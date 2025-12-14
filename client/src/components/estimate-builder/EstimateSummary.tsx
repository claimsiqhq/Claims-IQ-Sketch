import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingDown,
  Calculator,
  Building2,
  AlertCircle,
} from 'lucide-react';
import type { EstimateHierarchy } from '@/hooks/useEstimateBuilder';

// Simple totals from useEstimateBuilder hook
interface SimpleTotals {
  rcvTotal: number;
  acvTotal: number;
}

interface EstimateSummaryProps {
  totals: SimpleTotals | null;
  hierarchy: EstimateHierarchy | null;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

export function EstimateSummary({ totals, hierarchy }: EstimateSummaryProps) {
  // Calculate zone statistics from hierarchy
  const zones = hierarchy?.structures.flatMap((s) =>
    s.areas.flatMap((a) => a.zones)
  ) || [];

  const totalZones = zones.length;
  const completedZones = zones.filter((z) => z.status === 'complete').length;
  const scopedZones = zones.filter((z) => z.status === 'scoped').length;
  const measuredZones = zones.filter((z) => z.status === 'measured').length;
  const pendingZones = zones.filter((z) => z.status === 'pending').length;

  const completionPercent = totalZones > 0 ? (completedZones / totalZones) * 100 : 0;

  // Default totals if not loaded
  const displayTotals: SimpleTotals = totals || {
    rcvTotal: 0,
    acvTotal: 0,
  };

  // Calculate depreciation as difference between RCV and ACV
  const depreciation = displayTotals.rcvTotal - displayTotals.acvTotal;

  return (
    <div className="p-4 space-y-4">
      {/* Completion Progress */}
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm font-medium">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Zones Complete</span>
            <span className="font-semibold">
              {completedZones} / {totalZones}
            </span>
          </div>
          <Progress value={completionPercent} className="h-2" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>Complete ({completedZones})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Scoped ({scopedZones})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Measured ({measuredZones})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-slate-300" />
              <span>Pending ({pendingZones})</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* RCV Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Total RCV</span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(displayTotals.rcvTotal)}
            </span>
          </div>

          <Separator />

          {/* Depreciation */}
          {depreciation > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Depreciation</span>
              <span className="font-medium text-amber-600">
                -{formatCurrency(depreciation)}
              </span>
            </div>
          )}

          {/* ACV Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Total ACV</span>
            <span className="text-lg font-bold">
              {formatCurrency(displayTotals.acvTotal)}
            </span>
          </div>

          {/* Recoverable Depreciation Notice */}
          {depreciation > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Recoverable Depreciation</span>
              </div>
              <p className="text-lg font-bold text-amber-700 mt-1">
                {formatCurrency(depreciation)}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Withheld until repairs completed
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Structure Breakdown */}
      {hierarchy && hierarchy.structures.length > 0 && (
        <Card>
          <CardHeader className="py-3 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Structure Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hierarchy.structures.map((structure) => {
                const structureZones = structure.areas.flatMap((a) => a.zones);
                const structureItems = structureZones.reduce(
                  (sum, z) => sum + z.lineItemCount,
                  0
                );
                const structureComplete = structureZones.filter(
                  (z) => z.status === 'complete'
                ).length;

                return (
                  <div
                    key={structure.id}
                    className="p-3 bg-slate-50 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{structure.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {structureItems} items
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{structureZones.length} zones</span>
                      <span>•</span>
                      <span>{structureComplete} complete</span>
                      <span>•</span>
                      <span>{structure.areas.length} areas</span>
                    </div>
                    <Progress
                      value={
                        structureZones.length > 0
                          ? (structureComplete / structureZones.length) * 100
                          : 0
                      }
                      className="h-1"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Quick Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-slate-50 rounded">
              <div className="text-muted-foreground text-xs">Structures</div>
              <div className="font-semibold">{hierarchy?.structures.length || 0}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded">
              <div className="text-muted-foreground text-xs">Total Zones</div>
              <div className="font-semibold">{totalZones}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded">
              <div className="text-muted-foreground text-xs">Total Items</div>
              <div className="font-semibold">
                {zones.reduce((sum, z) => sum + z.lineItemCount, 0)}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded">
              <div className="text-muted-foreground text-xs">Completion</div>
              <div className="font-semibold">{completionPercent.toFixed(0)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
