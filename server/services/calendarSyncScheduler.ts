/**
 * Calendar Sync Scheduler
 * 
 * Handles automatic background synchronization of calendars with MS365.
 * Runs periodic syncs for all connected users.
 */

import { fullSync } from './ms365CalendarSyncService';
import { isUserConnected } from './ms365AuthService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface SyncConfig {
  enabled: boolean;
  intervalMinutes: number; // Default: 15 minutes
  dateRangeDays: number; // Default: 28 days (4 weeks) ahead
}

// Default configuration
const DEFAULT_CONFIG: SyncConfig = {
  enabled: true,
  intervalMinutes: 15,
  dateRangeDays: 28, // 4 weeks
};

let syncInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let config: SyncConfig = { ...DEFAULT_CONFIG };

/**
 * Initialize the sync scheduler
 */
export function initializeSyncScheduler(customConfig?: Partial<SyncConfig>): void {
  if (syncInterval) {
    console.log('[Calendar Sync Scheduler] Already initialized');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...customConfig };

  if (!config.enabled) {
    console.log('[Calendar Sync Scheduler] Disabled in configuration');
    return;
  }

  console.log(`[Calendar Sync Scheduler] Initializing with ${config.intervalMinutes} minute interval`);

  // Run initial sync after 30 seconds (give server time to start)
  setTimeout(() => {
    runSyncForAllUsers().catch(err => {
      console.error('[Calendar Sync Scheduler] Initial sync failed:', err);
    });
  }, 30000);

  // Set up periodic sync
  syncInterval = setInterval(() => {
    runSyncForAllUsers().catch(err => {
      console.error('[Calendar Sync Scheduler] Periodic sync failed:', err);
    });
  }, config.intervalMinutes * 60 * 1000);

  console.log('[Calendar Sync Scheduler] Started');
}

/**
 * Stop the sync scheduler
 */
export function stopSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Calendar Sync Scheduler] Stopped');
  }
}

/**
 * Update scheduler configuration
 */
export function updateSyncConfig(newConfig: Partial<SyncConfig>): void {
  config = { ...config, ...newConfig };

  if (config.enabled && !syncInterval) {
    initializeSyncScheduler(config);
  } else if (!config.enabled && syncInterval) {
    stopSyncScheduler();
  } else if (syncInterval && config.intervalMinutes !== DEFAULT_CONFIG.intervalMinutes) {
    // Restart with new interval
    stopSyncScheduler();
    initializeSyncScheduler(config);
  }
}

/**
 * Run sync for all connected users
 */
async function runSyncForAllUsers(): Promise<void> {
  if (isRunning) {
    console.log('[Calendar Sync Scheduler] Sync already in progress, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Get all users with MS365 tokens
    const { data: users, error } = await supabaseAdmin
      .from('user_ms365_tokens')
      .select('user_id')
      .not('access_token', 'is', null);

    if (error) {
      console.error('[Calendar Sync Scheduler] Failed to fetch connected users:', error);
      return;
    }

    if (!users || users.length === 0) {
      console.log('[Calendar Sync Scheduler] No users connected to MS365');
      return;
    }

    console.log(`[Calendar Sync Scheduler] Starting sync for ${users.length} user(s)`);

    // Sync for each user (in parallel, but limit concurrency)
    // Each user may have their own date range preference
    const syncPromises = users.map(user => syncForUser(user.user_id, config.dateRangeDays));
    const results = await Promise.allSettled(syncPromises);

    // Log results
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errorCount++;
        console.error('[Calendar Sync Scheduler] User sync failed:', result.reason);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Calendar Sync Scheduler] Completed: ${successCount} successful, ${errorCount} failed (${duration}ms)`
    );

  } catch (error) {
    console.error('[Calendar Sync Scheduler] Sync process failed:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Sync calendar for a specific user
 */
async function syncForUser(
  userId: string,
  defaultDateRangeDays: number
): Promise<void> {
  try {
    // Verify user is still connected
    if (!(await isUserConnected(userId))) {
      return; // User disconnected, skip
    }

    // Get user's preferences to check for custom date range
    let dateRangeDays = defaultDateRangeDays;
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .single();
      
      if (user?.preferences && typeof user.preferences === 'object') {
        const prefs = user.preferences as any;
        if (prefs.calendarSync?.dateRangeDays && typeof prefs.calendarSync.dateRangeDays === 'number') {
          dateRangeDays = prefs.calendarSync.dateRangeDays;
        }
      }
    } catch (error) {
      // If we can't get preferences, use default
      console.log(`[Calendar Sync Scheduler] Could not get preferences for user ${userId}, using default`);
    }

    // Get user's organization ID (use first active organization)
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!membership) {
      console.log(`[Calendar Sync Scheduler] User ${userId} has no active organization, skipping`);
      return;
    }

    const organizationId = membership.organization_id;

    // Calculate date range based on user preference or default
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + dateRangeDays);
    endDate.setHours(23, 59, 59, 999);

    // Run full sync
    const result = await fullSync(userId, organizationId, startDate, endDate);

    if (result.success) {
      console.log(
        `[Calendar Sync Scheduler] User ${userId}: pulled ${result.pulled}, pushed ${result.pushed}, updated ${result.updated}`
      );
    } else {
      console.error(
        `[Calendar Sync Scheduler] User ${userId} sync failed: ${result.errors.join('; ')}`
      );
    }

  } catch (error) {
    console.error(`[Calendar Sync Scheduler] Error syncing user ${userId}:`, error);
    throw error;
  }
}

/**
 * Manually trigger sync for all users (for testing/admin)
 */
export async function triggerManualSync(): Promise<{
  success: boolean;
  usersSynced: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    await runSyncForAllUsers();
    return { success: true, usersSynced: 0, errors: [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    return { success: false, usersSynced: 0, errors };
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  enabled: boolean;
  intervalMinutes: number;
  lastRunTime: Date | null;
} {
  return {
    running: isRunning,
    enabled: config.enabled,
    intervalMinutes: config.intervalMinutes,
    lastRunTime: null, // Could track this if needed
  };
}
