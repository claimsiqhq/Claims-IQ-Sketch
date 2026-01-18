/**
 * Microsoft 365 Calendar Sync Service
 * 
 * Handles bidirectional synchronization between local appointments and MS365 calendar:
 * - Pull events from MS365 and create/update local appointments
 * - Push local appointments to MS365
 * - Conflict detection and resolution
 * - Sync status tracking
 */

import { 
  fetchCalendarEvents, 
  createCalendarEvent, 
  updateCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent 
} from './ms365CalendarService';
import {
  getAppointmentsForDate,
  createInspectionAppointment,
  updateAppointment,
  getTodayAppointments,
  type InspectionAppointment,
  type CreateAppointmentInput
} from './ms365CalendarService';
import { isUserConnected, getValidAccessToken } from './ms365AuthService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export interface SyncResult {
  success: boolean;
  pulled: number; // Number of events pulled from MS365
  pushed: number; // Number of appointments pushed to MS365
  updated: number; // Number of appointments updated
  conflicts: number; // Number of conflicts detected
  errors: string[];
}

export interface ConflictInfo {
  localAppointment: InspectionAppointment;
  ms365Event: CalendarEvent;
  reason: string;
}

/**
 * Pull events from MS365 and create/update local appointments
 * Also caches ALL events locally for offline access and history
 */
export async function syncFromMs365(
  userId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pulled: 0,
    pushed: 0,
    updated: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    // Check if user is connected
    if (!(await isUserConnected(userId))) {
      result.errors.push('User not connected to Microsoft 365');
      result.success = false;
      return result;
    }

    // Fetch events from MS365
    const ms365Events = await fetchCalendarEvents(userId, startDate, endDate);
    result.pulled = ms365Events.length;

    // IMPORTANT: Cache ALL events locally for offline access and history
    // This happens regardless of whether events are linked to claims
    const cacheResult = await cacheCalendarEvents(userId, organizationId, ms365Events);
    if (cacheResult.errors.length > 0) {
      console.log(`[Calendar Sync] Cache warnings: ${cacheResult.errors.length} events had issues`);
      // Don't fail the sync for cache errors, just log them
    }
    console.log(`[Calendar Sync] Cached ${cacheResult.cached} events locally for offline access`);

    // Get existing local appointments in the date range
    // Note: getAppointmentsForDate only gets one day, so we need to query each day
    // For now, we'll get appointments for the start date and end date, then filter
    const startAppointments = await getAppointmentsForDate(userId, organizationId, startDate);
    const endAppointments = await getAppointmentsForDate(userId, organizationId, endDate);
    
    // Combine and deduplicate
    const appointmentMap = new Map<string, InspectionAppointment>();
    for (const apt of [...startAppointments, ...endAppointments]) {
      appointmentMap.set(apt.id, apt);
    }
    
    // Filter to only those in the date range
    const existingAppointments = Array.from(appointmentMap.values()).filter(apt => {
      const aptDate = new Date(apt.scheduledStart);
      return aptDate >= startDate && aptDate <= endDate;
    });

    // Create a map of existing appointments by MS365 event ID
    const appointmentsByMs365Id = new Map<string, InspectionAppointment>();
    for (const apt of existingAppointments) {
      if (apt.ms365EventId) {
        appointmentsByMs365Id.set(apt.ms365EventId, apt);
      }
    }

    // Process each MS365 event
    for (const event of ms365Events) {
      try {
        const existingAppointment = appointmentsByMs365Id.get(event.id);

        if (existingAppointment) {
          // Update existing appointment if needed
          const needsUpdate = 
            existingAppointment.title !== event.subject ||
            existingAppointment.scheduledStart !== event.start.dateTime ||
            existingAppointment.scheduledEnd !== event.end.dateTime ||
            existingAppointment.location !== (event.location?.displayName || null);

          if (needsUpdate) {
            await updateAppointment(
              existingAppointment.id,
              organizationId,
              {
                title: event.subject,
                scheduledStart: event.start.dateTime,
                scheduledEnd: event.end.dateTime,
                location: event.location?.displayName,
              },
              false // Don't sync back to MS365 (we're pulling from there)
            );
            result.updated++;
          }
        } else {
          // Create new local appointment from MS365 event
          // Try to extract claim ID from event subject or description
          const claimId = await extractClaimIdFromEvent(event, organizationId);
          
          if (claimId) {
            // Only create if we can link it to a claim
            await createInspectionAppointment({
              claimId,
              organizationId,
              adjusterId: userId,
              title: event.subject,
              description: event.bodyPreview || null,
              location: event.location?.displayName || null,
              scheduledStart: event.start.dateTime,
              scheduledEnd: event.end.dateTime,
              durationMinutes: calculateDurationMinutes(event.start.dateTime, event.end.dateTime),
              syncToMs365: false, // Already exists in MS365
            });
            result.pulled++;
          } else {
            // Event doesn't appear to be inspection-related, skip it
            console.log(`[Calendar Sync] Skipping MS365 event "${event.subject}" - no claim ID found`);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to sync event "${event.subject}": ${errorMsg}`);
        console.error(`[Calendar Sync] Error syncing event ${event.id}:`, error);
      }
    }

    // Update last sync time
    await updateLastSyncTime(userId, 'pull');

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Sync failed: ${errorMsg}`);
    console.error('[Calendar Sync] Pull sync failed:', error);
  }

  return result;
}

/**
 * Push local appointments to MS365
 */
export async function syncToMs365(
  userId: string,
  organizationId: string,
  appointmentIds?: string[],
  startDate?: Date,
  endDate?: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pulled: 0,
    pushed: 0,
    updated: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    // Check if user is connected
    if (!(await isUserConnected(userId))) {
      result.errors.push('User not connected to Microsoft 365');
      result.success = false;
      return result;
    }

    let appointments: InspectionAppointment[];

    if (appointmentIds && appointmentIds.length > 0) {
      // Sync specific appointments
      appointments = [];
      for (const id of appointmentIds) {
        const apt = await getAppointmentById(id, organizationId);
        if (apt && apt.adjusterId === userId) {
          appointments.push(apt);
        }
      }
    } else {
      // Sync all appointments in date range (default: today + 28 days / 4 weeks)
      const start = startDate || new Date();
      const end = endDate || new Date(Date.now() + 28 * 24 * 60 * 60 * 1000); // Default: 4 weeks
      appointments = await getAppointmentsForDate(userId, organizationId, start);
      // Filter to only those in the range
      appointments = appointments.filter(apt => {
        const aptDate = new Date(apt.scheduledStart);
        return aptDate >= start && aptDate <= end;
      });
    }

    // Process each appointment
    for (const appointment of appointments) {
      try {
        if (appointment.ms365EventId) {
          // Update existing MS365 event
          await updateCalendarEvent(userId, appointment.ms365EventId, {
            subject: appointment.title,
            body: appointment.description || undefined,
            startDateTime: appointment.scheduledStart,
            endDateTime: appointment.scheduledEnd,
            location: appointment.location || undefined,
          });

          // Update local sync status
          await supabaseAdmin
            .from('inspection_appointments')
            .update({
              synced_at: new Date().toISOString(),
              sync_status: 'synced',
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', appointment.id)
            .catch(() => {}); // Ignore if columns don't exist yet

          result.updated++;
        } else {
          // Create new MS365 event
          const ms365Event = await createCalendarEvent(userId, {
            subject: appointment.title,
            body: appointment.description || undefined,
            startDateTime: appointment.scheduledStart,
            endDateTime: appointment.scheduledEnd,
            location: appointment.location || undefined,
          });

          if (ms365Event) {
            // Update local appointment with MS365 event ID
            await supabaseAdmin
              .from('inspection_appointments')
              .update({
                ms365_event_id: ms365Event.id,
                synced_at: new Date().toISOString(),
                sync_status: 'synced',
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', appointment.id)
              .catch(() => {}); // Ignore if columns don't exist yet

            result.pushed++;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to sync appointment "${appointment.title}": ${errorMsg}`);
        console.error(`[Calendar Sync] Error syncing appointment ${appointment.id}:`, error);

        // Update sync status to error (if column exists)
        await supabaseAdmin
          .from('inspection_appointments')
          .update({
            sync_status: 'error',
            sync_error: errorMsg.substring(0, 500), // Limit error message length
          })
          .eq('id', appointment.id)
          .catch(() => {}); // Ignore if columns don't exist yet
      }
    }

    // Update last sync time
    await updateLastSyncTime(userId, 'push');

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Sync failed: ${errorMsg}`);
    console.error('[Calendar Sync] Push sync failed:', error);
  }

  return result;
}

/**
 * Full bidirectional sync
 */
export async function fullSync(
  userId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pulled: 0,
    pushed: 0,
    updated: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    // First, pull from MS365 (this is more authoritative)
    const pullResult = await syncFromMs365(userId, organizationId, startDate, endDate);
    result.pulled = pullResult.pulled;
    result.updated += pullResult.updated;
    result.errors.push(...pullResult.errors);

    // Then, push local appointments that aren't synced yet
    const pushResult = await syncToMs365(userId, organizationId, undefined, startDate, endDate);
    result.pushed = pushResult.pushed;
    result.updated += pushResult.updated;
    result.errors.push(...pushResult.errors);

    // Detect conflicts
    const conflicts = await detectConflicts(userId, organizationId, startDate, endDate);
    result.conflicts = conflicts.length;

    result.success = pullResult.success && pushResult.success;

    // Update last sync time
    await updateLastSyncTime(userId, 'full');

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Full sync failed: ${errorMsg}`);
    console.error('[Calendar Sync] Full sync failed:', error);
  }

  return result;
}

/**
 * Detect conflicts between local appointments and MS365 events
 */
export async function detectConflicts(
  userId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  try {
    if (!(await isUserConnected(userId))) {
      return conflicts;
    }

    // Get local appointments (filter to those in the date range)
    const allAppointments = await getAppointmentsForDate(userId, organizationId, startDate);
    const localAppointments = allAppointments.filter(apt => {
      const aptDate = new Date(apt.scheduledStart);
      return aptDate >= startDate && aptDate <= endDate;
    });
    
    // Get MS365 events
    const ms365Events = await fetchCalendarEvents(userId, startDate, endDate);

    // Create maps for comparison
    const appointmentsByMs365Id = new Map<string, InspectionAppointment>();
    for (const apt of localAppointments) {
      if (apt.ms365EventId) {
        appointmentsByMs365Id.set(apt.ms365EventId, apt);
      }
    }

    // Check for conflicts
    for (const event of ms365Events) {
      const localAppointment = appointmentsByMs365Id.get(event.id);
      
      if (localAppointment) {
        // Check if there are differences that indicate a conflict
        const timeDiff = Math.abs(
          new Date(localAppointment.scheduledStart).getTime() - 
          new Date(event.start.dateTime).getTime()
        );

        if (timeDiff > 5 * 60 * 1000) { // More than 5 minutes difference
          conflicts.push({
            localAppointment,
            ms365Event: event,
            reason: `Time mismatch: local ${localAppointment.scheduledStart} vs MS365 ${event.start.dateTime}`,
          });
        } else if (localAppointment.title !== event.subject) {
          conflicts.push({
            localAppointment,
            ms365Event: event,
            reason: `Title mismatch: local "${localAppointment.title}" vs MS365 "${event.subject}"`,
          });
        }
      }
    }

  } catch (error) {
    console.error('[Calendar Sync] Conflict detection failed:', error);
  }

  return conflicts;
}

/**
 * Get sync status for a user
 */
export async function getSyncStatus(
  userId: string,
  organizationId: string
): Promise<{
  connected: boolean;
  lastSyncTime: string | null;
  lastSyncDirection: 'pull' | 'push' | 'full' | null;
  pendingSyncs: number;
  errorCount: number;
}> {
  const connected = await isUserConnected(userId);

  // Get last sync time from user preferences or a separate sync log table
  // For now, we'll check the most recent synced appointment
  const { data: lastSynced } = await supabaseAdmin
    .from('inspection_appointments')
    .select('last_synced_at, sync_status')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .not('last_synced_at', 'is', null)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single();

  // Count pending and error syncs
  const { data: pending } = await supabaseAdmin
    .from('inspection_appointments')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .or('sync_status.is.null,sync_status.eq.pending')
    .limit(100);

  const { data: errors } = await supabaseAdmin
    .from('inspection_appointments')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('sync_status', 'error')
    .limit(100);

  return {
    connected,
    lastSyncTime: lastSynced?.last_synced_at || null,
    lastSyncDirection: null, // Could be stored in user preferences
    pendingSyncs: pending?.length || 0,
    errorCount: errors?.length || 0,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract claim ID from MS365 event (from subject or description)
 */
async function extractClaimIdFromEvent(event: CalendarEvent, organizationId: string): Promise<string | null> {
  // Try to extract UUID from description first (most reliable)
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  if (event.bodyPreview) {
    const uuidMatch = event.bodyPreview.match(uuidPattern);
    if (uuidMatch) {
      // Verify it's a valid claim ID
      const { data } = await supabaseAdmin
        .from('claims')
        .select('id')
        .eq('id', uuidMatch[0])
        .eq('organization_id', organizationId)
        .single();
      if (data) {
        return uuidMatch[0];
      }
    }
  }

  // Try to find claim number in subject (format: "Inspection - CLM-123456" or "Claim #123456")
  const claimNumberPattern = /(?:CLM-|Claim\s*#?|claim\s*)([A-Z0-9-]+)/i;
  const subjectMatch = event.subject.match(claimNumberPattern);
  if (subjectMatch) {
    const claimNumber = subjectMatch[1];
    // Look up claim by claim number
    const { data } = await supabaseAdmin
      .from('claims')
      .select('id')
      .eq('claim_number', claimNumber)
      .eq('organization_id', organizationId)
      .single();
    if (data) {
      return data.id;
    }
  }

  return null;
}

/**
 * Calculate duration in minutes between two ISO date strings
 */
function calculateDurationMinutes(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
}

/**
 * Get appointment by ID (helper function)
 */
async function getAppointmentById(
  appointmentId: string,
  organizationId: string
): Promise<InspectionAppointment | null> {
  const { data, error } = await supabaseAdmin
    .from('inspection_appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapAppointmentFromDb(data);
}

/**
 * Map database row to InspectionAppointment
 */
function mapAppointmentFromDb(row: any): InspectionAppointment {
  return {
    id: row.id,
    claimId: row.claim_id,
    organizationId: row.organization_id,
    adjusterId: row.user_id,
    ms365EventId: row.ms365_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    durationMinutes: row.duration_minutes,
    status: row.status,
    appointmentType: row.appointment_type,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update last sync time (store in user preferences or separate table)
 */
async function updateLastSyncTime(
  userId: string,
  direction: 'pull' | 'push' | 'full'
): Promise<void> {
  try {
    // Store in user preferences for now
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();

    const preferences = (user?.preferences as any) || {};
    preferences.calendarSync = {
      lastSyncTime: new Date().toISOString(),
      lastSyncDirection: direction,
    };

    const { error } = await supabaseAdmin
      .from('users')
      .update({ preferences })
      .eq('id', userId);

    if (error) {
      console.error('[Calendar Sync] Failed to update sync time:', error);
    }
  } catch (err) {
    // Silently fail - sync time tracking is not critical
    console.error('[Calendar Sync] Failed to update sync time:', err);
  }
}

// ============================================
// LOCAL CALENDAR EVENT CACHE
// Stores ALL MS365 events locally for offline access
// ============================================

export interface CachedCalendarEvent {
  id: string;
  userId: string;
  organizationId: string;
  ms365EventId: string;
  ms365CalendarId: string | null;
  subject: string;
  bodyPreview: string | null;
  location: string | null;
  startDatetime: string;
  endDatetime: string;
  isAllDay: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  attendees: any[];
  sensitivity: string;
  showAs: string;
  importance: string;
  isCancelled: boolean;
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  categories: string[];
  localAppointmentId: string | null;
  lastSyncedAt: string;
  ms365LastModified: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cache all MS365 calendar events locally
 * This stores events regardless of whether they're linked to claims
 */
export async function cacheCalendarEvents(
  userId: string,
  organizationId: string,
  events: CalendarEvent[]
): Promise<{ cached: number; errors: string[] }> {
  const result = { cached: 0, errors: [] as string[] };

  for (const event of events) {
    try {
      // Check if event already exists in cache
      const { data: existing } = await supabaseAdmin
        .from('calendar_event_cache')
        .select('id')
        .eq('user_id', userId)
        .eq('ms365_event_id', event.id)
        .maybeSingle();

      const eventData = {
        user_id: userId,
        organization_id: organizationId,
        ms365_event_id: event.id,
        ms365_calendar_id: (event as any).calendarId || null,
        subject: event.subject,
        body_preview: event.bodyPreview || null,
        location: event.location?.displayName || null,
        start_datetime: event.start.dateTime,
        end_datetime: event.end.dateTime,
        is_all_day: (event as any).isAllDay || false,
        organizer_email: event.organizer?.emailAddress?.address || null,
        organizer_name: event.organizer?.emailAddress?.name || null,
        attendees: (event as any).attendees || [],
        sensitivity: (event as any).sensitivity || 'normal',
        show_as: (event as any).showAs || 'busy',
        importance: (event as any).importance || 'normal',
        is_cancelled: (event as any).isCancelled || false,
        is_online_meeting: (event as any).isOnlineMeeting || false,
        online_meeting_url: (event as any).onlineMeetingUrl || null,
        categories: (event as any).categories || [],
        last_synced_at: new Date().toISOString(),
        ms365_last_modified: (event as any).lastModifiedDateTime || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // Update existing cache entry
        const { error } = await supabaseAdmin
          .from('calendar_event_cache')
          .update(eventData)
          .eq('id', existing.id);

        if (error) {
          result.errors.push(`Failed to update cached event "${event.subject}": ${error.message}`);
        } else {
          result.cached++;
        }
      } else {
        // Insert new cache entry
        const { error } = await supabaseAdmin
          .from('calendar_event_cache')
          .insert(eventData);

        if (error) {
          result.errors.push(`Failed to cache event "${event.subject}": ${error.message}`);
        } else {
          result.cached++;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Error caching event "${event.subject}": ${errorMsg}`);
    }
  }

  console.log(`[Calendar Cache] Cached ${result.cached} events for user ${userId}`);
  return result;
}

/**
 * Get cached calendar events for a date range
 * This works even when offline or disconnected from MS365
 */
export async function getCachedCalendarEvents(
  userId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<CachedCalendarEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .gte('start_datetime', startDate.toISOString())
    .lte('end_datetime', endDate.toISOString())
    .order('start_datetime', { ascending: true });

  if (error) {
    console.error('[Calendar Cache] Failed to fetch cached events:', error);
    return [];
  }

  return (data || []).map(mapCachedEventFromDb);
}

/**
 * Get all cached calendar events for a user (for history view)
 */
export async function getCalendarHistory(
  userId: string,
  organizationId: string,
  limit: number = 100,
  offset: number = 0
): Promise<{ events: CachedCalendarEvent[]; total: number }> {
  // Get total count
  const { count } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('organization_id', organizationId);

  // Get paginated events
  const { data, error } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .order('start_datetime', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Calendar Cache] Failed to fetch calendar history:', error);
    return { events: [], total: 0 };
  }

  return {
    events: (data || []).map(mapCachedEventFromDb),
    total: count || 0,
  };
}

/**
 * Clear old cached events (e.g., events older than 6 months)
 */
export async function cleanupOldCachedEvents(
  userId: string,
  olderThanDays: number = 180
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data, error } = await supabaseAdmin
    .from('calendar_event_cache')
    .delete()
    .eq('user_id', userId)
    .lt('end_datetime', cutoffDate.toISOString())
    .select('id');

  if (error) {
    console.error('[Calendar Cache] Failed to cleanup old events:', error);
    return 0;
  }

  const deletedCount = data?.length || 0;
  console.log(`[Calendar Cache] Cleaned up ${deletedCount} old events for user ${userId}`);
  return deletedCount;
}

/**
 * Link a cached event to a local appointment
 */
export async function linkCachedEventToAppointment(
  userId: string,
  ms365EventId: string,
  localAppointmentId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('calendar_event_cache')
    .update({ local_appointment_id: localAppointmentId })
    .eq('user_id', userId)
    .eq('ms365_event_id', ms365EventId);

  if (error) {
    console.error('[Calendar Cache] Failed to link event to appointment:', error);
    return false;
  }

  return true;
}

/**
 * Get cache statistics for a user
 */
export async function getCacheStats(
  userId: string,
  organizationId: string
): Promise<{
  totalEvents: number;
  linkedToAppointments: number;
  lastCacheUpdate: string | null;
  oldestEvent: string | null;
  newestEvent: string | null;
}> {
  // Total count
  const { count: totalCount } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('organization_id', organizationId);

  // Linked to appointments count
  const { count: linkedCount } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .not('local_appointment_id', 'is', null);

  // Get most recent sync time
  const { data: lastSync } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('last_synced_at')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single();

  // Get date range
  const { data: oldest } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('start_datetime')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .order('start_datetime', { ascending: true })
    .limit(1)
    .single();

  const { data: newest } = await supabaseAdmin
    .from('calendar_event_cache')
    .select('start_datetime')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .order('start_datetime', { ascending: false })
    .limit(1)
    .single();

  return {
    totalEvents: totalCount || 0,
    linkedToAppointments: linkedCount || 0,
    lastCacheUpdate: lastSync?.last_synced_at || null,
    oldestEvent: oldest?.start_datetime || null,
    newestEvent: newest?.start_datetime || null,
  };
}

/**
 * Map database row to CachedCalendarEvent
 */
function mapCachedEventFromDb(row: any): CachedCalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    ms365EventId: row.ms365_event_id,
    ms365CalendarId: row.ms365_calendar_id,
    subject: row.subject,
    bodyPreview: row.body_preview,
    location: row.location,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    isAllDay: row.is_all_day,
    organizerEmail: row.organizer_email,
    organizerName: row.organizer_name,
    attendees: row.attendees || [],
    sensitivity: row.sensitivity,
    showAs: row.show_as,
    importance: row.importance,
    isCancelled: row.is_cancelled,
    isOnlineMeeting: row.is_online_meeting,
    onlineMeetingUrl: row.online_meeting_url,
    categories: row.categories || [],
    localAppointmentId: row.local_appointment_id,
    lastSyncedAt: row.last_synced_at,
    ms365LastModified: row.ms365_last_modified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
