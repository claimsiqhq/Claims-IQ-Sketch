/**
 * Scope Panel - Read-Only Scope Display
 *
 * Displays assembled scope items for an estimate.
 * Scope defines WHAT work is required, independent of pricing.
 *
 * Features:
 * - View scope items by trade or zone
 * - See derived quantities from geometry
 * - Provenance information for audit
 * - NO pricing displayed
 *
 * See: docs/SCOPE_ENGINE.md for architecture details.
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface ScopeItem {
  id: string;
  estimate_id: string;
  zone_id: string | null;
  wall_index: number | null;
  line_item_id: string;
  line_item_code: string;
  quantity: string;
  unit: string;
  waste_factor: string;
  quantity_with_waste: string;
  provenance: string;
  provenance_details: {
    source_metric?: string;
    formula?: string;
    computed_at?: string;
  };
  trade_code: string;
  coverage_type: string;
  sort_order: number;
  status: "pending" | "approved" | "excluded";
  notes: string | null;
  line_item?: {
    code: string;
    description: string;
    unit: string;
    trade_code: string;
  };
  zone?: {
    id: string;
    name: string;
    zone_type: string;
    room_type: string | null;
  };
}

interface ScopeSummary {
  id: string;
  estimate_id: string;
  trade_code: string;
  line_item_count: number;
  zone_count: number;
  quantities_by_unit: Record<string, number>;
  pending_count: number;
  approved_count: number;
  excluded_count: number;
  trade?: {
    code: string;
    name: string;
    op_eligible: boolean;
  };
}

interface ScopeTrade {
  id: string;
  code: string;
  name: string;
  description: string | null;
  xact_category_prefix: string | null;
  sort_order: number;
  op_eligible: boolean;
  is_active: boolean;
}

interface ScopePanelProps {
  estimateId: string;
  className?: string;
}

// ============================================
// TRADE COLORS
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  excluded: "bg-red-100 text-red-800",
};

// ============================================
// DATA FETCHING
// ============================================

async function fetchScopeItems(estimateId: string): Promise<ScopeItem[]> {
  const response = await fetch(`/api/scope/estimate/${estimateId}`);
  if (!response.ok) throw new Error("Failed to fetch scope items");
  const data = await response.json();
  return data.items || [];
}

async function fetchScopeSummary(estimateId: string): Promise<{
  summary: ScopeSummary[];
  totals: {
    lineItemCount: number;
    pendingCount: number;
    approvedCount: number;
    excludedCount: number;
    tradeCount: number;
  };
}> {
  const response = await fetch(`/api/scope/estimate/${estimateId}/summary`);
  if (!response.ok) throw new Error("Failed to fetch scope summary");
  return response.json();
}

async function fetchTrades(): Promise<ScopeTrade[]> {
  const response = await fetch("/api/scope/trades");
  if (!response.ok) throw new Error("Failed to fetch trades");
  const data = await response.json();
  return data.trades || [];
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ScopePanel({ estimateId, className }: ScopePanelProps) {
  const [activeTab, setActiveTab] = React.useState("by-trade");

  // Fetch scope items
  const {
    data: items,
    isLoading: itemsLoading,
    error: itemsError,
  } = useQuery({
    queryKey: ["scope-items", estimateId],
    queryFn: () => fetchScopeItems(estimateId),
    enabled: !!estimateId,
  });

  // Fetch summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["scope-summary", estimateId],
    queryFn: () => fetchScopeSummary(estimateId),
    enabled: !!estimateId,
  });

  // Fetch trades
  const { data: trades } = useQuery({
    queryKey: ["scope-trades"],
    queryFn: fetchTrades,
  });

  if (itemsError) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription className="text-red-600">
            Error loading scope: {itemsError.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tradeMap = React.useMemo(() => {
    const map = new Map<string, ScopeTrade>();
    for (const trade of trades || []) {
      map.set(trade.code, trade);
    }
    return map;
  }, [trades]);

  // Group items by trade
  const itemsByTrade = React.useMemo(() => {
    const grouped = new Map<string, ScopeItem[]>();
    for (const item of items || []) {
      const trade = item.trade_code || "OTHER";
      if (!grouped.has(trade)) {
        grouped.set(trade, []);
      }
      grouped.get(trade)!.push(item);
    }
    return grouped;
  }, [items]);

  // Group items by zone
  const itemsByZone = React.useMemo(() => {
    const grouped = new Map<string, ScopeItem[]>();
    for (const item of items || []) {
      const zoneKey = item.zone?.name || "Unassigned";
      if (!grouped.has(zoneKey)) {
        grouped.set(zoneKey, []);
      }
      grouped.get(zoneKey)!.push(item);
    }
    return grouped;
  }, [items]);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scope</CardTitle>
            <CardDescription>
              What work is required (no pricing)
            </CardDescription>
          </div>
          {summaryData && (
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                {summaryData.totals.lineItemCount} items
              </Badge>
              <Badge variant="outline">
                {summaryData.totals.tradeCount} trades
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {itemsLoading || summaryLoading ? (
          <ScopeLoadingSkeleton />
        ) : items?.length === 0 ? (
          <EmptyScopeState />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="by-trade">By Trade</TabsTrigger>
              <TabsTrigger value="by-zone">By Zone</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="by-trade">
              <ScopeByTrade
                itemsByTrade={itemsByTrade}
                tradeMap={tradeMap}
              />
            </TabsContent>

            <TabsContent value="by-zone">
              <ScopeByZone itemsByZone={itemsByZone} tradeMap={tradeMap} />
            </TabsContent>

            <TabsContent value="summary">
              <ScopeSummaryView
                summary={summaryData?.summary || []}
                totals={summaryData?.totals}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ScopeByTrade({
  itemsByTrade,
  tradeMap,
}: {
  itemsByTrade: Map<string, ScopeItem[]>;
  tradeMap: Map<string, ScopeTrade>;
}) {
  const sortedTrades = Array.from(itemsByTrade.keys()).sort((a, b) => {
    const tradeA = tradeMap.get(a);
    const tradeB = tradeMap.get(b);
    return (tradeA?.sort_order || 999) - (tradeB?.sort_order || 999);
  });

  return (
    <Accordion type="multiple" className="w-full" defaultValue={sortedTrades}>
      {sortedTrades.map((tradeCode) => {
        const trade = tradeMap.get(tradeCode);
        const tradeItems = itemsByTrade.get(tradeCode) || [];

        return (
          <AccordionItem key={tradeCode} value={tradeCode}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "border",
                    TRADE_COLORS[tradeCode] || TRADE_COLORS.GEN
                  )}
                >
                  {tradeCode}
                </Badge>
                <span className="font-medium">
                  {trade?.name || tradeCode}
                </span>
                <span className="text-muted-foreground text-sm">
                  ({tradeItems.length} items)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ScopeItemsTable items={tradeItems} showZone />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function ScopeByZone({
  itemsByZone,
  tradeMap,
}: {
  itemsByZone: Map<string, ScopeItem[]>;
  tradeMap: Map<string, ScopeTrade>;
}) {
  const sortedZones = Array.from(itemsByZone.keys()).sort();

  return (
    <Accordion type="multiple" className="w-full" defaultValue={sortedZones}>
      {sortedZones.map((zoneName) => {
        const zoneItems = itemsByZone.get(zoneName) || [];

        return (
          <AccordionItem key={zoneName} value={zoneName}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="font-medium">{zoneName}</span>
                <span className="text-muted-foreground text-sm">
                  ({zoneItems.length} items)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ScopeItemsTable items={zoneItems} showTrade />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function ScopeItemsTable({
  items,
  showZone = false,
  showTrade = false,
}: {
  items: ScopeItem[];
  showZone?: boolean;
  showTrade?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Code</TableHead>
          <TableHead>Description</TableHead>
          {showZone && <TableHead className="w-[120px]">Zone</TableHead>}
          {showTrade && <TableHead className="w-[80px]">Trade</TableHead>}
          <TableHead className="w-[100px] text-right">Qty</TableHead>
          <TableHead className="w-[60px]">Unit</TableHead>
          <TableHead className="w-[80px]">Status</TableHead>
          <TableHead className="w-[60px]">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-mono text-xs">
              {item.line_item_code}
            </TableCell>
            <TableCell className="max-w-[300px] truncate">
              {item.line_item?.description || item.line_item_code}
            </TableCell>
            {showZone && (
              <TableCell className="text-sm">
                {item.zone?.name || "-"}
              </TableCell>
            )}
            {showTrade && (
              <TableCell>
                <Badge
                  className={cn(
                    "border text-xs",
                    TRADE_COLORS[item.trade_code] || TRADE_COLORS.GEN
                  )}
                >
                  {item.trade_code}
                </Badge>
              </TableCell>
            )}
            <TableCell className="text-right font-mono">
              {formatQuantity(item.quantity_with_waste)}
            </TableCell>
            <TableCell className="text-sm">{item.unit}</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={cn("text-xs", STATUS_COLORS[item.status])}
              >
                {item.status}
              </Badge>
            </TableCell>
            <TableCell>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <ProvenanceIcon provenance={item.provenance} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <ProvenanceTooltip item={item} />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ScopeSummaryView({
  summary,
  totals,
}: {
  summary: ScopeSummary[];
  totals?: {
    lineItemCount: number;
    pendingCount: number;
    approvedCount: number;
    excludedCount: number;
    tradeCount: number;
  };
}) {
  return (
    <div className="space-y-4">
      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Total Items"
            value={totals.lineItemCount}
            variant="default"
          />
          <SummaryCard
            label="Pending"
            value={totals.pendingCount}
            variant="warning"
          />
          <SummaryCard
            label="Approved"
            value={totals.approvedCount}
            variant="success"
          />
          <SummaryCard
            label="Trades"
            value={totals.tradeCount}
            variant="default"
          />
        </div>
      )}

      {/* By Trade Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trade</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Zones</TableHead>
            <TableHead>Quantities</TableHead>
            <TableHead className="text-right">Pending</TableHead>
            <TableHead className="text-right">Approved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.map((s) => (
            <TableRow key={s.trade_code}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "border",
                      TRADE_COLORS[s.trade_code] || TRADE_COLORS.GEN
                    )}
                  >
                    {s.trade_code}
                  </Badge>
                  <span>{s.trade?.name || s.trade_code}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">
                {s.line_item_count}
              </TableCell>
              <TableCell className="text-right font-mono">
                {s.zone_count}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(s.quantities_by_unit || {}).map(
                    ([unit, qty]) => (
                      <Badge key={unit} variant="outline" className="text-xs">
                        {formatQuantity(String(qty))} {unit}
                      </Badge>
                    )
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono">
                {s.pending_count}
              </TableCell>
              <TableCell className="text-right font-mono">
                {s.approved_count}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "bg-gray-50 border-gray-200",
    success: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    danger: "bg-red-50 border-red-200",
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-center",
        variantClasses[variant]
      )}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function ProvenanceIcon({ provenance }: { provenance: string }) {
  const icons: Record<string, string> = {
    geometry_derived: "📐",
    manual: "✏️",
    template: "📋",
    ai_suggested: "🤖",
    voice_command: "🎤",
  };

  return (
    <span className="text-lg" title={provenance}>
      {icons[provenance] || "❓"}
    </span>
  );
}

function ProvenanceTooltip({ item }: { item: ScopeItem }) {
  const details = item.provenance_details || {};

  return (
    <div className="text-xs space-y-1">
      <div>
        <strong>Source:</strong> {item.provenance.replace("_", " ")}
      </div>
      {details.formula && (
        <div>
          <strong>Formula:</strong> {details.formula}
        </div>
      )}
      {details.source_metric && (
        <div>
          <strong>Metric:</strong> {details.source_metric}
        </div>
      )}
      {details.computed_at && (
        <div>
          <strong>Computed:</strong>{" "}
          {new Date(details.computed_at).toLocaleString()}
        </div>
      )}
      {parseFloat(item.waste_factor) > 0 && (
        <div>
          <strong>Waste:</strong> {(parseFloat(item.waste_factor) * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function ScopeLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyScopeState() {
  return (
    <div className="text-center py-8">
      <div className="text-4xl mb-2">📋</div>
      <h3 className="font-medium text-lg">No Scope Items</h3>
      <p className="text-muted-foreground text-sm">
        Scope has not been assembled yet.
        <br />
        Add zones with geometry to generate scope.
      </p>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function formatQuantity(qty: string | number): string {
  const num = typeof qty === "string" ? parseFloat(qty) : qty;
  if (isNaN(num)) return "0";
  if (num >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (num >= 100) return num.toFixed(0);
  if (num >= 10) return num.toFixed(1);
  return num.toFixed(2);
}

export default ScopePanel;
