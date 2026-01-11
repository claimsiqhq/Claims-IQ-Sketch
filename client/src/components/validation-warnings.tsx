/**
 * Validation Warnings Component
 *
 * Displays validation issues for estimates with categorization,
 * severity indicators, and actionable suggestions.
 *
 * Features:
 * - Grouped by severity (errors, warnings, info)
 * - Category-based filtering
 * - Expandable issue details
 * - Suggested fixes
 *
 * See: docs/ESTIMATE_ENGINE.md for validation architecture.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  details?: string;
  suggestion?: string;
  relatedItems?: string[];
  zoneId?: string;
  zoneName?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationIssue[];
  validatedAt?: Date;
  summary?: {
    missingCompanions: number;
    quantityMismatches: number;
    tradeIncomplete: number;
    coverageIssues: number;
    pricingAnomalies: number;
    duplicateItems: number;
  };
}

interface ValidationWarningsProps {
  validation: ValidationResult;
  className?: string;
  compact?: boolean;
  showCategoryFilter?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const SEVERITY_CONFIG = {
  error: {
    label: "Errors",
    icon: "!",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-800",
    badgeVariant: "destructive" as const,
  },
  warning: {
    label: "Warnings",
    icon: "!",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    textColor: "text-yellow-800",
    badgeVariant: "secondary" as const,
  },
  info: {
    label: "Info",
    icon: "i",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-800",
    badgeVariant: "outline" as const,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  dependency: "Dependencies",
  quantity: "Quantities",
  exclusion: "Exclusions",
  replacement: "Replacements",
  completeness: "Completeness",
  depreciation: "Depreciation",
  coverage: "Coverage",
  missing_companion: "Missing Companions",
  quantity_mismatch: "Quantity Mismatches",
  trade_incomplete: "Trade Incomplete",
  coverage_issue: "Coverage Issues",
  pricing_anomaly: "Pricing Anomalies",
  duplicate_item: "Duplicates",
};

const CATEGORY_ICONS: Record<string, string> = {
  dependency: "->",
  quantity: "#",
  exclusion: "X",
  replacement: "<>",
  completeness: "+",
  depreciation: "%",
  coverage: "C",
  missing_companion: "+",
  quantity_mismatch: "#",
  trade_incomplete: "...",
  coverage_issue: "C",
  pricing_anomaly: "$",
  duplicate_item: "2x",
};

// ============================================
// MAIN COMPONENT
// ============================================

export function ValidationWarnings({
  validation,
  className,
  compact = false,
  showCategoryFilter = true,
}: ValidationWarningsProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  // Group issues by severity
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const infos = validation.issues.filter((i) => i.severity === "info");

  // Get unique categories
  const categories = Array.from(
    new Set(validation.issues.map((i) => i.category))
  ).sort();

  // Filter issues by category if selected
  const filteredIssues = selectedCategory
    ? validation.issues.filter((i) => i.category === selectedCategory)
    : validation.issues;

  if (validation.issues.length === 0) {
    return (
      <div className={cn("text-center py-6", className)}>
        <div className="text-4xl mb-2">OK</div>
        <h3 className="font-medium text-lg text-green-600">Validation Passed</h3>
        <p className="text-muted-foreground text-sm">
          No issues found in this estimate.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <CompactValidation
        validation={validation}
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <h3 className="font-medium">
          Validation Results
        </h3>
        {validation.errorCount > 0 && (
          <Badge variant="destructive">
            {validation.errorCount} Error{validation.errorCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {validation.warningCount > 0 && (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            {validation.warningCount} Warning{validation.warningCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {validation.infoCount > 0 && (
          <Badge variant="outline">
            {validation.infoCount} Info
          </Badge>
        )}
      </div>

      {/* Category Filter */}
      {showCategoryFilter && categories.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={selectedCategory === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            All ({validation.issues.length})
          </Badge>
          {categories.map((cat) => {
            const count = validation.issues.filter((i) => i.category === cat).length;
            return (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(cat)}
              >
                {CATEGORY_LABELS[cat] || cat} ({count})
              </Badge>
            );
          })}
        </div>
      )}

      {/* Issues by Severity */}
      <Tabs defaultValue={errors.length > 0 ? "errors" : warnings.length > 0 ? "warnings" : "info"}>
        <TabsList>
          <TabsTrigger value="errors" disabled={errors.length === 0}>
            Errors ({errors.length})
          </TabsTrigger>
          <TabsTrigger value="warnings" disabled={warnings.length === 0}>
            Warnings ({warnings.length})
          </TabsTrigger>
          <TabsTrigger value="info" disabled={infos.length === 0}>
            Info ({infos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-4">
          <IssuesList
            issues={selectedCategory ? errors.filter(i => i.category === selectedCategory) : errors}
            severity="error"
          />
        </TabsContent>

        <TabsContent value="warnings" className="mt-4">
          <IssuesList
            issues={selectedCategory ? warnings.filter(i => i.category === selectedCategory) : warnings}
            severity="warning"
          />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <IssuesList
            issues={selectedCategory ? infos.filter(i => i.category === selectedCategory) : infos}
            severity="info"
          />
        </TabsContent>
      </Tabs>

      {/* Summary Statistics */}
      {validation.summary && (
        <ValidationSummaryStats summary={validation.summary} />
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function IssuesList({
  issues,
  severity,
}: {
  issues: ValidationIssue[];
  severity: "error" | "warning" | "info";
}) {
  const config = SEVERITY_CONFIG[severity];

  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        No {config.label.toLowerCase()} found.
      </p>
    );
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {issues.map((issue, index) => (
        <AccordionItem
          key={`${issue.code}-${index}`}
          value={`${issue.code}-${index}`}
          className={cn(
            "border rounded-lg overflow-hidden",
            config.borderColor
          )}
        >
          <AccordionTrigger
            className={cn(
              "px-4 py-3 hover:no-underline",
              config.bgColor
            )}
          >
            <div className="flex items-start gap-3 text-left w-full">
              <Badge
                variant={config.badgeVariant}
                className="mt-0.5 shrink-0"
              >
                {issue.code}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className={cn("font-medium", config.textColor)}>
                  {issue.message}
                </p>
                {issue.zoneName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Zone: {issue.zoneName}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0 text-xs">
                {CATEGORY_LABELS[issue.category] || issue.category}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2">
            <div className="space-y-3">
              {issue.details && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Details</p>
                  <p className="text-sm">{issue.details}</p>
                </div>
              )}

              {issue.suggestion && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Suggestion</p>
                  <p className="text-sm text-green-700">{issue.suggestion}</p>
                </div>
              )}

              {issue.relatedItems && issue.relatedItems.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Related Items</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {issue.relatedItems.map((item) => (
                      <Badge key={item} variant="outline" className="text-xs font-mono">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function CompactValidation({
  validation,
  className,
}: {
  validation: ValidationResult;
  className?: string;
}) {
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");

  if (validation.isValid && warnings.length === 0) {
    return (
      <Alert className={cn("border-green-200 bg-green-50", className)}>
        <AlertTitle className="text-green-800">Valid</AlertTitle>
        <AlertDescription className="text-green-700">
          Estimate passed all validation checks.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{errors.length} Error{errors.length !== 1 ? "s" : ""}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-1">
              {errors.slice(0, 3).map((e, i) => (
                <li key={i} className="text-sm truncate">{e.message}</li>
              ))}
              {errors.length > 3 && (
                <li className="text-sm">...and {errors.length - 3} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTitle className="text-yellow-800">
            {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
          </AlertTitle>
          <AlertDescription className="text-yellow-700">
            <ul className="list-disc list-inside mt-1">
              {warnings.slice(0, 3).map((w, i) => (
                <li key={i} className="text-sm truncate">{w.message}</li>
              ))}
              {warnings.length > 3 && (
                <li className="text-sm">...and {warnings.length - 3} more</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ValidationSummaryStats({
  summary,
}: {
  summary: {
    missingCompanions: number;
    quantityMismatches: number;
    tradeIncomplete: number;
    coverageIssues: number;
    pricingAnomalies: number;
    duplicateItems: number;
  };
}) {
  const stats = [
    { label: "Missing Companions", value: summary.missingCompanions, icon: "+" },
    { label: "Quantity Issues", value: summary.quantityMismatches, icon: "#" },
    { label: "Incomplete Trades", value: summary.tradeIncomplete, icon: "..." },
    { label: "Coverage Issues", value: summary.coverageIssues, icon: "C" },
    { label: "Pricing Anomalies", value: summary.pricingAnomalies, icon: "$" },
    { label: "Duplicates", value: summary.duplicateItems, icon: "2x" },
  ].filter((s) => s.value > 0);

  if (stats.length === 0) return null;

  return (
    <div className="rounded-lg border p-4 bg-muted/50">
      <h4 className="font-medium mb-3 text-sm">Issue Summary</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-mono">
              {stat.icon}
            </span>
            <div>
              <div className="text-sm font-medium">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// INLINE VALIDATION INDICATOR
// ============================================

export function ValidationIndicator({
  validation,
  className,
}: {
  validation: ValidationResult;
  className?: string;
}) {
  if (validation.isValid && validation.warningCount === 0) {
    return (
      <Badge className={cn("bg-green-100 text-green-800", className)}>
        Valid
      </Badge>
    );
  }

  if (validation.errorCount > 0) {
    return (
      <Badge variant="destructive" className={className}>
        {validation.errorCount} Error{validation.errorCount !== 1 ? "s" : ""}
      </Badge>
    );
  }

  return (
    <Badge className={cn("bg-yellow-100 text-yellow-800", className)}>
      {validation.warningCount} Warning{validation.warningCount !== 1 ? "s" : ""}
    </Badge>
  );
}

export default ValidationWarnings;
