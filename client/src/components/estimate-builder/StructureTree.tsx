import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Layers,
  Square,
  Plus,
  ChevronRight,
  ChevronDown,
  Home,
  Warehouse,
  TreePine,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  StructureWithChildren,
  CreateStructureInput,
  CreateAreaInput,
  CreateZoneInput,
} from '@/hooks/useEstimateBuilder';
import type { ZoneType } from '@shared/schema';

interface StructureTreeProps {
  structures: StructureWithChildren[];
  activeZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onCreateZone: (areaId: string, input: CreateZoneInput) => Promise<any>;
  onCreateArea: (structureId: string, input: CreateAreaInput) => Promise<any>;
  onCreateStructure: (input: CreateStructureInput) => Promise<any>;
}

const AREA_TYPES = [
  { value: 'interior', label: 'Interior', icon: Home },
  { value: 'exterior', label: 'Exterior', icon: TreePine },
  { value: 'roofing', label: 'Roofing', icon: Warehouse },
  { value: 'specialty', label: 'Specialty', icon: Layers },
];

const ZONE_TYPES: { value: ZoneType; label: string }[] = [
  { value: 'room', label: 'Room' },
  { value: 'elevation', label: 'Elevation' },
  { value: 'roof', label: 'Roof Section' },
  { value: 'deck', label: 'Deck' },
  { value: 'linear', label: 'Linear' },
  { value: 'custom', label: 'Custom' },
];

const ROOM_TYPES = [
  'Kitchen', 'Living Room', 'Bedroom', 'Bathroom', 'Dining Room',
  'Family Room', 'Office', 'Laundry', 'Garage', 'Basement',
  'Attic', 'Hallway', 'Closet', 'Utility Room', 'Entry',
];

export function StructureTree({
  structures,
  activeZoneId,
  onSelectZone,
  onCreateZone,
  onCreateArea,
  onCreateStructure,
}: StructureTreeProps) {
  const [expandedStructures, setExpandedStructures] = useState<Set<string>>(
    new Set(structures.map(s => s.id))
  );
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(
    new Set(structures.flatMap(s => s.areas.map(a => a.id)))
  );

  const [isAddStructureOpen, setIsAddStructureOpen] = useState(false);
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [isAddZoneOpen, setIsAddZoneOpen] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const [newStructureName, setNewStructureName] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaType, setNewAreaType] = useState('interior');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState<ZoneType>('room');
  const [newRoomType, setNewRoomType] = useState('');

  const toggleStructure = (id: string) => {
    setExpandedStructures(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArea = (id: string) => {
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddStructure = async () => {
    if (!newStructureName.trim()) return;
    await onCreateStructure({ name: newStructureName.trim() });
    setNewStructureName('');
    setIsAddStructureOpen(false);
  };

  const handleAddArea = async () => {
    if (!selectedStructureId || !newAreaName.trim()) return;
    const area = await onCreateArea(selectedStructureId, {
      name: newAreaName.trim(),
      areaType: newAreaType,
    });
    setExpandedStructures(prev => new Set([...Array.from(prev), selectedStructureId]));
    setExpandedAreas(prev => new Set([...Array.from(prev), area.id]));
    setNewAreaName('');
    setNewAreaType('interior');
    setIsAddAreaOpen(false);
    setSelectedStructureId(null);
  };

  const handleAddZone = async () => {
    if (!selectedAreaId || !newZoneName.trim()) return;
    await onCreateZone(selectedAreaId, {
      name: newZoneName.trim(),
      zoneType: newZoneType,
      roomType: newZoneType === 'room' ? newRoomType : undefined,
    });
    setExpandedAreas(prev => new Set([...Array.from(prev), selectedAreaId]));
    setNewZoneName('');
    setNewZoneType('room');
    setNewRoomType('');
    setIsAddZoneOpen(false);
    setSelectedAreaId(null);
  };

  const getZoneStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-500';
      case 'scoped': return 'bg-blue-500';
      case 'measured': return 'bg-amber-500';
      default: return 'bg-slate-300';
    }
  };

  return (
    <div className="p-2">
      {/* Structures */}
      {structures.map(structure => (
        <div key={structure.id} className="mb-2">
          <Collapsible
            open={expandedStructures.has(structure.id)}
            onOpenChange={() => toggleStructure(structure.id)}
          >
            <div className="flex items-center group">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {expandedStructures.has(structure.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2 flex-1 py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer">
                <Building2 className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium truncate">{structure.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStructureId(structure.id);
                  setIsAddAreaOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <CollapsibleContent>
              <div className="ml-4 pl-2 border-l border-slate-200">
                {/* Areas */}
                {structure.areas.map(area => (
                  <div key={area.id} className="mb-1">
                    <Collapsible
                      open={expandedAreas.has(area.id)}
                      onOpenChange={() => toggleArea(area.id)}
                    >
                      <div className="flex items-center group">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            {expandedAreas.has(area.id) ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-2 flex-1 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm truncate">{area.name}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1 ml-auto">
                            {area.zones.length}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAreaId(area.id);
                            setIsAddZoneOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <CollapsibleContent>
                        <div className="ml-4 pl-2 border-l border-slate-200 space-y-0.5">
                          {/* Zones */}
                          {area.zones.map(zone => (
                            <button
                              key={zone.id}
                              onClick={() => onSelectZone(zone.id)}
                              className={cn(
                                'w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm text-left transition-colors',
                                activeZoneId === zone.id
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-slate-100'
                              )}
                            >
                              <div className={cn(
                                'h-2 w-2 rounded-full shrink-0',
                                getZoneStatusColor(zone.status)
                              )} />
                              <Square className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{zone.name}</span>
                              {zone.lineItemCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto">
                                  {zone.lineItemCount}
                                </Badge>
                              )}
                            </button>
                          ))}

                          {area.zones.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2 px-2">
                              No zones yet
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}

                {structure.areas.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 px-2">
                    No areas yet
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ))}

      {/* Add Structure Button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground mt-2"
        onClick={() => setIsAddStructureOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Structure
      </Button>

      {/* Add Structure Dialog */}
      <Dialog open={isAddStructureOpen} onOpenChange={setIsAddStructureOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Structure</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="structureName">Structure Name</Label>
              <Input
                id="structureName"
                placeholder="e.g., Main House, Detached Garage"
                value={newStructureName}
                onChange={(e) => setNewStructureName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStructure()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddStructureOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStructure} disabled={!newStructureName.trim()}>
              Add Structure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Area Dialog */}
      <Dialog open={isAddAreaOpen} onOpenChange={setIsAddAreaOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Area</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="areaName">Area Name</Label>
              <Input
                id="areaName"
                placeholder="e.g., First Floor, Front Exterior"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="areaType">Area Type</Label>
              <Select value={newAreaType} onValueChange={setNewAreaType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREA_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAreaOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddArea} disabled={!newAreaName.trim()}>
              Add Area
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Zone Dialog */}
      <Dialog open={isAddZoneOpen} onOpenChange={setIsAddZoneOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="zoneName">Zone Name</Label>
              <Input
                id="zoneName"
                placeholder="e.g., Kitchen, Front Elevation"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoneType">Zone Type</Label>
              <Select value={newZoneType} onValueChange={(v) => setNewZoneType(v as ZoneType)}>
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
            {newZoneType === 'room' && (
              <div className="space-y-2">
                <Label htmlFor="roomType">Room Type</Label>
                <Select value={newRoomType} onValueChange={setNewRoomType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room type" />
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddZoneOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddZone} disabled={!newZoneName.trim()}>
              Add Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
