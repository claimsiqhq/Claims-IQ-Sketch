/**
 * Movement Execution Page
 *
 * Execute a single movement - capture evidence, add notes, mark complete.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Mic,
  FileText,
  Check,
  X,
  SkipForward,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Lock,
  Info,
  Square
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFlowInstance,
  getPhaseMovements,
  getNextMovement,
  completeFlowMovement,
  skipFlowMovement,
  attachMovementEvidence,
  getMovementEvidence,
  uploadPhoto,
  type FlowInstance,
  type FlowMovement,
  type MovementEvidence,
} from "@/lib/api";
import { EvidenceGrid, LoadingButton, ErrorBanner, EmptyState } from "@/components/flow";
import { useStore } from "@/lib/store";
import { offlineStorage } from "@/services/offlineStorage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CapturedPhoto {
  id: string;
  dataUrl: string;
  file?: File;
  label?: string;
}

export default function MovementExecutionPage() {
  const [, params] = useRoute("/flows/:flowId/movements/:movementId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useStore();

  const flowId = params?.flowId;
  const movementId = params?.movementId;

  // Local state
  const [notes, setNotes] = useState('');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [showSketch, setShowSketch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch flow instance
  const {
    data: flowInstance,
    isLoading: isLoadingFlow,
    error: flowError,
  } = useQuery({
    queryKey: ['flowInstance', flowId],
    queryFn: async () => {
      try {
        const flowData = await getFlowInstance(flowId!);
        // Cache for offline access
        await offlineStorage.cacheFlow(flowData);
        return flowData;
      } catch (error) {
        // Try to load from cache if online fetch fails
        const cached = await offlineStorage.getCachedFlow(flowId!);
        if (cached) {
          return cached;
        }
        throw error;
      }
    },
    enabled: !!flowId,
  });

  // Fetch movements for current phase to find our movement
  const {
    data: movements,
    isLoading: isLoadingMovements,
  } = useQuery({
    queryKey: ['phaseMovements', flowId, flowInstance?.currentPhaseId],
    queryFn: () => getPhaseMovements(flowId!, flowInstance!.currentPhaseId!),
    enabled: !!flowId && !!flowInstance?.currentPhaseId,
  });

  // Find current movement
  const movement = movements?.find(m => m.id === movementId);

  // Fetch existing evidence
  const {
    data: existingEvidence,
    isLoading: isLoadingEvidence,
  } = useQuery({
    queryKey: ['movementEvidence', flowId, movementId],
    queryFn: () => getMovementEvidence(flowId!, movementId!),
    enabled: !!flowId && !!movementId,
  });

  // Complete movement mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const isOnline = syncManager.getIsOnline();
      const uploadedPhotoIds: string[] = [];

      // Upload photos first (if online)
      if (isOnline) {
        setIsUploading(true);
        try {
          for (const photo of capturedPhotos) {
            const file = photo.file || await fetch(photo.dataUrl)
              .then(r => r.blob())
              .then(blob => new File([blob], `movement-${Date.now()}.jpg`, { type: 'image/jpeg' }));

            const result = await uploadPhoto({
              claimId: flowInstance!.claimId,
              file,
              label: photo.label || movement?.name || 'Movement Photo',
              hierarchyPath: `Flow / ${flowInstance?.flowName || 'Inspection'} / ${movement?.name || 'Movement'}`,
            });

            if (result?.photo?.id) {
              uploadedPhotoIds.push(result.photo.id);

              // Attach to movement
              await attachMovementEvidence(flowId!, movementId!, {
                type: 'photo',
                referenceId: result.photo.id,
                userId: user.id,
              });
            }
          }
        } finally {
          setIsUploading(false);
        }
      } else {
        // Offline: queue photos for later upload
        for (const photo of capturedPhotos) {
          const file = photo.file || await fetch(photo.dataUrl)
            .then(r => r.blob())
            .then(blob => new File([blob], `movement-${Date.now()}.jpg`, { type: 'image/jpeg' }));
          
          await offlineStorage.queueEvidence({
            type: 'photo',
            fileData: file,
            fileName: file.name,
            flowInstanceId: flowId!,
            movementId: movementId!,
            claimId: flowInstance!.claimId,
            metadata: { label: photo.label || movement?.name },
          });
        }
      }

      // Complete the movement
      if (isOnline) {
        return completeFlowMovement(flowId!, movementId!, {
          userId: user.id,
          notes: notes || undefined,
          evidence: {
            photos: uploadedPhotoIds,
          },
        });
      } else {
        // Offline: queue completion
        const queued = await offlineStorage.queueCompletion({
          flowInstanceId: flowId!,
          movementId: movementId!,
          notes: notes || undefined,
          completedAt: new Date().toISOString(),
          evidenceIds: uploadedPhotoIds,
        });
        return queued as any; // Return queued item for optimistic update
      }
    },
    onSuccess: async () => {
      const isOnline = syncManager.getIsOnline();
      if (isOnline) {
        toast.success('Movement completed');
      } else {
        toast.success('Movement completed (offline - will sync when online)');
      }

      // Invalidate queries (only if online)
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['flowInstance', flowId] });
        queryClient.invalidateQueries({ queryKey: ['flowPhases', flowId] });
        queryClient.invalidateQueries({ queryKey: ['nextMovement', flowId] });
        queryClient.invalidateQueries({ queryKey: ['phaseMovements', flowId] });
      }

      // Navigate to next movement or back to flow progress
      try {
        if (isOnline) {
          const next = await getNextMovement(flowId!);
          if (next.type === 'movement' && next.movement) {
            setLocation(`/flows/${flowId}/movements/${next.movement.id}`);
          } else {
            setLocation(`/flows/${flowId}`);
          }
        } else {
          // Offline: optimistic navigation (may need adjustment based on cached flow state)
          setLocation(`/flows/${flowId}`);
        }
      } catch {
        setLocation(`/flows/${flowId}`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to complete movement');
    },
  });

  // Skip movement mutation
  const skipMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      return skipFlowMovement(flowId!, movementId!, {
        userId: user.id,
        reason,
      });
    },
    onSuccess: async () => {
      toast.success('Movement skipped');
      setShowSkipDialog(false);

      // Invalidate and navigate
      queryClient.invalidateQueries({ queryKey: ['flowInstance', flowId] });
      queryClient.invalidateQueries({ queryKey: ['flowPhases', flowId] });
      queryClient.invalidateQueries({ queryKey: ['nextMovement', flowId] });

      try {
        const next = await getNextMovement(flowId!);
        if (next.type === 'movement' && next.movement) {
          setLocation(`/flows/${flowId}/movements/${next.movement.id}`);
        } else {
          setLocation(`/flows/${flowId}`);
        }
      } catch {
        setLocation(`/flows/${flowId}`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to skip movement');
    },
  });

  // Handle photo capture
  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedPhotos(prev => [
          ...prev,
          {
            id: `photo-${Date.now()}-${Math.random()}`,
            dataUrl: event.target?.result as string,
            file,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Remove captured photo
  const handleRemovePhoto = (id: string) => {
    setCapturedPhotos(prev => prev.filter(p => p.id !== id));
  };

  // Loading state
  if (isLoadingFlow || isLoadingMovements) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  // Error or not found
  if (flowError || !flowInstance || !movement) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <ErrorBanner
            message={flowError instanceof Error ? flowError.message : 'Movement not found'}
          />
          <EmptyState
            icon="⚠️"
            title="Movement not found"
            description="This movement could not be loaded. It may have been removed or you may not have access to it."
            action={
              <Button
                variant="outline"
                onClick={() => setLocation(`/flows/${flowId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Flow
              </Button>
            }
          />
        </div>
      </Layout>
    );
  }

  const isSubmitting = completeMutation.isPending || isUploading;
  const hasEvidence = capturedPhotos.length > 0 || (existingEvidence && existingEvidence.length > 0);

  // Convert existing evidence to grid format
  const existingEvidenceItems = existingEvidence?.map(e => ({
    id: e.id,
    type: e.type,
    url: e.referenceId, // Assuming this is the photo URL or can be resolved
    label: e.type === 'note' ? 'Note' : undefined,
    data: e.data,
    createdAt: e.createdAt,
  })) || [];

  // Convert captured photos to grid format
  const capturedPhotoItems = capturedPhotos.map(p => ({
    id: p.id,
    type: 'photo' as const,
    url: p.dataUrl,
    thumbnailUrl: p.dataUrl,
    label: p.label,
  }));

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/flows/${flowId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{movement.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {flowInstance.currentPhaseName && (
                  <Badge variant="outline">{flowInstance.currentPhaseName}</Badge>
                )}
                {movement.isRequired && (
                  <Badge variant="destructive" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Required
                  </Badge>
                )}
                {movement.roomName && (
                  <Badge variant="secondary">{movement.roomName}</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Instructions */}
            {movement.description && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{movement.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Evidence Capture */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Evidence Capture
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Capture Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    ref={fileInputRef}
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    disabled // Voice note feature placeholder
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Voice Note
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 min-w-[120px]"
                    onClick={() => setShowSketch(true)}
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Sketch
                  </Button>
                </div>

                {/* Captured Photos Preview */}
                {capturedPhotos.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">New Photos ({capturedPhotos.length})</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {capturedPhotos.map((photo) => (
                        <div key={photo.id} className="relative aspect-square">
                          <img
                            src={photo.dataUrl}
                            alt="Captured"
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <Button
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => handleRemovePhoto(photo.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <button
                        className="aspect-square border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing Evidence */}
                {existingEvidenceItems.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Previously Captured</Label>
                    <EvidenceGrid
                      items={existingEvidenceItems}
                      columns={3}
                    />
                  </div>
                )}

                {/* Empty State */}
                {capturedPhotos.length === 0 && existingEvidenceItems.length === 0 && (
                  <EmptyState
                    icon={<Camera className="h-8 w-8 mx-auto opacity-50" />}
                    title="No evidence captured yet"
                    description="Take a photo, record a voice note, or add a sketch to document this movement."
                  />
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add notes about this movement..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </CardContent>
            </Card>

            {/* Validation Requirements */}
            {movement.validationRequirements && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Requirements:</span>
                  <ul className="list-disc list-inside mt-1 text-sm">
                    {Object.entries(movement.validationRequirements).map(([key, value]) => (
                      <li key={key}>{key}: {String(value)}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>
        
        {/* Sketch Dialog */}
        <Dialog open={showSketch} onOpenChange={setShowSketch}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Sketch Documentation</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <FlowSketchCapture
                flowInstanceId={flowId!}
                movementId={movementId!}
                claimId={flowInstance!.claimId}
                movementName={movement.name}
                onZoneCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ['movementEvidence', flowId, movementId] });
                  queryClient.invalidateQueries({ queryKey: ['movementSketchEvidence', flowId, movementId] });
                  toast.success('Zone created');
                }}
                onDamageAdded={() => {
                  queryClient.invalidateQueries({ queryKey: ['movementEvidence', flowId, movementId] });
                  queryClient.invalidateQueries({ queryKey: ['movementSketchEvidence', flowId, movementId] });
                  toast.success('Damage marker added');
                }}
                onClose={() => setShowSketch(false)}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Bottom Actions */}
        <div className="border-t p-4 bg-background space-y-3">
          <div className="flex gap-3">
            {/* Skip Button */}
            {!movement.isRequired && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSkipDialog(true)}
                disabled={isSubmitting}
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip
              </Button>
            )}

            {/* Complete Button */}
            <LoadingButton
              className="flex-1"
              onClick={() => completeMutation.mutate()}
              loading={isSubmitting}
              loadingText={isUploading ? 'Uploading photos...' : 'Completing...'}
              disabled={movement.isRequired && !hasEvidence && !notes}
            >
              <Check className="h-4 w-4 mr-2" />
              Complete
            </LoadingButton>
          </div>

          {/* Required notice */}
          {movement.isRequired && !hasEvidence && !notes && (
            <p className="text-xs text-center text-muted-foreground">
              This is a required movement. Please capture evidence or add notes.
            </p>
          )}
        </div>

        {/* Skip Dialog */}
        <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Skip Movement</DialogTitle>
              <DialogDescription>
                Please provide a reason for skipping this movement.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="skipReason">Reason</Label>
              <Textarea
                id="skipReason"
                placeholder="Enter reason for skipping..."
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowSkipDialog(false)}
              >
                Cancel
              </Button>
              <LoadingButton
                onClick={() => skipMutation.mutate(skipReason)}
                loading={skipMutation.isPending}
                loadingText="Skipping..."
                disabled={!skipReason.trim()}
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip Movement
              </LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
