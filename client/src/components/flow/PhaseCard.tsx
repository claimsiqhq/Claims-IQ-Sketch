/**
 * Phase Card Component
 *
 * Displays a single phase with its movements and completion status.
 * Expandable/collapsible to show movement details.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  PlayCircle,
  SkipForward,
  Lock,
  Home,
  Layers,
  MapPin,
  FileText,
  Shield,
  Wrench,
  Lightbulb,
  Mic
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowPhaseStatus, FlowMovement } from "@/lib/api";
import { getMovementGuidance } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface PhaseCardProps {
  phase: FlowPhaseStatus;
  movements?: FlowMovement[];
  isCurrentPhase?: boolean;
  onMovementClick?: (movement: FlowMovement) => void;
  flowInstanceId?: string;
  className?: string;
}

// Phase icons based on common phase names
const PHASE_ICONS: Record<string, React.ReactNode> = {
  arrival: <MapPin className="h-4 w-4" />,
  exterior: <Home className="h-4 w-4" />,
  interior: <Layers className="h-4 w-4" />,
  documentation: <FileText className="h-4 w-4" />,
  closeout: <CheckCircle2 className="h-4 w-4" />,
  safety: <Shield className="h-4 w-4" />,
  default: <Wrench className="h-4 w-4" />,
};

function getPhaseIcon(phaseName: string): React.ReactNode {
  const normalizedName = phaseName.toLowerCase();
  for (const [key, icon] of Object.entries(PHASE_ICONS)) {
    if (normalizedName.includes(key)) {
      return icon;
    }
  }
  return PHASE_ICONS.default;
}

export function PhaseCard({
  phase,
  movements = [],
  isCurrentPhase = false,
  onMovementClick,
  flowInstanceId,
  className
}: PhaseCardProps) {
  const [isExpanded, setIsExpanded] = useState(isCurrentPhase);

  const progressPercent = phase.movementCount > 0
    ? (phase.completedMovementCount / phase.movementCount) * 100
    : 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className={cn(
        "transition-all",
        isCurrentPhase && "ring-2 ring-primary ring-offset-2",
        phase.isCompleted && "bg-green-50/50 dark:bg-green-950/30",
        className
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center gap-3">
              {/* Phase Icon & Status */}
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                phase.isCompleted
                  ? "bg-green-500 text-white"
                  : isCurrentPhase
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {phase.isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  getPhaseIcon(phase.name)
                )}
              </div>

              {/* Phase Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base font-medium">
                    {phase.name}
                  </CardTitle>
                  {isCurrentPhase && (
                    <Badge variant="default" className="text-xs">
                      Current
                    </Badge>
                  )}
                  {phase.isCompleted && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      Complete
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {phase.completedMovementCount} / {phase.movementCount} movements
                  </span>
                  <Progress value={progressPercent} className="h-1.5 w-20" />
                </div>
              </div>

              {/* Expand/Collapse */}
              <div className="text-muted-foreground">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 border-t">
            {/* Description */}
            {phase.description && (
              <p className="text-sm text-muted-foreground mb-4 mt-3">
                {phase.description}
              </p>
            )}

            {/* Movements List */}
            <div className="space-y-2">
              {movements.length > 0 ? (
                movements.map((movement, index) => (
                  <MovementItem
                    key={movement.id}
                    movement={movement}
                    index={index}
                    onClick={onMovementClick}
                    flowInstanceId={flowInstanceId}
                  />
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No movements loaded for this phase.
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface MovementItemProps {
  movement: FlowMovement;
  index: number;
  onClick?: (movement: FlowMovement) => void;
  flowInstanceId?: string;
}

function MovementItem({ movement, index, onClick, flowInstanceId }: MovementItemProps) {
  const isCompleted = movement.completionStatus === 'completed';
  const isSkipped = movement.completionStatus === 'skipped';
  const isPending = !movement.completionStatus || movement.completionStatus === 'pending';
  const [showTips, setShowTips] = useState(false);
  
  // Fetch guidance if flowInstanceId is available
  const { data: guidance } = useQuery({
    queryKey: ['movementGuidance', flowInstanceId, movement.id],
    queryFn: () => getMovementGuidance(flowInstanceId!, movement.id),
    enabled: !!flowInstanceId && !!movement.id,
  });

  return (
    <div
      className={cn(
        "group flex flex-col gap-2 p-3 rounded-lg border transition-all",
        isCompleted && "bg-green-50/50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
        isSkipped && "bg-amber-50/50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
        isPending && "bg-background border-border hover:bg-muted/50 hover:shadow-sm",
        onClick && isPending && "cursor-pointer"
      )}
      onClick={() => onClick && isPending && onClick(movement)}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold",
          isCompleted && "bg-green-500 text-white",
          isSkipped && "bg-amber-500 text-white",
          isPending && "bg-primary/10 text-primary border-2 border-primary/20"
        )}>
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : isSkipped ? (
            <SkipForward className="h-3 w-3" />
          ) : (
            index + 1
          )}
        </div>

        {/* Movement Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-sm font-semibold",
              isCompleted && "text-green-700 dark:text-green-300",
              isSkipped && "text-amber-700 dark:text-amber-300 line-through",
              isPending && "text-foreground"
            )}>
              {movement.name}
            </span>
            {movement.isRequired && (
              <Badge variant="outline" className="text-xs h-5">
                <Lock className="h-2.5 w-2.5 mr-1" />
                Required
              </Badge>
            )}
            {movement.roomSpecific && movement.roomName && (
              <Badge variant="secondary" className="text-xs h-5">
                {movement.roomName}
              </Badge>
            )}
          </div>
          {movement.description && (
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {movement.description}
            </p>
          )}
          {guidance?.instruction && (
            <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed font-medium">
              {guidance.instruction}
            </p>
          )}
          {movement.notes && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 italic">
              "{movement.notes}"
            </p>
          )}
          
          {/* Tips Section */}
          {guidance?.tips && guidance.tips.length > 0 && (
            <div className="mt-2 pt-2 border-t border-muted">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTips(!showTips);
                }}
                className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>{guidance.tips.length} tip{guidance.tips.length !== 1 ? 's' : ''}</span>
                <ChevronRight className={cn("h-3 w-3 transition-transform", showTips && "rotate-90")} />
              </button>
              {showTips && (
                <ul className="mt-2 space-y-1.5 pl-5">
                  {guidance.tips.map((tip, tipIndex) => (
                    <li key={tipIndex} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                      <span className="flex-1">{tip}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Action */}
        {isPending && onClick && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-shrink-0 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onClick(movement);
            }}
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default PhaseCard;
