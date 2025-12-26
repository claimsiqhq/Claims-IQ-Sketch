/**
 * Upload Status Bar - Global floating component for tracking background uploads
 *
 * Features:
 * - Shows upload progress for all queued documents
 * - Minimizable to a small indicator
 * - Expandable to see individual file status
 * - Persists across navigation
 */

import { useState } from 'react';
import {
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useUploadQueue,
  useUploadQueueStats,
  type UploadQueueItem,
  type UploadStatus,
} from '@/lib/uploadQueue';

// ============================================
// STATUS ICON COMPONENT
// ============================================

function StatusIcon({ status, processingStatus }: { status: UploadStatus; processingStatus?: string }) {
  if (status === 'completed') {
    if (processingStatus === 'completed') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (processingStatus === 'failed') {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    // Still processing
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  }

  if (status === 'failed') {
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  }

  if (status === 'uploading') {
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  }

  if (status === 'classifying') {
    return <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />;
  }

  if (status === 'processing') {
    return <Loader2 className="h-4 w-4 text-purple-500 animate-spin" />;
  }

  // Pending
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

// ============================================
// QUEUE ITEM COMPONENT
// ============================================

function QueueItem({ item }: { item: UploadQueueItem }) {
  const { retryFailed, removeFromQueue } = useUploadQueue();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'pending':
        return 'Waiting...';
      case 'uploading':
        return `Uploading ${item.progress}%`;
      case 'classifying':
        return 'Identifying document type...';
      case 'processing':
        return 'Extracting data...';
      case 'completed':
        if (item.processingStatus === 'completed') return 'Complete';
        if (item.processingStatus === 'failed') return 'Upload OK, processing failed';
        if (item.processingStatus === 'classifying') return 'Identifying document type...';
        return 'Processing...';
      case 'failed':
        return item.error || 'Failed';
      default:
        return '';
    }
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-border/50 last:border-0">
      <StatusIcon status={item.status} processingStatus={item.processingStatus} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.fileName}</span>
          <span className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{getStatusText()}</span>
          {item.claimNumber && (
            <span className="text-xs text-muted-foreground">
              | Claim: {item.claimNumber}
            </span>
          )}
        </div>
        {(item.status === 'uploading' || item.status === 'pending') && (
          <Progress value={item.progress} className="h-1 mt-1" />
        )}
      </div>

      <div className="flex items-center gap-1">
        {item.status === 'failed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => retryFailed(item.id)}
            title="Retry upload"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
        {(item.status === 'completed' || item.status === 'failed') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => removeFromQueue(item.id)}
            title="Remove from list"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function UploadStatusBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const queue = useUploadQueue((state) => state.queue);
  const { clearCompleted, clearFailed, retryAllFailed, clearAll } = useUploadQueue();
  const stats = useUploadQueueStats();

  // Don't render if queue is empty
  if (queue.length === 0) {
    return null;
  }

  const { pending, uploading, classifying, processing, completed, failed, overallProgress, isActive } = stats;
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
            <ScrollArea className="max-h-64">
              <div className="divide-y divide-border/50">
                {queue.map((item) => (
                  <QueueItem key={item.id} item={item} />
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
