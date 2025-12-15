// Floor Plan Preview Component
// Renders multiple rooms with their positions and connections

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, X, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FloorPlan, RoomGeometry, RoomConnection, WallDirection } from '../types/geometry';
import { getPolygonBounds, formatDimension } from '../utils/polygon-math';
import { cn } from '@/lib/utils';

interface FloorPlanPreviewProps {
  floorPlan: FloorPlan | null;
  selectedRoomId?: string;
  onRoomSelect?: (roomId: string) => void;
  className?: string;
}

const PIXELS_PER_FOOT = 12;
const PADDING = 80;
const WALL_STROKE_WIDTH = 2;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

const COLORS = {
  wall: '#1e3a5f',
  wallSelected: '#7763B7',
  roomFill: 'rgba(226, 232, 240, 0.5)',
  roomFillSelected: 'rgba(119, 99, 183, 0.15)',
  connection: '#C6A54E',
  connectionLine: 'rgba(198, 165, 78, 0.6)',
  grid: '#e5e7eb',
  roomLabel: '#475569',
  dimensionLabel: '#0d9488',
};

function getWallMidpoint(
  room: RoomGeometry,
  wall: WallDirection,
  positionFt: number
): { x: number; y: number } {
  const originX = room.origin_x_ft ?? 0;
  const originY = room.origin_y_ft ?? 0;

  switch (wall) {
    case 'north':
      return { x: originX + positionFt, y: originY };
    case 'south':
      return { x: originX + positionFt, y: originY + room.length_ft };
    case 'east':
      return { x: originX + room.width_ft, y: originY + positionFt };
    case 'west':
      return { x: originX, y: originY + positionFt };
  }
}

export function FloorPlanPreview({
  floorPlan,
  selectedRoomId,
  onRoomSelect,
  className,
}: FloorPlanPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expandedCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastTouchDistance = useRef<number | null>(null);

  const { canvasWidth, canvasHeight, offsetX, offsetY, minX, minY } = useMemo(() => {
    if (!floorPlan || floorPlan.rooms.length === 0) {
      return { canvasWidth: 400, canvasHeight: 400, offsetX: PADDING, offsetY: PADDING, minX: 0, minY: 0 };
    }

    let globalMinX = Infinity, globalMaxX = -Infinity;
    let globalMinY = Infinity, globalMaxY = -Infinity;

    for (const room of floorPlan.rooms) {
      const roomOriginX = room.origin_x_ft ?? 0;
      const roomOriginY = room.origin_y_ft ?? 0;
      const bounds = getPolygonBounds(room.polygon);

      globalMinX = Math.min(globalMinX, roomOriginX + bounds.minX);
      globalMaxX = Math.max(globalMaxX, roomOriginX + bounds.maxX);
      globalMinY = Math.min(globalMinY, roomOriginY + bounds.minY);
      globalMaxY = Math.max(globalMaxY, roomOriginY + bounds.maxY);
    }

    const planWidth = globalMaxX - globalMinX;
    const planHeight = globalMaxY - globalMinY;

    return {
      canvasWidth: planWidth * PIXELS_PER_FOOT + PADDING * 2,
      canvasHeight: planHeight * PIXELS_PER_FOOT + PADDING * 2,
      offsetX: PADDING - globalMinX * PIXELS_PER_FOOT,
      offsetY: PADDING - globalMinY * PIXELS_PER_FOOT,
      minX: globalMinX,
      minY: globalMinY,
    };
  }, [floorPlan]);

  const EXPANDED_SCALE = 24;
  const EXPANDED_PADDING = 120;
  const expandedDimensions = useMemo(() => {
    if (!floorPlan || floorPlan.rooms.length === 0) {
      return { width: 800, height: 800, offsetX: EXPANDED_PADDING, offsetY: EXPANDED_PADDING };
    }

    let globalMinX = Infinity, globalMaxX = -Infinity;
    let globalMinY = Infinity, globalMaxY = -Infinity;

    for (const room of floorPlan.rooms) {
      const roomOriginX = room.origin_x_ft ?? 0;
      const roomOriginY = room.origin_y_ft ?? 0;
      const bounds = getPolygonBounds(room.polygon);

      globalMinX = Math.min(globalMinX, roomOriginX + bounds.minX);
      globalMaxX = Math.max(globalMaxX, roomOriginX + bounds.maxX);
      globalMinY = Math.min(globalMinY, roomOriginY + bounds.minY);
      globalMaxY = Math.max(globalMaxY, roomOriginY + bounds.maxY);
    }

    const planWidth = globalMaxX - globalMinX;
    const planHeight = globalMaxY - globalMinY;

    return {
      width: planWidth * EXPANDED_SCALE + EXPANDED_PADDING * 2,
      height: planHeight * EXPANDED_SCALE + EXPANDED_PADDING * 2,
      offsetX: EXPANDED_PADDING - globalMinX * EXPANDED_SCALE,
      offsetY: EXPANDED_PADDING - globalMinY * EXPANDED_SCALE,
    };
  }, [floorPlan]);

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
        setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * delta)));
        lastTouchDistance.current = currentDistance;
      }
    }
  }, [isPinching, getTouchDistance]);

  const handleTouchEnd = useCallback(() => {
    setIsPinching(false);
    lastTouchDistance.current = null;
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + 0.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - 0.2));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const drawFloorPlan = useCallback((
    ctx: CanvasRenderingContext2D,
    plan: FloorPlan,
    scale: number,
    offsetXPx: number,
    offsetYPx: number,
    showLabels: boolean = true
  ) => {
    const toCanvasX = (ft: number) => ft * scale + offsetXPx;
    const toCanvasY = (ft: number) => ft * scale + offsetYPx;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    const gridSpacing = 5 * scale;
    for (let x = offsetXPx % gridSpacing; x < ctx.canvas.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ctx.canvas.height);
      ctx.stroke();
    }
    for (let y = offsetYPx % gridSpacing; y < ctx.canvas.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ctx.canvas.width, y);
      ctx.stroke();
    }

    // Draw connections first (behind rooms)
    for (const conn of plan.connections) {
      const fromRoom = plan.rooms.find(r => r.id === conn.from.room_id);
      const toRoom = plan.rooms.find(r => r.id === conn.to.room_id);
      if (!fromRoom || !toRoom) continue;

      const fromPt = getWallMidpoint(fromRoom, conn.from.wall, conn.from.position_ft);
      const toPt = getWallMidpoint(toRoom, conn.to.wall, conn.to.position_ft);

      ctx.strokeStyle = COLORS.connectionLine;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(toCanvasX(fromPt.x), toCanvasY(fromPt.y));
      ctx.lineTo(toCanvasX(toPt.x), toCanvasY(toPt.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw connection indicators
      const iconSize = 8;
      ctx.fillStyle = COLORS.connection;
      ctx.beginPath();
      ctx.arc(toCanvasX(fromPt.x), toCanvasY(fromPt.y), iconSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(toCanvasX(toPt.x), toCanvasY(toPt.y), iconSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw each room
    for (const room of plan.rooms) {
      const roomOriginX = room.origin_x_ft ?? 0;
      const roomOriginY = room.origin_y_ft ?? 0;
      const isSelected = room.id === selectedRoomId;

      // Draw room polygon
      if (room.polygon.length > 0) {
        ctx.beginPath();
        ctx.moveTo(
          toCanvasX(roomOriginX + room.polygon[0].x),
          toCanvasY(roomOriginY + room.polygon[0].y)
        );
        for (let i = 1; i < room.polygon.length; i++) {
          ctx.lineTo(
            toCanvasX(roomOriginX + room.polygon[i].x),
            toCanvasY(roomOriginY + room.polygon[i].y)
          );
        }
        ctx.closePath();

        // Fill
        ctx.fillStyle = isSelected ? COLORS.roomFillSelected : COLORS.roomFill;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = isSelected ? COLORS.wallSelected : COLORS.wall;
        ctx.lineWidth = isSelected ? WALL_STROKE_WIDTH + 1 : WALL_STROKE_WIDTH;
        ctx.stroke();
      }

      // Draw room label
      if (showLabels) {
        const bounds = getPolygonBounds(room.polygon);
        const centerX = roomOriginX + (bounds.minX + bounds.maxX) / 2;
        const centerY = roomOriginY + (bounds.minY + bounds.maxY) / 2;

        ctx.fillStyle = isSelected ? COLORS.wallSelected : COLORS.roomLabel;
        ctx.font = `bold ${Math.max(10, scale * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(room.name, toCanvasX(centerX), toCanvasY(centerY));

        // Draw dimensions below name
        ctx.fillStyle = COLORS.dimensionLabel;
        ctx.font = `${Math.max(8, scale * 0.6)}px sans-serif`;
        ctx.fillText(
          `${formatDimension(room.width_ft)} × ${formatDimension(room.length_ft)}`,
          toCanvasX(centerX),
          toCanvasY(centerY) + scale * 1.2
        );
      }
    }
  }, [selectedRoomId]);

  // Draw main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !floorPlan) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasWidth * zoom;
    canvas.height = canvasHeight * zoom;
    ctx.scale(zoom, zoom);

    drawFloorPlan(ctx, floorPlan, PIXELS_PER_FOOT, offsetX, offsetY);
  }, [floorPlan, canvasWidth, canvasHeight, offsetX, offsetY, zoom, drawFloorPlan]);

  // Draw expanded canvas
  useEffect(() => {
    if (!isExpanded) return;

    const canvas = expandedCanvasRef.current;
    if (!canvas || !floorPlan) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = expandedDimensions.width;
    canvas.height = expandedDimensions.height;

    drawFloorPlan(ctx, floorPlan, EXPANDED_SCALE, expandedDimensions.offsetX, expandedDimensions.offsetY);
  }, [floorPlan, isExpanded, expandedDimensions, drawFloorPlan]);

  // Handle click to select room
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !onRoomSelect) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;

    const ftX = (clickX - offsetX) / PIXELS_PER_FOOT;
    const ftY = (clickY - offsetY) / PIXELS_PER_FOOT;

    // Find clicked room
    for (const room of floorPlan.rooms) {
      const roomOriginX = room.origin_x_ft ?? 0;
      const roomOriginY = room.origin_y_ft ?? 0;
      const bounds = getPolygonBounds(room.polygon);

      const roomMinX = roomOriginX + bounds.minX;
      const roomMaxX = roomOriginX + bounds.maxX;
      const roomMinY = roomOriginY + bounds.minY;
      const roomMaxY = roomOriginY + bounds.maxY;

      if (ftX >= roomMinX && ftX <= roomMaxX && ftY >= roomMinY && ftY <= roomMaxY) {
        onRoomSelect(room.id);
        return;
      }
    }
  }, [floorPlan, onRoomSelect, offsetX, offsetY, zoom]);

  if (!floorPlan) {
    return (
      <div className={cn('flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200 p-8', className)}>
        <div className="text-center text-slate-500">
          <Grid3x3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No floor plan</p>
          <p className="text-xs">Start by creating a floor plan</p>
        </div>
      </div>
    );
  }

  if (floorPlan.rooms.length === 0) {
    return (
      <div className={cn('flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200 p-8', className)}>
        <div className="text-center text-slate-500">
          <Grid3x3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{floorPlan.name}</p>
          <p className="text-xs">Add rooms to see the floor plan</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn('relative bg-white rounded-lg border border-slate-200 overflow-hidden', className)}
        data-testid="floor-plan-preview"
      >
        {/* Header */}
        <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm">
          <p className="text-sm font-medium text-slate-700">{floorPlan.name}</p>
          <p className="text-xs text-slate-500">
            {floorPlan.rooms.length} room{floorPlan.rooms.length !== 1 ? 's' : ''} • Level {floorPlan.level}
          </p>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90 backdrop-blur-sm"
            onClick={handleZoomOut}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90 backdrop-blur-sm"
            onClick={handleResetZoom}
            data-testid="button-reset-zoom"
          >
            <span className="text-xs font-medium">{Math.round(zoom * 100)}%</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90 backdrop-blur-sm"
            onClick={handleZoomIn}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white/90 backdrop-blur-sm"
            onClick={() => setIsExpanded(true)}
            data-testid="button-expand"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Canvas container */}
        <div
          className="overflow-auto max-h-[400px]"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="cursor-pointer"
            data-testid="canvas-floor-plan"
          />
        </div>

        {/* Room count badge */}
        <div className="absolute bottom-2 left-2 z-10">
          <div className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
            {formatDimension(floorPlan.width_ft)} × {formatDimension(floorPlan.length_ft)}
          </div>
        </div>
      </div>

      {/* Expanded dialog */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center justify-between">
              <span>{floorPlan.name} - Level {floorPlan.level}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(false)}
                data-testid="button-close-expanded"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 overflow-auto max-h-[calc(95vh-80px)]">
            <canvas ref={expandedCanvasRef} data-testid="canvas-floor-plan-expanded" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
