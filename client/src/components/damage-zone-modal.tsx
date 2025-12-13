import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { DamageZone } from "@/lib/types";

interface DamageZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (zone: Omit<DamageZone, "id" | "photos">) => void;
  roomId: string;
}

export default function DamageZoneModal({ isOpen, onClose, onSave, roomId }: DamageZoneModalProps) {
  const [type, setType] = useState<DamageZone["type"]>("Water");
  const [severity, setSeverity] = useState<DamageZone["severity"]>("Medium");
  const [affectedArea, setAffectedArea] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [surfaces, setSurfaces] = useState<string[]>([]);

  const handleSurfaceToggle = (surface: string) => {
    setSurfaces(prev => 
      prev.includes(surface) 
        ? prev.filter(s => s !== surface) 
        : [...prev, surface]
    );
  };

  const handleSave = () => {
    onSave({
      roomId,
      type,
      severity,
      affectedArea: Number(affectedArea) || 0,
      notes,
      affectedSurfaces: surfaces,
    });
    onClose();
    // Reset form
    setAffectedArea("");
    setNotes("");
    setSurfaces([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Damage Zone</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Damage Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Water", "Fire", "Smoke", "Mold", "Impact", "Wind", "Other"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Low", "Medium", "High", "Total"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Affected Area (SF)</Label>
            <Input 
              type="number" 
              value={affectedArea} 
              onChange={(e) => setAffectedArea(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Affected Surfaces</Label>
            <div className="grid grid-cols-2 gap-2">
              {["Floor", "Ceiling", "Wall North", "Wall South", "Wall East", "Wall West"].map((surface) => (
                <div key={surface} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`surface-${surface}`} 
                    checked={surfaces.includes(surface)}
                    onCheckedChange={() => handleSurfaceToggle(surface)}
                  />
                  <Label htmlFor={`surface-${surface}`} className="text-sm font-normal cursor-pointer">
                    {surface}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the damage..."
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Damage Zone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
