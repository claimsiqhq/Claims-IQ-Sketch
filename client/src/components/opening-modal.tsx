import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoomOpening, OpeningType, WallDirection, PositionType } from "@/lib/types";
import { DoorOpen, Square } from "lucide-react";

interface OpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (opening: Omit<RoomOpening, "id">) => void;
  existingOpening?: RoomOpening;
}

const openingTypes: { value: OpeningType; label: string; icon: string }[] = [
  { value: "door", label: "Standard Door", icon: "🚪" },
  { value: "window", label: "Window", icon: "🪟" },
  { value: "sliding_door", label: "Sliding Door", icon: "🚪" },
  { value: "french_door", label: "French Door", icon: "🚪" },
  { value: "archway", label: "Archway", icon: "🏛️" },
];

const wallOptions: { value: WallDirection; label: string }[] = [
  { value: "north", label: "North Wall" },
  { value: "south", label: "South Wall" },
  { value: "east", label: "East Wall" },
  { value: "west", label: "West Wall" },
];

const positionOptions: { value: PositionType; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const defaultDimensions: Record<OpeningType, { width: number; height: number }> = {
  door: { width: 3, height: 7 },
  window: { width: 3, height: 4 },
  sliding_door: { width: 6, height: 7 },
  french_door: { width: 5, height: 7 },
  archway: { width: 4, height: 7 },
};

export default function OpeningModal({ isOpen, onClose, onSave, existingOpening }: OpeningModalProps) {
  const [type, setType] = useState<OpeningType>(existingOpening?.type || "door");
  const [wall, setWall] = useState<WallDirection>(existingOpening?.wall || "north");
  const [position, setPosition] = useState<PositionType>(existingOpening?.position || "center");
  const [width, setWidth] = useState<string>(existingOpening?.width?.toString() || "3");
  const [height, setHeight] = useState<string>(existingOpening?.height?.toString() || "7");

  // Update dimensions when type changes
  useEffect(() => {
    if (!existingOpening) {
      const defaults = defaultDimensions[type];
      setWidth(defaults.width.toString());
      setHeight(defaults.height.toString());
    }
  }, [type, existingOpening]);

  // Reset form when modal opens with existing opening
  useEffect(() => {
    if (isOpen && existingOpening) {
      setType(existingOpening.type);
      setWall(existingOpening.wall);
      setPosition(existingOpening.position);
      setWidth(existingOpening.width.toString());
      setHeight(existingOpening.height.toString());
    } else if (isOpen && !existingOpening) {
      setType("door");
      setWall("north");
      setPosition("center");
      setWidth("3");
      setHeight("7");
    }
  }, [isOpen, existingOpening]);

  const handleSave = () => {
    onSave({
      type,
      wall,
      position,
      width: Number(width) || 3,
      height: Number(height) || 7,
    });
    onClose();
  };

  const isWindow = type === "window";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[100vw] h-[100dvh] sm:max-w-[450px] sm:h-auto flex flex-col rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5" />
            {existingOpening ? "Edit Opening" : "Add Door / Window"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1">
          {/* Opening Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as OpeningType)}>
              <SelectTrigger className="min-tap-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {openingTypes.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Wall Selection */}
          <div className="space-y-2">
            <Label>Wall</Label>
            <Select value={wall} onValueChange={(v) => setWall(v as WallDirection)}>
              <SelectTrigger className="min-tap-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label>Position on Wall</Label>
            <div className="grid grid-cols-3 gap-2">
              {positionOptions.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={position === opt.value ? "default" : "outline"}
                  className="min-tap-target"
                  onClick={() => setPosition(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width (ft)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                min="1"
                max="20"
                step="0.5"
                className="min-tap-target"
              />
            </div>
            <div className="space-y-2">
              <Label>Height (ft)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                min="1"
                max="12"
                step="0.5"
                className="min-tap-target"
              />
            </div>
          </div>

          {/* Visual Preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Preview</Label>
            <div className="bg-slate-100 rounded-lg p-4 flex items-center justify-center">
              <div className="relative">
                {/* Room representation */}
                <div className="w-32 h-32 border-2 border-slate-400 bg-white relative">
                  {/* Wall labels */}
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">North</span>
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">South</span>
                  <span className="absolute top-1/2 -left-6 -translate-y-1/2 text-[10px] text-slate-500">West</span>
                  <span className="absolute top-1/2 -right-6 -translate-y-1/2 text-[10px] text-slate-500">East</span>

                  {/* Opening indicator */}
                  <div
                    className={`absolute ${isWindow ? "bg-sky-400" : "bg-amber-600"} transition-all`}
                    style={{
                      ...(wall === "north" && {
                        top: 0,
                        height: "4px",
                        width: "24px",
                        left: position === "left" ? "8px" : position === "right" ? "calc(100% - 32px)" : "calc(50% - 12px)",
                      }),
                      ...(wall === "south" && {
                        bottom: 0,
                        height: "4px",
                        width: "24px",
                        left: position === "left" ? "8px" : position === "right" ? "calc(100% - 32px)" : "calc(50% - 12px)",
                      }),
                      ...(wall === "east" && {
                        right: 0,
                        width: "4px",
                        height: "24px",
                        top: position === "left" ? "8px" : position === "right" ? "calc(100% - 32px)" : "calc(50% - 12px)",
                      }),
                      ...(wall === "west" && {
                        left: 0,
                        width: "4px",
                        height: "24px",
                        top: position === "left" ? "8px" : position === "right" ? "calc(100% - 32px)" : "calc(50% - 12px)",
                      }),
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {isWindow ? "Window" : "Door"} on {wall} wall, {position} position
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pb-safe">
          <Button variant="outline" onClick={onClose} className="min-tap-target w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} className="min-tap-target w-full sm:w-auto">
            {existingOpening ? "Update" : "Add"} Opening
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
