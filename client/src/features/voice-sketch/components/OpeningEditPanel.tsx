// Opening Edit Panel Component
// Provides numeric inputs for editing opening properties (doors/windows)

import React, { useState, useEffect, useCallback } from 'react';
import { X, Move, Trash2, Copy, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import type { Opening, RoomGeometry, WallDirection, OpeningType } from '../types/geometry';
import { formatDimension, getWallLength, calculatePositionInFeet } from '../utils/polygon-math';
import { cn } from '@/lib/utils';

interface OpeningEditPanelProps {
  opening: Opening;
  room: RoomGeometry;
  onUpdate: (openingId: string, updates: Partial<Opening>) => void;
  onDelete: (openingId: string) => void;
  onDuplicate?: (openingId: string) => void;
  onClose: () => void;
  className?: string;
}

const OPENING_TYPES: { value: OpeningType; label: string }[] = [
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
  { value: 'archway', label: 'Archway' },
  { value: 'sliding_door', label: 'Sliding Door' },
  { value: 'french_door', label: 'French Door' },
];

const WALL_DIRECTIONS: { value: WallDirection; label: string }[] = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
];

export function OpeningEditPanel({
  opening,
  room,
  onUpdate,
  onDelete,
  onDuplicate,
  onClose,
  className,
}: OpeningEditPanelProps) {
  // Local state for editing
  const [width, setWidth] = useState(opening.width_ft.toString());
  const [height, setHeight] = useState(opening.height_ft.toString());
  const [sillHeight, setSillHeight] = useState(opening.sill_height_ft?.toString() ?? '3');
  const [position, setPosition] = useState<number>(() => {
    const wallLen = getWallLength(opening.wall, room.width_ft, room.length_ft);
    return calculatePositionInFeet(opening.position, wallLen, opening.width_ft, opening.position_from ?? 'start');
  });
  const [type, setType] = useState<OpeningType>(opening.type);
  const [wall, setWall] = useState<WallDirection>(opening.wall);

  // Calculate wall length and constraints
  const wallLength = getWallLength(wall, room.width_ft, room.length_ft);
  const minPosition = parseFloat(width) / 2 || 1;
  const maxPosition = wallLength - (parseFloat(width) / 2 || 1);

  // Update position when wall or width changes
  useEffect(() => {
    const newWallLength = getWallLength(wall, room.width_ft, room.length_ft);
    const newMinPos = parseFloat(width) / 2 || 1;
    const newMaxPos = newWallLength - (parseFloat(width) / 2 || 1);

    // Clamp position to new bounds
    if (position < newMinPos) setPosition(newMinPos);
    if (position > newMaxPos) setPosition(newMaxPos);
  }, [wall, width, room.width_ft, room.length_ft]);

  // Handle dimension input changes
  const handleWidthChange = useCallback((value: string) => {
    setWidth(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= wallLength) {
      onUpdate(opening.id, { width_ft: numValue });
    }
  }, [opening.id, onUpdate, wallLength]);

  const handleHeightChange = useCallback((value: string) => {
    setHeight(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= room.ceiling_height_ft) {
      onUpdate(opening.id, { height_ft: numValue });
    }
  }, [opening.id, onUpdate, room.ceiling_height_ft]);

  const handleSillHeightChange = useCallback((value: string) => {
    setSillHeight(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onUpdate(opening.id, { sill_height_ft: numValue });
    }
  }, [opening.id, onUpdate]);

  const handlePositionChange = useCallback((value: number[]) => {
    const newPos = value[0];
    setPosition(newPos);
    onUpdate(opening.id, { position: newPos });
  }, [opening.id, onUpdate]);

  const handleTypeChange = useCallback((value: string) => {
    const newType = value as OpeningType;
    setType(newType);
    onUpdate(opening.id, { type: newType });
  }, [opening.id, onUpdate]);

  const handleWallChange = useCallback((value: string) => {
    const newWall = value as WallDirection;
    setWall(newWall);
    onUpdate(opening.id, { wall: newWall });
  }, [opening.id, onUpdate]);

  // Quick position adjustments
  const nudgeLeft = useCallback(() => {
    const newPos = Math.max(minPosition, position - 0.5);
    setPosition(newPos);
    onUpdate(opening.id, { position: newPos });
  }, [opening.id, onUpdate, position, minPosition]);

  const nudgeRight = useCallback(() => {
    const newPos = Math.min(maxPosition, position + 0.5);
    setPosition(newPos);
    onUpdate(opening.id, { position: newPos });
  }, [opening.id, onUpdate, position, maxPosition]);

  const centerOnWall = useCallback(() => {
    const center = wallLength / 2;
    setPosition(center);
    onUpdate(opening.id, { position: center });
  }, [opening.id, onUpdate, wallLength]);

  const handleDelete = useCallback(() => {
    if (confirm(`Delete this ${opening.type}?`)) {
      onDelete(opening.id);
      onClose();
    }
  }, [opening.id, opening.type, onDelete, onClose]);

  const handleDuplicate = useCallback(() => {
    if (onDuplicate) {
      onDuplicate(opening.id);
    }
  }, [opening.id, onDuplicate]);

  const isWindow = type === 'window';
  const isDoor = type === 'door' || type === 'sliding_door' || type === 'french_door';

  return (
    <Card className={cn('w-80 shadow-lg', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Move className="h-4 w-4" />
            Edit {opening.type.replace('_', ' ')}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Type Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPENING_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Wall Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Wall</Label>
          <Select value={wall} onValueChange={handleWallChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WALL_DIRECTIONS.map(w => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label} ({formatDimension(getWallLength(w.value, room.width_ft, room.length_ft))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Width */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Width (ft)</Label>
          <Input
            type="number"
            min={0.5}
            max={wallLength - 1}
            step={0.5}
            value={width}
            onChange={(e) => handleWidthChange(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-1">
            {[2, 2.5, 3, 4, 5, 6].map(w => (
              <Button
                key={w}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleWidthChange(w.toString())}
              >
                {w}'
              </Button>
            ))}
          </div>
        </div>

        {/* Height */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Height (ft)</Label>
          <Input
            type="number"
            min={1}
            max={room.ceiling_height_ft}
            step={0.5}
            value={height}
            onChange={(e) => handleHeightChange(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-1">
            {isDoor && [6.67, 7, 8].map(h => (
              <Button
                key={h}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleHeightChange(h.toString())}
              >
                {formatDimension(h)}
              </Button>
            ))}
            {isWindow && [3, 4, 5].map(h => (
              <Button
                key={h}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleHeightChange(h.toString())}
              >
                {h}'
              </Button>
            ))}
          </div>
        </div>

        {/* Sill Height (Windows only) */}
        {isWindow && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sill Height (ft)</Label>
            <Input
              type="number"
              min={0}
              max={room.ceiling_height_ft - parseFloat(height)}
              step={0.25}
              value={sillHeight}
              onChange={(e) => handleSillHeightChange(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-1">
              {[2, 2.5, 3, 3.5, 4].map(sh => (
                <Button
                  key={sh}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs flex-1"
                  onClick={() => handleSillHeightChange(sh.toString())}
                >
                  {sh}'
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Position on Wall */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Position from Start: {formatDimension(position)}
            </Label>
            <span className="text-xs text-muted-foreground">
              Wall: {formatDimension(wallLength)}
            </span>
          </div>

          <Slider
            value={[position]}
            min={minPosition}
            max={maxPosition}
            step={0.25}
            onValueChange={handlePositionChange}
            className="my-2"
          />

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={nudgeLeft}
              disabled={position <= minPosition}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              -6"
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1"
              onClick={centerOnWall}
            >
              Center
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={nudgeRight}
              disabled={position >= maxPosition}
            >
              +6"
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Distance from corners display */}
        <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">From start corner:</span>
            <span className="font-medium">{formatDimension(position - parseFloat(width) / 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">From end corner:</span>
            <span className="font-medium">{formatDimension(wallLength - position - parseFloat(width) / 2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          {onDuplicate && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleDuplicate}
            >
              <Copy className="h-3 w-3 mr-1" />
              Duplicate
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default OpeningEditPanel;
