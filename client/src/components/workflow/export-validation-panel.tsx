/**
 * Export Validation Panel
 *
 * Displays evidence completeness and export readiness for a workflow.
 * Shows gaps, warnings, and risk levels.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Camera,
  Ruler,
  FileText,
  Download,
  RefreshCw,
  Loader2,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

export type RiskLevel = "none" | "low" | "medium" | "high" | "blocked";

export interface EvidenceGap {
  stepId: string;
  stepTitle: string;
  requirement: {
    type: string;
    label: string;
    required: boolean;
  };
  isBlocking: boolean;
  reason: string;
}

export interface ExportValidationResult {
  canExport: boolean;
  riskLevel: RiskLevel;
  gaps: EvidenceGap[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    blockedSteps: number;
    evidenceComplete: number;
    evidenceMissing: number;
  };
  warnings: string[];
}

export interface ExportValidationPanelProps {
  workflowId: string;
  onValidate: () => Promise<ExportValidationResult>;
  onExport: () => Promise<void>;
  className?: string;
}

// ============================================
// RISK LEVEL CONFIG
// ============================================

const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  none: {
    label: "Ready to Export",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-950",
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
  },
  low: {
    label: "Low Risk",
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-950",
    icon: <Shield className="h-5 w-5 text-blue-600" />,
  },
  medium: {
    label: "Medium Risk",
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-950",
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  },
  high: {
    label: "High Risk",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-950",
    icon: <FileWarning className="h-5 w-5 text-orange-600" />,
  },
  blocked: {
    label: "Export Blocked",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-950",
    icon: <XCircle className="h-5 w-5 text-red-600" />,
  },
};

// ============================================
// COMPONENT
// ============================================

export function ExportValidationPanel({
  workflowId,
  onValidate,
  onExport,
  className,
}: ExportValidationPanelProps) {
  const [validation, setValidation] = useState<ExportValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showGaps, setShowGaps] = useState(false);

  // Auto-validate on mount
  useEffect(() => {
    handleValidate();
  }, [workflowId]);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const result = await onValidate();
      setValidation(result);
    } catch (error) {
      console.error("Validation error:", error);
    } finally {
      setIsValidating(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport();
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!validation && !isValidating) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Button onClick={handleValidate}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Validate for Export
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isValidating) {
    return (
      <Card className={className}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span>Validating workflow...</span>
        </CardContent>
      </Card>
    );
  }

  if (!validation) return null;

  const riskConfig = RISK_LEVEL_CONFIG[validation.riskLevel];
  const evidencePercent =
    validation.summary.evidenceComplete + validation.summary.evidenceMissing > 0
      ? (validation.summary.evidenceComplete /
          (validation.summary.evidenceComplete + validation.summary.evidenceMissing)) *
        100
      : 100;

  const blockingGaps = validation.gaps.filter((g) => g.isBlocking);
  const advisoryGaps = validation.gaps.filter((g) => !g.isBlocking);

  return (
    <Card className={cn(className, riskConfig.bgColor)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {riskConfig.icon}
            <div>
              <CardTitle className={cn("text-lg", riskConfig.color)}>
                {riskConfig.label}
              </CardTitle>
              <CardDescription>
                {validation.canExport
                  ? "Workflow is ready for export"
                  : "Some evidence is missing"}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleValidate}
            disabled={isValidating}
          >
            <RefreshCw
              className={cn("h-4 w-4", isValidating && "animate-spin")}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold">
              {validation.summary.completedSteps}
            </div>
            <div className="text-xs text-muted-foreground">
              / {validation.summary.totalSteps} Steps
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {validation.summary.evidenceComplete}
            </div>
            <div className="text-xs text-muted-foreground">Evidence OK</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">
              {validation.summary.evidenceMissing}
            </div>
            <div className="text-xs text-muted-foreground">Missing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {validation.summary.blockedSteps}
            </div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
        </div>

        {/* Evidence Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Evidence Completeness</span>
            <span>{Math.round(evidencePercent)}%</span>
          </div>
          <Progress value={evidencePercent} className="h-2" />
        </div>

        {/* Warnings */}
        {validation.warnings.length > 0 && (
          <div className="space-y-2">
            {validation.warnings.map((warning, i) => (
              <Alert key={i} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Evidence Gaps */}
        {validation.gaps.length > 0 && (
          <Collapsible open={showGaps} onOpenChange={setShowGaps}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4" />
                  {validation.gaps.length} Evidence Gap{validation.gaps.length > 1 ? "s" : ""}
                </span>
                {showGaps ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {/* Blocking Gaps */}
              {blockingGaps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    Blocking ({blockingGaps.length})
                  </h4>
                  {blockingGaps.map((gap, i) => (
                    <GapItem key={i} gap={gap} isBlocking />
                  ))}
                </div>
              )}

              {/* Advisory Gaps */}
              {advisoryGaps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Recommended ({advisoryGaps.length})
                  </h4>
                  {advisoryGaps.map((gap, i) => (
                    <GapItem key={i} gap={gap} isBlocking={false} />
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Export Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleExport}
          disabled={!validation.canExport || isExporting}
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : validation.canExport ? (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export to Xactimate
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 mr-2" />
              Export Blocked
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================
// GAP ITEM COMPONENT
// ============================================

function GapItem({ gap, isBlocking }: { gap: EvidenceGap; isBlocking: boolean }) {
  const getIcon = () => {
    switch (gap.requirement.type) {
      case "photo":
        return <Camera className="h-4 w-4" />;
      case "measurement":
        return <Ruler className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
      default:
        return <FileWarning className="h-4 w-4" />;
    }
  };

  return (
    <div
      className={cn(
        "p-2 rounded border text-sm",
        isBlocking
          ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
          : "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground flex-shrink-0 mt-0.5">{getIcon()}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{gap.stepTitle}</div>
          <div className="text-xs text-muted-foreground">
            {gap.requirement.label}: {gap.reason}
          </div>
        </div>
        <Badge
          variant={isBlocking ? "destructive" : "outline"}
          className="flex-shrink-0 text-xs"
        >
          {gap.requirement.type}
        </Badge>
      </div>
    </div>
  );
}

export default ExportValidationPanel;
