/**
 * Start Flow Button Component
 *
 * Button to start a new inspection flow for a claim.
 * Features:
 * - Peril type selection (if not known)
 * - Confirmation dialog before starting
 * - Loading state during flow creation
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "./LoadingButton";
import { ErrorBanner } from "./ErrorBanner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PlayCircle,
  Loader2,
  Droplets,
  Wind,
  Flame,
  AlertCircle,
  Zap,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

// Common peril types with icons
const PERIL_OPTIONS = [
  { value: 'water_damage', label: 'Water Damage', icon: Droplets, color: 'text-blue-500' },
  { value: 'wind_hail', label: 'Wind / Hail', icon: Wind, color: 'text-cyan-500' },
  { value: 'fire', label: 'Fire', icon: Flame, color: 'text-orange-500' },
  { value: 'lightning', label: 'Lightning', icon: Zap, color: 'text-yellow-500' },
  { value: 'other', label: 'Other', icon: HelpCircle, color: 'text-gray-500' },
];

interface StartFlowButtonProps {
  claimId: string;
  perilType?: string | null;
  onStart: (flowId: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function StartFlowButton({
  claimId,
  perilType,
  onStart,
  isLoading = false,
  disabled = false,
  variant = 'default',
  size = 'default',
  className,
}: StartFlowButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedPeril, setSelectedPeril] = useState<string>(perilType || '');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartClick = () => {
    // If peril type is known, show confirmation
    // If not, show selection dialog
    setSelectedPeril(perilType || '');
    setError(null);
    setShowDialog(true);
  };

  const handleConfirmStart = async () => {
    if (!selectedPeril) {
      setError('Please select a peril type');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      // Import and call the API function
      const { startFlowForClaim } = await import('@/lib/api');
      const result = await startFlowForClaim(claimId, selectedPeril);
      setShowDialog(false);
      onStart(result.flowInstanceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start flow');
    } finally {
      setIsStarting(false);
    }
  };

  const selectedOption = PERIL_OPTIONS.find(p => p.value === selectedPeril);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn("gap-2", className)}
        onClick={handleStartClick}
        disabled={disabled || isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        Start Inspection Flow
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Inspection Flow</DialogTitle>
            <DialogDescription>
              Begin a guided inspection flow for this claim. The flow will walk you
              through all required evidence collection steps based on the peril type.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Peril Selection */}
            <div className="space-y-2">
              <Label htmlFor="perilType">Peril Type</Label>
              <Select
                value={selectedPeril}
                onValueChange={(value) => {
                  setSelectedPeril(value);
                  setError(null);
                }}
              >
                <SelectTrigger id="perilType">
                  <SelectValue placeholder="Select peril type">
                    {selectedOption && (
                      <div className="flex items-center gap-2">
                        <selectedOption.icon className={cn("h-4 w-4", selectedOption.color)} />
                        {selectedOption.label}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PERIL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className={cn("h-4 w-4", option.color)} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {perilType && (
                <p className="text-xs text-muted-foreground">
                  Pre-selected based on claim information. You can change if needed.
                </p>
              )}
            </div>

            {/* Info Alert */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Once started, the flow will guide you through each inspection step.
                You can pause and resume at any time.
              </AlertDescription>
            </Alert>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <LoadingButton
              onClick={handleConfirmStart}
              loading={isStarting}
              loadingText="Starting..."
              disabled={!selectedPeril}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Start Flow
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default StartFlowButton;
