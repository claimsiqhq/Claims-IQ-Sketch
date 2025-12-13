import { useRef, useState, useEffect, useCallback } from "react";
import { Room, DamageZone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Move, Maximize2, X, Plus, AlertTriangle } from "lucide-react";

interface SketchCanvasProps {
  rooms: Room[];
  damageZones?: DamageZone[];
  onUpdateRoom: (roomId: string, data: Partial<Room>) => void;
  onSelectRoom: (roomId: string | null) => void;
  selectedRoomId: string | null;
  readOnly?: boolean;
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

  // Constants for conversion (1 grid unit = 1 foot = 20px)
  const PIXELS_PER_FOOT = 20;
  const SNAP_GRID = 10; // Snap to half foot

  // Helper to get coordinates from mouse or touch event
  const getEventCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e) {
      return { clientX: e.touches[0]?.clientX ?? 0, clientY: e.touches[0]?.clientY ?? 0 };
    }
    return { clientX: e.clientX, clientY: e.clientY };
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
      initialX: room.x * PIXELS_PER_FOOT,
      initialY: room.y * PIXELS_PER_FOOT,
      initialW: room.width * PIXELS_PER_FOOT,
      initialH: room.height * PIXELS_PER_FOOT,
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

    if (dragState.type === "move") {
      let newX = dragState.initialX + dx;
      let newY = dragState.initialY + dy;

      // Snap to grid
      newX = Math.round(newX / SNAP_GRID) * SNAP_GRID;
      newY = Math.round(newY / SNAP_GRID) * SNAP_GRID;

      // Convert back to feet
      onUpdateRoom(dragState.roomId, {
        x: newX / PIXELS_PER_FOOT,
        y: newY / PIXELS_PER_FOOT
      });
    } else if (dragState.type === "resize") {
      let newW = dragState.initialW + dx;
      let newH = dragState.initialH + dy;

      // Minimum size constraints (2ft x 2ft)
      newW = Math.max(newW, 2 * PIXELS_PER_FOOT);
      newH = Math.max(newH, 2 * PIXELS_PER_FOOT);

      // Snap
      newW = Math.round(newW / SNAP_GRID) * SNAP_GRID;
      newH = Math.round(newH / SNAP_GRID) * SNAP_GRID;

      onUpdateRoom(dragState.roomId, {
        width: newW / PIXELS_PER_FOOT,
        height: newH / PIXELS_PER_FOOT
      });
    }
  }, [dragState, onUpdateRoom]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = getEventCoordinates(e);
    handleDragMove(clientX, clientY);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragState) return;
    e.preventDefault(); // Prevent scrolling while dragging
    const { clientX, clientY } = getEventCoordinates(e);
    handleDragMove(clientX, clientY);
  }, [dragState, handleDragMove]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
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
  }, [dragState, handleDragEnd, handleTouchMove]);

  return (
    <div 
      className="relative w-full h-full bg-slate-50 overflow-hidden select-none group"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={() => onSelectRoom(null)}
      style={{
        backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      {/* Origin Marker */}
      <div className="absolute top-4 left-4 pointer-events-none z-10">
        <span className="text-xs text-slate-400 font-mono">1 grid square = 1 sq ft</span>
      </div>

      <div className="absolute inset-0 p-10 transform translate-x-10 translate-y-10">
        {rooms.map((room) => {
          const isSelected = selectedRoomId === room.id;
          const roomDamageZones = damageZones.filter(dz => dz.roomId === room.id);
          const hasDamage = roomDamageZones.length > 0;
          
          return (
            <div
              key={room.id}
              className={cn(
                "absolute border-2 transition-all flex items-center justify-center cursor-move shadow-sm touch-none",
                isSelected
                  ? "border-primary bg-primary/5 z-20"
                  : "border-slate-400 bg-white hover:border-primary/50 z-10",
                hasDamage && !isSelected && "border-red-400 bg-red-50/50"
              )}
              style={{
                left: `${room.x * PIXELS_PER_FOOT}px`,
                top: `${room.y * PIXELS_PER_FOOT}px`,
                width: `${room.width * PIXELS_PER_FOOT}px`,
                height: `${room.height * PIXELS_PER_FOOT}px`,
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
                  className="absolute bottom-[-8px] right-[-8px] w-6 h-6 md:w-4 md:h-4 bg-white border-2 border-primary rounded-full cursor-nwse-resize shadow-md z-30 flex items-center justify-center touch-none"
                  onMouseDown={(e) => handleMouseDown(e, room.id, "resize")}
                  onTouchStart={(e) => handleTouchStart(e, room.id, "resize")}
                >
                  <div className="w-2 h-2 md:w-1.5 md:h-1.5 bg-primary rounded-full" />
                </div>
              )}
              
              {/* Type Badge */}
              <div className={cn(
                "absolute -top-2 left-2 text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider z-30",
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
