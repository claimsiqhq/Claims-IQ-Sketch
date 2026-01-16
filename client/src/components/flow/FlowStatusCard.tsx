/**
 * Flow Status Card Component
 *
 * Displays current flow status including:
 * - Current phase name and progress
 * - Percentage complete
 * - Time elapsed
 * - Continue button to navigate to current movement
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  PlayCircle,
  Pause,
  CheckCircle2,
  Clock,
  ChevronRight,
  XCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { FlowInstance, FlowProgress } from "@/lib/api";

interface FlowStatusCardProps {
  flow: FlowInstance;
  onContinue: () => void;
  onCancel?: () => void;
  className?: string;
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  active: {
    label: "In Progress",
    icon: PlayCircle,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-800",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950",
    border: "border-amber-200 dark:border-amber-800",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950",
    border: "border-green-200 dark:border-green-800",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950",
    border: "border-red-200 dark:border-red-800",
  },
};

export function FlowStatusCard({
  flow,
  onContinue,
  onCancel,
  className,
  isLoading = false
}: FlowStatusCardProps) {
  const statusConfig = STATUS_CONFIG[flow.status] || STATUS_CONFIG.active;
  const StatusIcon = statusConfig.icon;

  // Calculate progress
  const progress = flow.progress || {
    total: 0,
    completed: 0,
    percentComplete: 0,
  };

  // Calculate time elapsed
  const timeElapsed = flow.startedAt
    ? formatDistanceToNow(new Date(flow.startedAt), { addSuffix: false })
    : null;

  return (
    <Card className={cn(statusConfig.bg, statusConfig.border, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <StatusIcon className={cn("h-5 w-5", statusConfig.color)} />
            Inspection Flow
          </CardTitle>
          <Badge variant="outline" className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Flow Name and Description */}
        <div>
          <h4 className="font-medium text-sm">{flow.flowName || "Inspection Flow"}</h4>
          {flow.flowDescription && (
            <p className="text-xs text-muted-foreground mt-1">{flow.flowDescription}</p>
          )}
        </div>

        {/* Current Phase */}
        {flow.currentPhaseName && (
          <div className="p-3 bg-background/50 rounded-lg border">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Current Phase
            </div>
            <div className="font-medium">{flow.currentPhaseName}</div>
            {flow.currentPhaseDescription && (
              <p className="text-xs text-muted-foreground mt-1">
                {flow.currentPhaseDescription}
              </p>
            )}
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {progress.completed} / {progress.total} movements
            </span>
          </div>
          <Progress value={progress.percentComplete} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress.percentComplete)}% complete</span>
            {timeElapsed && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeElapsed}
              </span>
            )}
          </div>
        </div>

        {/* Completed Movements Badge */}
        {flow.completedMovements && flow.completedMovements.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>{flow.completedMovements.length} movements completed</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {flow.status === 'active' && (
            <Button
              onClick={onContinue}
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Continue Inspection
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {flow.status === 'paused' && (
            <Button
              onClick={onContinue}
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Resume Inspection
            </Button>
          )}
          {flow.status === 'completed' && (
            <Button
              onClick={onContinue}
              variant="outline"
              className="flex-1"
            >
              View Summary
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {flow.status === 'active' && onCancel && (
            <Button
              onClick={onCancel}
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              title="Cancel Flow"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FlowStatusCard;
