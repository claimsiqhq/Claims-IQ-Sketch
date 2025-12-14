import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, DoorOpen } from 'lucide-react';
import type { EstimateMissingWall } from '@shared/schema';
import type { CreateMissingWallInput } from '@/hooks/useEstimateBuilder';

interface MissingWallManagerProps {
  missingWalls: EstimateMissingWall[];
  onAdd: (input: CreateMissingWallInput) => Promise<any>;
  onDelete: (wallId: string) => Promise<any>;
  disabled?: boolean;
}

const OPENING_TYPES = [
  { value: 'door', label: 'Door', defaultWidth: 3, defaultHeight: 6.67 },
  { value: 'double_door', label: 'Double Door', defaultWidth: 6, defaultHeight: 6.67 },
  { value: 'window', label: 'Window', defaultWidth: 3, defaultHeight: 4 },
  { value: 'large_window', label: 'Large Window', defaultWidth: 5, defaultHeight: 4 },
  { value: 'archway', label: 'Archway', defaultWidth: 4, defaultHeight: 7 },
  { value: 'pass_through', label: 'Pass Through', defaultWidth: 4, defaultHeight: 3 },
  { value: 'custom', label: 'Custom Opening', defaultWidth: 0, defaultHeight: 0 },
];

const WALL_LOCATIONS = [
  { value: 'north', label: 'North Wall' },
  { value: 'south', label: 'South Wall' },
  { value: 'east', label: 'East Wall' },
  { value: 'west', label: 'West Wall' },
  { value: 'long_1', label: 'Long Wall 1' },
  { value: 'long_2', label: 'Long Wall 2' },
  { value: 'short_1', label: 'Short Wall 1' },
  { value: 'short_2', label: 'Short Wall 2' },
];

const getOpeningLabel = (type: string) => {
  const found = OPENING_TYPES.find(t => t.value === type);
  return found?.label || type;
};

const getLocationLabel = (location: string | null) => {
  if (!location) return '';
  const found = WALL_LOCATIONS.find(l => l.value === location);
  return found?.label || location;
};

interface FormState {
  openingType: string;
  opensInto: string;
  widthFt: number;
  heightFt: number;
  name: string;
}

export function MissingWallManager({
  missingWalls,
  onAdd,
  onDelete,
  disabled,
}: MissingWallManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newOpening, setNewOpening] = useState<FormState>({
    openingType: 'door',
    opensInto: '',
    widthFt: 3,
    heightFt: 6.67,
    name: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpeningTypeChange = (type: string) => {
    const typeConfig = OPENING_TYPES.find(t => t.value === type);
    setNewOpening(prev => ({
      ...prev,
      openingType: type,
      widthFt: typeConfig?.defaultWidth || prev.widthFt,
      heightFt: typeConfig?.defaultHeight || prev.heightFt,
    }));
  };

  const handleAddOpening = async () => {
    setIsSubmitting(true);
    try {
      await onAdd({
        openingType: newOpening.openingType,
        opensInto: newOpening.opensInto || undefined,
        widthFt: newOpening.widthFt,
        heightFt: newOpening.heightFt,
        name: newOpening.name || undefined,
      });
      setIsAddDialogOpen(false);
      // Reset form
      setNewOpening({
        openingType: 'door',
        opensInto: '',
        widthFt: 3,
        heightFt: 6.67,
        name: '',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate total opening SF from widthFt * heightFt
  const totalOpeningSF = missingWalls.reduce((sum, wall) => {
    const width = wall.widthFt ? parseFloat(wall.widthFt) : 0;
    const height = wall.heightFt ? parseFloat(wall.heightFt) : 0;
    return sum + (width * height);
  }, 0);

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Missing Walls / Openings
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={disabled}>
                <Plus className="h-4 w-4 mr-2" />
                Add Opening
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Opening</DialogTitle>
                <DialogDescription>
                  Add a door, window, or other opening that reduces wall area.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Opening Type</Label>
                  <Select
                    value={newOpening.openingType}
                    onValueChange={handleOpeningTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPENING_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Opens Into (Optional)</Label>
                  <Select
                    value={newOpening.opensInto || ''}
                    onValueChange={(v) =>
                      setNewOpening(prev => ({ ...prev, opensInto: v || '' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {WALL_LOCATIONS.map(loc => (
                        <SelectItem key={loc.value} value={loc.value}>
                          {loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Width (ft)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newOpening.widthFt || ''}
                      onChange={(e) =>
                        setNewOpening(prev => ({
                          ...prev,
                          widthFt: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Height (ft)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newOpening.heightFt || ''}
                      onChange={(e) =>
                        setNewOpening(prev => ({
                          ...prev,
                          heightFt: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Name (Optional)</Label>
                  <Input
                    value={newOpening.name || ''}
                    onChange={(e) =>
                      setNewOpening(prev => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g., Entry door to garage"
                  />
                </div>

                {/* Calculated SF */}
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Opening Area</span>
                    <span className="font-semibold">
                      {((newOpening.widthFt || 0) * (newOpening.heightFt || 0)).toFixed(2)} SF
                    </span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddOpening} disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Opening'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {missingWalls.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No openings defined</p>
            <p className="text-xs mt-1">
              Add doors, windows, or other openings to subtract from wall area
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {missingWalls.map((wall) => (
              <div
                key={wall.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-amber-100 flex items-center justify-center">
                    <DoorOpen className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {getOpeningLabel(wall.openingType)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {wall.widthFt && wall.heightFt && (
                        <span>
                          {parseFloat(wall.widthFt).toFixed(1)}' × {parseFloat(wall.heightFt).toFixed(1)}'
                        </span>
                      )}
                      {wall.opensInto && (
                        <span className="ml-2">• {getLocationLabel(wall.opensInto)}</span>
                      )}
                    </div>
                    {wall.name && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {wall.name}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="font-mono">
                    -{(parseFloat(wall.widthFt) * parseFloat(wall.heightFt)).toFixed(1)} SF
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => onDelete(wall.id)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Total Deduction */}
            <div className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm font-medium">Total Wall Deduction</span>
              <Badge variant="outline" className="font-mono text-amber-600">
                -{totalOpeningSF.toFixed(1)} SF
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
