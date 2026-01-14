/**
 * Evidence Capture Component
 *
 * UI for capturing required evidence (photos, measurements, notes) for workflow steps.
 * Enforces evidence requirements and provides contextual prompts.
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Camera,
  Ruler,
  FileText,
  Check,
  Circle,
  AlertCircle,
  Upload,
  X,
  Plus,
  Trash2,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

export interface PhotoRequirement {
  minCount: number;
  maxCount?: number;
  angles?: string[];
  subjects?: string[];
}

export interface MeasurementRequirement {
  type: string;
  unit: string;
  minReadings?: number;
  locations?: string[];
}

export interface NoteRequirement {
  promptText: string;
  minLength?: number;
  structuredFields?: {
    field: string;
    type: "text" | "number" | "boolean" | "select";
    required: boolean;
    options?: string[];
  }[];
}

export interface EvidenceRequirement {
  type: "photo" | "measurement" | "note";
  label: string;
  description?: string;
  required: boolean;
  photo?: PhotoRequirement;
  measurement?: MeasurementRequirement;
  note?: NoteRequirement;
}

export interface CapturedEvidence {
  requirementId: string;
  type: "photo" | "measurement" | "note";
  photoId?: string;
  photoDataUrl?: string;
  measurementData?: {
    type: string;
    value: number;
    unit: string;
    location?: string;
  };
  noteData?: {
    text: string;
    structuredData?: Record<string, unknown>;
  };
}

export interface EvidenceCaptureProps {
  stepId: string;
  stepTitle: string;
  requirements: EvidenceRequirement[];
  fulfilled: {
    requirementId: string;
    fulfilled: boolean;
    evidenceId?: string;
  }[];
  onCapture: (evidence: CapturedEvidence) => Promise<void>;
  onComplete: () => void;
  isBlocking?: boolean;
}

// ============================================
// EVIDENCE REQUIREMENT ITEM
// ============================================

function EvidenceRequirementItem({
  requirement,
  index,
  isFulfilled,
  onCapture,
}: {
  requirement: EvidenceRequirement;
  index: number;
  isFulfilled: boolean;
  onCapture: (evidence: CapturedEvidence) => void;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<{ dataUrl: string; file?: File }[]>([]);
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementLocation, setMeasurementLocation] = useState("");
  const [noteText, setNoteText] = useState("");
  const [structuredData, setStructuredData] = useState<Record<string, unknown>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhotos((prev) => [
          ...prev,
          { dataUrl: event.target?.result as string, file },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePhotoSubmit = () => {
    capturedPhotos.forEach((photo, i) => {
      onCapture({
        requirementId: `${index}`,
        type: "photo",
        photoDataUrl: photo.dataUrl,
      });
    });
    setCapturedPhotos([]);
    setIsCapturing(false);
  };

  const handleMeasurementSubmit = () => {
    if (!measurementValue) return;

    onCapture({
      requirementId: `${index}`,
      type: "measurement",
      measurementData: {
        type: requirement.measurement?.type || "linear",
        value: parseFloat(measurementValue),
        unit: requirement.measurement?.unit || "ft",
        location: measurementLocation || undefined,
      },
    });

    setMeasurementValue("");
    setMeasurementLocation("");
    setIsCapturing(false);
  };

  const handleNoteSubmit = () => {
    if (!noteText && Object.keys(structuredData).length === 0) return;

    onCapture({
      requirementId: `${index}`,
      type: "note",
      noteData: {
        text: noteText,
        structuredData: Object.keys(structuredData).length > 0 ? structuredData : undefined,
      },
    });

    setNoteText("");
    setStructuredData({});
    setIsCapturing(false);
  };

  const getIcon = () => {
    switch (requirement.type) {
      case "photo":
        return <Camera className="h-4 w-4" />;
      case "measurement":
        return <Ruler className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isFulfilled
          ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
          : requirement.required
          ? "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"
          : "bg-muted border-muted-foreground/20"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            isFulfilled
              ? "bg-green-500 text-white"
              : requirement.required
              ? "bg-amber-500 text-white"
              : "bg-muted-foreground/20 text-muted-foreground"
          )}
        >
          {isFulfilled ? <Check className="h-5 w-5" /> : getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{requirement.label}</span>
            {requirement.required && !isFulfilled && (
              <Badge variant="destructive" className="text-xs">
                Required
              </Badge>
            )}
            {requirement.type === "photo" && requirement.photo && (
              <Badge variant="outline" className="text-xs">
                {requirement.photo.minCount}+ photos
              </Badge>
            )}
          </div>

          {requirement.description && (
            <p className="text-xs text-muted-foreground mt-1">{requirement.description}</p>
          )}

          {requirement.photo?.subjects && (
            <div className="flex flex-wrap gap-1 mt-2">
              {requirement.photo.subjects.map((subject, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {subject}
                </Badge>
              ))}
            </div>
          )}

          {requirement.measurement?.locations && (
            <div className="flex flex-wrap gap-1 mt-2">
              {requirement.measurement.locations.map((loc, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {loc}
                </Badge>
              ))}
            </div>
          )}

          {!isFulfilled && (
            <div className="mt-3">
              {!isCapturing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCapturing(true)}
                  className="gap-2"
                >
                  {getIcon()}
                  Capture {requirement.type}
                </Button>
              ) : (
                <Card className="mt-2">
                  <CardContent className="pt-4 space-y-3">
                    {/* Photo Capture */}
                    {requirement.type === "photo" && (
                      <>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          ref={fileInputRef}
                          onChange={handlePhotoCapture}
                          className="hidden"
                        />
                        <div className="flex flex-wrap gap-2">
                          {capturedPhotos.map((photo, i) => (
                            <div key={i} className="relative w-20 h-20">
                              <img
                                src={photo.dataUrl}
                                alt={`Captured ${i + 1}`}
                                className="w-full h-full object-cover rounded"
                              />
                              <button
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                                onClick={() =>
                                  setCapturedPhotos((prev) => prev.filter((_, idx) => idx !== i))
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            className="w-20 h-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground hover:bg-muted"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Plus className="h-6 w-6" />
                          </button>
                        </div>
                        {capturedPhotos.length >= (requirement.photo?.minCount ?? 0) && (
                          <Button size="sm" onClick={handlePhotoSubmit}>
                            Save {capturedPhotos.length} Photo(s)
                          </Button>
                        )}
                        {requirement.photo?.minCount !== undefined && requirement.photo.minCount > 0 && capturedPhotos.length < requirement.photo.minCount && (
                          <p className="text-xs text-amber-600">
                            Need {requirement.photo.minCount - capturedPhotos.length} more photo(s)
                          </p>
                        )}
                      </>
                    )}

                    {/* Measurement Capture */}
                    {requirement.type === "measurement" && (
                      <>
                        <div className="grid gap-2">
                          <Label>
                            Value ({requirement.measurement?.unit || "ft"})
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={measurementValue}
                            onChange={(e) => setMeasurementValue(e.target.value)}
                            placeholder={`Enter ${requirement.measurement?.type || "measurement"}`}
                          />
                        </div>
                        {requirement.measurement?.locations && (
                          <div className="grid gap-2">
                            <Label>Location</Label>
                            <Select value={measurementLocation} onValueChange={setMeasurementLocation}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                              <SelectContent>
                                {requirement.measurement.locations.map((loc) => (
                                  <SelectItem key={loc} value={loc}>
                                    {loc.replace(/_/g, " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <Button
                          size="sm"
                          onClick={handleMeasurementSubmit}
                          disabled={!measurementValue}
                        >
                          Save Measurement
                        </Button>
                      </>
                    )}

                    {/* Note Capture */}
                    {requirement.type === "note" && (
                      <>
                        {requirement.note?.structuredFields?.map((field) => (
                          <div key={field.field} className="grid gap-2">
                            <Label>
                              {field.field.replace(/_/g, " ")}
                              {field.required && <span className="text-red-500">*</span>}
                            </Label>
                            {field.type === "text" && (
                              <Input
                                value={(structuredData[field.field] as string) || ""}
                                onChange={(e) =>
                                  setStructuredData((prev) => ({
                                    ...prev,
                                    [field.field]: e.target.value,
                                  }))
                                }
                              />
                            )}
                            {field.type === "number" && (
                              <Input
                                type="number"
                                value={(structuredData[field.field] as number) || ""}
                                onChange={(e) =>
                                  setStructuredData((prev) => ({
                                    ...prev,
                                    [field.field]: parseFloat(e.target.value),
                                  }))
                                }
                              />
                            )}
                            {field.type === "boolean" && (
                              <Select
                                value={structuredData[field.field]?.toString() || ""}
                                onValueChange={(v) =>
                                  setStructuredData((prev) => ({
                                    ...prev,
                                    [field.field]: v === "true",
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">Yes</SelectItem>
                                  <SelectItem value="false">No</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {field.type === "select" && field.options && (
                              <Select
                                value={(structuredData[field.field] as string) || ""}
                                onValueChange={(v) =>
                                  setStructuredData((prev) => ({
                                    ...prev,
                                    [field.field]: v,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt.replace(/_/g, " ")}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                        <div className="grid gap-2">
                          <Label>{requirement.note?.promptText || "Notes"}</Label>
                          <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={3}
                            placeholder="Enter your notes..."
                          />
                        </div>
                        <Button size="sm" onClick={handleNoteSubmit}>
                          Save Note
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsCapturing(false)}
                    >
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function EvidenceCapture({
  stepId,
  stepTitle,
  requirements,
  fulfilled,
  onCapture,
  onComplete,
  isBlocking = false,
}: EvidenceCaptureProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalRequired = requirements.filter((r) => r.required).length;
  const totalFulfilled = fulfilled.filter(
    (f) => f.fulfilled && requirements.find((r, i) => i.toString() === f.requirementId)?.required
  ).length;

  const canComplete = totalFulfilled >= totalRequired;
  const progressPercent = totalRequired > 0 ? (totalFulfilled / totalRequired) * 100 : 100;

  const handleCapture = async (evidence: CapturedEvidence) => {
    setIsSubmitting(true);
    try {
      await onCapture(evidence);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="font-semibold">{stepTitle}</h3>
        <div className="flex items-center gap-2">
          <Progress value={progressPercent} className="flex-1 h-2" />
          <span className="text-sm text-muted-foreground">
            {totalFulfilled}/{totalRequired} required
          </span>
        </div>
        {isBlocking && !canComplete && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>This step blocks export until evidence is captured</span>
          </div>
        )}
      </div>

      {/* Requirements List */}
      <div className="space-y-3">
        {requirements.map((requirement, index) => {
          const isFulfilled = fulfilled.find(
            (f) => f.requirementId === index.toString()
          )?.fulfilled || false;

          return (
            <EvidenceRequirementItem
              key={index}
              requirement={requirement}
              index={index}
              isFulfilled={isFulfilled}
              onCapture={handleCapture}
            />
          );
        })}
      </div>

      {/* Complete Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!canComplete || isSubmitting}
          className="gap-2"
        >
          {canComplete ? (
            <>
              <Check className="h-4 w-4" />
              Complete Step
            </>
          ) : (
            <>
              <Circle className="h-4 w-4" />
              Capture Required Evidence
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default EvidenceCapture;
