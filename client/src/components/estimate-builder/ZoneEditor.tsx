import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Save, RotateCcw } from 'lucide-react';
import type { ZoneWithChildren, UpdateZoneInput } from '@/hooks/useEstimateBuilder';
import type { ZoneType, ZoneStatus } from '@shared/schema';

interface ZoneEditorProps {
  zone: ZoneWithChildren;
  onUpdate: (updates: UpdateZoneInput) => Promise<any>;
  disabled?: boolean;
}

const ZONE_TYPES: { value: ZoneType; label: string }[] = [
  { value: 'room', label: 'Room' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'roof', label: 'Roof Section' },
  { value: 'deck', label: 'Deck' },
  { value: 'linear', label: 'Linear' },
  { value: 'custom', label: 'Custom' },
];

const ZONE_STATUSES: { value: ZoneStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'measured', label: 'Measured' },
  { value: 'scoped', label: 'Scoped' },
  { value: 'complete', label: 'Complete' },
];

const FLOOR_LEVELS = [
  { value: 'basement', label: 'Basement' },
  { value: 'main', label: 'Main Floor' },
  { value: 'upper', label: 'Upper Floor' },
  { value: 'attic', label: 'Attic' },
];

const ROOM_TYPES = [
  'Kitchen', 'Living Room', 'Bedroom', 'Bathroom', 'Dining Room',
  'Family Room', 'Office', 'Laundry', 'Garage', 'Basement',
  'Attic', 'Hallway', 'Closet', 'Utility Room', 'Entry',
];

const DAMAGE_TYPES = [
  'Water', 'Fire', 'Smoke', 'Wind', 'Hail', 'Impact', 'Vandalism', 'Other',
];

const DAMAGE_SEVERITIES = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'total_loss', label: 'Total Loss' },
];

const PITCH_OPTIONS = [
  '2/12', '3/12', '4/12', '5/12', '6/12', '7/12', '8/12', '9/12', '10/12', '12/12',
];

export function ZoneEditor({ zone, onUpdate, disabled }: ZoneEditorProps) {
  const [formData, setFormData] = useState({
    name: zone.name || '',
    zoneCode: zone.zoneCode || '',
    zoneType: (zone.zoneType as ZoneType) || 'room',
    status: (zone.status as ZoneStatus) || 'pending',
    roomType: zone.roomType || '',
    floorLevel: zone.floorLevel || 'main',
    lengthFt: zone.lengthFt ? parseFloat(zone.lengthFt) : '',
    widthFt: zone.widthFt ? parseFloat(zone.widthFt) : '',
    heightFt: zone.heightFt ? parseFloat(zone.heightFt) : 8,
    pitch: zone.pitch || '',
    damageType: zone.damageType || '',
    damageSeverity: zone.damageSeverity || '',
    notes: zone.notes || '',
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Update form when zone changes
  useEffect(() => {
    setFormData({
      name: zone.name || '',
      zoneCode: zone.zoneCode || '',
      zoneType: (zone.zoneType as ZoneType) || 'room',
      status: (zone.status as ZoneStatus) || 'pending',
      roomType: zone.roomType || '',
      floorLevel: zone.floorLevel || 'main',
      lengthFt: zone.lengthFt ? parseFloat(zone.lengthFt) : '',
      widthFt: zone.widthFt ? parseFloat(zone.widthFt) : '',
      heightFt: zone.heightFt ? parseFloat(zone.heightFt) : 8,
      pitch: zone.pitch || '',
      damageType: zone.damageType || '',
      damageSeverity: zone.damageSeverity || '',
      notes: zone.notes || '',
    });
    setHasChanges(false);
  }, [zone.id]);

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const updates: UpdateZoneInput = {
      name: formData.name,
      zoneCode: formData.zoneCode || undefined,
      zoneType: formData.zoneType,
      status: formData.status,
      roomType: formData.roomType || undefined,
      floorLevel: formData.floorLevel,
      lengthFt: formData.lengthFt ? Number(formData.lengthFt) : undefined,
      widthFt: formData.widthFt ? Number(formData.widthFt) : undefined,
      heightFt: formData.heightFt ? Number(formData.heightFt) : undefined,
      pitch: formData.pitch || undefined,
      damageType: formData.damageType || undefined,
      damageSeverity: formData.damageSeverity || undefined,
      notes: formData.notes || undefined,
    };
    await onUpdate(updates);
    setHasChanges(false);
  };

  const handleReset = () => {
    setFormData({
      name: zone.name || '',
      zoneCode: zone.zoneCode || '',
      zoneType: (zone.zoneType as ZoneType) || 'room',
      status: (zone.status as ZoneStatus) || 'pending',
      roomType: zone.roomType || '',
      floorLevel: zone.floorLevel || 'main',
      lengthFt: zone.lengthFt ? parseFloat(zone.lengthFt) : '',
      widthFt: zone.widthFt ? parseFloat(zone.widthFt) : '',
      heightFt: zone.heightFt ? parseFloat(zone.heightFt) : 8,
      pitch: zone.pitch || '',
      damageType: zone.damageType || '',
      damageSeverity: zone.damageSeverity || '',
      notes: zone.notes || '',
    });
    setHasChanges(false);
  };

  const showPitch = formData.zoneType === 'roof';
  const showHeight = formData.zoneType === 'room' || formData.zoneType === 'elevation';
  const showRoomType = formData.zoneType === 'room';

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Zone Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Zone Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoneCode">Zone Code</Label>
              <Input
                id="zoneCode"
                value={formData.zoneCode}
                onChange={(e) => updateField('zoneCode', e.target.value)}
                placeholder="e.g., KITCHEN1"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zoneType">Zone Type</Label>
              <Select
                value={formData.zoneType}
                onValueChange={(v) => updateField('zoneType', v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => updateField('status', v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showRoomType && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roomType">Room Type</Label>
                <Select
                  value={formData.roomType}
                  onValueChange={(v) => updateField('roomType', v)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="floorLevel">Floor Level</Label>
                <Select
                  value={formData.floorLevel}
                  onValueChange={(v) => updateField('floorLevel', v)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOOR_LEVELS.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dimensions */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lengthFt">Length (ft)</Label>
              <Input
                id="lengthFt"
                type="number"
                step="0.5"
                min="0"
                value={formData.lengthFt}
                onChange={(e) => updateField('lengthFt', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="widthFt">Width (ft)</Label>
              <Input
                id="widthFt"
                type="number"
                step="0.5"
                min="0"
                value={formData.widthFt}
                onChange={(e) => updateField('widthFt', e.target.value)}
                disabled={disabled}
              />
            </div>
            {showHeight && (
              <div className="space-y-2">
                <Label htmlFor="heightFt">Height (ft)</Label>
                <Input
                  id="heightFt"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.heightFt}
                  onChange={(e) => updateField('heightFt', e.target.value)}
                  disabled={disabled}
                />
              </div>
            )}
            {showPitch && (
              <div className="space-y-2">
                <Label htmlFor="pitch">Pitch</Label>
                <Select
                  value={formData.pitch}
                  onValueChange={(v) => updateField('pitch', v)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pitch" />
                  </SelectTrigger>
                  <SelectContent>
                    {PITCH_OPTIONS.map(pitch => (
                      <SelectItem key={pitch} value={pitch}>
                        {pitch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Damage Info */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Damage Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="damageType">Damage Type</Label>
              <Select
                value={formData.damageType}
                onValueChange={(v) => updateField('damageType', v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DAMAGE_TYPES.map(type => (
                    <SelectItem key={type} value={type.toLowerCase()}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="damageSeverity">Severity</Label>
              <Select
                value={formData.damageSeverity}
                onValueChange={(v) => updateField('damageSeverity', v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {DAMAGE_SEVERITIES.map(severity => (
                    <SelectItem key={severity.value} value={severity.value}>
                      {severity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Add notes about this zone..."
              rows={3}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Actions */}
      {hasChanges && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={disabled}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={disabled}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
