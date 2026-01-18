/**
 * Start Flow Button Component
 *
 * Button to start a new inspection flow for a claim.
 * Features:
 * - Auto-selects flow based on claim's primaryPeril (no manual selection needed)
 * - Falls back to selection dialog only when:
 *   - No matching flow exists for the claim's peril
 *   - Multiple flows available and user wants to choose
 * - Loading state during flow creation
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "./LoadingButton";
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
  HelpCircle,
  CheckCircle2,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startFlowForClaim, previewFlowSelectionForClaim, type FlowAutoSelectionPreview } from "@/lib/api";

// Peril type icons for display
const PERIL_ICONS: Record<string, { icon: typeof Droplets; color: string }> = {
  'water_damage': { icon: Droplets, color: 'text-blue-500' },
  'water': { icon: Droplets, color: 'text-blue-500' },
  'wind_hail': { icon: Wind, color: 'text-cyan-500' },
  'wind': { icon: Wind, color: 'text-cyan-500' },
  'hail': { icon: Wind, color: 'text-cyan-500' },
  'fire': { icon: Flame, color: 'text-orange-500' },
  'lightning': { icon: Zap, color: 'text-yellow-500' },
  'general': { icon: HelpCircle, color: 'text-gray-500' },
  'other': { icon: HelpCircle, color: 'text-gray-500' },
};

function getPerilIcon(perilType: string | null | undefined) {
  if (!perilType) return PERIL_ICONS['other'];
  const normalized = perilType.toLowerCase().replace(/[\s-]/g, '_');
  return PERIL_ICONS[normalized] || PERIL_ICONS['other'];
}

interface StartFlowButtonProps {
  claimId: string;
  /** Optional: Pre-known peril type from claim (legacy support) */
  perilType?: string | null;
  /** Callback when flow starts successfully */
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
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [preview, setPreview] = useState<FlowAutoSelectionPreview | null>(null);
  const [dialogMode, setDialogMode] = useState<'loading' | 'select' | 'confirm' | 'error'>('loading');

  const handleStartClick = async () => {
    setError(null);
    setIsStarting(true);

    try {
      // Try to auto-start the flow without any dialog
      const result = await startFlowForClaim(claimId);
      onStart(result.flowInstanceId);
    } catch (err) {
      // If auto-start failed, we need to show the dialog
      setIsStarting(false);
      setShowDialog(true);
      setDialogMode('loading');

      try {
        // Get preview to understand what options are available
        const previewResult = await previewFlowSelectionForClaim(claimId);
        setPreview(previewResult);

        if (previewResult.requiresSelection) {
          if (previewResult.availableFlows.length === 0) {
            // No flows available at all
            setDialogMode('error');
            setError(previewResult.message);
          } else {
            // Multiple flows or selection required
            setDialogMode('select');
            setSelectedFlowId(previewResult.availableFlows[0]?.id || '');
          }
        } else if (previewResult.selectedFlow) {
          // A flow was selected but something else failed - show confirmation
          setDialogMode('confirm');
          setSelectedFlowId(previewResult.selectedFlow.id);
        } else {
          setDialogMode('error');
          setError(err instanceof Error ? err.message : 'Failed to start flow');
        }
      } catch (previewErr) {
        setDialogMode('error');
        setError(err instanceof Error ? err.message : 'Failed to start flow');
      }
    }
  };

  const handleConfirmStart = async () => {
    if (!selectedFlowId && preview?.availableFlows?.length === 0) {
      setError('No inspection flow available');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      // Find the selected flow to get its peril type
      const selectedFlow = preview?.availableFlows.find(f => f.id === selectedFlowId);
      const perilTypeToUse = selectedFlow?.perilType || perilType;

      const result = await startFlowForClaim(claimId, perilTypeToUse || undefined);
      setShowDialog(false);
      onStart(result.flowInstanceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start flow');
    } finally {
      setIsStarting(false);
    }
  };

  const selectedFlow = preview?.availableFlows.find(f => f.id === selectedFlowId);
  const selectedPerilIcon = getPerilIcon(selectedFlow?.perilType);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn("gap-2", className)}
        onClick={handleStartClick}
        disabled={disabled || isLoading || isStarting}
      >
        {(isLoading || isStarting) ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        {isStarting ? 'Starting...' : 'Start Inspection Flow'}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'loading' && 'Preparing Flow...'}
              {dialogMode === 'select' && 'Select Inspection Flow'}
              {dialogMode === 'confirm' && 'Confirm Flow Selection'}
              {dialogMode === 'error' && 'Cannot Start Flow'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'loading' && 'Loading available inspection flows...'}
              {dialogMode === 'select' && 'Choose which inspection flow to use for this claim.'}
              {dialogMode === 'confirm' && 'Ready to start the inspection flow for this claim.'}
              {dialogMode === 'error' && 'There was a problem starting the inspection flow.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Loading State */}
            {dialogMode === 'loading' && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Flow Selection */}
            {dialogMode === 'select' && preview && (
              <>
                {preview.claimPerilType && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Claim peril type: <strong>{preview.claimPerilType}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="flowSelect">Available Flows</Label>
                  <Select
                    value={selectedFlowId}
                    onValueChange={(value) => {
                      setSelectedFlowId(value);
                      setError(null);
                    }}
                  >
                    <SelectTrigger id="flowSelect">
                      <SelectValue placeholder="Select a flow">
                        {selectedFlow && (
                          <div className="flex items-center gap-2">
                            <selectedPerilIcon.icon className={cn("h-4 w-4", selectedPerilIcon.color)} />
                            {selectedFlow.name}
                          </div>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {preview.availableFlows.map((flow) => {
                        const icon = getPerilIcon(flow.perilType);
                        return (
                          <SelectItem key={flow.id} value={flow.id}>
                            <div className="flex items-center gap-2">
                              <icon.icon className={cn("h-4 w-4", icon.color)} />
                              <div>
                                <div>{flow.name}</div>
                                {flow.description && (
                                  <div className="text-xs text-muted-foreground">{flow.description}</div>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-sm text-muted-foreground">
                  {preview.message}
                </p>
              </>
            )}

            {/* Confirmation */}
            {dialogMode === 'confirm' && preview?.selectedFlow && (
              <>
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Ready to start <strong>{preview.selectedFlow.name}</strong>
                  </AlertDescription>
                </Alert>

                {preview.claimPerilType && (
                  <p className="text-sm text-muted-foreground">
                    Based on claim peril type: {preview.claimPerilType}
                  </p>
                )}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Once started, the flow will guide you through each inspection step.
                    You can pause and resume at any time.
                  </AlertDescription>
                </Alert>
              </>
            )}

            {/* Error State */}
            {dialogMode === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error || 'No inspection flow is available for this claim type.'}
                </AlertDescription>
              </Alert>
            )}

            {/* General Error Message */}
            {error && dialogMode !== 'error' && (
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
            {dialogMode !== 'loading' && dialogMode !== 'error' && (
              <LoadingButton
                onClick={handleConfirmStart}
                loading={isStarting}
                loadingText="Starting..."
                disabled={!selectedFlowId && !preview?.selectedFlow}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Start Flow
              </LoadingButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default StartFlowButton;
