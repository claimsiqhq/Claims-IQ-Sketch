/**
 * useSyncStatus Hook
 *
 * React hook for monitoring sync status and managing offline data synchronization.
 * Uses the Dexie-based sync service for full offline support.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncService, SyncStatus, SyncProgress } from '../lib/syncService';
import { OfflineStorage } from '../lib/offlineStorage';

export interface UseSyncStatusResult {
  /** Current sync status */
  status: SyncStatus;
  /** Whether the device is online */
  isOnline: boolean;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Number of items pending sync */
  pendingCount: number;
  /** Current sync progress */
  progress: SyncProgress | null;
  /** Force immediate sync */
  forceSync: () => Promise<void>;
  /** Register for background sync */
  registerBackgroundSync: () => Promise<boolean>;
  /** Clear all offline data */
  clearOfflineData: () => Promise<void>;
  /** Get offline storage stats */
  getStorageStats: () => Promise<OfflineStorageStats>;
}

export interface OfflineStorageStats {
  claims: number;
  zones: number;
  photos: number;
  damageMarkers: number;
  syncQueue: number;
  flowStates: number;
  lineItems: number;
}

export function useSyncStatus(): UseSyncStatusResult {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const syncingRef = useRef(false);

  // Subscribe to sync service updates
  useEffect(() => {
    const unsubscribe = syncService.subscribe(
      (newStatus: SyncStatus, newProgress: SyncProgress) => {
        setStatus(newStatus);
        setProgress(newProgress);
        setIsSyncing(newStatus === 'syncing');
      }
    );

    // Get initial status
    const initialStatus = syncService.getStatus();
    setStatus(initialStatus.status);
    setIsOnline(initialStatus.isOnline);

    // Get initial pending count
    syncService.getPendingCount().then(setPendingCount);

    return unsubscribe;
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      // Refresh pending count when coming online
      syncService.getPendingCount().then(setPendingCount);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Refresh pending count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      syncService.getPendingCount().then(setPendingCount);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Force sync
  const forceSync = useCallback(async () => {
    if (syncingRef.current || !isOnline) return;

    syncingRef.current = true;
    setIsSyncing(true);

    try {
      await syncService.forceSync();
      const newCount = await syncService.getPendingCount();
      setPendingCount(newCount);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline]);

  // Register for background sync
  const registerBackgroundSync = useCallback(async () => {
    return syncService.registerBackgroundSync();
  }, []);

  // Clear all offline data
  const clearOfflineData = useCallback(async () => {
    await OfflineStorage.clearAll();
    setPendingCount(0);
    setProgress(null);
  }, []);

  // Get storage stats
  const getStorageStats = useCallback(async (): Promise<OfflineStorageStats> => {
    const [claims, zones, photos, damageMarkers, syncQueue, flowStates, lineItems] =
      await Promise.all([
        OfflineStorage.getAllClaims().then((r) => r.length),
        OfflineStorage.getZonesForClaim('').catch(() => []).then(() => 0), // Simplified
        OfflineStorage.getPhotosForClaim('').catch(() => []).then(() => 0),
        Promise.resolve(0), // Would need to aggregate
        OfflineStorage.getSyncQueueCount(),
        Promise.resolve(0),
        Promise.resolve(0),
      ]);

    return {
      claims,
      zones,
      photos,
      damageMarkers,
      syncQueue,
      flowStates,
      lineItems,
    };
  }, []);

  return {
    status,
    isOnline,
    isSyncing,
    pendingCount,
    progress,
    forceSync,
    registerBackgroundSync,
    clearOfflineData,
    getStorageStats,
  };
}

/**
 * Hook for displaying sync status in the UI
 */
export function useSyncIndicator() {
  const { status, isOnline, isSyncing, pendingCount, progress } = useSyncStatus();

  const statusText = (() => {
    if (!isOnline) return 'Offline';
    if (isSyncing) {
      if (progress) {
        return `Syncing ${progress.completed}/${progress.total}...`;
      }
      return 'Syncing...';
    }
    if (pendingCount > 0) return `${pendingCount} pending`;
    if (status === 'error') return 'Sync error';
    return 'Synced';
  })();

  const statusColor = (() => {
    if (!isOnline) return 'gray';
    if (isSyncing) return 'blue';
    if (status === 'error') return 'red';
    if (pendingCount > 0) return 'yellow';
    return 'green';
  })();

  return {
    statusText,
    statusColor,
    showBadge: pendingCount > 0 || status === 'error',
    badgeCount: pendingCount,
  };
}
