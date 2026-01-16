/**
 * useOffline Hook
 * 
 * React hook for managing offline state and sync operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { syncManager } from '../services/syncManager';
import { offlineStorage } from '../services/offlineStorage';

interface SyncStatus {
  pendingCompletions: number;
  pendingEvidence: number;
  queueSize: number;
  lastSync: string | null;
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(syncManager.getIsOnline());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingCompletions: 0,
    pendingEvidence: 0,
    queueSize: 0,
    lastSync: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Subscribe to connectivity changes
    const unsubscribe = syncManager.onConnectivityChange(setIsOnline);

    // Load initial status
    refreshSyncStatus();

    return unsubscribe;
  }, []);

  const refreshSyncStatus = useCallback(async () => {
    const status = await offlineStorage.getOfflineSummary();
    setSyncStatus(status);
  }, []);

  const triggerSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await syncManager.syncAll();
      await refreshSyncStatus();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshSyncStatus]);

  return {
    isOnline,
    syncStatus,
    isSyncing,
    triggerSync,
    refreshSyncStatus,
    hasPendingChanges: syncStatus.queueSize > 0,
  };
}
