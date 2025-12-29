/**
 * Upload Status Bar - Global floating component for tracking background uploads
 */

import { useState, useEffect, useRef } from 'react';
import {
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUploadQueue, useUploadQueueStats } from '@/lib/uploadQueue';
import { UploadQueueRow } from './UploadQueueRow';

// ============================================
// MAIN COMPONENT
// ============================================

export function UploadStatusBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const autoClearTimerRef = useRef<NodeJS.Timeout | null>(null);

  const queue = useUploadQueue((state) => state.queue);
  const { clearCompleted, clearFailed, retryAllFailed, retryFailed, removeFromQueue, clearAll } = useUploadQueue();
  const stats = useUploadQueueStats();

  const { pending, uploading, classifying, processing, completed, failed, isActive } = stats;

  // Auto-clear completed items after 3 seconds when all processing is done
  useEffect(() => {
    // Clear any existing timer
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }

    // If no active uploads and we have completed items (and no failures), auto-clear
    if (!isActive && completed > 0 && failed === 0 && queue.length > 0) {
      autoClearTimerRef.current = setTimeout(() => {
        clearAll();
      }, 3000);
    }

    return () => {
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
      }
    };
  }, [isActive, completed, failed, queue.length, clearAll]);

  // Don't render if queue is empty
  if (queue.length === 0) {
    return null;
  }

  const { overallProgress } = stats;
  const activeCount = pending + uploading + classifying + processing;

  // Minimized view - just a small floating indicator
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            'rounded-full shadow-lg gap-2',
            isActive && 'animate-pulse'
          )}
          onClick={() => setIsMinimized(false)}
        >
          <Upload className="h-4 w-4" />
          {isActive ? (
            <span>{activeCount} uploading</span>
          ) : (
            <span>{completed} done</span>
          )}
          {failed > 0 && (
            <span className="text-red-500">({failed} failed)</span>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="bg-background border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 cursor-pointer select-none',
            isActive ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-muted/30'
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="relative">
            <Upload className={cn('h-5 w-5', isActive && 'text-blue-500')} />
            {isActive && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {isActive
                  ? `Uploading ${activeCount} document${activeCount !== 1 ? 's' : ''}`
                  : `${completed} document${completed !== 1 ? 's' : ''} uploaded`}
              </span>
              {failed > 0 && (
                <span className="text-xs text-red-500">
                  ({failed} failed)
                </span>
              )}
            </div>
            {isActive && (
              <Progress value={overallProgress} className="h-1.5 mt-1.5" />
            )}
          </div>

          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              title="Minimize"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Expanded view */}
        {isExpanded && (
          <>
            <ScrollArea className="max-h-80">
              <div>
                {queue.map((item) => (
                  <UploadQueueRow 
                    key={item.id} 
                    item={item}
                    onRetry={() => retryFailed(item.id)}
                    onRemove={() => removeFromQueue(item.id)}
                    variant="compact"
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-t border-border">
              <div className="flex items-center gap-2">
                {failed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={retryAllFailed}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry failed
                  </Button>
                )}
                {completed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearCompleted}
                  >
                    Clear done
                  </Button>
                )}
              </div>
              {!isActive && queue.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={clearAll}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default UploadStatusBar;
