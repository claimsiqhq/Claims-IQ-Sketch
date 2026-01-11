/**
 * Estimate Panel - Priced Estimate Display
 *
 * Displays a fully priced estimate with totals, breakdowns, and validation.
 * Integrates with the Pricing Engine output.
 *
 * Features:
 * - Estimate summary with RCV/ACV totals
 * - Trade breakdown with material/labor split
 * - Coverage breakdown
 * - O&P eligibility display
 * - Validation warnings integration
 *
 * See: docs/ESTIMATE_ENGINE.md for architecture details.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ValidationWarnings } from "./validation-warnings";

// ============================================
// TYPES
// ============================================

interface UnitPriceBreakdown {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  wasteFactor: number;
  adjustedMaterial: number;
  adjustedLabor: number;
  adjustedEquipment: number;
  unitPrice: number;
  minimumCharge: number;
}

interface PricedLineItem {
  lineItemCode: string;
  description: string;
  categoryId: string;
  unit: string;
  quantity: number;
  quantitySource: string;
  unitPriceBreakdown: UnitPriceBreakdown;
  unitPrice: number;
  subtotal: number;
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
  taxAmount: number;
  taxableAmount: number;
  rcv: number;
  coverageCode: string;
  tradeCode: string | null;
  reasons: string[];
  isAutoAdded: boolean;
  zoneId?: string;
  zoneName?: string;
}

interface TradeTotals {
  tradeCode: string;
  tradeName: string;
  lineItemCount: number;
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
  subtotal: number;
  taxAmount: number;
  rcv: number;
  opEligible: boolean;
}

interface CoverageBreakdown {
  coverageCode: string;
  lineItemCount: number;
  subtotal: number;
  taxAmount: number;
  rcv: number;
}

interface EstimateTotals {
  lineItemCount: number;
  subtotalMaterial: number;
  subtotalLabor: number;
  subtotalEquipment: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  taxRate: number;
  subtotalAfterTax: number;
  wasteIncluded: number;
}

interface OverheadAndProfit {
  qualifiesForOp: boolean;
  tradesInvolved: string[];
  opThreshold: number;
  opTradeMinimum: number;
  overheadPct: number;
  profitPct: number;
  overheadAmount: number;
  profitAmount: number;
}

interface ValidationIssue {
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

interface PricedEstimateResult {
  lineItems: PricedLineItem[];
  tradeBreakdown: TradeTotals[];
  coverageBreakdown: CoverageBreakdown[];
  totals: EstimateTotals;
  overheadAndProfit: OverheadAndProfit;
  rcvTotal: number;
  config: {
    regionId: string;
    carrierProfileId?: string;
    calculatedAt: Date;
  };
}

interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationIssue[];
  summary: {
    missingCompanions: number;
    quantityMismatches: number;
    tradeIncomplete: number;
    coverageIssues: number;
    pricingAnomalies: number;
    duplicateItems: number;
  };
}

interface EstimatePanelProps {
  estimate: PricedEstimateResult | null;
  validation?: ValidationResult | null;
  isLoading?: boolean;
  className?: string;
  showValidation?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const TRADE_COLORS: Record<string, string> = {
  MIT: "bg-red-100 text-red-800 border-red-200",
  DEM: "bg-orange-100 text-orange-800 border-orange-200",
  DRY: "bg-yellow-100 text-yellow-800 border-yellow-200",
  PNT: "bg-blue-100 text-blue-800 border-blue-200",
  FLR: "bg-green-100 text-green-800 border-green-200",
  INS: "bg-purple-100 text-purple-800 border-purple-200",
  CAR: "bg-amber-100 text-amber-800 border-amber-200",
  CAB: "bg-cyan-100 text-cyan-800 border-cyan-200",
  CTR: "bg-teal-100 text-teal-800 border-teal-200",
  RFG: "bg-slate-100 text-slate-800 border-slate-200",
  WIN: "bg-sky-100 text-sky-800 border-sky-200",
  EXT: "bg-stone-100 text-stone-800 border-stone-200",
  ELE: "bg-indigo-100 text-indigo-800 border-indigo-200",
  PLM: "bg-violet-100 text-violet-800 border-violet-200",
  HVAC: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  GEN: "bg-gray-100 text-gray-800 border-gray-200",
};

const COVERAGE_LABELS: Record<string, string> = {
  A: "Dwelling (Coverage A)",
  B: "Other Structures (Coverage B)",
  C: "Personal Property (Coverage C)",
  D: "Loss of Use (Coverage D)",
};

// ============================================
// MAIN COMPONENT
// ============================================

export function EstimatePanel({
  estimate,
  validation,
  isLoading = false,
  className,
  showValidation = true,
}: EstimatePanelProps) {
  const [activeTab, setActiveTab] = React.useState("summary");

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle>Estimate</CardTitle>
          <CardDescription>Calculating...</CardDescription>
        </CardHeader>
        <CardContent>
          <EstimateLoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!estimate) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle>Estimate</CardTitle>
          <CardDescription>No estimate data available</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyEstimateState />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Estimate</CardTitle>
            <CardDescription>
              Priced estimate with {estimate.totals.lineItemCount} items
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">
              ${formatCurrency(estimate.rcvTotal)}
            </div>
            <div className="text-sm text-muted-foreground">RCV Total</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="trades">By Trade</TabsTrigger>
            <TabsTrigger value="coverage">By Coverage</TabsTrigger>
            <TabsTrigger value="items">Line Items</TabsTrigger>
            {showValidation && validation && (
              <TabsTrigger value="validation">
                Validation
                {validation.errorCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                    {validation.errorCount}
                  </Badge>
                )}
                {validation.warningCount > 0 && validation.errorCount === 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 bg-yellow-100 text-yellow-800">
                    {validation.warningCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="summary">
            <EstimateSummary
              totals={estimate.totals}
              op={estimate.overheadAndProfit}
              rcvTotal={estimate.rcvTotal}
              tradeBreakdown={estimate.tradeBreakdown}
              coverageBreakdown={estimate.coverageBreakdown}
            />
          </TabsContent>

          <TabsContent value="trades">
            <TradeBreakdown trades={estimate.tradeBreakdown} />
          </TabsContent>

          <TabsContent value="coverage">
            <CoverageBreakdownView coverage={estimate.coverageBreakdown} />
          </TabsContent>

          <TabsContent value="items">
            <LineItemsTable items={estimate.lineItems} />
          </TabsContent>

          {showValidation && validation && (
            <TabsContent value="validation">
              <ValidationWarnings validation={validation} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ============================================
// SUMMARY VIEW
// ============================================

function EstimateSummary({
  totals,
  op,
  rcvTotal,
  tradeBreakdown,
  coverageBreakdown,
}: {
  totals: EstimateTotals;
  op: OverheadAndProfit;
  rcvTotal: number;
  tradeBreakdown: TradeTotals[];
  coverageBreakdown: CoverageBreakdown[];
}) {
  const materialPct = (totals.subtotalMaterial / totals.subtotalBeforeTax) * 100 || 0;
  const laborPct = (totals.subtotalLabor / totals.subtotalBeforeTax) * 100 || 0;
  const equipmentPct = (totals.subtotalEquipment / totals.subtotalBeforeTax) * 100 || 0;

  return (
    <div className="space-y-6">
      {/* Totals Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Subtotal"
          value={totals.subtotalBeforeTax}
          variant="default"
        />
        <SummaryCard
          label="Tax"
          value={totals.taxAmount}
          subtext={`${totals.taxRate.toFixed(1)}%`}
          variant="default"
        />
        <SummaryCard
          label="O&P"
          value={op.overheadAmount + op.profitAmount}
          subtext={op.qualifiesForOp ? "Eligible" : "Not Eligible"}
          variant={op.qualifiesForOp ? "success" : "muted"}
        />
        <SummaryCard
          label="RCV Total"
          value={rcvTotal}
          variant="highlight"
        />
      </div>

      {/* Material/Labor/Equipment Breakdown */}
      <div className="rounded-lg border p-4">
        <h4 className="font-medium mb-3">Cost Breakdown</h4>
        <div className="space-y-3">
          <CostBreakdownBar
            label="Material"
            amount={totals.subtotalMaterial}
            percentage={materialPct}
            color="bg-blue-500"
          />
          <CostBreakdownBar
            label="Labor"
            amount={totals.subtotalLabor}
            percentage={laborPct}
            color="bg-green-500"
          />
          <CostBreakdownBar
            label="Equipment"
            amount={totals.subtotalEquipment}
            percentage={equipmentPct}
            color="bg-purple-500"
          />
        </div>
        {totals.wasteIncluded > 0 && (
          <div className="mt-3 text-sm text-muted-foreground">
            Includes ${formatCurrency(totals.wasteIncluded)} waste factor
          </div>
        )}
      </div>

      {/* O&P Details */}
      {op.qualifiesForOp && (
        <div className="rounded-lg border p-4 bg-green-50">
          <h4 className="font-medium mb-2">Overhead & Profit</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Overhead ({op.overheadPct}%): </span>
              <span className="font-medium">${formatCurrency(op.overheadAmount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Profit ({op.profitPct}%): </span>
              <span className="font-medium">${formatCurrency(op.profitAmount)}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {op.tradesInvolved.length} trades involved (threshold: {op.opTradeMinimum})
          </div>
        </div>
      )}

      {!op.qualifiesForOp && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <h4 className="font-medium mb-2">Overhead & Profit</h4>
          <p className="text-sm text-muted-foreground">
            Not eligible. Requires {op.opTradeMinimum} trades and
            ${formatCurrency(op.opThreshold)} minimum.
            Currently: {op.tradesInvolved.length} trades.
          </p>
        </div>
      )}

      {/* Quick Trade Summary */}
      <div className="rounded-lg border p-4">
        <h4 className="font-medium mb-3">Trades Summary</h4>
        <div className="flex flex-wrap gap-2">
          {tradeBreakdown.map((trade) => (
            <Badge
              key={trade.tradeCode}
              className={cn(
                "border",
                TRADE_COLORS[trade.tradeCode] || TRADE_COLORS.GEN
              )}
            >
              {trade.tradeCode}: ${formatCurrency(trade.rcv)}
            </Badge>
          ))}
        </div>
      </div>

      {/* Quick Coverage Summary */}
      <div className="rounded-lg border p-4">
        <h4 className="font-medium mb-3">Coverage Summary</h4>
        <div className="space-y-2">
          {coverageBreakdown.map((cov) => (
            <div key={cov.coverageCode} className="flex justify-between text-sm">
              <span>{COVERAGE_LABELS[cov.coverageCode] || `Coverage ${cov.coverageCode}`}</span>
              <span className="font-medium">${formatCurrency(cov.rcv)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// TRADE BREAKDOWN VIEW
// ============================================

function TradeBreakdown({ trades }: { trades: TradeTotals[] }) {
  return (
    <Accordion type="multiple" className="w-full" defaultValue={trades.map((t) => t.tradeCode)}>
      {trades.map((trade) => (
        <AccordionItem key={trade.tradeCode} value={trade.tradeCode}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center justify-between w-full pr-4">
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "border",
                    TRADE_COLORS[trade.tradeCode] || TRADE_COLORS.GEN
                  )}
                >
                  {trade.tradeCode}
                </Badge>
                <span className="font-medium">{trade.tradeName}</span>
                <span className="text-muted-foreground text-sm">
                  ({trade.lineItemCount} items)
                </span>
              </div>
              <span className="font-bold text-green-600">
                ${formatCurrency(trade.rcv)}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <div className="text-xs text-muted-foreground">Material</div>
                <div className="font-medium">${formatCurrency(trade.totalMaterial)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Labor</div>
                <div className="font-medium">${formatCurrency(trade.totalLabor)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Equipment</div>
                <div className="font-medium">${formatCurrency(trade.totalEquipment)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tax</div>
                <div className="font-medium">${formatCurrency(trade.taxAmount)}</div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// ============================================
// COVERAGE BREAKDOWN VIEW
// ============================================

function CoverageBreakdownView({ coverage }: { coverage: CoverageBreakdown[] }) {
  const total = coverage.reduce((sum, c) => sum + c.rcv, 0);

  return (
    <div className="space-y-4">
      {coverage.map((cov) => {
        const pct = (cov.rcv / total) * 100 || 0;
        return (
          <div key={cov.coverageCode} className="rounded-lg border p-4">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h4 className="font-medium">
                  {COVERAGE_LABELS[cov.coverageCode] || `Coverage ${cov.coverageCode}`}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {cov.lineItemCount} line items
                </p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-green-600">
                  ${formatCurrency(cov.rcv)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {pct.toFixed(1)}% of total
                </div>
              </div>
            </div>
            <Progress value={pct} className="h-2" />
            <div className="mt-2 flex justify-between text-sm text-muted-foreground">
              <span>Subtotal: ${formatCurrency(cov.subtotal)}</span>
              <span>Tax: ${formatCurrency(cov.taxAmount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// LINE ITEMS TABLE
// ============================================

function LineItemsTable({ items }: { items: PricedLineItem[] }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Code</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[80px]">Trade</TableHead>
            <TableHead className="w-[80px] text-right">Qty</TableHead>
            <TableHead className="w-[60px]">Unit</TableHead>
            <TableHead className="w-[100px] text-right">Unit Price</TableHead>
            <TableHead className="w-[100px] text-right">Subtotal</TableHead>
            <TableHead className="w-[100px] text-right">RCV</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={`${item.lineItemCode}-${index}`}>
              <TableCell className="font-mono text-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>{item.lineItemCode}</TooltipTrigger>
                    <TooltipContent>
                      <PriceBreakdownTooltip item={item} />
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {item.description}
                {item.isAutoAdded && (
                  <Badge variant="outline" className="ml-2 text-xs">Auto</Badge>
                )}
              </TableCell>
              <TableCell>
                {item.tradeCode && (
                  <Badge
                    className={cn(
                      "border text-xs",
                      TRADE_COLORS[item.tradeCode] || TRADE_COLORS.GEN
                    )}
                  >
                    {item.tradeCode}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatQuantity(item.quantity)}
              </TableCell>
              <TableCell className="text-sm">{item.unit}</TableCell>
              <TableCell className="text-right font-mono">
                ${item.unitPrice.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-mono">
                ${formatCurrency(item.subtotal)}
              </TableCell>
              <TableCell className="text-right font-mono font-medium text-green-600">
                ${formatCurrency(item.rcv)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function SummaryCard({
  label,
  value,
  subtext,
  variant = "default",
}: {
  label: string;
  value: number;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "muted" | "highlight";
}) {
  const variantClasses = {
    default: "bg-gray-50 border-gray-200",
    success: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    muted: "bg-gray-50 border-gray-200 opacity-75",
    highlight: "bg-green-100 border-green-300",
  };

  return (
    <div className={cn("rounded-lg border p-3", variantClasses[variant])}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">${formatCurrency(value)}</div>
      {subtext && (
        <div className="text-xs text-muted-foreground">{subtext}</div>
      )}
    </div>
  );
}

function CostBreakdownBar({
  label,
  amount,
  percentage,
  color,
}: {
  label: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">
          ${formatCurrency(amount)} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function PriceBreakdownTooltip({ item }: { item: PricedLineItem }) {
  const breakdown = item.unitPriceBreakdown;
  return (
    <div className="text-xs space-y-1 min-w-[180px]">
      <div className="font-medium border-b pb-1 mb-1">Price Breakdown</div>
      <div className="flex justify-between">
        <span>Material:</span>
        <span>${breakdown.materialCost.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Labor:</span>
        <span>${breakdown.laborCost.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Equipment:</span>
        <span>${breakdown.equipmentCost.toFixed(2)}</span>
      </div>
      {breakdown.wasteFactor > 1 && (
        <div className="flex justify-between text-muted-foreground">
          <span>Waste Factor:</span>
          <span>{((breakdown.wasteFactor - 1) * 100).toFixed(0)}%</span>
        </div>
      )}
      <div className="border-t pt-1 mt-1 flex justify-between font-medium">
        <span>Unit Price:</span>
        <span>${breakdown.unitPrice.toFixed(2)}</span>
      </div>
      {item.zoneName && (
        <div className="text-muted-foreground pt-1">
          Zone: {item.zoneName}
        </div>
      )}
    </div>
  );
}

function EstimateLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function EmptyEstimateState() {
  return (
    <div className="text-center py-8">
      <div className="text-4xl mb-2">$</div>
      <h3 className="font-medium text-lg">No Estimate</h3>
      <p className="text-muted-foreground text-sm">
        Create zones with damage attributes to generate an estimate.
      </p>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(qty: number): string {
  if (qty >= 1000) return qty.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (qty >= 100) return qty.toFixed(0);
  if (qty >= 10) return qty.toFixed(1);
  return qty.toFixed(2);
}

export default EstimatePanel;
