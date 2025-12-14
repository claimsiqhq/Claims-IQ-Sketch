import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Square, RulerIcon, Layers, Grid3X3, ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import type { ZoneType } from '@shared/schema';

interface ZoneDimensions {
  sfFloor?: string | number | null;
  sfWalls?: string | number | null;
  sfCeiling?: string | number | null;
  sfLw?: string | number | null;
  sfSw?: string | number | null;
  syFloor?: string | number | null;
  lfFloorPerim?: string | number | null;
  skRoofSquares?: string | number | null;
  pitchMultiplier?: string | number | null;
}

interface DimensionDisplayProps {
  dimensions: ZoneDimensions | null | undefined;
  zoneType: ZoneType;
}

const formatNumber = (value: string | number | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
};

const DimensionCard = ({
  label,
  value,
  unit,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  icon?: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) => (
  <div
    className={`p-3 rounded-lg border ${
      highlight
        ? 'bg-primary/5 border-primary/20'
        : 'bg-slate-50 border-slate-200'
    }`}
  >
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  </div>
);

export function DimensionDisplay({ dimensions, zoneType }: DimensionDisplayProps) {
  if (!dimensions) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Calculated Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Enter length and width measurements to calculate dimensions automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isRoom = zoneType === 'room';
  const isRoof = zoneType === 'roof';
  const isElevation = zoneType === 'elevation';
  const isLinear = zoneType === 'linear';

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Calculated Dimensions</CardTitle>
          <Badge variant="outline" className="text-xs capitalize">
            {zoneType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Dimensions */}
        <div className="grid grid-cols-2 gap-3">
          {/* Floor/Roof Area */}
          {(isRoom || isRoof) && (
            <DimensionCard
              label="Floor/Roof Area"
              value={formatNumber(dimensions.sfFloor)}
              unit="SF"
              icon={Square}
              highlight
            />
          )}

          {/* Square Yards (for flooring) */}
          {isRoom && (
            <DimensionCard
              label="Floor (Yards)"
              value={formatNumber(dimensions.syFloor)}
              unit="SY"
              icon={Grid3X3}
            />
          )}

          {/* Wall Area */}
          {(isRoom || isElevation) && (
            <DimensionCard
              label="Wall Area"
              value={formatNumber(dimensions.sfWalls)}
              unit="SF"
              icon={Layers}
              highlight={isElevation}
            />
          )}

          {/* Ceiling Area */}
          {isRoom && (
            <DimensionCard
              label="Ceiling Area"
              value={formatNumber(dimensions.sfCeiling)}
              unit="SF"
              icon={Layers}
            />
          )}

          {/* Floor Perimeter */}
          {isRoom && (
            <DimensionCard
              label="Floor Perimeter"
              value={formatNumber(dimensions.lfFloorPerim)}
              unit="LF"
              icon={RulerIcon}
            />
          )}

          {/* Linear measurement */}
          {isLinear && (
            <DimensionCard
              label="Linear Feet"
              value={formatNumber(dimensions.lfFloorPerim)}
              unit="LF"
              icon={RulerIcon}
              highlight
            />
          )}

          {/* Roof Squares */}
          {isRoof && (
            <DimensionCard
              label="Roofing Squares"
              value={formatNumber(dimensions.skRoofSquares)}
              unit="SQ"
              icon={Grid3X3}
              highlight
            />
          )}

          {/* Pitch Multiplier */}
          {isRoof && dimensions.pitchMultiplier && (
            <DimensionCard
              label="Pitch Multiplier"
              value={formatNumber(dimensions.pitchMultiplier, 3)}
              unit="×"
              icon={ArrowUpDown}
            />
          )}
        </div>

        {/* Wall Breakdown for Rooms */}
        {isRoom && (dimensions.sfLw || dimensions.sfSw) && (
          <>
            <Separator />
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-3">
                Wall Breakdown
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <DimensionCard
                  label="Long Walls (2×)"
                  value={formatNumber(dimensions.sfLw)}
                  unit="SF"
                  icon={ArrowLeftRight}
                />
                <DimensionCard
                  label="Short Walls (2×)"
                  value={formatNumber(dimensions.sfSw)}
                  unit="SF"
                  icon={ArrowUpDown}
                />
              </div>
            </div>
          </>
        )}

        {/* Calculation Info */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {isRoom && 'Wall SF accounts for missing walls/openings. Floor SF = L × W.'}
            {isRoof && 'Roof squares = (L × W × Pitch Multiplier) ÷ 100.'}
            {isElevation && 'Wall SF = Length × Height.'}
            {isLinear && 'Linear measurement for items like fencing or gutters.'}
            {zoneType === 'deck' && 'Deck area = Length × Width.'}
            {zoneType === 'custom' && 'Custom zone with manual dimensions.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
