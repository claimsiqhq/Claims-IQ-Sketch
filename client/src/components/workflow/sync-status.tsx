/**
 * Sync Status Indicator
 *
 * Visual indicator showing online/offline status and sync state.
 * Critical for field adjusters to know their work is saved.
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncStatusProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  onSyncClick?: () => void;
  className?: string;
}

export function SyncStatus({
  isOnline,
  isSyncing,
  pendingCount,
  lastSyncedAt,
  syncError,
  onSyncClick,
  className,
}: SyncStatusProps) {
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (syncError) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [syncError]);

  // Determine status
  const getStatus = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        text: "Offline",
        variant: "outline" as const,
        color: "text-amber-600 border-amber-300 bg-amber-50",
      };
    }

    if (isSyncing) {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: "Syncing",
        variant: "outline" as const,
        color: "text-blue-600 border-blue-300 bg-blue-50",
      };
    }

    if (syncError && showError) {
      return {
        icon: <AlertCircle className="h-3 w-3" />,
        text: "Sync failed",
        variant: "destructive" as const,
        color: "",
      };
    }

    if (pendingCount > 0) {
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: `${pendingCount} pending`,
        variant: "outline" as const,
        color: "text-amber-600 border-amber-300 bg-amber-50",
      };
    }

    return {
      icon: <Check className="h-3 w-3" />,
      text: "Saved",
      variant: "secondary" as const,
      color: "text-green-600",
    };
  };

  const status = getStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1", className)}>
            <Badge
              variant={status.variant}
              className={cn(
                "text-xs flex items-center gap-1 cursor-default",
                status.color
              )}
            >
              {status.icon}
              {status.text}
            </Badge>

            {/* Manual sync button when pending */}
            {isOnline && pendingCount > 0 && !isSyncing && onSyncClick && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onSyncClick}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-3 w-3 text-green-600" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-amber-600" />
                  <span>Offline - changes saved locally</span>
                </>
              )}
            </div>
            {lastSyncedAt && (
              <div className="text-muted-foreground">
                Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
              </div>
            )}
            {pendingCount > 0 && (
              <div className="text-amber-600">
                {pendingCount} change{pendingCount > 1 ? "s" : ""} waiting to sync
              </div>
            )}
            {syncError && (
              <div className="text-red-600">{syncError}</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact sync indicator for tight spaces
 */
interface CompactSyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  className?: string;
}

export function CompactSyncIndicator({
  isOnline,
  isSyncing,
  pendingCount,
  className,
}: CompactSyncIndicatorProps) {
  if (!isOnline) {
    return (
      <div className={cn("flex items-center gap-1 text-amber-600", className)}>
        <WifiOff className="h-3 w-3" />
        <span className="text-xs">Offline</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className={cn("flex items-center gap-1 text-blue-600", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs">Saving...</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className={cn("flex items-center gap-1 text-amber-600", className)}>
        <Cloud className="h-3 w-3" />
        <span className="text-xs">{pendingCount}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 text-green-600", className)}>
      <Check className="h-3 w-3" />
      <span className="text-xs">Saved</span>
    </div>
  );
}

export default SyncStatus;
