/**
 * useFlowActions Hook
 * 
 * Provides offline-aware flow actions (complete movement, capture photo, etc.)
 */

import { useState } from 'react';
import { syncManager } from '../services/syncManager';
import { offlineStorage } from '../services/offlineStorage';
import * as api from '../lib/api';
import { toast } from 'sonner';

export function useFlowActions(flowInstanceId: string, userId: string) {
  const [isLoading, setIsLoading] = useState(false);

  // Complete movement with offline support
  const completeMovement = async (
    movementId: string,
    data: {
      notes?: string;
      photos?: string[];
      audioId?: string;
      measurements?: any;
    }
  ) => {
    setIsLoading(true);

    try {
      if (syncManager.getIsOnline()) {
        // Online: call API directly
        const result = await api.completeFlowMovement(flowInstanceId, movementId, {
          userId,
          notes: data.notes,
          evidence: {
            photos: data.photos || [],
            audioId: data.audioId,
            measurements: data.measurements,
          },
        });
        return { success: true, result, offline: false };
      } else {
        // Offline: queue for later
        const queued = await offlineStorage.queueCompletion({
          flowInstanceId,
          movementId,
          notes: data.notes,
          completedAt: new Date().toISOString(),
          evidenceIds: data.photos || [],
        });

        // Update local flow state optimistically
        await updateLocalFlowState(flowInstanceId, movementId);

        toast.success('Movement completed (offline - will sync when online)');
        return { success: true, result: queued, offline: true };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to complete movement';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Capture photo with offline support
  const capturePhoto = async (
    file: File,
    movementId: string,
    claimId: string,
    metadata?: any
  ) => {
    try {
      if (syncManager.getIsOnline()) {
        // Online: upload immediately
        const formData = new FormData();
        formData.append('file', file);
        formData.append('claimId', claimId);
        formData.append('flowInstanceId', flowInstanceId);
        formData.append('movementId', movementId);

        const response = await fetch('/api/photos/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to upload photo');
        }

        const photoData = await response.json();

        // Attach to movement
        await api.attachMovementEvidence(flowInstanceId, movementId, {
          type: 'photo',
          referenceId: photoData.id,
        });

        return { success: true, photo: photoData, offline: false };
      } else {
        // Offline: save locally and queue
        const queued = await offlineStorage.queueEvidence({
          type: 'photo',
          fileData: file,
          fileName: file.name,
          flowInstanceId,
          movementId,
          claimId,
          metadata: metadata || {},
        });

        toast.info('Photo saved offline - will upload when online');
        return { success: true, photo: queued, offline: true };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to capture photo';
      toast.error(message);
      throw error;
    }
  };

  // Record voice note with offline support
  const recordVoiceNote = async (
    audioBlob: Blob,
    movementId: string,
    claimId: string,
    metadata?: any
  ) => {
    try {
      if (syncManager.getIsOnline()) {
        // Online: upload immediately
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice-note.m4a');
        formData.append('claimId', claimId);
        formData.append('flowInstanceId', flowInstanceId);
        formData.append('movementId', movementId);

        const response = await fetch('/api/audio/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to upload audio');
        }

        const audioData = await response.json();
        return { success: true, audio: audioData, offline: false };
      } else {
        // Offline: save locally and queue
        const queued = await offlineStorage.queueEvidence({
          type: 'voice_note',
          fileData: audioBlob,
          fileName: 'voice-note.m4a',
          flowInstanceId,
          movementId,
          claimId,
          metadata: metadata || {},
        });

        toast.info('Voice note saved offline - will upload when online');
        return { success: true, audio: queued, offline: true };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to record voice note';
      toast.error(message);
      throw error;
    }
  };

  return {
    isLoading,
    completeMovement,
    capturePhoto,
    recordVoiceNote,
  };
}

// Helper: Update local flow state after offline completion
async function updateLocalFlowState(
  flowInstanceId: string,
  completedMovementId: string
) {
  const cached = await offlineStorage.getCachedFlow(flowInstanceId);
  if (!cached) return;

  // Mark movement as complete locally
  // This is optimistic—will reconcile on sync
  const movementKey = `${cached.currentPhaseId}:${completedMovementId}`;
  const completedMovements = cached.completedMovements || [];
  if (!completedMovements.includes(movementKey)) {
    cached.completedMovements = [...completedMovements, movementKey];
    await offlineStorage.cacheFlow(cached);
  }
}
