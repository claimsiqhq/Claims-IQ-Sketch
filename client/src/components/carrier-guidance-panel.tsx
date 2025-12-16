/**
 * Carrier Guidance Panel Component
 *
 * Displays carrier-specific inspection guidance as a read-only panel.
 * Shows carrier requirements, emphases, and notes that overlay the base peril rules.
 *
 * Features:
 * - Read-only display
 * - Shows carrier name and requirements
 * - Highlights additional requirements
 * - Displays carrier notes
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  getClaimCarrierGuidance,
  type MergedInspectionWithCarrier,
  type AdditionalRequirement,
} from "@/lib/api";

interface CarrierGuidancePanelProps {
  claimId: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function CarrierGuidancePanel({
  claimId,
  className,
  defaultExpanded = true,
}: CarrierGuidancePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [guidance, setGuidance] = useState<MergedInspectionWithCarrier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGuidance = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    setError(null);

    try {
      const data = await getClaimCarrierGuidance(claimId);
      setGuidance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load carrier guidance');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    fetchGuidance();
  }, [fetchGuidance]);

  // Don't render if no carrier guidance exists
  if (!loading && !guidance?.carrierGuidance) {
    return null;
  }

  const carrierGuidance = guidance?.carrierGuidance;
  const additionalRequirements = guidance?.additionalRequirements || [];
  const carrierNotes = guidance?.carrierNotes || [];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn("border-blue-200 bg-blue-50/30", className)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-blue-50/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="text-blue-800">Carrier Guidance</span>
                {carrierGuidance && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                    {carrierGuidance.carrierName}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-blue-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-blue-600" />
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

            {carrierGuidance && (
              <>
                {/* Additional Requirements */}
                {additionalRequirements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-blue-800 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Carrier Requirements
                    </h4>
                    <ul className="space-y-1.5">
                      {additionalRequirements.map((req, index) => (
                        <RequirementItem key={index} requirement={req} />
                      ))}
                    </ul>
                  </div>
                )}

                {/* Emphasis Areas */}
                {carrierGuidance.emphasis.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-blue-800 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Areas of Emphasis
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {carrierGuidance.emphasis.map((item, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs bg-blue-100 text-blue-700 border-blue-300"
                        >
                          {formatEmphasis(item)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Carrier Notes */}
                {(carrierNotes.length > 0 || carrierGuidance.notes) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-blue-800 uppercase tracking-wider flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Carrier Notes
                    </h4>
                    <ul className="space-y-1 text-sm text-blue-700">
                      {carrierGuidance.notes && (
                        <li className="bg-blue-100 px-2 py-1 rounded">
                          {carrierGuidance.notes}
                        </li>
                      )}
                      {carrierNotes.map((note, index) => (
                        <li key={index} className="bg-blue-100 px-2 py-1 rounded">
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* De-emphasis Note */}
                {carrierGuidance.deEmphasis.length > 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    Note: This carrier de-emphasizes: {carrierGuidance.deEmphasis.join(', ')}
                  </p>
                )}
              </>
            )}

            {!carrierGuidance && !loading && !error && (
              <p className="text-sm text-muted-foreground">
                No carrier-specific guidance for this claim.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Requirement item component
function RequirementItem({ requirement }: { requirement: AdditionalRequirement }) {
  return (
    <div className={cn(
      "flex items-start gap-2 text-sm px-2 py-1.5 rounded",
      requirement.required ? "bg-blue-100" : "bg-blue-50"
    )}>
      <span className="flex-shrink-0 mt-0.5">
        {requirement.required ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
        ) : (
          <Info className="h-3.5 w-3.5 text-blue-400" />
        )}
      </span>
      <span className={cn(
        "text-blue-700",
        requirement.required && "font-medium"
      )}>
        {requirement.description}
        {requirement.required && (
          <span className="text-xs text-blue-500 ml-1">(Required)</span>
        )}
      </span>
    </div>
  );
}

// Format emphasis text to be more readable
function formatEmphasis(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Inline carrier guidance badge - for compact display
 */
export function CarrierGuidanceBadge({
  claimId,
  className,
}: {
  claimId: string;
  className?: string;
}) {
  const [guidance, setGuidance] = useState<MergedInspectionWithCarrier | null>(null);

  useEffect(() => {
    const fetchGuidance = async () => {
      if (!claimId) return;
      try {
        const data = await getClaimCarrierGuidance(claimId);
        setGuidance(data);
      } catch {
        // Silently fail for badge display
      }
    };
    fetchGuidance();
  }, [claimId]);

  if (!guidance?.carrierGuidance) {
    return null;
  }

  const requirementCount = guidance.additionalRequirements.filter(r => r.required).length;

  return (
    <Badge variant="outline" className={cn("text-xs text-blue-600 border-blue-300", className)}>
      <Building2 className="h-3 w-3 mr-1" />
      {guidance.carrierGuidance.carrierName}
      {requirementCount > 0 && (
        <span className="ml-1 bg-blue-600 text-white px-1 rounded">
          {requirementCount}
        </span>
      )}
    </Badge>
  );
}

export default CarrierGuidancePanel;
