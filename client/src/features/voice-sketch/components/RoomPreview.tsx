// Room Preview Component
// Live 2D sketch preview for voice-created rooms

import React, { useRef, useEffect, useMemo } from 'react';
import { Home } from 'lucide-react';
import type { RoomGeometry, Opening, Feature, VoiceDamageZone, WallDirection } from '../types/geometry';
import { formatDimension, getWallLength, calculatePositionInFeet, formatRoomName } from '../utils/polygon-math';
import { cn } from '@/lib/utils';

interface RoomPreviewProps {
  room: RoomGeometry | null;
  className?: string;
}

const PIXELS_PER_FOOT = 20;
const PADDING = 60;
const WALL_STROKE_WIDTH = 3;

// Color scheme
const COLORS = {
  wall: '#1e3a5f',
  wallLabel: '#64748b',
  dimension: '#0d9488',
  door: '#8b5a2b',
  window: '#87ceeb',
  closet: '#d4d4d4',
  island: '#a8a29e',
  fireplace: '#dc2626',
  damage: {
    water: 'rgba(59, 130, 246, 0.3)',
    fire: 'rgba(239, 68, 68, 0.3)',
    smoke: 'rgba(107, 114, 128, 0.3)',
    mold: 'rgba(34, 197, 94, 0.3)',
    wind: 'rgba(168, 162, 158, 0.3)',
    impact: 'rgba(249, 115, 22, 0.3)',
  },
  grid: '#e5e7eb',
};

export function RoomPreview({ room, className }: RoomPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate canvas dimensions and scale
  const { canvasWidth, canvasHeight, scale, offsetX, offsetY } = useMemo(() => {
    if (!room) {
      return { canvasWidth: 400, canvasHeight: 400, scale: PIXELS_PER_FOOT, offsetX: PADDING, offsetY: PADDING };
    }

    const roomWidthPx = room.width_ft * PIXELS_PER_FOOT;
    const roomHeightPx = room.length_ft * PIXELS_PER_FOOT;

    return {
      canvasWidth: roomWidthPx + PADDING * 2,
      canvasHeight: roomHeightPx + PADDING * 2,
      scale: PIXELS_PER_FOOT,
      offsetX: PADDING,
      offsetY: PADDING,
    };
  }, [room]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid background
    drawGrid(ctx, canvasWidth, canvasHeight);

    if (!room) {
      drawPlaceholder(ctx, canvasWidth, canvasHeight);
      return;
    }

    // Draw damage zones first (background)
    room.damageZones.forEach((zone) => {
      drawDamageZone(ctx, zone, room, offsetX, offsetY, scale);
    });

    // Draw room outline
    drawRoomOutline(ctx, room, offsetX, offsetY, scale);

    // Draw features
    room.features.forEach((feature) => {
      drawFeature(ctx, feature, room, offsetX, offsetY, scale);
    });

    // Draw openings (doors, windows)
    room.openings.forEach((opening) => {
      drawOpening(ctx, opening, room, offsetX, offsetY, scale);
    });

    // Draw dimensions
    drawDimensions(ctx, room, offsetX, offsetY, scale);

    // Draw wall labels
    drawWallLabels(ctx, room, offsetX, offsetY, scale);

    // Draw room name
    drawRoomName(ctx, room, offsetX, offsetY, scale, canvasWidth);

  }, [room, canvasWidth, canvasHeight, offsetX, offsetY, scale]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-lg border bg-card overflow-auto',
        className
      )}
    >
      <div className="p-3 border-b bg-muted/50">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Home className="h-4 w-4" />
          Room Preview
        </h3>
      </div>
      <div className="p-4 flex items-center justify-center min-h-[300px]">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="max-w-full h-auto"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </div>
      {room && (
        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-4">
            <span>
              <strong>Area:</strong> {(room.width_ft * room.length_ft).toFixed(0)} sq ft
            </span>
            <span>
              <strong>Perimeter:</strong> {(2 * (room.width_ft + room.length_ft)).toFixed(0)} ft
            </span>
            <span>
              <strong>Ceiling:</strong> {formatDimension(room.ceiling_height_ft)}
            </span>
            {room.damageZones.length > 0 && (
              <span className="text-red-600">
                <strong>Damage Zones:</strong> {room.damageZones.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;

  // Draw grid lines every foot
  const gridSize = PIXELS_PER_FOOT;
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Start speaking to create a room...', width / 2, height / 2);
}

function drawRoomOutline(
  ctx: CanvasRenderingContext2D,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const w = room.width_ft * scale;
  const h = room.length_ft * scale;

  // Fill with light background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(offsetX, offsetY, w, h);

  // Draw walls
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = WALL_STROKE_WIDTH;
  ctx.strokeRect(offsetX, offsetY, w, h);
}

function drawOpening(
  ctx: CanvasRenderingContext2D,
  opening: Opening,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const wallLength = getWallLength(opening.wall, room.width_ft, room.length_ft);
  const position = calculatePositionInFeet(opening.position, wallLength, opening.width_ft);
  const openingWidthPx = opening.width_ft * scale;

  let x: number, y: number, width: number, height: number;
  const wallThickness = WALL_STROKE_WIDTH * 2;

  switch (opening.wall) {
    case 'north':
      x = offsetX + position * scale - openingWidthPx / 2;
      y = offsetY - wallThickness / 2;
      width = openingWidthPx;
      height = wallThickness;
      break;
    case 'south':
      x = offsetX + position * scale - openingWidthPx / 2;
      y = offsetY + room.length_ft * scale - wallThickness / 2;
      width = openingWidthPx;
      height = wallThickness;
      break;
    case 'east':
      x = offsetX + room.width_ft * scale - wallThickness / 2;
      y = offsetY + position * scale - openingWidthPx / 2;
      width = wallThickness;
      height = openingWidthPx;
      break;
    case 'west':
      x = offsetX - wallThickness / 2;
      y = offsetY + position * scale - openingWidthPx / 2;
      width = wallThickness;
      height = openingWidthPx;
      break;
  }

  // Clear the wall section
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);

  // Draw opening indicator
  if (opening.type === 'door' || opening.type === 'sliding_door' || opening.type === 'french_door') {
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(x, y, width, height);

    // Draw door swing arc
    ctx.beginPath();
    ctx.strokeStyle = COLORS.door;
    ctx.lineWidth = 1;

    if (opening.wall === 'north' || opening.wall === 'south') {
      const centerX = x + width / 2;
      const arcRadius = openingWidthPx * 0.8;
      const startAngle = opening.wall === 'north' ? 0 : Math.PI;
      const endAngle = opening.wall === 'north' ? Math.PI / 2 : Math.PI * 1.5;
      ctx.arc(x, y + height / 2, arcRadius, startAngle, endAngle);
    } else {
      const centerY = y + height / 2;
      const arcRadius = openingWidthPx * 0.8;
      const startAngle = opening.wall === 'east' ? Math.PI / 2 : -Math.PI / 2;
      const endAngle = opening.wall === 'east' ? Math.PI : 0;
      ctx.arc(x + width / 2, y, arcRadius, startAngle, endAngle);
    }
    ctx.stroke();
  } else {
    // Window
    ctx.fillStyle = COLORS.window;
    ctx.fillRect(x, y, width, height);

    // Draw window panes
    ctx.strokeStyle = '#4a90a4';
    ctx.lineWidth = 1;
    if (opening.wall === 'north' || opening.wall === 'south') {
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width / 2, y + height);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y + height / 2);
      ctx.lineTo(x + width, y + height / 2);
      ctx.stroke();
    }
  }
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  if (feature.wall === 'freestanding') {
    // Draw freestanding feature (like an island) in center-ish area
    const featureW = feature.width_ft * scale;
    const featureH = feature.depth_ft * scale;
    const x = offsetX + (room.width_ft * scale - featureW) / 2;
    const y = offsetY + (room.length_ft * scale - featureH) / 2;

    ctx.fillStyle = COLORS.island;
    ctx.fillRect(x, y, featureW, featureH);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, featureW, featureH);
    return;
  }

  const wallLength = getWallLength(feature.wall, room.width_ft, room.length_ft);
  const position = calculatePositionInFeet(feature.position, wallLength, feature.width_ft);
  const featureWidthPx = feature.width_ft * scale;
  const featureDepthPx = feature.depth_ft * scale;

  let x: number, y: number, width: number, height: number;

  switch (feature.wall) {
    case 'north':
      x = offsetX + position * scale - featureWidthPx / 2;
      y = offsetY;
      width = featureWidthPx;
      height = featureDepthPx;
      break;
    case 'south':
      x = offsetX + position * scale - featureWidthPx / 2;
      y = offsetY + room.length_ft * scale - featureDepthPx;
      width = featureWidthPx;
      height = featureDepthPx;
      break;
    case 'east':
      x = offsetX + room.width_ft * scale - featureDepthPx;
      y = offsetY + position * scale - featureWidthPx / 2;
      width = featureDepthPx;
      height = featureWidthPx;
      break;
    case 'west':
      x = offsetX;
      y = offsetY + position * scale - featureWidthPx / 2;
      width = featureDepthPx;
      height = featureWidthPx;
      break;
  }

  // Draw feature
  const fillColor = feature.type === 'fireplace' ? COLORS.fireplace : COLORS.closet;
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Draw label
  ctx.fillStyle = '#64748b';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(feature.type, x + width / 2, y + height / 2);
}

function drawDamageZone(
  ctx: CanvasRenderingContext2D,
  zone: VoiceDamageZone,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const color = COLORS.damage[zone.type] || COLORS.damage.water;
  const extentPx = zone.extent_ft * scale;

  ctx.fillStyle = color;

  zone.affected_walls.forEach((wall) => {
    let x: number, y: number, width: number, height: number;

    switch (wall) {
      case 'north':
        x = offsetX;
        y = offsetY;
        width = room.width_ft * scale;
        height = extentPx;
        break;
      case 'south':
        x = offsetX;
        y = offsetY + room.length_ft * scale - extentPx;
        width = room.width_ft * scale;
        height = extentPx;
        break;
      case 'east':
        x = offsetX + room.width_ft * scale - extentPx;
        y = offsetY;
        width = extentPx;
        height = room.length_ft * scale;
        break;
      case 'west':
        x = offsetX;
        y = offsetY;
        width = extentPx;
        height = room.length_ft * scale;
        break;
    }

    ctx.fillRect(x, y, width, height);
  });

  // Draw damage zone border
  ctx.strokeStyle = zone.type === 'water' ? '#3b82f6' : '#ef4444';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  zone.affected_walls.forEach((wall) => {
    const wallLength = getWallLength(wall, room.width_ft, room.length_ft);
    ctx.beginPath();

    switch (wall) {
      case 'north':
        ctx.moveTo(offsetX, offsetY + extentPx);
        ctx.lineTo(offsetX + wallLength * scale, offsetY + extentPx);
        break;
      case 'south':
        ctx.moveTo(offsetX, offsetY + room.length_ft * scale - extentPx);
        ctx.lineTo(offsetX + wallLength * scale, offsetY + room.length_ft * scale - extentPx);
        break;
      case 'east':
        ctx.moveTo(offsetX + room.width_ft * scale - extentPx, offsetY);
        ctx.lineTo(offsetX + room.width_ft * scale - extentPx, offsetY + room.length_ft * scale);
        break;
      case 'west':
        ctx.moveTo(offsetX + extentPx, offsetY);
        ctx.lineTo(offsetX + extentPx, offsetY + room.length_ft * scale);
        break;
    }

    ctx.stroke();
  });

  ctx.setLineDash([]);
}

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const w = room.width_ft * scale;
  const h = room.length_ft * scale;

  ctx.fillStyle = COLORS.dimension;
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Width dimension (top)
  ctx.fillText(formatDimension(room.width_ft), offsetX + w / 2, offsetY - 20);

  // Length dimension (right)
  ctx.save();
  ctx.translate(offsetX + w + 20, offsetY + h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(formatDimension(room.length_ft), 0, 0);
  ctx.restore();
}

function drawWallLabels(
  ctx: CanvasRenderingContext2D,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const w = room.width_ft * scale;
  const h = room.length_ft * scale;

  ctx.fillStyle = COLORS.wallLabel;
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Wall labels
  ctx.fillText('N', offsetX + w / 2, offsetY - 8);
  ctx.fillText('S', offsetX + w / 2, offsetY + h + 10);
  ctx.fillText('W', offsetX - 10, offsetY + h / 2);
  ctx.fillText('E', offsetX + w + 10, offsetY + h / 2);
}

function drawRoomName(
  ctx: CanvasRenderingContext2D,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number,
  canvasWidth: number
) {
  ctx.fillStyle = COLORS.wall;
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(formatRoomName(room.name), canvasWidth / 2, 10);
}
