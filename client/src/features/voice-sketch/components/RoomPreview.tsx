// Room Preview Component
// Live 2D sketch preview for voice-created rooms with pinch-to-zoom support

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Home, ZoomIn, ZoomOut, Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { RoomGeometry, Opening, Feature, VoiceDamageZone, WallDirection } from '../types/geometry';
import { formatDimension, getWallLength, calculatePositionInFeet, formatRoomName, generateDamageZonePolygon } from '../utils/polygon-math';
import { cn } from '@/lib/utils';

interface RoomPreviewProps {
  room: RoomGeometry | null;
  className?: string;
}

const PIXELS_PER_FOOT = 20;
const PADDING = 60;
const WALL_STROKE_WIDTH = 3;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

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
  const expandedCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastTouchDistance = useRef<number | null>(null);

  // Helper to calculate polygon bounding box
  const getPolygonBounds = useCallback((polygon: { x: number; y: number }[]) => {
    if (polygon.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }, []);

  // Calculate canvas dimensions and scale
  const { canvasWidth, canvasHeight, scale, offsetX, offsetY } = useMemo(() => {
    if (!room) {
      return { canvasWidth: 400, canvasHeight: 400, scale: PIXELS_PER_FOOT, offsetX: PADDING, offsetY: PADDING };
    }

    // Use polygon bounds to handle L/T shapes with negative coordinates
    const bounds = getPolygonBounds(room.polygon);
    const polyWidth = bounds.maxX - bounds.minX;
    const polyHeight = bounds.maxY - bounds.minY;

    const roomWidthPx = polyWidth * PIXELS_PER_FOOT;
    const roomHeightPx = polyHeight * PIXELS_PER_FOOT;

    // Offset accounts for negative coordinates in the polygon
    const adjustedOffsetX = PADDING - bounds.minX * PIXELS_PER_FOOT;
    const adjustedOffsetY = PADDING - bounds.minY * PIXELS_PER_FOOT;

    return {
      canvasWidth: roomWidthPx + PADDING * 2,
      canvasHeight: roomHeightPx + PADDING * 2,
      scale: PIXELS_PER_FOOT,
      offsetX: adjustedOffsetX,
      offsetY: adjustedOffsetY,
    };
  }, [room, getPolygonBounds]);

  // Calculate expanded canvas dimensions (larger scale for detail)
  const EXPANDED_PIXELS_PER_FOOT = 40; // Double the resolution
  const EXPANDED_PADDING = 100;
  const expandedDimensions = useMemo(() => {
    if (!room) {
      return { width: 800, height: 800, scale: EXPANDED_PIXELS_PER_FOOT, offsetX: EXPANDED_PADDING, offsetY: EXPANDED_PADDING };
    }

    // Use polygon bounds to handle L/T shapes with negative coordinates
    const bounds = getPolygonBounds(room.polygon);
    const polyWidth = bounds.maxX - bounds.minX;
    const polyHeight = bounds.maxY - bounds.minY;

    const roomWidthPx = polyWidth * EXPANDED_PIXELS_PER_FOOT;
    const roomHeightPx = polyHeight * EXPANDED_PIXELS_PER_FOOT;

    // Offset accounts for negative coordinates in the polygon
    const adjustedOffsetX = EXPANDED_PADDING - bounds.minX * EXPANDED_PIXELS_PER_FOOT;
    const adjustedOffsetY = EXPANDED_PADDING - bounds.minY * EXPANDED_PIXELS_PER_FOOT;

    return {
      width: roomWidthPx + EXPANDED_PADDING * 2,
      height: roomHeightPx + EXPANDED_PADDING * 2,
      scale: EXPANDED_PIXELS_PER_FOOT,
      offsetX: adjustedOffsetX,
      offsetY: adjustedOffsetY,
    };
  }, [room, getPolygonBounds]);

  // Touch event handlers for pinch-to-zoom
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      lastTouchDistance.current = getTouchDistance(e.touches);
    }
  }, [getTouchDistance]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      if (currentDistance && lastTouchDistance.current) {
        const delta = currentDistance / lastTouchDistance.current;
        setZoom(prevZoom => {
          const newZoom = prevZoom * delta;
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
        });
        lastTouchDistance.current = currentDistance;
      }
    }
  }, [isPinching, getTouchDistance]);

  const handleTouchEnd = useCallback(() => {
    setIsPinching(false);
    lastTouchDistance.current = null;
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setIsExpanded(false);
  }, []);

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

    // Draw room outline first (white background)
    drawRoomOutline(ctx, room, offsetX, offsetY, scale);

    // Draw damage zones on top of room background
    room.damageZones.forEach((zone) => {
      drawDamageZone(ctx, zone, room, offsetX, offsetY, scale);
    });

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

  // Draw on expanded canvas when dialog is open
  useEffect(() => {
    if (!isExpanded) return;

    const canvas = expandedCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, scale: expScale, offsetX: expOffsetX, offsetY: expOffsetY } = expandedDimensions;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid background
    drawGrid(ctx, width, height);

    if (!room) {
      drawPlaceholder(ctx, width, height);
      return;
    }

    // Draw room outline first (white background)
    drawRoomOutline(ctx, room, expOffsetX, expOffsetY, expScale);

    // Draw damage zones on top of room background
    room.damageZones.forEach((zone) => {
      drawDamageZone(ctx, zone, room, expOffsetX, expOffsetY, expScale);
    });

    // Draw features
    room.features.forEach((feature) => {
      drawFeature(ctx, feature, room, expOffsetX, expOffsetY, expScale);
    });

    // Draw openings (doors, windows)
    room.openings.forEach((opening) => {
      drawOpening(ctx, opening, room, expOffsetX, expOffsetY, expScale);
    });

    // Draw dimensions
    drawDimensions(ctx, room, expOffsetX, expOffsetY, expScale);

    // Draw wall labels
    drawWallLabels(ctx, room, expOffsetX, expOffsetY, expScale);

    // Draw room name
    drawRoomName(ctx, room, expOffsetX, expOffsetY, expScale, width);

  }, [isExpanded, room, expandedDimensions]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-lg border bg-card overflow-hidden flex flex-col',
        className
      )}
    >
      {/* Header with zoom controls */}
      <div className="p-2 sm:p-3 border-b bg-muted/50 flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Home className="h-4 w-4" />
          <span className="hidden xs:inline">Room Preview</span>
          <span className="xs:hidden">Preview</span>
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExpand}
            disabled={!room}
            data-testid="button-expand"
            title="Expand to fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Canvas container with touch handling */}
      <div
        ref={canvasContainerRef}
        className="flex-1 overflow-auto min-h-[200px] sm:min-h-[300px]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: isPinching ? 'none' : 'pan-x pan-y' }}
      >
        <div
          className="p-2 sm:p-4 flex items-center justify-center w-full h-full"
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="max-w-full"
            style={{
              imageRendering: 'crisp-edges',
              width: `${canvasWidth * zoom}px`,
              height: `${canvasHeight * zoom}px`,
              maxWidth: zoom <= 1 ? '100%' : 'none',
              objectFit: 'contain'
            }}
          />
        </div>
      </div>
      
      {/* Room info - optimized for mobile */}
      {room && (
        <div className="p-2 sm:p-3 border-t bg-muted/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">Area:</span>
              <span>{(room.width_ft * room.length_ft).toFixed(0)} ft²</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">Perim:</span>
              <span>{(2 * (room.width_ft + room.length_ft)).toFixed(0)} ft</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">Ceiling:</span>
              <span>{formatDimension(room.ceiling_height_ft)}</span>
            </div>
            {room.damageZones.length > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <span className="font-medium">Damage:</span>
                <span>{room.damageZones.length} zone{room.damageZones.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded view dialog */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-muted/50">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                {room ? formatRoomName(room.name) : 'Room Preview'}
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseExpanded}
                className="h-8 w-8"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto p-4 bg-white flex items-center justify-center" style={{ maxHeight: 'calc(95vh - 120px)' }}>
            <canvas
              ref={expandedCanvasRef}
              width={expandedDimensions.width}
              height={expandedDimensions.height}
              style={{
                imageRendering: 'crisp-edges',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
          {/* Expanded view room info */}
          {room && (
            <div className="p-4 border-t bg-muted/30">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Dimensions:</span>
                  <span>{formatDimension(room.width_ft)} × {formatDimension(room.length_ft)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Area:</span>
                  <span>{(room.width_ft * room.length_ft).toFixed(0)} ft²</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Perimeter:</span>
                  <span>{(2 * (room.width_ft + room.length_ft)).toFixed(0)} ft</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Ceiling:</span>
                  <span>{formatDimension(room.ceiling_height_ft)}</span>
                </div>
                {room.openings.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Openings:</span>
                    <span>{room.openings.length}</span>
                  </div>
                )}
                {room.features.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Features:</span>
                    <span>{room.features.length}</span>
                  </div>
                )}
                {room.damageZones.length > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <span className="font-medium">Damage Zones:</span>
                    <span>{room.damageZones.length}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
  const polygon = room.polygon;

  // For non-rectangular shapes, use the polygon path
  if (room.shape !== 'rectangle' && polygon.length > 0) {
    ctx.beginPath();
    
    // Move to first point
    ctx.moveTo(offsetX + polygon[0].x * scale, offsetY + polygon[0].y * scale);
    
    // Draw lines to each subsequent point
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(offsetX + polygon[i].x * scale, offsetY + polygon[i].y * scale);
    }
    
    // Close the path
    ctx.closePath();
    
    // Fill with light background
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Draw walls
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = WALL_STROKE_WIDTH;
    ctx.stroke();
  } else {
    // For rectangles, use simple rect for efficiency
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
  const position = calculatePositionInFeet(opening.position, wallLength, opening.width_ft, opening.position_from ?? 'start');
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
    // Draw freestanding feature (like an island)
    const featureW = feature.width_ft * scale;
    const featureH = feature.depth_ft * scale;
    
    // Calculate position based on x_offset_ft and y_offset_ft if provided
    // x_offset_ft = distance from west wall (left edge)
    // y_offset_ft = distance from south wall (bottom edge)
    let x: number, y: number;
    
    if (feature.x_offset_ft !== undefined) {
      // Position from west wall
      x = offsetX + feature.x_offset_ft * scale;
    } else {
      // Default to centered horizontally
      x = offsetX + (room.width_ft * scale - featureW) / 2;
    }
    
    if (feature.y_offset_ft !== undefined) {
      // Position from south wall (remember: canvas y increases downward, so we need to flip)
      // y_offset_ft is distance from south wall, so we calculate from top (north)
      y = offsetY + (room.length_ft * scale - feature.y_offset_ft * scale - featureH);
    } else {
      // Default to centered vertically
      y = offsetY + (room.length_ft * scale - featureH) / 2;
    }

    ctx.fillStyle = COLORS.island;
    ctx.fillRect(x, y, featureW, featureH);
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, featureW, featureH);
    
    // Draw label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(feature.type, x + featureW / 2, y + featureH / 2);
    return;
  }

  const wallLength = getWallLength(feature.wall, room.width_ft, room.length_ft);
  const position = calculatePositionInFeet(feature.position, wallLength, feature.width_ft, feature.position_from ?? 'start');
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
  const strokeColor = zone.type === 'water' ? '#3b82f6' : 
                      zone.type === 'fire' ? '#ef4444' :
                      zone.type === 'mold' ? '#22c55e' :
                      zone.type === 'smoke' ? '#6b7280' : '#f97316';

  // Get or generate the damage zone polygon
  let polygon = zone.polygon;
  if (!polygon || polygon.length === 0) {
    // Generate polygon from wall-extent specification
    polygon = generateDamageZonePolygon(
      room.width_ft,
      room.length_ft,
      zone.affected_walls,
      zone.extent_ft
    );
  }

  if (polygon.length === 0) return;

  // Draw filled polygon
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(offsetX + polygon[0].x * scale, offsetY + polygon[0].y * scale);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(offsetX + polygon[i].x * scale, offsetY + polygon[i].y * scale);
  }
  ctx.closePath();
  ctx.fill();

  // Draw dashed border
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw damage type label in the center of the zone
  if (polygon.length > 0) {
    // Calculate centroid of polygon
    let cx = 0, cy = 0;
    for (const p of polygon) {
      cx += p.x;
      cy += p.y;
    }
    cx = cx / polygon.length * scale + offsetX;
    cy = cy / polygon.length * scale + offsetY;

    // Draw label background
    const labelText = zone.type.charAt(0).toUpperCase() + zone.type.slice(1);
    ctx.font = 'bold 10px Inter, sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(cx - textWidth / 2 - 4, cy - 7, textWidth + 8, 14);
    
    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, cx, cy);
  }
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

  // Draw opening dimensions
  room.openings.forEach((opening) => {
    drawOpeningDimension(ctx, opening, room, offsetX, offsetY, scale);
  });

  // Draw feature dimensions
  room.features.forEach((feature) => {
    drawFeatureDimension(ctx, feature, room, offsetX, offsetY, scale);
  });
}

function drawOpeningDimension(
  ctx: CanvasRenderingContext2D,
  opening: Opening,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const wallLength = getWallLength(opening.wall, room.width_ft, room.length_ft);
  const position = calculatePositionInFeet(opening.position, wallLength, opening.width_ft, opening.position_from ?? 'start');
  const openingWidthPx = opening.width_ft * scale;

  // Position and label offset based on wall
  let labelX: number, labelY: number;
  const labelOffset = 14;

  switch (opening.wall) {
    case 'north':
      labelX = offsetX + position * scale;
      labelY = offsetY - labelOffset - 6;
      break;
    case 'south':
      labelX = offsetX + position * scale;
      labelY = offsetY + room.length_ft * scale + labelOffset + 6;
      break;
    case 'east':
      labelX = offsetX + room.width_ft * scale + labelOffset + 12;
      labelY = offsetY + position * scale;
      break;
    case 'west':
      labelX = offsetX - labelOffset - 12;
      labelY = offsetY + position * scale;
      break;
  }

  // Draw dimension label with background
  const dimText = formatDimension(opening.width_ft);
  ctx.font = '9px Inter, sans-serif';
  const textWidth = ctx.measureText(dimText).width;

  // Background pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.roundRect(labelX - textWidth / 2 - 4, labelY - 6, textWidth + 8, 12, 3);
  ctx.fill();

  // Border
  ctx.strokeStyle = opening.type.includes('door') ? COLORS.door : COLORS.window;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = opening.type.includes('door') ? COLORS.door : '#4a90a4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dimText, labelX, labelY);
}

function drawFeatureDimension(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  room: RoomGeometry,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const featureWidthPx = feature.width_ft * scale;
  const featureDepthPx = feature.depth_ft * scale;
  let x: number, y: number;

  if (feature.wall === 'freestanding') {
    if (feature.x_offset_ft !== undefined) {
      x = offsetX + feature.x_offset_ft * scale;
    } else {
      x = offsetX + (room.width_ft * scale - featureWidthPx) / 2;
    }
    if (feature.y_offset_ft !== undefined) {
      y = offsetY + (room.length_ft * scale - feature.y_offset_ft * scale - featureDepthPx);
    } else {
      y = offsetY + (room.length_ft * scale - featureDepthPx) / 2;
    }

    // Draw dimension below freestanding feature
    const dimText = `${formatDimension(feature.width_ft)} × ${formatDimension(feature.depth_ft)}`;
    ctx.font = '8px Inter, sans-serif';
    const textWidth = ctx.measureText(dimText).width;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(x + featureWidthPx / 2 - textWidth / 2 - 3, y + featureDepthPx + 2, textWidth + 6, 12);

    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(dimText, x + featureWidthPx / 2, y + featureDepthPx + 4);
    return;
  }

  // Wall-attached features
  const wallLength = getWallLength(feature.wall, room.width_ft, room.length_ft);
  const position = calculatePositionInFeet(feature.position, wallLength, feature.width_ft, feature.position_from ?? 'start');

  switch (feature.wall) {
    case 'north':
      x = offsetX + position * scale - featureWidthPx / 2;
      y = offsetY;
      break;
    case 'south':
      x = offsetX + position * scale - featureWidthPx / 2;
      y = offsetY + room.length_ft * scale - featureDepthPx;
      break;
    case 'east':
      x = offsetX + room.width_ft * scale - featureDepthPx;
      y = offsetY + position * scale - featureWidthPx / 2;
      break;
    case 'west':
      x = offsetX;
      y = offsetY + position * scale - featureWidthPx / 2;
      break;
  }

  // Dimension text
  const dimText = `${formatDimension(feature.width_ft)}×${formatDimension(feature.depth_ft)}`;
  ctx.font = '7px Inter, sans-serif';
  const textWidth = ctx.measureText(dimText).width;

  // Position based on wall
  let labelX: number, labelY: number;
  if (feature.wall === 'north' || feature.wall === 'south') {
    labelX = x + featureWidthPx / 2;
    labelY = feature.wall === 'north' ? y + featureDepthPx + 8 : y - 8;
  } else {
    labelX = feature.wall === 'east' ? x - 8 : x + featureDepthPx + 8;
    labelY = y + featureWidthPx / 2;
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(labelX - textWidth / 2 - 2, labelY - 5, textWidth + 4, 10);

  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dimText, labelX, labelY);
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
