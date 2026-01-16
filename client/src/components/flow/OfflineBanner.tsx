/**
 * Offline Banner Component
 * 
 * Displays offline status and pending sync items.
 */

import { useEffect } from 'react';
import { useOffline } from '@/hooks/useOffline';
import { WifiOff, RefreshCw, CloudOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function OfflineBanner() {
  const {
    isOnline,
    syncStatus,
    isSyncing,
    triggerSync,
    hasPendingChanges,
    refreshSyncStatus,
  } = useOffline();

  // Refresh status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSyncStatus();
    }, 5000); // Every 5 seconds

    return () => clearInterval(interval);
  }, [refreshSyncStatus]);

  // Don't show if online and fully synced
  if (isOnline && !hasPendingChanges) {
    return null;
  }

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;

    const result = await triggerSync();
    if (result) {
      if (result.success) {
        toast.success(`Synced ${result.synced} items successfully`);
      } else if (result.failed > 0) {
        toast.error(`Sync completed with ${result.failed} errors`);
      }
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm',
        !isOnline
          ? 'bg-gray-600 text-white'
          : 'bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span className="flex-1">
            Offline mode - Changes will sync when connected
          </span>
        </>
      ) : hasPendingChanges ? (
        <>
          <CloudOff className="h-4 w-4" />
          <span className="flex-1">
            {syncStatus.queueSize} change{syncStatus.queueSize !== 1 ? 's' : ''}{' '}
            pending sync
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-7 text-xs"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Sync Now
              </>
            )}
          </Button>
        </>
      ) : null}
    </div>
  );
}
