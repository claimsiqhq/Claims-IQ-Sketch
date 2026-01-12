/**
 * Step Completion Dialog
 *
 * Mobile-optimized dialog that prompts adjusters to capture findings,
 * photos, measurements, and notes when completing an inspection step.
 *
 * Features:
 * - Fullscreen on mobile for better UX
 * - Photo capture integration
 * - Findings/observations textarea
 * - Time tracking
 * - Damage severity selection
 * - Quick action buttons
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CompactPhotoCapture, CapturedPhoto } from "./photo-capture";
import { VoiceButton } from "./voice-input";
import { FindingsTemplates, SeverityQuickSelect } from "./findings-templates";
import {
  CheckCircle2,
  Clock,
  Camera,
  FileText,
  AlertTriangle,
  Ruler,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Loader2,
  ChevronRight,
  Eye,
  MessageSquare,
  X,
  Mic,
} from "lucide-react";

// Evidence requirement from workflow JSON
export interface EvidenceRequirement {
  id?: string;
  type: 'photo' | 'measurement' | 'note';
  label: string;
  required: boolean;
  description?: string;
  photo?: {
    minCount?: number;
    maxCount?: number;
    angles?: string[];
    subjects?: string[];
  };
  measurement?: {
    type: string;
    unit: string;
    minReadings?: number;
  };
  note?: {
    promptText?: string;
    minLength?: number;
  };
}

// Step data from parent
export interface StepData {
  id: string;
  title: string;
  instructions?: string;
  stepType: string;
  estimatedMinutes?: number;
  required: boolean;
  roomName?: string;
  assets?: {
    assetType: string;
    label: string;
    required: boolean;
  }[];
  // Dynamic workflow fields
  evidenceRequirements?: EvidenceRequirement[];
  blocking?: 'blocking' | 'conditional' | 'non_blocking';
  conditions?: Record<string, unknown>;
}

// Completion data to return
export interface StepCompletionData {
  stepId: string;
  status: "completed" | "skipped";
  findings: string;
  photos: CapturedPhoto[];
  actualMinutes: number;
  damageSeverity: "none" | "minor" | "moderate" | "severe" | null;
  measurementValue?: string;
  measurementUnit?: string;
  followUpNeeded: boolean;
  followUpNote?: string;
}

interface StepCompletionDialogProps {
  step: StepData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (data: StepCompletionData) => void;
  onSkip?: (stepId: string, reason: string) => void;
  isSubmitting?: boolean;
  /** Validates evidence including both stored and pending evidence */
  validateEvidence?: (step: StepData, pendingPhotos: CapturedPhoto[], pendingNotes: string) => { valid: boolean; message?: string };
}

export function StepCompletionDialog({
  step,
  open,
  onOpenChange,
  onComplete,
  onSkip,
  isSubmitting = false,
  validateEvidence,
}: StepCompletionDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Form state
  const [findings, setFindings] = useState("");
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [actualMinutes, setActualMinutes] = useState(5);
  const [damageSeverity, setDamageSeverity] = useState<"none" | "minor" | "moderate" | "severe" | null>(null);
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("ft");
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Reset form when step changes
  useEffect(() => {
    if (step) {
      setFindings("");
      setPhotos([]);
      setActualMinutes(step.estimatedMinutes || 5);
      setDamageSeverity(null);
      setMeasurementValue("");
      setFollowUpNeeded(false);
      setFollowUpNote("");
      setSkipReason("");
      setShowSkipConfirm(false);
    }
  }, [step?.id]);

  if (!step) return null;

  // Determine required photos based on evidence requirements or step assets
  const getRequiredPhotoCount = (): number => {
    // First check evidenceRequirements (dynamic workflow)
    if (step.evidenceRequirements) {
      const photoReq = step.evidenceRequirements.find(r => r.type === 'photo' && r.required);
      if (photoReq?.photo?.minCount) {
        return photoReq.photo.minCount;
      }
    }
    // Fall back to legacy assets count
    return step.assets?.filter(a => a.required && a.assetType === "photo").length || 1;
  };

  const requiredPhotos = getRequiredPhotoCount();
  const hasEnoughPhotos = photos.length >= requiredPhotos;

  // Check note requirements from evidence requirements
  const getNoteRequirement = (): { required: boolean; minLength: number } => {
    if (step.evidenceRequirements) {
      const noteReq = step.evidenceRequirements.find(r => r.type === 'note' && r.required);
      if (noteReq) {
        return { required: true, minLength: noteReq.note?.minLength || 1 };
      }
    }
    // Default: required steps need at least some finding notes
    return { required: step.required, minLength: 1 };
  };

  const noteRequirement = getNoteRequirement();
  const hasRequiredNotes = !noteRequirement.required || findings.trim().length >= noteRequirement.minLength;

  // Check measurement requirements
  const getMeasurementRequirement = (): boolean => {
    if (step.evidenceRequirements) {
      return step.evidenceRequirements.some(r => r.type === 'measurement' && r.required);
    }
    return step.stepType === 'measurement';
  };

  const requiresMeasurement = getMeasurementRequirement();
  const hasMeasurement = !requiresMeasurement || (measurementValue.trim().length > 0);

  // Validate evidence using provided validator (includes pending photos and notes)
  const evidenceValidation = validateEvidence
    ? validateEvidence(step, photos, findings)
    : { valid: true };

  // Check if step is blocking (required or blocking='blocking')
  const isBlockingStep = step.required || step.blocking === 'blocking';

  // Basic local requirements check
  const hasBasicRequirements = !isBlockingStep || (hasEnoughPhotos && hasRequiredNotes && hasMeasurement);

  // Check if can complete - must pass both basic requirements and evidence validation
  const canComplete = hasBasicRequirements && evidenceValidation.valid;

  // Build validation message for UI
  const buildValidationMessage = (): string | undefined => {
    if (evidenceValidation.message) {
      return evidenceValidation.message;
    }
    if (isBlockingStep) {
      if (!hasEnoughPhotos) {
        return `This step requires at least ${requiredPhotos} photo(s). You have ${photos.length}.`;
      }
      if (!hasRequiredNotes) {
        return `This step requires findings/notes${noteRequirement.minLength > 1 ? ` (minimum ${noteRequirement.minLength} characters)` : ''}.`;
      }
      if (!hasMeasurement) {
        return 'This step requires a measurement value.';
      }
    }
    return undefined;
  };

  const validationMessage = buildValidationMessage();

  const handleComplete = () => {
    // Double-check validation before submitting (include pending photos and notes)
    if (validateEvidence) {
      const finalValidation = validateEvidence(step, photos, findings);
      if (!finalValidation.valid) {
        // Validation failed - don't proceed
        return;
      }
    }

    // Also verify local requirements are met for blocking steps
    if (isBlockingStep && !hasBasicRequirements) {
      return;
    }

    onComplete({
      stepId: step.id,
      status: "completed",
      findings,
      photos,
      actualMinutes,
      damageSeverity,
      measurementValue: step.stepType === "measurement" ? measurementValue : undefined,
      measurementUnit: step.stepType === "measurement" ? measurementUnit : undefined,
      followUpNeeded,
      followUpNote: followUpNeeded ? followUpNote : undefined,
    });
  };

  const handleSkip = () => {
    if (onSkip && skipReason) {
      onSkip(step.id, skipReason);
    }
  };

  // Content to render
  const content = (
    <div className="space-y-6 pb-4">
      {/* Step Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {step.roomName && (
            <Badge variant="secondary" className="text-xs">
              {step.roomName}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs capitalize">
            {step.stepType.replace("_", " ")}
          </Badge>
          {step.required && (
            <Badge variant="destructive" className="text-xs">Required</Badge>
          )}
        </div>
        {step.instructions && (
          <p className="text-sm text-muted-foreground">{step.instructions}</p>
        )}
      </div>

      {/* Skip confirmation */}
      {showSkipConfirm ? (
        <div className="space-y-3 p-4 border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Skip this step?</span>
          </div>
          <Textarea
            placeholder="Enter reason for skipping..."
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowSkipConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleSkip}
              disabled={!skipReason.trim() || isSubmitting}
            >
              Confirm Skip
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Photo Capture */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Photos
              {step.required && !hasEnoughPhotos && (
                <span className="text-xs text-amber-600">
                  ({requiredPhotos} required)
                </span>
              )}
            </Label>
            <CompactPhotoCapture
              photos={photos}
              onPhotosChange={setPhotos}
              minCount={step.required ? requiredPhotos : 0}
              maxCount={10}
              disabled={isSubmitting}
            />
          </div>

          {/* Findings / Observations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                What did you find?
                {step.required && (
                  <span className="text-xs text-muted-foreground">(Required)</span>
                )}
              </Label>
              <div className="flex items-center gap-1">
                <FindingsTemplates
                  onSelect={(text) => setFindings(prev => prev ? `${prev}\n\n${text}` : text)}
                />
                <VoiceButton
                  onTranscript={(text) => setFindings(prev => prev ? `${prev} ${text}` : text)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <Textarea
              placeholder="Describe your observations, findings, or any notable conditions..."
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              className="min-h-[100px]"
              disabled={isSubmitting}
            />
          </div>

          {/* Damage Severity - Quick select */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Damage Severity</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: "none", label: "None", icon: ThumbsUp, color: "text-green-600 border-green-600 bg-green-50" },
                { value: "minor", label: "Minor", icon: Minus, color: "text-amber-600 border-amber-600 bg-amber-50" },
                { value: "moderate", label: "Moderate", icon: AlertTriangle, color: "text-orange-600 border-orange-600 bg-orange-50" },
                { value: "severe", label: "Severe", icon: ThumbsDown, color: "text-red-600 border-red-600 bg-red-50" },
              ].map((option) => {
                const Icon = option.icon;
                const isSelected = damageSeverity === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setDamageSeverity(option.value as any)}
                    disabled={isSubmitting}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors",
                      isSelected ? option.color : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isSelected ? "" : "text-muted-foreground")} />
                    <span className="text-xs font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Measurement Input (for measurement steps) */}
          {step.stepType === "measurement" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Measurement
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Value"
                  value={measurementValue}
                  onChange={(e) => setMeasurementValue(e.target.value)}
                  className="flex-1"
                  disabled={isSubmitting}
                />
                <select
                  value={measurementUnit}
                  onChange={(e) => setMeasurementUnit(e.target.value)}
                  className="px-3 rounded-md border"
                  disabled={isSubmitting}
                >
                  <option value="ft">ft</option>
                  <option value="in">in</option>
                  <option value="sq ft">sq ft</option>
                  <option value="lf">LF</option>
                  <option value="ea">EA</option>
                </select>
              </div>
            </div>
          )}

          {/* Time Tracking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Spent
              </Label>
              <span className="text-sm font-medium">{actualMinutes} min</span>
            </div>
            <Slider
              value={[actualMinutes]}
              onValueChange={([value]) => setActualMinutes(value)}
              min={1}
              max={60}
              step={1}
              disabled={isSubmitting}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 min</span>
              <span>Est: {step.estimatedMinutes || 5} min</span>
              <span>60 min</span>
            </div>
          </div>

          {/* Follow-up Flag */}
          <div className="space-y-2">
            <button
              onClick={() => setFollowUpNeeded(!followUpNeeded)}
              disabled={isSubmitting}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left",
                followUpNeeded
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                  : "border-muted hover:border-muted-foreground/30"
              )}
            >
              <AlertTriangle className={cn(
                "h-5 w-5",
                followUpNeeded ? "text-amber-600" : "text-muted-foreground"
              )} />
              <div className="flex-1">
                <span className="font-medium block">Needs Follow-up</span>
                <span className="text-xs text-muted-foreground">
                  Flag for additional review or action
                </span>
              </div>
              <div className={cn(
                "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                followUpNeeded ? "bg-amber-500 border-amber-500" : "border-muted-foreground/30"
              )}>
                {followUpNeeded && <CheckCircle2 className="h-4 w-4 text-white" />}
              </div>
            </button>

            {followUpNeeded && (
              <Textarea
                placeholder="What needs to be followed up?"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                className="min-h-[60px]"
                disabled={isSubmitting}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  // Check if step can be skipped (not required AND not blocking)
  const canSkip = !step.required && step.blocking !== 'blocking';

  // Footer actions
  const footer = (
    <div className="flex gap-2 w-full">
      {!showSkipConfirm && canSkip && onSkip && (
        <Button
          variant="ghost"
          onClick={() => setShowSkipConfirm(true)}
          disabled={isSubmitting}
        >
          Skip
        </Button>
      )}
      <div className="flex-1" />
      {!showSkipConfirm && (
        <>
          {validationMessage && !canComplete && (
            <div className="text-sm text-destructive flex items-center gap-2 p-2 bg-destructive/10 rounded mr-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{validationMessage}</span>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!canComplete || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Step
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );

  // Use Drawer on mobile, Dialog on desktop
  if (!isDesktop) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="text-left flex-shrink-0">
            <DrawerTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {step.title}
            </DrawerTitle>
            <DrawerDescription>
              Complete this step by documenting your findings
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto flex-1 min-h-0">
            {content}
          </div>
          <DrawerFooter className="pt-2 flex-shrink-0 border-t bg-background">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {step.title}
          </DialogTitle>
          <DialogDescription>
            Complete this step by documenting your findings
          </DialogDescription>
        </DialogHeader>
        {content}
        <DialogFooter>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StepCompletionDialog;
