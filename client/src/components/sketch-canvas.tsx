import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Room, DamageZone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Move, Maximize2, X, Plus, AlertTriangle, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SketchCanvasProps {
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

export default function SketchCanvas({
  rooms,
  damageZones = [],
  onUpdateRoom,
  onSelectRoom,
  selectedRoomId,
  readOnly = false
}: SketchCanvasProps) {
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

  // Constants for conversion (1 grid unit = 1 foot = 20px at scale 1)
  const BASE_PIXELS_PER_FOOT = 20;
  const PIXELS_PER_FOOT = BASE_PIXELS_PER_FOOT * viewState.scale;
  const SNAP_GRID = 10 * viewState.scale; // Snap to half foot
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 3;

  // Calculate bounds for all rooms to enable fit-to-view
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

    // Add padding
    const padding = 2; // 2 feet padding
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
    const newScale = Math.min(scaleX, scaleY, MAX_SCALE) * 0.9; // 90% to add some margin

    // Center the content
    const contentWidth = roomBounds.width * BASE_PIXELS_PER_FOOT * newScale;
    const contentHeight = roomBounds.height * BASE_PIXELS_PER_FOOT * newScale;

    setViewState({
      scale: Math.max(newScale, MIN_SCALE),
      offsetX: (containerWidth - contentWidth) / 2 - roomBounds.minX * BASE_PIXELS_PER_FOOT * newScale,
      offsetY: (containerHeight - contentHeight) / 2 - roomBounds.minY * BASE_PIXELS_PER_FOOT * newScale
    });
  }, [rooms.length, roomBounds]);

  // Auto-fit on initial load or when rooms change significantly
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

  // Helper to get coordinates from mouse or touch event
  const getEventCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e) {
      return { clientX: e.touches[0]?.clientX ?? 0, clientY: e.touches[0]?.clientY ?? 0 };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  // Get distance between two touch points for pinch-to-zoom
  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Get center point between two touches
  const getTouchCenter = (touches: TouchList): { x: number; y: number } => {
    if (touches.length < 2) {
      return { x: touches[0]?.clientX ?? 0, y: touches[0]?.clientY ?? 0 };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  // Handle pinch-to-zoom
  const handlePinchZoom = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) return;

    const currentDistance = getTouchDistance(e.touches);

    if (lastPinchDistance !== null) {
      const scaleFactor = currentDistance / lastPinchDistance;
      const center = getTouchCenter(e.touches);

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      // Calculate the point in the canvas that's at the center of the pinch
      const centerX = center.x - rect.left;
      const centerY = center.y - rect.top;

      setViewState(prev => {
        const newScale = Math.min(Math.max(prev.scale * scaleFactor, MIN_SCALE), MAX_SCALE);
        const scaleChange = newScale / prev.scale;

        // Adjust offset to zoom towards the pinch center
        return {
          scale: newScale,
          offsetX: centerX - (centerX - prev.offsetX) * scaleChange,
          offsetY: centerY - (centerY - prev.offsetY) * scaleChange
        };
      });
    }

    setLastPinchDistance(currentDistance);
  }, [lastPinchDistance]);

  // Handle pan start
  const handlePanStart = (clientX: number, clientY: number) => {
    setIsPanning(true);
    setPanStart({ x: clientX - viewState.offsetX, y: clientY - viewState.offsetY });
  };

  // Handle pan move
  const handlePanMove = useCallback((clientX: number, clientY: number) => {
    if (!isPanning) return;
    setViewState(prev => ({
      ...prev,
      offsetX: clientX - panStart.x,
      offsetY: clientY - panStart.y
    }));
  }, [isPanning, panStart]);

  // Handle pan end
  const handlePanEnd = () => {
    setIsPanning(false);
    setLastPinchDistance(null);
  };

  const startDrag = (clientX: number, clientY: number, roomId: string, type: "move" | "resize") => {
    if (readOnly) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

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

  const handleMouseDown = (e: React.MouseEvent, roomId: string, type: "move" | "resize") => {
    e.stopPropagation();
    const { clientX, clientY } = getEventCoordinates(e);
    startDrag(clientX, clientY, roomId, type);
  };

  const handleTouchStart = (e: React.TouchEvent, roomId: string, type: "move" | "resize") => {
    e.stopPropagation();
    // Prevent scrolling while dragging
    if (!readOnly) {
      e.preventDefault();
    }
    const { clientX, clientY } = getEventCoordinates(e);
    startDrag(clientX, clientY, roomId, type);
  };

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragState) return;

    const dx = clientX - dragState.startX;
    const dy = clientY - dragState.startY;
    const currentScale = viewState.scale;
    const scaledPixelsPerFoot = BASE_PIXELS_PER_FOOT * currentScale;
    const scaledSnapGrid = 10 * currentScale;

    if (dragState.type === "move") {
      let newX = dragState.initialX + dx;
      let newY = dragState.initialY + dy;

      // Snap to grid
      newX = Math.round(newX / scaledSnapGrid) * scaledSnapGrid;
      newY = Math.round(newY / scaledSnapGrid) * scaledSnapGrid;

      // Convert back to feet
      onUpdateRoom(dragState.roomId, {
        x: newX / scaledPixelsPerFoot,
        y: newY / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize") {
      let newW = dragState.initialW + dx;
      let newH = dragState.initialH + dy;

      // Minimum size constraints (2ft x 2ft)
      newW = Math.max(newW, 2 * scaledPixelsPerFoot);
      newH = Math.max(newH, 2 * scaledPixelsPerFoot);

      // Snap
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        width: newW / scaledPixelsPerFoot,
        height: newH / scaledPixelsPerFoot
      });
    }
  }, [dragState, onUpdateRoom, viewState.scale]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = getEventCoordinates(e);
    handleDragMove(clientX, clientY);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    // Handle pinch-to-zoom with two fingers
    if (e.touches.length === 2) {
      e.preventDefault();
      handlePinchZoom(e);
      return;
    }

    // Handle single finger pan or room drag
    if (dragState) {
      e.preventDefault();
      const { clientX, clientY } = getEventCoordinates(e);
      handleDragMove(clientX, clientY);
    } else if (isPanning) {
      e.preventDefault();
      const { clientX, clientY } = getEventCoordinates(e);
      handlePanMove(clientX, clientY);
    }
  }, [dragState, isPanning, handleDragMove, handlePanMove, handlePinchZoom]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    handlePanEnd();
  }, []);

  // Handle wheel zoom for desktop
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

    // Add wheel listener for zoom
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    if (dragState || isPanning) {
      // Mouse events
      window.addEventListener('mouseup', handleDragEnd);
      // Touch events
      window.addEventListener('touchend', handleDragEnd);
      window.addEventListener('touchcancel', handleDragEnd);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    return () => {
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dragState, isPanning, handleDragEnd, handleTouchMove]);

  // Handle canvas background click for pan start
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only start pan if clicking on empty space (not a room)
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-content')) {
      handlePanStart(e.clientX, e.clientY);
    }
  };

  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    // Two-finger touch starts pinch zoom
    if (e.touches.length === 2) {
      setLastPinchDistance(getTouchDistance(e.touches));
      return;
    }

    // Single finger on empty space starts pan
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-content')) {
      const { clientX, clientY } = getEventCoordinates(e);
      handlePanStart(clientX, clientY);
    }
  };

  // Handle mouse move for both drag and pan
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = getEventCoordinates(e);
    if (dragState) {
      handleDragMove(clientX, clientY);
    } else if (isPanning) {
      handlePanMove(clientX, clientY);
    }
  };

  return (
    <div
      className="relative w-full h-full bg-slate-50 overflow-hidden select-none group touch-none"
      ref={containerRef}
      onMouseMove={handleCanvasMouseMove}
      onMouseDown={handleCanvasMouseDown}
      onMouseUp={handleDragEnd}
      onTouchStart={handleCanvasTouchStart}
      onClick={(e) => {
        // Only deselect if clicking on empty space
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-content')) {
          onSelectRoom(null);
        }
      }}
      style={{
        backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
        backgroundSize: `${BASE_PIXELS_PER_FOOT * viewState.scale}px ${BASE_PIXELS_PER_FOOT * viewState.scale}px`,
        backgroundPosition: `${viewState.offsetX}px ${viewState.offsetY}px`,
        cursor: isPanning ? 'grabbing' : 'grab'
      }}
    >
      {/* Zoom Controls - Horizontal Bar at Bottom */}
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
        <div className="h-4 w-px bg-slate-200" />
        <span className="text-[10px] text-slate-400 hidden md:block">Scroll/drag</span>
        <span className="text-[10px] text-slate-400 md:hidden">Pinch/drag</span>
      </div>

      {/* Canvas Content with Transform */}
      <div
        className="canvas-content absolute inset-0"
        style={{
          transform: `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`,
          transformOrigin: '0 0'
        }}
      >
        {rooms.map((room) => {
          const isSelected = selectedRoomId === room.id;
          const roomDamageZones = damageZones.filter(dz => dz.roomId === room.id);
          const hasDamage = roomDamageZones.length > 0;

          return (
            <div
              key={room.id}
              className={cn(
                "absolute border-2 transition-colors flex items-center justify-center cursor-move shadow-sm touch-none",
                isSelected
                  ? "border-primary bg-primary/5 z-20"
                  : "border-slate-400 bg-white hover:border-primary/50 z-10",
                hasDamage && !isSelected && "border-red-400 bg-red-50/50"
              )}
              style={{
                left: `${room.x * BASE_PIXELS_PER_FOOT}px`,
                top: `${room.y * BASE_PIXELS_PER_FOOT}px`,
                width: `${room.width * BASE_PIXELS_PER_FOOT}px`,
                height: `${room.height * BASE_PIXELS_PER_FOOT}px`,
              }}
              onMouseDown={(e) => handleMouseDown(e, room.id, "move")}
              onTouchStart={(e) => handleTouchStart(e, room.id, "move")}
              onClick={(e) => { e.stopPropagation(); onSelectRoom(room.id); }}
            >
              {/* Damage Overlay */}
              {hasDamage && (
                <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex items-center justify-center">
                  <AlertTriangle className="text-red-500/20 h-12 w-12" />
                </div>
              )}

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

              {/* Resize Handle - larger touch target on mobile */}
              {!readOnly && isSelected && (
                <div
                  className="absolute bottom-[-8px] right-[-8px] w-8 h-8 md:w-5 md:h-5 bg-white border-2 border-primary rounded-full cursor-nwse-resize shadow-md z-30 flex items-center justify-center touch-none"
                  onMouseDown={(e) => handleMouseDown(e, room.id, "resize")}
                  onTouchStart={(e) => handleTouchStart(e, room.id, "resize")}
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
  );
}
