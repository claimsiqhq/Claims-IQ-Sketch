// Sketch Completeness Indicator Component
// Visual indicator for sketch completeness status with issue list

import React, { useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Home,
  DoorOpen,
  Ruler,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RoomGeometry } from '../types/geometry';
import type { SketchCompletenessIssue } from '../services/sketch-manipulation-store';
import { cn } from '@/lib/utils';

interface SketchCompletenessIndicatorProps {
  rooms: RoomGeometry[];
  issues: SketchCompletenessIssue[];
  isComplete: boolean;
  onIssueClick?: (issue: SketchCompletenessIssue) => void;
  className?: string;
  compact?: boolean;
}

// Issue type icons
const issueIcons: Record<SketchCompletenessIssue['type'], React.ReactNode> = {
  missing_ceiling_height: <Ruler className="h-3.5 w-3.5" />,
  missing_wall: <Square className="h-3.5 w-3.5" />,
  no_openings: <DoorOpen className="h-3.5 w-3.5" />,
  no_dimensions: <Ruler className="h-3.5 w-3.5" />,
};

// Severity icons and colors
const severityConfig: Record<SketchCompletenessIssue['severity'], {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}> = {
  error: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
};

export function SketchCompletenessIndicator({
  rooms,
  issues,
  isComplete,
  onIssueClick,
  className,
  compact = false,
}: SketchCompletenessIndicatorProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Group issues by severity
  const groupedIssues = useMemo(() => {
    return {
      errors: issues.filter(i => i.severity === 'error'),
      warnings: issues.filter(i => i.severity === 'warning'),
      infos: issues.filter(i => i.severity === 'info'),
    };
  }, [issues]);

  // Calculate room completeness stats
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const roomsWithIssues = new Set(issues.map(i => i.roomId)).size;
    const completeRooms = totalRooms - roomsWithIssues;

    return {
      totalRooms,
      completeRooms,
      roomsWithIssues,
      completionPercentage: totalRooms > 0 ? Math.round((completeRooms / totalRooms) * 100) : 100,
    };
  }, [rooms, issues]);

  // Compact badge view
  if (compact) {
    const badgeVariant = isComplete
      ? 'default'
      : groupedIssues.errors.length > 0
        ? 'destructive'
        : 'secondary';

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={badgeVariant}
              className={cn(
                'cursor-pointer',
                isComplete && 'bg-green-600 hover:bg-green-700',
                className
              )}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isComplete ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </>
              ) : (
                <>
                  {groupedIssues.errors.length > 0 ? (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 mr-1" />
                  )}
                  {issues.length} issue{issues.length !== 1 ? 's' : ''}
                </>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">
                {isComplete ? 'Sketch is complete' : `${issues.length} issue(s) found`}
              </p>
              {!isComplete && (
                <ul className="text-xs space-y-0.5">
                  {issues.slice(0, 3).map(issue => (
                    <li key={issue.roomId + issue.type} className="flex items-center gap-1">
                      {severityConfig[issue.severity].icon}
                      {issue.message}
                    </li>
                  ))}
                  {issues.length > 3 && (
                    <li className="text-muted-foreground">
                      +{issues.length - 3} more...
                    </li>
                  )}
                </ul>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full panel view
  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      {/* Header */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-between p-3 h-auto',
              isComplete ? 'hover:bg-green-50' : 'hover:bg-muted/50'
            )}
          >
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : groupedIssues.errors.length > 0 ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              <div className="text-left">
                <p className="text-sm font-medium">
                  {isComplete ? 'Sketch Complete' : 'Sketch Incomplete'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.completeRooms}/{stats.totalRooms} rooms verified
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Issue count badges */}
              {groupedIssues.errors.length > 0 && (
                <Badge variant="destructive" className="h-5 text-xs">
                  {groupedIssues.errors.length}
                </Badge>
              )}
              {groupedIssues.warnings.length > 0 && (
                <Badge className="h-5 text-xs bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                  {groupedIssues.warnings.length}
                </Badge>
              )}
              {groupedIssues.infos.length > 0 && (
                <Badge variant="secondary" className="h-5 text-xs">
                  {groupedIssues.infos.length}
                </Badge>
              )}
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
            {issues.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                All rooms have complete geometry data.
              </div>
            ) : (
              <>
                {/* Errors */}
                {groupedIssues.errors.length > 0 && (
                  <IssueGroup
                    title="Errors"
                    issues={groupedIssues.errors}
                    severity="error"
                    onIssueClick={onIssueClick}
                  />
                )}

                {/* Warnings */}
                {groupedIssues.warnings.length > 0 && (
                  <IssueGroup
                    title="Warnings"
                    issues={groupedIssues.warnings}
                    severity="warning"
                    onIssueClick={onIssueClick}
                  />
                )}

                {/* Info */}
                {groupedIssues.infos.length > 0 && (
                  <IssueGroup
                    title="Notes"
                    issues={groupedIssues.infos}
                    severity="info"
                    onIssueClick={onIssueClick}
                  />
                )}
              </>
            )}
          </div>

          {/* Progress bar */}
          <div className="border-t px-3 py-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Completion</span>
              <span className="font-medium">{stats.completionPercentage}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  stats.completionPercentage === 100
                    ? 'bg-green-500'
                    : stats.completionPercentage >= 75
                      ? 'bg-yellow-500'
                      : 'bg-destructive'
                )}
                style={{ width: `${stats.completionPercentage}%` }}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Issue group component
interface IssueGroupProps {
  title: string;
  issues: SketchCompletenessIssue[];
  severity: SketchCompletenessIssue['severity'];
  onIssueClick?: (issue: SketchCompletenessIssue) => void;
}

function IssueGroup({ title, issues, severity, onIssueClick }: IssueGroupProps) {
  const config = severityConfig[severity];

  return (
    <div className="space-y-1">
      <p className={cn('text-xs font-medium', config.color)}>{title}</p>
      {issues.map(issue => (
        <button
          key={issue.roomId + issue.type}
          className={cn(
            'w-full text-left rounded-md p-2 text-xs flex items-start gap-2',
            'transition-colors hover:opacity-80',
            config.bgColor
          )}
          onClick={() => onIssueClick?.(issue)}
        >
          <span className={config.color}>{issueIcons[issue.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{issue.roomName}</p>
            <p className="text-muted-foreground">{issue.message.split(': ')[1] || issue.message}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// Simplified status badge for toolbars
export function SketchStatusBadge({
  isComplete,
  issueCount,
  onClick,
  className,
}: {
  isComplete: boolean;
  issueCount: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Badge
      variant={isComplete ? 'default' : issueCount > 0 ? 'secondary' : 'outline'}
      className={cn(
        'cursor-pointer transition-colors',
        isComplete && 'bg-green-600 hover:bg-green-700',
        className
      )}
      onClick={onClick}
    >
      {isComplete ? (
        <>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Complete
        </>
      ) : (
        <>
          <AlertTriangle className="h-3 w-3 mr-1" />
          {issueCount} issue{issueCount !== 1 ? 's' : ''}
        </>
      )}
    </Badge>
  );
}

export default SketchCompletenessIndicator;
