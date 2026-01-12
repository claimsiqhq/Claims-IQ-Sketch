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
      <DialogContent className="w-full max-w-[100vw] h-[100dvh] sm:max-w-[500px] sm:h-auto flex flex-col rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Damage Zone</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="damage-type">Damage Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger id="damage-type" className="min-tap-target">
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
              <Label htmlFor="damage-severity">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                <SelectTrigger id="damage-severity" className="min-tap-target">
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
            <Label htmlFor="affected-area">Affected Area (SF)</Label>
            <Input
              id="affected-area"
              type="number"
              inputMode="decimal"
              value={affectedArea}
              onChange={(e) => setAffectedArea(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Affected Surfaces</Label>
            <div className="grid grid-cols-2 gap-3">
              {["Floor", "Ceiling", "Wall North", "Wall South", "Wall East", "Wall West"].map((surface) => (
                <div key={surface} className="flex items-center space-x-3 min-h-[44px]">
                  <Checkbox
                    id={`surface-${surface}`}
                    checked={surfaces.includes(surface)}
                    onCheckedChange={() => handleSurfaceToggle(surface)}
                    className="h-5 w-5"
                  />
                  <Label htmlFor={`surface-${surface}`} className="text-sm font-normal cursor-pointer flex-1">
                    {surface}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="damage-notes">Notes</Label>
            <Textarea
              id="damage-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the damage..."
              className="resize-none min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pb-safe">
          <Button variant="outline" onClick={onClose} className="min-tap-target w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} className="min-tap-target w-full sm:w-auto">Save Damage Zone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
