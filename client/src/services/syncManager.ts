/**
 * Sync Manager
 * 
 * Manages synchronization of offline data when connection is restored.
 * Uses browser navigator.onLine API instead of React Native NetInfo.
 */

import { offlineStorage } from './offlineStorage';
import * as api from '../lib/api';

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

class SyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor() {
    this.initNetworkListener();
  }

  private initNetworkListener() {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      const wasOffline = !this.isOnline;
      this.isOnline = true;
      this.notifyListeners();

      // Auto-sync when coming back online
      if (wasOffline) {
        console.log('[SyncManager] Network restored, starting sync...');
        this.syncAll().catch((err) => {
          console.error('[SyncManager] Auto-sync failed:', err);
        });
      }
    };

    const handleOffline = () => {
      this.isOnline = false;
      this.notifyListeners();
      console.log('[SyncManager] Network disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial state
    this.isOnline = navigator.onLine;
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.isOnline));
  }

  onConnectivityChange(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress');
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: ['Sync already in progress'],
      };
    }

    if (!this.isOnline) {
      console.log('[SyncManager] Cannot sync: offline');
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: ['No network connection'],
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Sync evidence first (photos, voice notes)
      const evidenceResult = await this.syncEvidence();
      result.synced += evidenceResult.synced;
      result.failed += evidenceResult.failed;
      result.errors.push(...evidenceResult.errors);

      // Then sync completions
      const completionResult = await this.syncCompletions();
      result.synced += completionResult.synced;
      result.failed += completionResult.failed;
      result.errors.push(...completionResult.errors);

      // Update last sync timestamp
      await offlineStorage.setLastSync(new Date().toISOString());

      result.success = result.failed === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : 'Unknown sync error'
      );
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  private async syncEvidence(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const pending = await offlineStorage.getPendingEvidence();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const evidence of pending) {
      try {
        const blob = await offlineStorage.getEvidenceBlob(evidence.id);
        if (!blob) {
          throw new Error('Evidence file not found');
        }

        // Create File object from Blob
        const file = new File([blob], evidence.fileName, {
          type: blob.type || 'application/octet-stream',
        });

        if (evidence.type === 'photo') {
          // Upload photo using FormData
          const formData = new FormData();
          formData.append('file', file);
          formData.append('claimId', evidence.claimId);
          formData.append('flowInstanceId', evidence.flowInstanceId);
          formData.append('movementId', evidence.movementId);

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

          // Attach to movement (userId required by API; stored in metadata when queued offline)
          await api.attachMovementEvidence(
            evidence.flowInstanceId,
            evidence.movementId,
            {
              type: 'photo',
              referenceId: photoData.id,
              userId: evidence.metadata?.userId ?? '',
            }
          );
        } else if (evidence.type === 'voice_note') {
          // Upload audio (API expects field name 'audio')
          const formData = new FormData();
          formData.append('audio', file, evidence.fileName || 'voice-note.webm');
          formData.append('claimId', evidence.claimId);
          formData.append('flowInstanceId', evidence.flowInstanceId);
          formData.append('movementId', evidence.movementId);

          const response = await fetch('/api/audio/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to upload audio' }));
            throw new Error(error.error || 'Failed to upload audio');
          }

          const audioData = await response.json();
          if (audioData?.id) {
            await api.attachMovementEvidence(
              evidence.flowInstanceId,
              evidence.movementId,
              {
                type: 'audio',
                referenceId: audioData.id,
                data: { audioUrl: audioData.audioUrl, type: 'voice_note' },
                userId: evidence.metadata?.userId ?? '',
              }
            );
          }
        }

        // Remove from pending
        await offlineStorage.removeEvidence(evidence.id);
        await offlineStorage.removeFromSyncQueue(evidence.id);
        synced++;
      } catch (error) {
        console.error(`[SyncManager] Failed to sync evidence ${evidence.id}:`, error);
        failed++;
        errors.push(
          `Evidence ${evidence.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );

        // Update attempt count in queue
        const queueItem = await this.getQueueItem(evidence.id);
        if (queueItem) {
          await offlineStorage.updateQueueItem(evidence.id, {
            attempts: queueItem.attempts + 1,
            lastAttempt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { synced, failed, errors };
  }

  private async syncCompletions(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const pending = await offlineStorage.getPendingCompletions();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const completion of pending) {
      try {
        await api.completeFlowMovement(
          completion.flowInstanceId,
          completion.movementId,
          {
            userId: completion.evidenceIds[0] || '', // Adjust as needed
            notes: completion.notes,
          }
        );

        // Remove from pending
        await offlineStorage.removeCompletion(completion.id);
        await offlineStorage.removeFromSyncQueue(completion.id);
        synced++;
      } catch (error) {
        console.error(
          `[SyncManager] Failed to sync completion ${completion.id}:`,
          error
        );
        failed++;
        errors.push(
          `Completion ${completion.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );

        // Update attempt count
        const queueItem = await this.getQueueItem(completion.id);
        if (queueItem) {
          await offlineStorage.updateQueueItem(completion.id, {
            attempts: queueItem.attempts + 1,
            lastAttempt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { synced, failed, errors };
  }

  private async getQueueItem(itemId: string) {
    const queue = await offlineStorage.getSyncQueue();
    return queue.find((i) => i.id === itemId);
  }
}

export const syncManager = new SyncManager();
