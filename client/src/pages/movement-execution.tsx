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
  uploadAudio,
  type FlowInstance,
  type FlowMovement,
  type MovementEvidence,
} from "@/lib/api";
import { EvidenceGrid, LoadingButton, ErrorBanner, EmptyState, FlowSketchCapture } from "@/components/flow";
import { syncManager } from "@/services/syncManager";
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
  
  // Voice recording state
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [savedVoiceNotes, setSavedVoiceNotes] = useState<{ id: string; timestamp: string; audioUrl?: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

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
            try {
              const file = photo.file || await fetch(photo.dataUrl)
                .then(r => r.blob())
                .then(blob => new File([blob], `movement-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`, { type: 'image/jpeg' }));

              const result = await uploadPhoto({
                claimId: flowInstance!.claimId,
                file,
                label: photo.label || movement?.name || 'Movement Photo',
                hierarchyPath: `Flow / ${flowInstance?.flowName || 'Inspection'} / ${movement?.name || 'Movement'}`,
              });

              // uploadPhoto returns UploadedPhoto directly (has .id property)
              if (result?.id) {
                uploadedPhotoIds.push(result.id);

                // Attach to movement evidence
                await attachMovementEvidence(flowId!, movementId!, {
                  type: 'photo',
                  referenceId: result.id,
                  userId: user.id,
                });
              } else {
                console.error('Photo upload response missing ID:', result);
                toast.error('Photo uploaded but missing ID - check console');
              }
            } catch (photoError) {
              console.error('Failed to upload photo:', photoError);
              toast.error(`Failed to upload photo: ${photoError instanceof Error ? photoError.message : 'Unknown error'}`);
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
            metadata: { label: photo.label || movement?.name, userId: user.id },
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

      // Invalidate and refetch queries (only if online)
      if (isOnline) {
        // Invalidate all related queries
        queryClient.invalidateQueries({ queryKey: ['flowInstance', flowId] });
        queryClient.invalidateQueries({ queryKey: ['flowPhases', flowId] });
        queryClient.invalidateQueries({ queryKey: ['nextMovement', flowId] });
        queryClient.invalidateQueries({ queryKey: ['phaseMovements', flowId] });

        // CRITICAL: Refetch flow instance to ensure we have the latest completed_movements array
        // before calling getNextMovement. Without this, getNextMovement may use stale data
        // and return the same movement we just completed.
        await queryClient.refetchQueries({ queryKey: ['flowInstance', flowId] });
      }

      // Navigate to next movement or back to flow progress
      try {
        if (isOnline) {
          const next = await getNextMovement(flowId!);
          
          // Check if next movement is different from current (prevents staying on same step)
          if (next.type === 'movement' && next.movement) {
            if (next.movement.id === movementId) {
              // Same movement returned - backend might not have updated yet
              // Wait a moment and retry once
              console.warn('Next movement is same as current, retrying after delay...');
              await new Promise(resolve => setTimeout(resolve, 500));
              const retryNext = await getNextMovement(flowId!);
              
              if (retryNext.type === 'movement' && retryNext.movement && retryNext.movement.id !== movementId) {
                setLocation(`/flows/${flowId}/movements/${retryNext.movement.id}`);
              } else {
                // Still same or no movement - go to flow progress
                setLocation(`/flows/${flowId}`);
              }
            } else {
              // Different movement - navigate to it
              setLocation(`/flows/${flowId}/movements/${next.movement.id}`);
            }
          } else {
            // No more movements or flow complete - go to flow progress
            setLocation(`/flows/${flowId}`);
          }
        } else {
          // Offline: optimistic navigation (may need adjustment based on cached flow state)
          setLocation(`/flows/${flowId}`);
        }
      } catch (error) {
        console.error('Failed to get next movement:', error);
        // If we can't get next movement, go back to flow progress
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

  // Ref for timer so interval always sees current value (avoids stale closure)
  const recordingElapsedRef = useRef(0);

  // Voice recording handlers
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer audio/webm; Safari and some browsers need no mimeType (browser default)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const blobType = mediaRecorder.mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      recordingElapsedRef.current = 0;
      setRecordingTime(0);
      setShowVoiceRecorder(true);
      setIsRecording(true);

      // Timer: increment ref and set state so UI updates every second
      recordingTimerRef.current = setInterval(() => {
        recordingElapsedRef.current += 1;
        setRecordingTime(recordingElapsedRef.current);
      }, 1000);
    } catch (err) {
      toast.error('Could not access microphone');
      console.error('Microphone access error:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      recordingElapsedRef.current = 0;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAudioBlob(null);
    setRecordingTime(0);
    recordingElapsedRef.current = 0;
    setShowVoiceRecorder(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const saveVoiceNote = useCallback(async () => {
    if (!audioBlob || !flowInstance?.claimId) {
      toast.error('No recording to save');
      return;
    }

    const isOnline = syncManager.getIsOnline();

    if (!isOnline) {
      // Offline: queue voice note for sync when back online
      try {
        const fileName = `voice-note-${Date.now()}.${audioBlob.type?.includes('webm') ? 'webm' : 'webm'}`;
        await offlineStorage.queueEvidence({
          type: 'voice_note',
          fileData: audioBlob,
          fileName,
          flowInstanceId: flowId!,
          movementId: movementId!,
          claimId: flowInstance.claimId,
          metadata: { userId: user?.id },
        });
        toast.success('Voice note saved for sync when online');
        setAudioBlob(null);
        setRecordingTime(0);
        setShowVoiceRecorder(false);
        queryClient.invalidateQueries({ queryKey: ['movementEvidence', flowId, movementId] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save voice note for sync');
      }
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadAudio({
        file: audioBlob,
        claimId: flowInstance.claimId,
        flowInstanceId: flowId ?? undefined,
        movementId: movementId ?? undefined,
      });

      if (!result?.id) {
        throw new Error('Server did not return a voice note ID');
      }

      // Track saved voice note for display with audio URL for playback
      setSavedVoiceNotes(prev => [...prev, {
        id: result.id,
        timestamp: new Date().toLocaleTimeString(),
        audioUrl: result.audioUrl ?? undefined,
      }]);

      // Attach to movement evidence if we have a movement
      if (flowId && movementId && user?.id) {
        try {
          await attachMovementEvidence(flowId, movementId, {
            type: 'audio',
            referenceId: result.id,
            data: { audioUrl: result.audioUrl, type: 'voice_note' },
            userId: user.id,
          });
        } catch (attachErr) {
          console.warn('Could not attach audio to movement evidence:', attachErr);
        }
      }

      toast.success('Voice note saved');
      setAudioBlob(null);
      setRecordingTime(0);
      setShowVoiceRecorder(false);
      queryClient.invalidateQueries({ queryKey: ['movementEvidence', flowId, movementId] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save voice note';
      toast.error(message);
      setShowVoiceRecorder(false);
      setAudioBlob(null);
      setRecordingTime(0);
    } finally {
      setIsUploading(false);
    }
  }, [audioBlob, flowInstance?.claimId, flowId, movementId, user?.id, queryClient]);

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

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
  const hasEvidence = capturedPhotos.length > 0 || savedVoiceNotes.length > 0 || (existingEvidence && existingEvidence.length > 0);

  // Convert existing evidence to grid format
  const existingEvidenceItems = existingEvidence?.map(e => ({
    id: e.id,
    type: e.type,
    url: e.type === 'audio' 
      ? (e.data?.audioUrl || e.data?.publicUrl) 
      : (e.data?.publicUrl || e.referenceId),
    label: e.type === 'note' ? 'Note' : e.type === 'audio' ? 'Voice Note' : undefined,
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
                    className={cn(
                      "flex-1 min-w-[120px]",
                      showVoiceRecorder && "ring-2 ring-red-500"
                    )}
                    onClick={startRecording}
                    disabled={isRecording || showVoiceRecorder}
                    data-testid="button-voice-note"
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

                {/* Voice Recording Panel */}
                {showVoiceRecorder && (
                  <div className="p-4 bg-muted rounded-lg border" data-testid="voice-recorder-panel">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          isRecording ? "bg-red-500 animate-pulse" : "bg-gray-400"
                        )} />
                        <span className="font-mono text-lg">
                          {formatRecordingTime(recordingTime)}
                        </span>
                        {isRecording && (
                          <span className="text-sm text-muted-foreground">Recording...</span>
                        )}
                        {!isRecording && audioBlob && (
                          <span className="text-sm text-green-600">Ready to save</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isRecording ? (
                        <Button
                          variant="destructive"
                          onClick={stopRecording}
                          className="flex-1"
                          data-testid="button-stop-recording"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      ) : audioBlob ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={cancelRecording}
                            className="flex-1"
                            disabled={isUploading}
                            data-testid="button-discard-recording"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Discard
                          </Button>
                          <Button
                            onClick={saveVoiceNote}
                            className="flex-1"
                            disabled={isUploading}
                            data-testid="button-save-recording"
                          >
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-2" />
                            )}
                            Save
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={cancelRecording}
                          className="flex-1"
                          data-testid="button-cancel-recording"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Saved Voice Notes Display */}
                {savedVoiceNotes.length > 0 && (
                  <div className="space-y-2" data-testid="saved-voice-notes">
                    <Label className="text-sm">Voice Notes ({savedVoiceNotes.length})</Label>
                    <div className="space-y-2">
                      {savedVoiceNotes.map((note) => (
                        <div 
                          key={note.id} 
                          className="flex flex-col gap-2 p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <Mic className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">Voice Note</p>
                              <p className="text-xs text-muted-foreground">Saved at {note.timestamp}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              Transcribing...
                            </Badge>
                          </div>
                          {note.audioUrl && (
                            <audio controls className="w-full h-8">
                              <source src={note.audioUrl} />
                            </audio>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                {capturedPhotos.length === 0 && savedVoiceNotes.length === 0 && existingEvidenceItems.length === 0 && (
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Evidence Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.isArray(movement.validationRequirements) ? (
                    // Handle array of requirement objects
                    (() => {
                      const required = movement.validationRequirements.filter((req: any) => req.is_required === true);
                      const optional = movement.validationRequirements.filter((req: any) => req.is_required !== true);
                      
                      return (
                        <div className="space-y-3">
                          {required.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                                <span className="text-xs text-muted-foreground">Must be completed</span>
                              </div>
                              <ul className="space-y-1.5 ml-1">
                                {required.map((req: any, index: number) => (
                                  <li key={index} className="text-sm flex items-start gap-2">
                                    <span className="text-muted-foreground mt-0.5">•</span>
                                    <div className="flex-1">
                                      <span className="font-medium capitalize">{req.type?.replace(/_/g, ' ') || 'Evidence'}</span>
                                      {req.description && (
                                        <span className="text-muted-foreground ml-1">— {req.description}</span>
                                      )}
                                      {req.quantity_min !== undefined && req.quantity_max !== undefined && (
                                        <span className="text-muted-foreground ml-1">
                                          ({req.quantity_min === req.quantity_max 
                                            ? `${req.quantity_min}` 
                                            : `${req.quantity_min}-${req.quantity_max}`} 
                                          {req.type === 'photo' ? ' photo' + (req.quantity_max > 1 ? 's' : '') 
                                            : req.type === 'voice_note' ? ' note' + (req.quantity_max > 1 ? 's' : '')
                                            : ' item' + (req.quantity_max > 1 ? 's' : '')})
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {optional.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className="text-xs">Optional</Badge>
                                <span className="text-xs text-muted-foreground">Recommended but not required</span>
                              </div>
                              <ul className="space-y-1.5 ml-1">
                                {optional.map((req: any, index: number) => (
                                  <li key={index} className="text-sm flex items-start gap-2">
                                    <span className="text-muted-foreground mt-0.5">•</span>
                                    <div className="flex-1">
                                      <span className="font-medium capitalize">{req.type?.replace(/_/g, ' ') || 'Evidence'}</span>
                                      {req.description && (
                                        <span className="text-muted-foreground ml-1">— {req.description}</span>
                                      )}
                                      {req.quantity_min !== undefined && req.quantity_max !== undefined && (
                                        <span className="text-muted-foreground ml-1">
                                          ({req.quantity_min === req.quantity_max 
                                            ? `${req.quantity_min}` 
                                            : `${req.quantity_min}-${req.quantity_max}`} 
                                          {req.type === 'photo' ? ' photo' + (req.quantity_max > 1 ? 's' : '') 
                                            : req.type === 'voice_note' ? ' note' + (req.quantity_max > 1 ? 's' : '')
                                            : ' item' + (req.quantity_max > 1 ? 's' : '')})
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : typeof movement.validationRequirements === 'object' ? (
                    // Handle object with key-value pairs (fallback)
                    <div className="text-sm text-muted-foreground">
                      <p>Requirements data format not recognized. Please check the flow definition.</p>
                    </div>
                  ) : (
                    // Handle primitive value (fallback)
                    <div className="text-sm">{String(movement.validationRequirements)}</div>
                  )}
                </CardContent>
              </Card>
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
