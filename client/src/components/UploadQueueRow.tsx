import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type UploadQueueItem, type UploadStatus } from "@/lib/uploadQueue";

interface UploadQueueRowProps {
  item: UploadQueueItem;
  onRetry?: () => void;
  onRemove?: () => void;
  variant?: "compact" | "full";
}

function StatusIcon({ status, processingStatus }: { status: UploadStatus; processingStatus?: string }) {
  if (status === "completed") {
    if (processingStatus === "completed") {
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    }
    if (processingStatus === "failed") {
      return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
    }
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />;
  }
  if (status === "failed") {
    return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />;
  }
  if (status === "uploading") {
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />;
  }
  if (status === "classifying") {
    return <Loader2 className="h-4 w-4 text-orange-500 animate-spin shrink-0" />;
  }
  if (status === "processing") {
    return <Loader2 className="h-4 w-4 text-purple-500 animate-spin shrink-0" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function getStatusBadge(item: UploadQueueItem) {
  switch (item.status) {
    case "pending":
      return <Badge variant="outline" className="text-slate-500 shrink-0">Queued</Badge>;
    case "uploading":
      return <Badge variant="outline" className="text-blue-600 bg-blue-50 shrink-0">Uploading {item.progress}%</Badge>;
    case "classifying":
      return <Badge variant="outline" className="text-purple-600 bg-purple-50 shrink-0">Classifying</Badge>;
    case "processing":
      return <Badge variant="outline" className="text-amber-600 bg-amber-50 shrink-0">Processing</Badge>;
    case "completed":
      return <Badge variant="outline" className="text-green-600 bg-green-50 shrink-0">Done</Badge>;
    case "failed":
      return <Badge variant="destructive" className="shrink-0">Failed</Badge>;
    default:
      return null;
  }
}

function getStatusText(item: UploadQueueItem): string {
  switch (item.status) {
    case "pending":
      return "Waiting...";
    case "uploading":
      return `Uploading ${item.progress}%`;
    case "classifying":
      return "Identifying...";
    case "processing":
      return "Extracting data...";
    case "completed":
      if (item.processingStatus === "completed") return "Complete";
      if (item.processingStatus === "failed") return "Processing failed";
      if (item.processingStatus === "classifying") return "Identifying...";
      return "Processing...";
    case "failed":
      return item.error || "Failed";
    default:
      return "";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadQueueRow({ item, onRetry, onRemove, variant = "full" }: UploadQueueRowProps) {
  const showActions = onRetry || onRemove;
  
  return (
    <div 
      className={cn(
        "grid gap-2 py-2 px-3 border-b border-border/50 last:border-0",
        "grid-cols-[auto_minmax(0,1fr)_auto]",
        "items-start"
      )}
      data-testid={`upload-row-${item.id}`}
    >
      <StatusIcon status={item.status} processingStatus={item.processingStatus} />

      <div className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span 
            className="text-sm font-medium break-all line-clamp-2"
            title={item.fileName}
          >
            {item.fileName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatFileSize(item.fileSize)}
          </span>
          {variant === "full" && getStatusBadge(item)}
        </div>
        
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
          {variant === "compact" && <span>{getStatusText(item)}</span>}
          {variant === "full" && item.type && item.type !== "auto" && (
            <span className="capitalize">{item.type}</span>
          )}
          {item.error && (
            <span className="text-destructive">{item.error}</span>
          )}
          {item.claimNumber && (
            <span>Claim: {item.claimNumber}</span>
          )}
        </div>

        {(item.status === "uploading" || item.status === "pending") && (
          <Progress value={item.progress} className="h-1 mt-1.5" />
        )}
      </div>

      {showActions && (
        <div className="flex items-center gap-1 shrink-0">
          {item.status === "failed" && onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRetry}
              title="Retry upload"
              data-testid={`button-retry-upload-${item.id}`}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {(item.status === "pending" || item.status === "failed" || item.status === "completed") && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              title="Remove"
              data-testid={`button-remove-upload-${item.id}`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadQueueRow;
