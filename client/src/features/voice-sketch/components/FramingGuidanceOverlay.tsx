/**
 * Framing Guidance Overlay Component
 * 
 * Provides visual guidance overlay on camera preview to ensure photos support
 * estimate defensibility. Shows grid lines, horizon leveling, and text instructions.
 * 
 * Peril-specific guidance content is fetched from claim context or workflow.
 */

import React from 'react';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FramingGuidanceProps {
  targetType: 'room_overview' | 'damage_detail' | 'opening' | 'material' | 'measurement_reference' | 'context' | 'fixtures' | 'flooring';
  framingGuidance?: string;
  perilType?: string;
  showGrid?: boolean;
  showHorizon?: boolean;
  className?: string;
}

const GUIDANCE_BY_TYPE: Record<string, string[]> = {
  room_overview: [
    'Step back to capture the full room',
    'Include all four corners in frame',
    'Ensure good lighting',
  ],
  damage_detail: [
    'Get close to the damage',
    'Include surrounding area for context',
    'Add a reference object for scale if possible',
  ],
  opening: [
    'Center the opening in frame',
    'Include surrounding wall area',
    'Show full height and width',
  ],
  material: [
    'Capture material texture clearly',
    'Include enough area to show pattern',
    'Ensure good lighting',
  ],
  measurement_reference: [
    'Include measuring tape or known object',
    'Ensure scale reference is clearly visible',
    'Capture full area being measured',
  ],
  fixtures: [
    'Capture all fixtures in the area',
    'Show fixtures in context of room',
    'Ensure clear detail',
  ],
  flooring: [
    'Point camera at floor',
    'Capture material and condition',
    'Include enough area to show pattern',
  ],
};

const PERIL_SPECIFIC_GUIDANCE: Record<string, Record<string, string[]>> = {
  hail: {
    damage_detail: [
      'Capture hail impact patterns',
      'Include 90-degree angle reference',
      'Show dent depth and spacing',
    ],
  },
  water: {
    damage_detail: [
      'Capture water line height',
      'Show affected materials clearly',
      'Include source if visible',
    ],
  },
  wind: {
    damage_detail: [
      'Show wind direction indicators',
      'Capture structural damage clearly',
      'Include surrounding context',
    ],
  },
};

export function FramingGuidanceOverlay({
  targetType,
  framingGuidance,
  perilType,
  showGrid = true,
  showHorizon = true,
  className,
}: FramingGuidanceProps) {
  // Get guidance tips
  const baseGuidance = GUIDANCE_BY_TYPE[targetType] || [];
  const perilGuidance = perilType && PERIL_SPECIFIC_GUIDANCE[perilType]?.[targetType];
  const allGuidance = perilGuidance || baseGuidance;

  return (
    <div className={cn('absolute inset-0 pointer-events-none z-10', className)}>
      {/* Grid overlay */}
      {showGrid && (
        <div className="absolute inset-0 opacity-20">
          <div className="grid grid-cols-3 grid-rows-3 h-full w-full">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="border border-white/30"
                style={{
                  gridColumn: (i % 3) + 1,
                  gridRow: Math.floor(i / 3) + 1,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Horizon leveling guide */}
      {showHorizon && (
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/50 transform -translate-y-1/2" />
      )}

      {/* Guidance text overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            {framingGuidance ? (
              <p className="text-sm font-medium">{framingGuidance}</p>
            ) : (
              <>
                <p className="text-sm font-medium">Framing Tips:</p>
                <ul className="text-xs space-y-0.5 list-disc list-inside">
                  {allGuidance.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Corner indicators for rule of thirds */}
      {showGrid && (
        <>
          <div className="absolute top-1/3 left-1/3 w-2 h-2 border-2 border-white/50 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/3 right-1/3 w-2 h-2 border-2 border-white/50 rounded-full transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 border-2 border-white/50 rounded-full transform -translate-x-1/2 translate-y-1/2" />
          <div className="absolute bottom-1/3 right-1/3 w-2 h-2 border-2 border-white/50 rounded-full transform translate-x-1/2 translate-y-1/2" />
        </>
      )}
    </div>
  );
}
