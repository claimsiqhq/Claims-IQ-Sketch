/**
 * Microsoft 365 Calendar Service
 * 
 * Handles calendar operations via Microsoft Graph API:
 * - Fetch calendar events
 * - Create inspection appointments
 * - Update/delete events
 * - Sync appointments with local database
 */

import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import { getGraphClient, getValidAccessToken } from './ms365AuthService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Types for calendar events
export interface CalendarEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  isAllDay?: boolean;
  webLink?: string;
}

export interface InspectionAppointment {
  id: string;
  claimId: string;
  organizationId: string;
  adjusterId: string;
  ms365EventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  appointmentType: 'initial_inspection' | 're_inspection' | 'follow_up';
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  claimId: string;
  organizationId: string;
  adjusterId: string;
  title: string;
  description?: string;
  location?: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes?: number;
  appointmentType?: 'initial_inspection' | 're_inspection' | 'follow_up';
  syncToMs365?: boolean;
}

/**
 * Fetch calendar events from MS365 for a date range
 */
export async function fetchCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const client = await getGraphClient(userId);
  if (!client) {
    throw new Error('Not connected to Microsoft 365');
  }

  try {
    const response = await client
      .api('/me/calendarview')
      .query({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
      })
      .select('id,subject,bodyPreview,start,end,location,isAllDay,webLink')
      .orderby('start/dateTime')
      .top(50)
      .get();

    return response.value || [];
  } catch (error) {
    console.error('[MS365 Calendar] Failed to fetch events:', error);
    throw error;
  }
}

/**
 * Fetch today's calendar events
 */
export async function fetchTodayEvents(userId: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  return fetchCalendarEvents(userId, startOfDay, endOfDay);
}

/**
 * Create a calendar event in MS365
 */
export async function createCalendarEvent(
  userId: string,
  event: {
    subject: string;
    body?: string;
    startDateTime: string;
    endDateTime: string;
    timeZone?: string;
    location?: string;
  }
): Promise<CalendarEvent | null> {
  const client = await getGraphClient(userId);
  if (!client) {
    throw new Error('Not connected to Microsoft 365');
  }

  try {
    const eventPayload: any = {
      subject: event.subject,
      start: {
        dateTime: event.startDateTime,
        timeZone: event.timeZone || 'UTC',
      },
      end: {
        dateTime: event.endDateTime,
        timeZone: event.timeZone || 'UTC',
      },
    };

    if (event.body) {
      eventPayload.body = {
        contentType: 'HTML',
        content: event.body,
      };
    }

    if (event.location) {
      eventPayload.location = {
        displayName: event.location,
      };
    }

    const response = await client
      .api('/me/events')
      .post(eventPayload);

    return response;
  } catch (error) {
    console.error('[MS365 Calendar] Failed to create event:', error);
    throw error;
  }
}

/**
 * Update a calendar event in MS365
 */
export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  updates: {
    subject?: string;
    body?: string;
    startDateTime?: string;
    endDateTime?: string;
    timeZone?: string;
    location?: string;
  }
): Promise<CalendarEvent | null> {
  const client = await getGraphClient(userId);
  if (!client) {
    throw new Error('Not connected to Microsoft 365');
  }

  try {
    const payload: any = {};

    if (updates.subject) {
      payload.subject = updates.subject;
    }
    if (updates.body) {
      payload.body = {
        contentType: 'HTML',
        content: updates.body,
      };
    }
    if (updates.startDateTime) {
      payload.start = {
        dateTime: updates.startDateTime,
        timeZone: updates.timeZone || 'UTC',
      };
    }
    if (updates.endDateTime) {
      payload.end = {
        dateTime: updates.endDateTime,
        timeZone: updates.timeZone || 'UTC',
      };
    }
    if (updates.location) {
      payload.location = {
        displayName: updates.location,
      };
    }

    const response = await client
      .api(`/me/events/${eventId}`)
      .patch(payload);

    return response;
  } catch (error) {
    console.error('[MS365 Calendar] Failed to update event:', error);
    throw error;
  }
}

/**
 * Delete a calendar event from MS365
 */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  const client = await getGraphClient(userId);
  if (!client) {
    throw new Error('Not connected to Microsoft 365');
  }

  try {
    await client.api(`/me/events/${eventId}`).delete();
    return true;
  } catch (error) {
    console.error('[MS365 Calendar] Failed to delete event:', error);
    throw error;
  }
}

// ============================================
// LOCAL APPOINTMENT MANAGEMENT
// ============================================

/**
 * Create an inspection appointment (with optional MS365 sync)
 */
export async function createInspectionAppointment(
  input: CreateAppointmentInput
): Promise<InspectionAppointment> {
  let ms365EventId: string | null = null;
  let syncedAt: string | null = null;

  // If sync requested and user connected, create in MS365
  if (input.syncToMs365) {
    try {
      const ms365Event = await createCalendarEvent(input.adjusterId, {
        subject: input.title,
        body: input.description,
        startDateTime: input.scheduledStart,
        endDateTime: input.scheduledEnd,
        location: input.location,
      });
      
      if (ms365Event) {
        ms365EventId = ms365Event.id;
        syncedAt = new Date().toISOString();
      }
    } catch (error) {
      console.warn('[MS365 Calendar] Sync failed, creating local appointment only:', error);
    }
  }

  // Create local appointment record
  const { data, error } = await supabaseAdmin
    .from('inspection_appointments')
    .insert({
      claim_id: input.claimId,
      organization_id: input.organizationId,
      adjuster_id: input.adjusterId,
      ms365_event_id: ms365EventId,
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      duration_minutes: input.durationMinutes || 60,
      status: 'scheduled',
      appointment_type: input.appointmentType || 'initial_inspection',
      synced_at: syncedAt,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapAppointmentFromDb(data);
}

/**
 * Get appointments for a user on a specific date
 */
export async function getAppointmentsForDate(
  userId: string,
  organizationId: string,
  date: Date
): Promise<InspectionAppointment[]> {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  const { data, error } = await supabaseAdmin
    .from('inspection_appointments')
    .select('*')
    .eq('adjuster_id', userId)
    .eq('organization_id', organizationId)
    .gte('scheduled_start', startOfDay.toISOString())
    .lte('scheduled_start', endOfDay.toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_start', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapAppointmentFromDb);
}

/**
 * Get today's appointments for a user
 */
export async function getTodayAppointments(
  userId: string,
  organizationId: string
): Promise<InspectionAppointment[]> {
  return getAppointmentsForDate(userId, organizationId, new Date());
}

/**
 * Get appointment by ID
 */
export async function getAppointmentById(
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
 * Get appointments for a claim
 */
export async function getAppointmentsForClaim(
  claimId: string,
  organizationId: string
): Promise<InspectionAppointment[]> {
  const { data, error } = await supabaseAdmin
    .from('inspection_appointments')
    .select('*')
    .eq('claim_id', claimId)
    .eq('organization_id', organizationId)
    .order('scheduled_start', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapAppointmentFromDb);
}

/**
 * Update an appointment
 */
export async function updateAppointment(
  appointmentId: string,
  organizationId: string,
  updates: Partial<{
    title: string;
    description: string;
    location: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
    appointmentType: string;
  }>,
  syncToMs365: boolean = true
): Promise<InspectionAppointment | null> {
  // Get existing appointment
  const existing = await getAppointmentById(appointmentId, organizationId);
  if (!existing) {
    return null;
  }

  // Update in MS365 if synced
  if (syncToMs365 && existing.ms365EventId) {
    try {
      await updateCalendarEvent(existing.adjusterId, existing.ms365EventId, {
        subject: updates.title,
        body: updates.description,
        startDateTime: updates.scheduledStart,
        endDateTime: updates.scheduledEnd,
        location: updates.location,
      });
    } catch (error) {
      console.warn('[MS365 Calendar] Sync update failed:', error);
    }
  }

  // Build update object
  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.title) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.location !== undefined) dbUpdates.location = updates.location;
  if (updates.scheduledStart) dbUpdates.scheduled_start = updates.scheduledStart;
  if (updates.scheduledEnd) dbUpdates.scheduled_end = updates.scheduledEnd;
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.appointmentType) dbUpdates.appointment_type = updates.appointmentType;

  const { data, error } = await supabaseAdmin
    .from('inspection_appointments')
    .update(dbUpdates)
    .eq('id', appointmentId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error || !data) {
    return null;
  }

  return mapAppointmentFromDb(data);
}

/**
 * Delete an appointment
 */
export async function deleteAppointment(
  appointmentId: string,
  organizationId: string,
  deleteFromMs365: boolean = true
): Promise<boolean> {
  // Get existing appointment
  const existing = await getAppointmentById(appointmentId, organizationId);
  if (!existing) {
    return false;
  }

  // Delete from MS365 if synced
  if (deleteFromMs365 && existing.ms365EventId) {
    try {
      await deleteCalendarEvent(existing.adjusterId, existing.ms365EventId);
    } catch (error) {
      console.warn('[MS365 Calendar] Sync delete failed:', error);
    }
  }

  // Delete local record
  const { error } = await supabaseAdmin
    .from('inspection_appointments')
    .delete()
    .eq('id', appointmentId)
    .eq('organization_id', organizationId);

  return !error;
}

/**
 * Cancel an appointment (soft delete)
 */
export async function cancelAppointment(
  appointmentId: string,
  organizationId: string
): Promise<InspectionAppointment | null> {
  return updateAppointment(appointmentId, organizationId, { status: 'cancelled' });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapAppointmentFromDb(row: any): InspectionAppointment {
  return {
    id: row.id,
    claimId: row.claim_id,
    organizationId: row.organization_id,
    adjusterId: row.adjuster_id,
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
