// Sketch Toolbar Component
// Professional toolbar for sketch manipulation with all UX parity features

import React, { useCallback } from 'react';
import {
  MousePointer2,
  Move,
  Hand,
  RotateCcw,
  RotateCw,
  Copy,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Grid3X3,
  Magnet,
  Undo2,
  Redo2,
  Maximize2,
  Square,
  SquareDashed,
  Home,
  DoorOpen,
  PanelTop,
  Pencil,
  Car,
  Trees,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RoomGeometry, WallDirection } from '../types/geometry';
import type { SketchToolMode, SelectedEntity, ZoneType } from '../services/sketch-manipulation-store';
import { useSketchManipulationStore } from '../services/sketch-manipulation-store';
import { SketchStatusBadge } from './SketchCompletenessIndicator';
import { cn } from '@/lib/utils';

interface SketchToolbarProps {
  rooms: RoomGeometry[];
  onRoomsChange: (rooms: RoomGeometry[]) => void;
  className?: string;
}

export function SketchToolbar({
  rooms,
  onRoomsChange,
  className,
}: SketchToolbarProps) {
  const {
    selectedEntities,
    toolMode,
    setToolMode,
    selectedZoneType,
    setSelectedZoneType,
    snappingConfig,
    setSnappingConfig,
    completenessIssues,
    isSketchComplete,
    moveRoom,
    copyRoom,
    rotateRoom,
    alignSelected,
    distributeSelected,
    detectExteriorWalls,
    toggleWallMissing,
    toggleWallExterior,
    updateCompletenessIssues,
    undo,
    redo,
    canUndo,
    canRedo,
    deselectAll,
  } = useSketchManipulationStore();

  const hasSelection = selectedEntities.length > 0;
  const hasRoomSelection = selectedEntities.some(e => e.type === 'room');
  const hasWallSelection = selectedEntities.some(e => e.type === 'wall');
  const hasMultiSelect = selectedEntities.length > 1;
  const selectedRoomCount = selectedEntities.filter(e => e.type === 'room').length;

  // Tool mode handlers
  const handleToolModeChange = useCallback((mode: SketchToolMode) => {
    setToolMode(mode);
  }, [setToolMode]);

  // Room manipulation handlers
  const handleRotateRoom = useCallback((degrees: 90 | 180 | 270) => {
    const roomEntity = selectedEntities.find(e => e.type === 'room');
    if (!roomEntity) return;

    const updatedRooms = rotateRoom(roomEntity.roomId, degrees, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedEntities, rooms, rotateRoom, onRoomsChange]);

  const handleCopyRoom = useCallback(() => {
    const roomEntity = selectedEntities.find(e => e.type === 'room');
    if (!roomEntity) return;

    const { updatedRooms } = copyRoom(roomEntity.roomId, 5, 5, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedEntities, rooms, copyRoom, onRoomsChange]);

  const handleDeleteSelected = useCallback(() => {
    if (!hasSelection) return;

    const roomIds = selectedEntities
      .filter(e => e.type === 'room')
      .map(e => e.roomId);

    const updatedRooms = rooms.filter(r => !roomIds.includes(r.id));
    onRoomsChange(updatedRooms);
    deselectAll();
  }, [selectedEntities, hasSelection, rooms, onRoomsChange, deselectAll]);

  // Alignment handlers
  const handleAlign = useCallback((alignment: 'left' | 'right' | 'top' | 'bottom' | 'center_h' | 'center_v') => {
    if (selectedRoomCount < 2) return;
    const updatedRooms = alignSelected(alignment, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedRoomCount, alignSelected, rooms, onRoomsChange]);

  const handleDistribute = useCallback((axis: 'horizontal' | 'vertical') => {
    if (selectedRoomCount < 3) return;
    const updatedRooms = distributeSelected(axis, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedRoomCount, distributeSelected, rooms, onRoomsChange]);

  // Wall manipulation handlers
  const handleToggleMissing = useCallback(() => {
    const wallEntity = selectedEntities.find(e => e.type === 'wall');
    if (!wallEntity || !wallEntity.wallDirection) return;

    const updatedRooms = toggleWallMissing(wallEntity.roomId, wallEntity.wallDirection, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedEntities, rooms, toggleWallMissing, onRoomsChange]);

  const handleToggleExterior = useCallback(() => {
    const wallEntity = selectedEntities.find(e => e.type === 'wall');
    if (!wallEntity || !wallEntity.wallDirection) return;

    const updatedRooms = toggleWallExterior(wallEntity.roomId, wallEntity.wallDirection, rooms);
    onRoomsChange(updatedRooms);
  }, [selectedEntities, rooms, toggleWallExterior, onRoomsChange]);

  // Snapping handlers
  const toggleGridSnap = useCallback(() => {
    setSnappingConfig({ gridEnabled: !snappingConfig.gridEnabled });
  }, [snappingConfig.gridEnabled, setSnappingConfig]);

  const toggleParallelSnap = useCallback(() => {
    setSnappingConfig({ parallelSnapEnabled: !snappingConfig.parallelSnapEnabled });
  }, [snappingConfig.parallelSnapEnabled, setSnappingConfig]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    const updatedRooms = undo(rooms);
    if (updatedRooms) {
      onRoomsChange(updatedRooms);
    }
  }, [rooms, undo, onRoomsChange]);

  const handleRedo = useCallback(() => {
    const updatedRooms = redo(rooms);
    if (updatedRooms) {
      onRoomsChange(updatedRooms);
    }
  }, [rooms, redo, onRoomsChange]);

  // Auto-detect exterior walls
  const handleDetectExterior = useCallback(() => {
    detectExteriorWalls(rooms);
    updateCompletenessIssues(rooms);
  }, [rooms, detectExteriorWalls, updateCompletenessIssues]);

  return (
    <TooltipProvider>
      <div className={cn(
        'flex items-center gap-1 p-1 bg-background border rounded-lg shadow-sm',
        className
      )}>
        {/* Selection Tools */}
        <ToolGroup title="Selection">
          <ToolButton
            icon={<MousePointer2 className="h-4 w-4" />}
            label="Select"
            shortcut="V"
            active={toolMode === 'select'}
            onClick={() => handleToolModeChange('select')}
          />
          <ToolButton
            icon={<Move className="h-4 w-4" />}
            label="Move"
            shortcut="M"
            active={toolMode === 'move_room'}
            onClick={() => handleToolModeChange('move_room')}
          />
          <ToolButton
            icon={<Hand className="h-4 w-4" />}
            label="Pan"
            shortcut="Space"
            active={toolMode === 'pan'}
            onClick={() => handleToolModeChange('pan')}
          />
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Draw Tools with Zone Type */}
        <ToolGroup title="Draw">
          <ToolButton
            icon={<Pencil className="h-4 w-4" />}
            label="Draw Room/Polygon"
            shortcut="R"
            active={toolMode === 'draw_room'}
            onClick={() => handleToolModeChange('draw_room')}
          />
          {/* Zone Type Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1 min-w-[90px]"
              >
                {selectedZoneType === 'room' && <Home className="h-4 w-4" />}
                {selectedZoneType === 'garage' && <Car className="h-4 w-4" />}
                {selectedZoneType === 'porch' && <Building2 className="h-4 w-4" />}
                {selectedZoneType === 'deck' && <Trees className="h-4 w-4" />}
                {selectedZoneType === 'structure' && <Building2 className="h-4 w-4" />}
                <span className="text-xs capitalize">{selectedZoneType}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Zone Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedZoneType('room')}>
                <Home className="h-4 w-4 mr-2" />
                Room
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedZoneType('garage')}>
                <Car className="h-4 w-4 mr-2" />
                Garage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedZoneType('porch')}>
                <Building2 className="h-4 w-4 mr-2" />
                Porch
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedZoneType('deck')}>
                <Trees className="h-4 w-4 mr-2" />
                Deck
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedZoneType('structure')}>
                <Building2 className="h-4 w-4 mr-2" />
                Structure (detached)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Door/Window Tools */}
        <ToolGroup title="Openings">
          <ToolButton
            icon={<DoorOpen className="h-4 w-4" />}
            label="Add Door"
            shortcut="D"
            active={toolMode === 'draw_door'}
            onClick={() => handleToolModeChange('draw_door')}
          />
          <ToolButton
            icon={<PanelTop className="h-4 w-4" />}
            label="Add Window"
            shortcut="W"
            active={toolMode === 'draw_window'}
            onClick={() => handleToolModeChange('draw_window')}
          />
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Room Manipulation */}
        <ToolGroup title="Room">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                disabled={!hasRoomSelection}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Rotate Room</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleRotateRoom(90)}>
                <RotateCw className="h-4 w-4 mr-2" />
                Rotate 90°
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRotateRoom(180)}>
                <RotateCw className="h-4 w-4 mr-2" />
                Rotate 180°
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRotateRoom(270)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Rotate 270°
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolButton
            icon={<Copy className="h-4 w-4" />}
            label="Copy Room"
            shortcut="Ctrl+D"
            disabled={!hasRoomSelection}
            onClick={handleCopyRoom}
          />
          <ToolButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            shortcut="Del"
            disabled={!hasSelection}
            onClick={handleDeleteSelected}
            variant="destructive"
          />
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Alignment (Multi-select) */}
        <ToolGroup title="Align">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                disabled={selectedRoomCount < 2}
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Align Rooms</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAlign('left')}>
                <AlignLeft className="h-4 w-4 mr-2" />
                Align Left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('center_h')}>
                <AlignCenter className="h-4 w-4 mr-2" />
                Align Center (H)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('right')}>
                <AlignRight className="h-4 w-4 mr-2" />
                Align Right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAlign('top')}>
                <AlignStartVertical className="h-4 w-4 mr-2" />
                Align Top
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('center_v')}>
                <AlignCenterVertical className="h-4 w-4 mr-2" />
                Align Center (V)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('bottom')}>
                <AlignEndVertical className="h-4 w-4 mr-2" />
                Align Bottom
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDistribute('horizontal')}
                disabled={selectedRoomCount < 3}
              >
                <Maximize2 className="h-4 w-4 mr-2 rotate-90" />
                Distribute Horizontal
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDistribute('vertical')}
                disabled={selectedRoomCount < 3}
              >
                <Maximize2 className="h-4 w-4 mr-2" />
                Distribute Vertical
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Wall Tools */}
        <ToolGroup title="Walls">
          <ToolButton
            icon={<SquareDashed className="h-4 w-4" />}
            label="Toggle Missing"
            disabled={!hasWallSelection}
            onClick={handleToggleMissing}
          />
          <ToolButton
            icon={<Home className="h-4 w-4" />}
            label="Toggle Exterior"
            disabled={!hasWallSelection}
            onClick={handleToggleExterior}
          />
          <ToolButton
            icon={<Square className="h-4 w-4" />}
            label="Detect Exterior"
            onClick={handleDetectExterior}
          />
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Snapping */}
        <ToolGroup title="Snapping">
          <Toggle
            size="sm"
            pressed={snappingConfig.gridEnabled}
            onPressedChange={toggleGridSnap}
            className="h-8 px-2"
          >
            <Grid3X3 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={snappingConfig.parallelSnapEnabled}
            onPressedChange={toggleParallelSnap}
            className="h-8 px-2"
          >
            <Magnet className="h-4 w-4" />
          </Toggle>
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Undo/Redo */}
        <ToolGroup title="History">
          <ToolButton
            icon={<Undo2 className="h-4 w-4" />}
            label="Undo"
            shortcut="Ctrl+Z"
            disabled={!canUndo()}
            onClick={handleUndo}
          />
          <ToolButton
            icon={<Redo2 className="h-4 w-4" />}
            label="Redo"
            shortcut="Ctrl+Y"
            disabled={!canRedo()}
            onClick={handleRedo}
          />
        </ToolGroup>

        <Separator orientation="vertical" className="h-6" />

        {/* Status */}
        <SketchStatusBadge
          isComplete={isSketchComplete}
          issueCount={completenessIssues.length}
          className="ml-1"
        />
      </div>
    </TooltipProvider>
  );
}

// Tool group wrapper
function ToolGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={title}>
      {children}
    </div>
  );
}

// Tool button with tooltip
interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  onClick: () => void;
}

function ToolButton({
  icon,
  label,
  shortcut,
  active,
  disabled,
  variant = 'default',
  onClick,
}: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-8 px-2',
            variant === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive'
          )}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">{label}</p>
        {shortcut && <p className="text-xs text-muted-foreground">{shortcut}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

export default SketchToolbar;
