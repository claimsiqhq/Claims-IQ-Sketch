/**
 * Inspection Tips Panel Component
 *
 * Displays peril-specific inspection tips as a collapsible, non-blocking panel.
 * Part of the Peril-Specific Inspection Intelligence Layer.
 *
 * Features:
 * - Collapsible design (informational only)
 * - Peril-driven tips
 * - Quick tips for immediate reference
 * - Links to full inspection intelligence
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Lightbulb,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Camera,
  MapPin,
  Shield,
  Loader2,
} from "lucide-react";
import {
  getInspectionIntelligenceByPeril,
  type InspectionIntelligence,
  type EscalationTrigger,
} from "@/lib/api";
import { Peril } from "@/lib/types";

interface InspectionTipsPanelProps {
  peril: Peril | string;
  secondaryPerils?: (Peril | string)[];
  claimId?: string;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Collapsible panel showing peril-specific inspection tips
 */
export function InspectionTipsPanel({
  peril,
  secondaryPerils = [],
  claimId,
  className,
  defaultExpanded = false,
}: InspectionTipsPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [intelligence, setIntelligence] = useState<InspectionIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIntelligence = async () => {
      if (!peril) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getInspectionIntelligenceByPeril(peril);
        setIntelligence(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tips');
      } finally {
        setLoading(false);
      }
    };

    fetchIntelligence();
  }, [peril]);

  if (!peril) return null;

  const urgencyColors: Record<string, string> = {
    immediate: 'bg-red-100 text-red-700 border-red-300',
    same_day: 'bg-amber-100 text-amber-700 border-amber-300',
    within_48h: 'bg-blue-100 text-blue-700 border-blue-300',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn("border-dashed", className)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Inspection Tips
                {intelligence && (
                  <Badge variant="secondary" className="text-xs">
                    {intelligence.primaryPerilRules.displayName}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {intelligence && (
              <>
                {/* Quick Tips */}
                {intelligence.quickTips.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Quick Tips
                    </h4>
                    <ul className="space-y-1.5">
                      {intelligence.quickTips.map((tip, index) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Priority Areas */}
                {intelligence.primaryPerilRules.priorityAreas.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Where to Start
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {intelligence.primaryPerilRules.priorityAreas
                        .filter(area => area.criticalityLevel === 'high')
                        .slice(0, 4)
                        .map((area, index) => (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs cursor-help",
                                  area.criticalityLevel === 'high' && "border-red-300 bg-red-50",
                                )}
                              >
                                {area.area}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p>{area.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                    </div>
                  </div>
                )}

                {/* Common Misses (top 2) */}
                {intelligence.primaryPerilRules.commonMisses.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Don't Miss
                    </h4>
                    <ul className="space-y-1.5">
                      {intelligence.primaryPerilRules.commonMisses.slice(0, 2).map((miss, index) => (
                        <Tooltip key={index}>
                          <TooltipTrigger asChild>
                            <li className="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded cursor-help">
                              {miss.issue}
                            </li>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p className="font-medium">{miss.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Consequence: {miss.consequence}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Safety Considerations (if any) */}
                {intelligence.primaryPerilRules.safetyConsiderations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Safety
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {intelligence.primaryPerilRules.safetyConsiderations[0]}
                    </p>
                  </div>
                )}

                {/* Escalation Triggers (immediate only) */}
                {intelligence.escalationTriggers.filter(t => t.urgency === 'immediate').length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-red-600 uppercase tracking-wider">
                      Escalate Immediately If:
                    </h4>
                    <ul className="space-y-1">
                      {intelligence.escalationTriggers
                        .filter(t => t.urgency === 'immediate')
                        .slice(0, 2)
                        .map((trigger, index) => (
                          <li key={index} className="text-xs text-red-600">
                            • {trigger.condition}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {!intelligence && !loading && !error && (
              <p className="text-sm text-muted-foreground">
                No inspection tips available for this peril.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/**
 * Compact inline inspection hint for quick reference
 */
export function InspectionHint({
  peril,
  className,
}: {
  peril: Peril | string;
  className?: string;
}) {
  const [tips, setTips] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    const fetchTips = async () => {
      if (!peril) return;
      try {
        const data = await getInspectionIntelligenceByPeril(peril);
        setTips(data.quickTips || []);
      } catch {
        // Silently fail for inline hints
      }
    };
    fetchTips();
  }, [peril]);

  if (tips.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1 text-xs text-amber-600 cursor-help",
            className
          )}
        >
          <Lightbulb className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{tips[currentTipIndex]}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          {tips.map((tip, index) => (
            <p key={index} className={cn("text-xs", index === currentTipIndex && "font-medium")}>
              • {tip}
            </p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default InspectionTipsPanel;
