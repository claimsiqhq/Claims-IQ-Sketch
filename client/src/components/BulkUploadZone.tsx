import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUploadQueue,
  useUploadQueueStats,
  subscribeToCompletions,
  type DocumentUploadType,
  type UploadQueueItem,
} from "@/lib/uploadQueue";

interface BulkUploadZoneProps {
  className?: string;
  compact?: boolean;
  onUploadComplete?: () => void;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
  if (['doc', 'docx'].includes(ext || '')) return '📝';
  if (['xls', 'xlsx'].includes(ext || '')) return '📊';
  return '📎';
}

function getStatusBadge(item: UploadQueueItem) {
  switch (item.status) {
    case 'pending':
      return <Badge variant="outline" className="text-slate-500">Queued</Badge>;
    case 'uploading':
      return <Badge variant="outline" className="text-blue-600 bg-blue-50">Uploading {item.progress}%</Badge>;
    case 'classifying':
      return <Badge variant="outline" className="text-purple-600 bg-purple-50">Classifying</Badge>;
    case 'processing':
      return <Badge variant="outline" className="text-amber-600 bg-amber-50">Processing</Badge>;
    case 'completed':
      return <Badge variant="outline" className="text-green-600 bg-green-50">Done</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadQueueItem({ 
  item, 
  onRemove, 
  onRetry 
}: { 
  item: UploadQueueItem; 
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm">
      <span className="text-lg shrink-0">{getFileIcon(item.fileName)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.fileName}</span>
          {getStatusBadge(item)}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(item.fileSize)}</span>
          {item.type !== 'auto' && (
            <>
              <span>•</span>
              <span className="capitalize">{item.type}</span>
            </>
          )}
          {item.error && (
            <>
              <span>•</span>
              <span className="text-destructive">{item.error}</span>
            </>
          )}
        </div>
        {item.status === 'uploading' && (
          <Progress value={item.progress} className="h-1 mt-1" />
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {item.status === 'failed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRetry}
            data-testid={`button-retry-upload-${item.id}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {(item.status === 'pending' || item.status === 'failed' || item.status === 'completed') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            data-testid={`button-remove-upload-${item.id}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function BulkUploadZone({ className, compact = false, onUploadComplete }: BulkUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track pending completion notification
  const pendingCompletionRef = useRef(false);
  
  const { 
    queue, 
    addToQueue, 
    removeFromQueue, 
    retryFailed, 
    retryAllFailed,
    clearCompleted, 
    clearAll 
  } = useUploadQueue();
  
  const stats = useUploadQueueStats();

  // Subscribe to completion events from the store
  useEffect(() => {
    const unsubscribe = subscribeToCompletions(() => {
      pendingCompletionRef.current = true;
    });
    return unsubscribe;
  }, []);

  // Fire onUploadComplete when queue becomes idle and we have pending completions
  useEffect(() => {
    if (!stats.isActive && pendingCompletionRef.current) {
      pendingCompletionRef.current = false;
      onUploadComplete?.();
    }
  }, [stats.isActive, onUploadComplete]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addToQueue(files, { type: 'auto' as DocumentUploadType });
    }
  }, [addToQueue]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addToQueue(files, { type: 'auto' as DocumentUploadType });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addToQueue]);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (compact && queue.length === 0) {
    return (
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
          className
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        data-testid="bulk-upload-zone-compact"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Upload className="h-5 w-5" />
          <span className="text-sm font-medium">Drop files or click to upload claims</span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="bulk-upload-zone">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Bulk Upload
            {stats.isActive && (
              <Badge variant="secondary" className="ml-2">
                {stats.uploading + stats.processing} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <>
                {stats.completed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCompleted}
                    className="h-7 text-xs"
                    data-testid="button-clear-completed"
                  >
                    Clear done
                  </Button>
                )}
                {stats.failed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={retryAllFailed}
                    className="h-7 text-xs"
                    data-testid="button-retry-all"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry all
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsExpanded(!isExpanded)}
                  data-testid="button-toggle-queue"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-3",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          data-testid="bulk-upload-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
              isDragging ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {isDragging ? "Drop files here" : "Drag & drop claim documents"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                FNOL, policies, endorsements • PDF, images, docs
              </p>
            </div>
          </div>
        </div>

        {stats.isActive && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Overall progress</span>
              <span>{stats.completed} of {stats.total} complete</span>
            </div>
            <Progress value={stats.total > 0 ? (stats.completed / stats.total) * 100 : 0} className="h-2" />
          </div>
        )}

        {queue.length > 0 && isExpanded && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {queue.map((item) => (
                <UploadQueueItem
                  key={item.id}
                  item={item}
                  onRemove={() => removeFromQueue(item.id)}
                  onRetry={() => retryFailed(item.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {queue.length === 0 && (
          <div className="text-center py-2 text-sm text-muted-foreground">
            No documents in queue
          </div>
        )}
      </CardContent>
    </Card>
  );
}

