import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Room, DamageZone, RoomOpening, WallDirection, PositionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Move, Maximize2, X, Plus, AlertTriangle, ZoomIn, ZoomOut, Maximize, DoorOpen, PanelTop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSketchManipulationStore } from "@/features/voice-sketch/services/sketch-manipulation-store";
import { generateId } from "@/features/voice-sketch/utils/polygon-math";

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

  // Get tool mode from sketch manipulation store
  const { toolMode, setToolMode } = useSketchManipulationStore();

  // Resize types: edges (n/s/e/w) and corners (ne/nw/se/sw)
  type ResizeHandle = "resize" | "resize_n" | "resize_s" | "resize_e" | "resize_w" | "resize_ne" | "resize_nw" | "resize_se" | "resize_sw";

  const [dragState, setDragState] = useState<{
    roomId: string;
    type: "move" | ResizeHandle;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // Track which handle is being dragged for visual feedback
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

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

  // Helper to calculate opening position on a wall
  const getOpeningStyle = (
    opening: RoomOpening,
    roomWidth: number,
    roomHeight: number
  ): React.CSSProperties => {
    const openingWidthPx = opening.width * BASE_PIXELS_PER_FOOT;
    const openingThickness = 6; // Thickness of the opening indicator

    // Calculate position offset based on position type
    const getPositionOffset = (wallLength: number, openingLength: number): number => {
      const padding = 10; // Small padding from edges
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
        return "#38bdf8"; // sky-400
      case "door":
      case "sliding_door":
      case "french_door":
        return "#d97706"; // amber-600
      case "archway":
        return "#a855f7"; // purple-500
      default:
        return "#64748b"; // slate-500
    }
  };

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
  const getTouchDistance = (touches: TouchList | React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Get center point between two touches
  const getTouchCenter = (touches: TouchList | React.TouchList): { x: number; y: number } => {
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

  // Convert screen coordinates to canvas coordinates (in feet)
  const screenToCanvasFeet = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewState.offsetX) / (BASE_PIXELS_PER_FOOT * viewState.scale),
      y: (clientY - rect.top - viewState.offsetY) / (BASE_PIXELS_PER_FOOT * viewState.scale),
    };
  }, [viewState]);

  // Calculate distance from point to line segment
  const distanceToLineSegment = (point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.sqrt(Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2));
    }

    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projectedPoint = {
      x: start.x + t * dx,
      y: start.y + t * dy
    };

    return Math.sqrt(Math.pow(point.x - projectedPoint.x, 2) + Math.pow(point.y - projectedPoint.y, 2));
  };

  // Get position along wall in feet
  const getPositionAlongWall = (point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return 0;

    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const wallLength = Math.sqrt(lengthSquared);
    return t * wallLength;
  };

  // Handle wall click to add door/window
  const handleWallClick = useCallback((clientX: number, clientY: number, openingType: 'door' | 'window') => {
    if (readOnly) return;

    const clickPoint = screenToCanvasFeet(clientX, clientY);
    const TOLERANCE_FT = 1.5; // 1.5 foot tolerance for clicking on wall

    // Find the nearest wall within tolerance
    let nearestRoom: Room | null = null;
    let nearestWall: WallDirection | null = null;
    let nearestDistance = Infinity;
    let positionAlongWall = 0;
    let wallLength = 0;

    for (const room of rooms) {
      // Define wall segments for each room
      const walls: { direction: WallDirection; start: { x: number; y: number }; end: { x: number; y: number } }[] = [
        { direction: 'north', start: { x: room.x, y: room.y }, end: { x: room.x + room.width, y: room.y } },
        { direction: 'south', start: { x: room.x, y: room.y + room.height }, end: { x: room.x + room.width, y: room.y + room.height } },
        { direction: 'west', start: { x: room.x, y: room.y }, end: { x: room.x, y: room.y + room.height } },
        { direction: 'east', start: { x: room.x + room.width, y: room.y }, end: { x: room.x + room.width, y: room.y + room.height } },
      ];

      for (const wall of walls) {
        const distance = distanceToLineSegment(clickPoint, wall.start, wall.end);

        if (distance < nearestDistance && distance <= TOLERANCE_FT) {
          nearestDistance = distance;
          nearestRoom = room;
          nearestWall = wall.direction;
          positionAlongWall = getPositionAlongWall(clickPoint, wall.start, wall.end);
          wallLength = wall.direction === 'north' || wall.direction === 'south'
            ? room.width
            : room.height;
        }
      }
    }

    if (nearestRoom && nearestWall) {
      // Create the opening
      const defaultWidth = openingType === 'door' ? 3 : 4; // 3ft door, 4ft window
      const defaultHeight = openingType === 'door' ? 7 : 4; // 7ft door, 4ft window

      // Calculate position as offset from start of wall
      // Clamp to ensure the opening fits on the wall
      const maxOffset = wallLength - defaultWidth;
      const openingOffset = Math.max(0, Math.min(positionAlongWall - defaultWidth / 2, maxOffset));

      const newOpening: RoomOpening = {
        id: generateId(),
        type: openingType,
        wall: nearestWall,
        width: defaultWidth,
        height: defaultHeight,
        position: openingOffset, // Position in feet from wall start
      };

      // Add opening to the room
      const existingOpenings = nearestRoom.openings || [];
      onUpdateRoom(nearestRoom.id, {
        openings: [...existingOpenings, newOpening]
      });

      // Select the room
      onSelectRoom(nearestRoom.id);

      // Switch back to select mode
      setToolMode('select');
    }
  }, [readOnly, rooms, screenToCanvasFeet, onUpdateRoom, onSelectRoom, setToolMode]);

  const startDrag = (clientX: number, clientY: number, roomId: string, type: "move" | ResizeHandle) => {
    if (readOnly) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    onSelectRoom(roomId);
    setActiveHandle(type.startsWith('resize') ? type : null);

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

  const handleMouseDown = (e: React.MouseEvent, roomId: string, type: "move" | ResizeHandle) => {
    e.stopPropagation();
    const { clientX, clientY } = getEventCoordinates(e);
    startDrag(clientX, clientY, roomId, type);
  };

  const handleTouchStart = (e: React.TouchEvent, roomId: string, type: "move" | ResizeHandle) => {
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
    const minSize = 2 * scaledPixelsPerFoot; // Minimum 2ft

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
    } else if (dragState.type === "resize" || dragState.type === "resize_se") {
      // Original resize (bottom-right corner) or SE corner
      let newW = dragState.initialW + dx;
      let newH = dragState.initialH + dy;

      newW = Math.max(newW, minSize);
      newH = Math.max(newH, minSize);
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        width: newW / scaledPixelsPerFoot,
        height: newH / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_n") {
      // North edge: change Y position and height
      let newY = dragState.initialY + dy;
      let newH = dragState.initialH - dy;

      newH = Math.max(newH, minSize);
      if (newH === minSize) {
        newY = dragState.initialY + dragState.initialH - minSize;
      }
      newY = Math.round(newY / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        y: newY / scaledPixelsPerFoot,
        height: newH / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_s") {
      // South edge: change height only
      let newH = dragState.initialH + dy;
      newH = Math.max(newH, minSize);
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        height: newH / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_e") {
      // East edge: change width only
      let newW = dragState.initialW + dx;
      newW = Math.max(newW, minSize);
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        width: newW / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_w") {
      // West edge: change X position and width
      let newX = dragState.initialX + dx;
      let newW = dragState.initialW - dx;

      newW = Math.max(newW, minSize);
      if (newW === minSize) {
        newX = dragState.initialX + dragState.initialW - minSize;
      }
      newX = Math.round(newX / scaledSnapGrid) * scaledSnapGrid;
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        x: newX / scaledPixelsPerFoot,
        width: newW / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_ne") {
      // NE corner: change Y position, height, and width
      let newY = dragState.initialY + dy;
      let newW = dragState.initialW + dx;
      let newH = dragState.initialH - dy;

      newW = Math.max(newW, minSize);
      newH = Math.max(newH, minSize);
      if (newH === minSize) {
        newY = dragState.initialY + dragState.initialH - minSize;
      }
      newY = Math.round(newY / scaledSnapGrid) * scaledSnapGrid;
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        y: newY / scaledPixelsPerFoot,
        width: newW / scaledPixelsPerFoot,
        height: newH / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_nw") {
      // NW corner: change X, Y positions, width, and height
      let newX = dragState.initialX + dx;
      let newY = dragState.initialY + dy;
      let newW = dragState.initialW - dx;
      let newH = dragState.initialH - dy;

      newW = Math.max(newW, minSize);
      newH = Math.max(newH, minSize);
      if (newW === minSize) {
        newX = dragState.initialX + dragState.initialW - minSize;
      }
      if (newH === minSize) {
        newY = dragState.initialY + dragState.initialH - minSize;
      }
      newX = Math.round(newX / scaledSnapGrid) * scaledSnapGrid;
      newY = Math.round(newY / scaledSnapGrid) * scaledSnapGrid;
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        x: newX / scaledPixelsPerFoot,
        y: newY / scaledPixelsPerFoot,
        width: newW / scaledPixelsPerFoot,
        height: newH / scaledPixelsPerFoot
      });
    } else if (dragState.type === "resize_sw") {
      // SW corner: change X position, width, and height
      let newX = dragState.initialX + dx;
      let newW = dragState.initialW - dx;
      let newH = dragState.initialH + dy;

      newW = Math.max(newW, minSize);
      newH = Math.max(newH, minSize);
      if (newW === minSize) {
        newX = dragState.initialX + dragState.initialW - minSize;
      }
      newX = Math.round(newX / scaledSnapGrid) * scaledSnapGrid;
      newW = Math.round(newW / scaledSnapGrid) * scaledSnapGrid;
      newH = Math.round(newH / scaledSnapGrid) * scaledSnapGrid;

      onUpdateRoom(dragState.roomId, {
        x: newX / scaledPixelsPerFoot,
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
    setActiveHandle(null);
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

  // Handle canvas background click for pan start or tool-specific actions
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Handle door/window tool modes - click on wall to add opening
    if (toolMode === 'draw_door') {
      handleWallClick(e.clientX, e.clientY, 'door');
      return;
    }
    if (toolMode === 'draw_window') {
      handleWallClick(e.clientX, e.clientY, 'window');
      return;
    }

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

    // Handle door/window tool modes - tap on wall to add opening
    if (toolMode === 'draw_door') {
      const { clientX, clientY } = getEventCoordinates(e);
      handleWallClick(clientX, clientY, 'door');
      return;
    }
    if (toolMode === 'draw_window') {
      const { clientX, clientY } = getEventCoordinates(e);
      handleWallClick(clientX, clientY, 'window');
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
        cursor: isPanning ? 'grabbing' :
          toolMode === 'draw_door' || toolMode === 'draw_window' ? 'crosshair' :
          toolMode === 'pan' ? 'grab' : 'default'
      }}
    >
      {/* Tool Mode Indicator */}
      {(toolMode === 'draw_door' || toolMode === 'draw_window') && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20 bg-blue-500 text-white rounded-full shadow-md px-3 py-1.5">
          {toolMode === 'draw_door' ? (
            <DoorOpen className="h-4 w-4" />
          ) : (
            <PanelTop className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">
            Click on a wall to add {toolMode === 'draw_door' ? 'door' : 'window'}
          </span>
        </div>
      )}

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

      {/* Empty State - show when no rooms */}
      {rooms.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center p-6 bg-white/80 backdrop-blur rounded-lg border shadow-sm max-w-xs">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">No Rooms Yet</h3>
            <p className="text-sm text-slate-500">
              Tap the <strong>+</strong> button above to add your first room, or use Voice Sketch.
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

              {/* Openings (Doors/Windows) */}
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

              {/* Resize Handles - Edge and Corner handles for precise resizing */}
              {!readOnly && isSelected && (
                <>
                  {/* Edge Handles */}
                  {/* North edge */}
                  <div
                    className={cn(
                      "absolute top-[-4px] left-1/2 -translate-x-1/2 w-12 h-2 rounded-full cursor-ns-resize z-30 touch-none",
                      activeHandle === "resize_n" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_n")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_n")}
                  />
                  {/* South edge */}
                  <div
                    className={cn(
                      "absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-12 h-2 rounded-full cursor-ns-resize z-30 touch-none",
                      activeHandle === "resize_s" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_s")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_s")}
                  />
                  {/* East edge */}
                  <div
                    className={cn(
                      "absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-12 rounded-full cursor-ew-resize z-30 touch-none",
                      activeHandle === "resize_e" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_e")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_e")}
                  />
                  {/* West edge */}
                  <div
                    className={cn(
                      "absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-12 rounded-full cursor-ew-resize z-30 touch-none",
                      activeHandle === "resize_w" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_w")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_w")}
                  />

                  {/* Corner Handles */}
                  {/* NW corner */}
                  <div
                    className={cn(
                      "absolute top-[-6px] left-[-6px] w-3 h-3 rounded-full cursor-nwse-resize shadow-md z-30 touch-none border-2 border-white",
                      activeHandle === "resize_nw" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_nw")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_nw")}
                  />
                  {/* NE corner */}
                  <div
                    className={cn(
                      "absolute top-[-6px] right-[-6px] w-3 h-3 rounded-full cursor-nesw-resize shadow-md z-30 touch-none border-2 border-white",
                      activeHandle === "resize_ne" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_ne")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_ne")}
                  />
                  {/* SW corner */}
                  <div
                    className={cn(
                      "absolute bottom-[-6px] left-[-6px] w-3 h-3 rounded-full cursor-nesw-resize shadow-md z-30 touch-none border-2 border-white",
                      activeHandle === "resize_sw" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_sw")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_sw")}
                  />
                  {/* SE corner */}
                  <div
                    className={cn(
                      "absolute bottom-[-6px] right-[-6px] w-3 h-3 rounded-full cursor-nwse-resize shadow-md z-30 touch-none border-2 border-white",
                      activeHandle === "resize_se" ? "bg-orange-500" : "bg-blue-500 hover:bg-blue-600"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, room.id, "resize_se")}
                    onTouchStart={(e) => handleTouchStart(e, room.id, "resize_se")}
                  />
                </>
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
