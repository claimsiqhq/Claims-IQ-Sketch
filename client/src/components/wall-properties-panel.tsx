// WallPropertiesPanel - Properties panel for editing wall attributes
// Part of the wall-first sketch model

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Move,
  Ruler,
  Home,
  Building2,
  Link2,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { WallEntity, WallType, RoomGeometry } from '@/features/voice-sketch/types/geometry';
import { formatDimension } from '@/features/voice-sketch/utils/polygon-math';

interface WallPropertiesPanelProps {
  selectedWalls: WallEntity[];
  rooms: RoomGeometry[];
  onUpdateLength: (wallId: string, newLength: number) => void;
  onUpdateHeight: (wallId: string, newHeight: number) => void;
  onUpdateType: (wallId: string, newType: WallType) => void;
  onClose: () => void;
  className?: string;
}

export default function WallPropertiesPanel({
  selectedWalls,
  rooms,
  onUpdateLength,
  onUpdateHeight,
  onUpdateType,
  onClose,
  className,
}: WallPropertiesPanelProps) {
  const [lengthInput, setLengthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const singleWall = selectedWalls.length === 1 ? selectedWalls[0] : null;

  // Update inputs when selection changes
  useEffect(() => {
    if (singleWall) {
      setLengthInput(singleWall.length_ft.toFixed(1));
      setHeightInput(singleWall.height_ft.toFixed(1));
    } else {
      setLengthInput('');
      setHeightInput('');
    }
  }, [singleWall]);

  // Get connected room names
  const getConnectedRoomNames = useCallback((wall: WallEntity): string[] => {
    return wall.roomIds
      .map(roomId => {
        const room = rooms.find(r => r.id === roomId);
        return room?.name || 'Unknown Room';
      })
      .map(name =>
        name
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      );
  }, [rooms]);

  // Handle length change
  const handleLengthChange = useCallback(() => {
    if (!singleWall) return;
    const newLength = parseFloat(lengthInput);
    if (isNaN(newLength) || newLength < 1) return;
    onUpdateLength(singleWall.id, newLength);
  }, [singleWall, lengthInput, onUpdateLength]);

  // Handle height change
  const handleHeightChange = useCallback(() => {
    if (!singleWall) return;
    const newHeight = parseFloat(heightInput);
    if (isNaN(newHeight) || newHeight < 1) return;
    onUpdateHeight(singleWall.id, newHeight);
  }, [singleWall, heightInput, onUpdateHeight]);

  // Handle type toggle
  const handleTypeToggle = useCallback((checked: boolean) => {
    if (!singleWall) return;
    const newType: WallType = checked ? 'exterior' : 'interior';
    onUpdateType(singleWall.id, newType);
  }, [singleWall, onUpdateType]);

  // Handle key press for input fields
  const handleKeyPress = useCallback((
    e: React.KeyboardEvent,
    submitHandler: () => void
  ) => {
    if (e.key === 'Enter') {
      submitHandler();
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  if (selectedWalls.length === 0) {
    return null;
  }

  const isExterior = singleWall?.type === 'exterior';
  const isMissing = singleWall?.type === 'missing';

  return (
    <div
      className={cn(
        'bg-white border rounded-lg shadow-lg overflow-hidden',
        'w-72 max-h-[calc(100vh-200px)]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-primary/10 rounded">
            <Ruler className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-sm">
            {selectedWalls.length === 1
              ? 'Wall Properties'
              : `${selectedWalls.length} Walls Selected`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-4 overflow-y-auto">
          {singleWall ? (
            <>
              {/* Wall Type Badge */}
              <div className="flex items-center gap-2">
                <Badge
                  variant={isExterior ? 'default' : isMissing ? 'outline' : 'secondary'}
                  className={cn(
                    'text-xs',
                    isExterior && 'bg-slate-800',
                    isMissing && 'border-dashed'
                  )}
                >
                  {isExterior ? (
                    <Building2 className="h-3 w-3 mr-1" />
                  ) : (
                    <Home className="h-3 w-3 mr-1" />
                  )}
                  {singleWall.type.charAt(0).toUpperCase() + singleWall.type.slice(1)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {singleWall.orientation}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {singleWall.direction}
                </Badge>
              </div>

              <Separator />

              {/* Length */}
              <div className="space-y-1.5">
                <Label htmlFor="wall-length" className="text-xs text-slate-500">
                  Length
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="wall-length"
                    type="number"
                    step="0.5"
                    min="1"
                    value={lengthInput}
                    onChange={(e) => setLengthInput(e.target.value)}
                    onBlur={handleLengthChange}
                    onKeyPress={(e) => handleKeyPress(e, handleLengthChange)}
                    className="h-8 text-sm"
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">ft</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {formatDimension(singleWall.length_ft)}
                </p>
              </div>

              {/* Orientation (Read-only) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">
                  Orientation
                </Label>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-md text-sm text-slate-700">
                  <Move className="h-3.5 w-3.5 text-slate-400" />
                  <span className="capitalize">{singleWall.orientation}</span>
                  <span className="text-slate-400">
                    ({singleWall.direction} facing)
                  </span>
                </div>
              </div>

              {/* Interior/Exterior Toggle */}
              <div className="space-y-1.5">
                <Label htmlFor="wall-type" className="text-xs text-slate-500">
                  Wall Type
                </Label>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <Home className={cn(
                      'h-4 w-4',
                      !isExterior ? 'text-primary' : 'text-slate-400'
                    )} />
                    <span className="text-sm">Interior</span>
                  </div>
                  <Switch
                    id="wall-type"
                    checked={isExterior}
                    onCheckedChange={handleTypeToggle}
                    disabled={singleWall.isShared}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Exterior</span>
                    <Building2 className={cn(
                      'h-4 w-4',
                      isExterior ? 'text-primary' : 'text-slate-400'
                    )} />
                  </div>
                </div>
                {singleWall.isShared && (
                  <p className="text-[10px] text-amber-600">
                    Shared walls are always interior
                  </p>
                )}
              </div>

              {/* Wall Height */}
              <div className="space-y-1.5">
                <Label htmlFor="wall-height" className="text-xs text-slate-500">
                  Wall Height
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="wall-height"
                    type="number"
                    step="0.5"
                    min="1"
                    value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    onBlur={handleHeightChange}
                    onKeyPress={(e) => handleKeyPress(e, handleHeightChange)}
                    className="h-8 text-sm"
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">ft</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Inherits ceiling height unless overridden
                </p>
              </div>

              <Separator />

              {/* Connected Rooms */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  Connected Rooms
                </Label>
                <div className="space-y-1">
                  {getConnectedRoomNames(singleWall).map((name, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded text-sm"
                    >
                      <div className="w-2 h-2 rounded-full bg-primary/60" />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
                {singleWall.isShared && (
                  <Badge variant="outline" className="text-xs mt-2">
                    <Link2 className="h-3 w-3 mr-1" />
                    Shared Wall
                  </Badge>
                )}
              </div>
            </>
          ) : (
            // Multi-selection summary
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {selectedWalls.length} walls selected
              </p>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Length:</span>
                  <span className="font-medium">
                    {formatDimension(
                      selectedWalls.reduce((sum, w) => sum + w.length_ft, 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Exterior Walls:</span>
                  <span className="font-medium">
                    {selectedWalls.filter(w => w.type === 'exterior').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Interior Walls:</span>
                  <span className="font-medium">
                    {selectedWalls.filter(w => w.type === 'interior').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Shared Walls:</span>
                  <span className="font-medium">
                    {selectedWalls.filter(w => w.isShared).length}
                  </span>
                </div>
              </div>

              <Separator />

              <p className="text-xs text-slate-400">
                Select a single wall to edit its properties
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
