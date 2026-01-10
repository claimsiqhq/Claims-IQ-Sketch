// SketchCanvasWalls - Enhanced sketch canvas with wall-first editing model
// Provides wall selection, hit-testing, visual distinction, and move capabilities

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Room, DamageZone, RoomOpening } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Move,
  Maximize2,
  X,
  Plus,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize,
  MousePointer,
  Hand,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import WallPropertiesPanel from "@/components/wall-properties-panel";
import type { WallEntity, WallType, RoomGeometry, Point } from "@/features/voice-sketch/types/geometry";
import { useWallStore, SketchToolMode } from "@/features/voice-sketch/services/wall-store";
import {
  extractAllWalls,
  pointNearWall,
  formatDimension,
} from "@/features/voice-sketch/utils/polygon-math";

interface SketchCanvasWallsProps {
  rooms: Room[];
  damageZones?: DamageZone[];
  onUpdateRoom: (roomId: string, data: Partial<Room>) => void;
  onSelectRoom: (roomId: string | null) => void;
  selectedRoomId: string | null;
  readOnly?: boolean;
}

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Convert Room to RoomGeometry for wall extraction
function roomToGeometry(room: Room): RoomGeometry {
  return {
    id: room.id,
    name: room.name,
    shape: 'rectangle',
    width_ft: room.width,
    length_ft: room.height, // Room uses height for length
    ceiling_height_ft: room.ceilingHeight || 8,
    polygon: [
      { x: 0, y: 0 },
      { x: room.width, y: 0 },
      { x: room.width, y: room.height },
      { x: 0, y: room.height },
    ],
    openings: room.openings?.map(o => ({
      id: o.id,
      type: o.type as any,
      wall: o.wall,
      width_ft: o.width,
      height_ft: o.height,
      position: o.position as any,
    })) || [],
    features: [],
    damageZones: [],
    notes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    origin_x_ft: room.x,
    origin_y_ft: room.y,
    hierarchyLevel: 'room',
    subRooms: [],
    objects: [],
    photos: [],
  };
}

export default function SketchCanvasWalls({
  rooms,
  damageZones = [],
  onUpdateRoom,
  onSelectRoom,
  selectedRoomId,
  readOnly = false
}: SketchCanvasWallsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    roomId: string;
    type: "move" | "resize";
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // View state for zoom and pan
  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);

  // Wall store
  const {
    walls,
    selectedWallIds,
    hoveredWallId,
    toolMode,
    isDraggingWall,
    deriveWallsFromRooms,
    selectWall,
    deselectAll: deselectAllWalls,
    setHoveredWall,
    setToolMode,
    findWallAtPoint,
    getSelectedWalls,
    updateWallLength,
    updateWallHeight,
    updateWallType,
    startWallDrag,
    updateWallDrag,
    endWallDrag,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useWallStore();

  // Constants
  const BASE_PIXELS_PER_FOOT = 20;
  const PIXELS_PER_FOOT = BASE_PIXELS_PER_FOOT * viewState.scale;
  const SNAP_GRID = 10 * viewState.scale;
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 3;
  const WALL_HIT_TOLERANCE = 8; // pixels

  // Convert rooms to RoomGeometry and derive walls
  const roomGeometries = useMemo(() =>
    rooms.map(roomToGeometry),
    [rooms]
  );

  useEffect(() => {
    deriveWallsFromRooms(roomGeometries);
  }, [roomGeometries, deriveWallsFromRooms]);

  // Helper to get opening style
  const getOpeningStyle = (
    opening: RoomOpening,
    roomWidth: number,
    roomHeight: number
  ): React.CSSProperties => {
    const openingWidthPx = opening.width * BASE_PIXELS_PER_FOOT;
    const openingThickness = 6;

    const getPositionOffset = (wallLength: number, openingLength: number): number => {
      const padding = 10;
      switch (opening.position) {
        case "left":
          return padding;
        case "right":
          return wallLength - openingLength - padding;
        case "center":
        default:
          return (wallLength - openingLength) / 2;
      }
    };

    const roomWidthPx = roomWidth * BASE_PIXELS_PER_FOOT;
    const roomHeightPx = roomHeight * BASE_PIXELS_PER_FOOT;

    switch (opening.wall) {
      case "north":
        return {
          position: "absolute",
          top: -openingThickness / 2,
          left: getPositionOffset(roomWidthPx, openingWidthPx),
          width: openingWidthPx,
          height: openingThickness,
        };
      case "south":
        return {
          position: "absolute",
          bottom: -openingThickness / 2,
          left: getPositionOffset(roomWidthPx, openingWidthPx),
          width: openingWidthPx,
          height: openingThickness,
        };
      case "east":
        return {
          position: "absolute",
          right: -openingThickness / 2,
          top: getPositionOffset(roomHeightPx, openingWidthPx),
          width: openingThickness,
          height: openingWidthPx,
        };
      case "west":
        return {
          position: "absolute",
          left: -openingThickness / 2,
          top: getPositionOffset(roomHeightPx, openingWidthPx),
          width: openingThickness,
          height: openingWidthPx,
        };
      default:
        return {};
    }
  };

  // Get color for opening type
  const getOpeningColor = (type: RoomOpening["type"]): string => {
    switch (type) {
      case "window":
        return "#38bdf8";
      case "door":
      case "sliding_door":
      case "french_door":
        return "#d97706";
      case "archway":
        return "#a855f7";
      default:
        return "#64748b";
    }
  };

  // Get wall style based on type and state
  const getWallStyle = useCallback((wall: WallEntity): React.CSSProperties => {
    const isSelected = selectedWallIds.includes(wall.id);
    const isHovered = hoveredWallId === wall.id;

    // Calculate wall position and dimensions
    const startX = wall.startPoint.x * BASE_PIXELS_PER_FOOT;
    const startY = wall.startPoint.y * BASE_PIXELS_PER_FOOT;
    const endX = wall.endPoint.x * BASE_PIXELS_PER_FOOT;
    const endY = wall.endPoint.y * BASE_PIXELS_PER_FOOT;

    const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

    // Determine stroke width and color based on wall type and state
    let strokeWidth = wall.type === 'exterior' ? 4 : 2;
    let strokeColor = wall.type === 'exterior' ? '#1e293b' : '#64748b';

    if (wall.type === 'missing') {
      strokeColor = '#94a3b8';
    }

    if (isHovered && !isSelected) {
      strokeColor = '#3b82f6';
      strokeWidth += 1;
    }

    if (isSelected) {
      strokeColor = '#2563eb';
      strokeWidth += 2;
    }

    return {
      position: 'absolute',
      left: startX,
      top: startY,
      width: length,
      height: strokeWidth,
      backgroundColor: strokeColor,
      transformOrigin: '0 50%',
      transform: `rotate(${angle}deg)`,
      cursor: toolMode === 'move_wall' && isSelected ? 'move' : 'pointer',
      pointerEvents: 'auto',
      borderRadius: 1,
      boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.3)' : undefined,
      // Dashed border for missing walls
      ...(wall.type === 'missing' ? {
        backgroundImage: `repeating-linear-gradient(90deg, ${strokeColor}, ${strokeColor} 4px, transparent 4px, transparent 8px)`,
        backgroundColor: 'transparent',
      } : {}),
    };
  }, [selectedWallIds, hoveredWallId, toolMode]);

  // Calculate bounds for all rooms
  const roomBounds = useMemo(() => {
    if (rooms.length === 0) {
      return { minX: 0, minY: 0, maxX: 20, maxY: 20, width: 20, height: 20 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    rooms.forEach(room => {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    });

    const padding = 2;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    };
  }, [rooms]);

  // Fit all rooms in view
  const fitToView = useCallback(() => {
    if (!containerRef.current || rooms.length === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / (roomBounds.width * BASE_PIXELS_PER_FOOT);
    const scaleY = containerHeight / (roomBounds.height * BASE_PIXELS_PER_FOOT);
    const newScale = Math.min(scaleX, scaleY, MAX_SCALE) * 0.9;

    const contentWidth = roomBounds.width * BASE_PIXELS_PER_FOOT * newScale;
    const contentHeight = roomBounds.height * BASE_PIXELS_PER_FOOT * newScale;

    setViewState({
      scale: Math.max(newScale, MIN_SCALE),
      offsetX: (containerWidth - contentWidth) / 2 - roomBounds.minX * BASE_PIXELS_PER_FOOT * newScale,
      offsetY: (containerHeight - contentHeight) / 2 - roomBounds.minY * BASE_PIXELS_PER_FOOT * newScale
    });
  }, [rooms.length, roomBounds]);

  // Auto-fit on initial load
  useEffect(() => {
    if (rooms.length > 0 && viewState.scale === 1 && viewState.offsetX === 0 && viewState.offsetY === 0) {
      fitToView();
    }
  }, [rooms.length, fitToView, viewState.scale, viewState.offsetX, viewState.offsetY]);

  // Zoom controls
  const handleZoomIn = () => {
    setViewState(prev => ({
      ...prev,
      scale: Math.min(prev.scale * 1.25, MAX_SCALE)
    }));
  };

  const handleZoomOut = () => {
    setViewState(prev => ({
      ...prev,
      scale: Math.max(prev.scale / 1.25, MIN_SCALE)
    }));
  };

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewState.offsetX) / (BASE_PIXELS_PER_FOOT * viewState.scale),
      y: (clientY - rect.top - viewState.offsetY) / (BASE_PIXELS_PER_FOOT * viewState.scale),
    };
  }, [viewState]);

  // Handle wall click
  const handleWallClick = useCallback((e: React.MouseEvent, wall: WallEntity) => {
    e.stopPropagation();
    if (readOnly) return;

    selectWall(wall.id, e.shiftKey);
    onSelectRoom(null); // Deselect room when selecting wall
  }, [readOnly, selectWall, onSelectRoom]);

  // Handle wall mouse enter
  const handleWallMouseEnter = useCallback((wall: WallEntity) => {
    if (readOnly) return;
    setHoveredWall(wall.id);
  }, [readOnly, setHoveredWall]);

  // Handle wall mouse leave
  const handleWallMouseLeave = useCallback(() => {
    setHoveredWall(null);
  }, [setHoveredWall]);

  // Handle wall mouse down for dragging
  const handleWallMouseDown = useCallback((e: React.MouseEvent, wall: WallEntity) => {
    if (readOnly || toolMode !== 'move_wall') return;
    if (!selectedWallIds.includes(wall.id)) return;

    e.stopPropagation();
    e.preventDefault();

    const canvasPoint = screenToCanvas(e.clientX, e.clientY);
    startWallDrag(wall.id, canvasPoint);
  }, [readOnly, toolMode, selectedWallIds, screenToCanvas, startWallDrag]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target.classList.contains('canvas-content')) {
      deselectAllWalls();
      onSelectRoom(null);
    }
  }, [deselectAllWalls, onSelectRoom]);

  // Handle canvas mouse move
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingWall) {
      const canvasPoint = screenToCanvas(e.clientX, e.clientY);
      const updatedRooms = updateWallDrag(canvasPoint, roomGeometries);
      if (updatedRooms) {
        // Apply room updates
        updatedRooms.forEach(updatedRoom => {
          const originalRoom = rooms.find(r => r.id === updatedRoom.id);
          if (originalRoom) {
            onUpdateRoom(updatedRoom.id, {
              width: updatedRoom.width_ft,
              height: updatedRoom.length_ft,
            });
          }
        });
      }
      return;
    }

    // Handle panning
    if (isPanning) {
      setViewState(prev => ({
        ...prev,
        offsetX: e.clientX - panStart.x,
        offsetY: e.clientY - panStart.y
      }));
      return;
    }

    // Update hovered wall
    if (toolMode === 'select' || toolMode === 'move_wall') {
      const canvasPoint = screenToCanvas(e.clientX, e.clientY);
      const wall = findWallAtPoint(canvasPoint, viewState.scale, WALL_HIT_TOLERANCE);
      setHoveredWall(wall?.id || null);
    }
  }, [
    isDraggingWall, isPanning, panStart, toolMode,
    screenToCanvas, updateWallDrag, findWallAtPoint,
    setHoveredWall, rooms, roomGeometries, onUpdateRoom, viewState.scale
  ]);

  // Handle canvas mouse up
  const handleCanvasMouseUp = useCallback(() => {
    if (isDraggingWall) {
      endWallDrag();
    }
    setIsPanning(false);
  }, [isDraggingWall, endWallDrag]);

  // Handle canvas mouse down
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-content')) {
      if (toolMode === 'pan' || e.button === 1) { // Middle mouse button
        setIsPanning(true);
        setPanStart({ x: e.clientX - viewState.offsetX, y: e.clientY - viewState.offsetY });
      }
    }
  }, [toolMode, viewState.offsetX, viewState.offsetY]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;

    setViewState(prev => {
      const newScale = Math.min(Math.max(prev.scale * scaleFactor, MIN_SCALE), MAX_SCALE);
      const scaleChange = newScale / prev.scale;

      return {
        scale: newScale,
        offsetX: mouseX - (mouseX - prev.offsetX) * scaleChange,
        offsetY: mouseY - (mouseY - prev.offsetY) * scaleChange
      };
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Handle undo/redo
  const handleUndo = useCallback(() => {
    const updatedRooms = undo(roomGeometries);
    if (updatedRooms) {
      updatedRooms.forEach(updatedRoom => {
        onUpdateRoom(updatedRoom.id, {
          width: updatedRoom.width_ft,
          height: updatedRoom.length_ft,
        });
      });
    }
  }, [undo, roomGeometries, onUpdateRoom]);

  const handleRedo = useCallback(() => {
    const updatedRooms = redo(roomGeometries);
    if (updatedRooms) {
      updatedRooms.forEach(updatedRoom => {
        onUpdateRoom(updatedRoom.id, {
          width: updatedRoom.width_ft,
          height: updatedRoom.length_ft,
        });
      });
    }
  }, [redo, roomGeometries, onUpdateRoom]);

  // Wall property handlers
  const handleUpdateWallLength = useCallback((wallId: string, newLength: number) => {
    const updatedRooms = updateWallLength(wallId, newLength, roomGeometries);
    updatedRooms.forEach(updatedRoom => {
      onUpdateRoom(updatedRoom.id, {
        width: updatedRoom.width_ft,
        height: updatedRoom.length_ft,
      });
    });
  }, [updateWallLength, roomGeometries, onUpdateRoom]);

  const handleUpdateWallHeight = useCallback((wallId: string, newHeight: number) => {
    updateWallHeight(wallId, newHeight);
  }, [updateWallHeight]);

  const handleUpdateWallType = useCallback((wallId: string, newType: WallType) => {
    updateWallType(wallId, newType);
  }, [updateWallType]);

  // Room drag handlers (existing functionality)
  const startDrag = (clientX: number, clientY: number, roomId: string, type: "move" | "resize") => {
    if (readOnly) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    deselectAllWalls();
    onSelectRoom(roomId);

    setDragState({
      roomId,
      type,
      startX: clientX,
      startY: clientY,
      initialX: room.x * BASE_PIXELS_PER_FOOT * viewState.scale,
      initialY: room.y * BASE_PIXELS_PER_FOOT * viewState.scale,
      initialW: room.width * BASE_PIXELS_PER_FOOT * viewState.scale,
      initialH: room.height * BASE_PIXELS_PER_FOOT * viewState.scale,
    });
  };

  const handleRoomMouseDown = (e: React.MouseEvent, roomId: string, type: "move" | "resize") => {
    e.stopPropagation();
    startDrag(e.clientX, e.clientY, roomId, type);
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const currentScale = viewState.scale;
      const scaledPixelsPerFoot = BASE_PIXELS_PER_FOOT * currentScale;
      const scaledSnapGrid = 10 * currentScale;

      if (dragState.type === "move") {
        let newX = dragState.initialX + dx;
        let newY = dragState.initialY + dy;

        newX = Math.round(newX / scaledSnapGrid) * scaledSnapGrid;
        newY = Math.round(newY / scaledSnapGrid) * scaledSnapGrid;

        onUpdateRoom(dragState.roomId, {
          x: newX / scaledPixelsPerFoot,
          y: newY / scaledPixelsPerFoot
        });
      } else if (dragState.type === "resize") {
        let newW = dragState.initialW + dx;
        let newH = dragState.initialH + dy;

        newW = Math.max(newW, 2 * scaledPixelsPerFoot);
        newH = Math.max(newH, 2 * scaledPixelsPerFoot);

        newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
        newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

        onUpdateRoom(dragState.roomId, {
          width: newW / scaledPixelsPerFoot,
          height: newH / scaledPixelsPerFoot
        });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, viewState.scale, onUpdateRoom]);

  const selectedWalls = getSelectedWalls();

  return (
    <TooltipProvider>
      <div
        className="relative w-full h-full bg-slate-50 overflow-hidden select-none group touch-none"
        ref={containerRef}
        onMouseMove={handleCanvasMouseMove}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onClick={handleCanvasClick}
        style={{
          backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
          backgroundSize: `${BASE_PIXELS_PER_FOOT * viewState.scale}px ${BASE_PIXELS_PER_FOOT * viewState.scale}px`,
          backgroundPosition: `${viewState.offsetX}px ${viewState.offsetY}px`,
          cursor: isPanning ? 'grabbing' : (toolMode === 'pan' ? 'grab' : 'default')
        }}
      >
        {/* Toolbar */}
        <div className="absolute top-3 left-3 flex items-center gap-1 z-20 bg-white/95 backdrop-blur rounded-lg shadow-md p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={toolMode === 'select' ? 'default' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setToolMode('select')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select (V)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={toolMode === 'move_wall' ? 'default' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setToolMode('move_wall')}
              >
                <Move className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move Wall (M)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={toolMode === 'pan' ? 'default' : 'ghost'}
                className="h-8 w-8 p-0"
                onClick={() => setToolMode('pan')}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pan (Space)</TooltipContent>
          </Tooltip>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleUndo}
                disabled={!canUndo()}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleRedo}
                disabled={!canRedo()}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20 bg-white/95 backdrop-blur rounded-full shadow-md px-3 py-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-slate-600 font-mono min-w-[2.5rem] text-center">
            {Math.round(viewState.scale * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <div className="h-4 w-px bg-slate-200" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); fitToView(); }}
            title="Fit to view"
          >
            <Maximize className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Wall Properties Panel */}
        {selectedWalls.length > 0 && (
          <WallPropertiesPanel
            selectedWalls={selectedWalls}
            rooms={roomGeometries}
            onUpdateLength={handleUpdateWallLength}
            onUpdateHeight={handleUpdateWallHeight}
            onUpdateType={handleUpdateWallType}
            onClose={deselectAllWalls}
            className="absolute top-3 right-3 z-20"
          />
        )}

        {/* Empty State */}
        {rooms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center p-6 bg-white/80 backdrop-blur rounded-lg border shadow-sm max-w-xs">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">No Rooms Yet</h3>
              <p className="text-sm text-slate-500">
                Add your first room to start sketching.
              </p>
            </div>
          </div>
        )}

        {/* Canvas Content with Transform */}
        <div
          className="canvas-content absolute inset-0"
          style={{
            transform: `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Walls Layer (rendered below rooms for proper z-ordering) */}
          <div className="absolute inset-0 pointer-events-none">
            {walls.map((wall) => (
              <div
                key={wall.id}
                style={getWallStyle(wall)}
                onClick={(e) => handleWallClick(e, wall)}
                onMouseEnter={() => handleWallMouseEnter(wall)}
                onMouseLeave={handleWallMouseLeave}
                onMouseDown={(e) => handleWallMouseDown(e, wall)}
              >
                {/* Wall endpoints for selected walls */}
                {selectedWallIds.includes(wall.id) && (
                  <>
                    <div
                      className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full"
                      style={{
                        left: -6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                    <div
                      className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full"
                      style={{
                        right: -6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Rooms Layer */}
          {rooms.map((room) => {
            const isSelected = selectedRoomId === room.id;
            const roomDamageZones = damageZones.filter(dz => dz.roomId === room.id);
            const hasDamage = roomDamageZones.length > 0;

            return (
              <div
                key={room.id}
                className={cn(
                  "absolute transition-colors flex items-center justify-center cursor-move touch-none",
                  "bg-white/60",
                  isSelected && "z-20",
                  hasDamage && "bg-red-50/30"
                )}
                style={{
                  left: `${room.x * BASE_PIXELS_PER_FOOT}px`,
                  top: `${room.y * BASE_PIXELS_PER_FOOT}px`,
                  width: `${room.width * BASE_PIXELS_PER_FOOT}px`,
                  height: `${room.height * BASE_PIXELS_PER_FOOT}px`,
                }}
                onMouseDown={(e) => handleRoomMouseDown(e, room.id, "move")}
                onClick={(e) => { e.stopPropagation(); deselectAllWalls(); onSelectRoom(room.id); }}
              >
                {/* Damage Overlay */}
                {hasDamage && (
                  <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex items-center justify-center">
                    <AlertTriangle className="text-red-500/20 h-12 w-12" />
                  </div>
                )}

                {/* Openings */}
                {room.openings?.map((opening) => (
                  <div
                    key={opening.id}
                    className="pointer-events-none z-20"
                    style={{
                      ...getOpeningStyle(opening, room.width, room.height),
                      backgroundColor: getOpeningColor(opening.type),
                      borderRadius: "2px",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    }}
                    title={`${opening.type} (${opening.width}' x ${opening.height}')`}
                  />
                ))}

                {/* Room Label */}
                <div className="text-center pointer-events-none select-none px-2 z-10 relative">
                  <div className="text-xs font-semibold text-slate-900 truncate max-w-full flex items-center justify-center gap-1">
                    {room.name}
                    {hasDamage && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {room.width}' x {room.height}'
                  </div>
                  <div className="text-[10px] text-primary/70 font-mono mt-0.5">
                    {Math.round(room.width * room.height)} SF
                  </div>
                </div>

                {/* Resize Handle */}
                {!readOnly && isSelected && (
                  <div
                    className="absolute bottom-[-8px] right-[-8px] w-8 h-8 md:w-5 md:h-5 bg-white border-2 border-primary rounded-full cursor-nwse-resize shadow-md z-30 flex items-center justify-center touch-none"
                    onMouseDown={(e) => handleRoomMouseDown(e, room.id, "resize")}
                  >
                    <div className="w-3 h-3 md:w-2 md:h-2 bg-primary rounded-full" />
                  </div>
                )}

                {/* Type Badge */}
                <div className={cn(
                  "absolute -top-2 left-2 text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider z-30 whitespace-nowrap",
                  hasDamage ? "bg-red-50 border-red-200 text-red-600 font-medium" : "bg-slate-100 border-slate-200 text-slate-500"
                )}>
                  {room.type}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
