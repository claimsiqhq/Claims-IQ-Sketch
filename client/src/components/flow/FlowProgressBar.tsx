/**
 * Flow Progress Bar Component
 *
 * Visual progress indicator showing:
 * - Overall percentage complete
 * - Step count (completed / total)
 * - Optional phase indicators
 */

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import type { FlowProgress, FlowPhaseStatus } from "@/lib/api";

interface FlowProgressBarProps {
  progress: FlowProgress;
  phases?: FlowPhaseStatus[];
  currentPhaseId?: string | null;
  showPhaseIndicators?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FlowProgressBar({
  progress,
  phases,
  currentPhaseId,
  showPhaseIndicators = false,
  size = 'md',
  className,
}: FlowProgressBarProps) {
  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {Math.round(progress.percentComplete)}% Complete
          </span>
          <span className="text-muted-foreground">
            {progress.completed} of {progress.total}
          </span>
        </div>
        <Progress
          value={progress.percentComplete}
          className={heightClasses[size]}
        />
      </div>

      {/* Phase Indicators */}
      {showPhaseIndicators && phases && phases.length > 0 && (
        <div className="flex items-center justify-between px-1">
          {phases.map((phase, index) => {
            const isCompleted = phase.isCompleted;
            const isCurrent = phase.id === currentPhaseId;
            const isPending = !isCompleted && !isCurrent;

            return (
              <div key={phase.id} className="flex items-center">
                {/* Phase Dot */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    isCompleted && "bg-green-500 text-white",
                    isCurrent && "bg-primary text-primary-foreground",
                    isPending && "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isCurrent ? (
                      <PlayCircle className="h-4 w-4" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs mt-1 text-center max-w-[60px] truncate",
                    isCurrent && "font-medium text-primary",
                    isCompleted && "text-green-600 dark:text-green-400",
                    isPending && "text-muted-foreground"
                  )}>
                    {phase.name}
                  </span>
                </div>

                {/* Connector Line */}
                {index < phases.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-2",
                    isCompleted ? "bg-green-500" : "bg-muted"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Compact progress indicator for small spaces
 */
interface CompactProgressProps {
  progress: FlowProgress;
  className?: string;
}

export function CompactFlowProgress({ progress, className }: CompactProgressProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress value={progress.percentComplete} className="h-1.5 flex-1" />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {progress.completed}/{progress.total}
      </span>
    </div>
  );
}

/**
 * Circular progress indicator
 */
interface CircularProgressProps {
  progress: FlowProgress;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularFlowProgress({
  progress,
  size = 60,
  strokeWidth = 6,
  className
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress.percentComplete / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-semibold">
          {Math.round(progress.percentComplete)}%
        </span>
      </div>
    </div>
  );
}

export default FlowProgressBar;
