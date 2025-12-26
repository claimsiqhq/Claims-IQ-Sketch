/**
 * Upload Queue Store - Manages background document uploads
 *
 * This store provides:
 * - Persistent upload queue that survives navigation
 * - Concurrent upload management (up to 4 simultaneous)
 * - Automatic retry on failures
 * - Progress tracking per file
 * - Processing status polling
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// TYPES
// ============================================

export type DocumentUploadType = 'fnol' | 'policy' | 'endorsement' | 'photo' | 'estimate' | 'correspondence';
export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface UploadQueueItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  claimId?: string;
  claimNumber?: string;
  type: DocumentUploadType;
  category?: string;
  status: UploadStatus;
  progress: number; // 0-100 for upload progress
  error?: string;
  documentId?: string; // Set after successful upload
  processingStatus?: ProcessingStatus; // Set after upload, tracks AI processing
  retryCount: number;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface UploadQueueState {
  // Queue state
  queue: UploadQueueItem[];
  activeUploads: number;
  maxConcurrent: number;
  isProcessingQueue: boolean;

  // Actions
  addToQueue: (files: File[], options: {
    claimId?: string;
    claimNumber?: string;
    type: DocumentUploadType;
    category?: string;
  }) => string[];

  removeFromQueue: (id: string) => void;
  clearCompleted: () => void;
  clearFailed: () => void;
  clearAll: () => void;

  retryFailed: (id: string) => void;
  retryAllFailed: () => void;

  // Internal actions (called by the upload processor)
  _updateItem: (id: string, updates: Partial<UploadQueueItem>) => void;
  _setActiveUploads: (count: number) => void;
  _setProcessingQueue: (isProcessing: boolean) => void;
  _getNextPending: () => UploadQueueItem | undefined;

  // Computed
  getPendingCount: () => number;
  getActiveCount: () => number;
  getCompletedCount: () => number;
  getFailedCount: () => number;
  getTotalProgress: () => number;
  getItemsByClaimId: (claimId: string) => UploadQueueItem[];
}

// ============================================
// STORE
// ============================================

export const useUploadQueue = create<UploadQueueState>()(
  persist(
    (set, get) => ({
      // Initial state
      queue: [],
      activeUploads: 0,
      maxConcurrent: 4,
      isProcessingQueue: false,

      // Add files to the queue
      addToQueue: (files, options) => {
        const newItems: UploadQueueItem[] = files.map((file) => ({
          id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          fileName: file.name,
          fileSize: file.size,
          claimId: options.claimId,
          claimNumber: options.claimNumber,
          type: options.type,
          category: options.category,
          status: 'pending' as UploadStatus,
          progress: 0,
          retryCount: 0,
          addedAt: Date.now(),
        }));

        set((state) => ({
          queue: [...state.queue, ...newItems],
        }));

        // Trigger queue processing
        setTimeout(() => processQueue(), 0);

        return newItems.map((item) => item.id);
      },

      removeFromQueue: (id) => {
        set((state) => ({
          queue: state.queue.filter((item) => item.id !== id),
        }));
      },

      clearCompleted: () => {
        set((state) => ({
          queue: state.queue.filter((item) => item.status !== 'completed'),
        }));
      },

      clearFailed: () => {
        set((state) => ({
          queue: state.queue.filter((item) => item.status !== 'failed'),
        }));
      },

      clearAll: () => {
        set({ queue: [], activeUploads: 0, isProcessingQueue: false });
      },

      retryFailed: (id) => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id
              ? { ...item, status: 'pending' as UploadStatus, error: undefined, progress: 0, retryCount: item.retryCount + 1 }
              : item
          ),
        }));

        // Trigger queue processing
        setTimeout(() => processQueue(), 0);
      },

      retryAllFailed: () => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.status === 'failed'
              ? { ...item, status: 'pending' as UploadStatus, error: undefined, progress: 0, retryCount: item.retryCount + 1 }
              : item
          ),
        }));

        // Trigger queue processing
        setTimeout(() => processQueue(), 0);
      },

      // Internal actions
      _updateItem: (id, updates) => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      _setActiveUploads: (count) => {
        set({ activeUploads: count });
      },

      _setProcessingQueue: (isProcessing) => {
        set({ isProcessingQueue: isProcessing });
      },

      _getNextPending: () => {
        const state = get();
        return state.queue.find((item) => item.status === 'pending');
      },

      // Computed getters
      getPendingCount: () => {
        return get().queue.filter((item) => item.status === 'pending').length;
      },

      getActiveCount: () => {
        return get().queue.filter((item) => item.status === 'uploading' || item.status === 'processing').length;
      },

      getCompletedCount: () => {
        return get().queue.filter((item) => item.status === 'completed').length;
      },

      getFailedCount: () => {
        return get().queue.filter((item) => item.status === 'failed').length;
      },

      getTotalProgress: () => {
        const queue = get().queue;
        if (queue.length === 0) return 100;

        const activeItems = queue.filter(
          (item) => item.status !== 'completed' && item.status !== 'failed'
        );

        if (activeItems.length === 0) return 100;

        const totalProgress = activeItems.reduce((sum, item) => sum + item.progress, 0);
        return Math.round(totalProgress / activeItems.length);
      },

      getItemsByClaimId: (claimId) => {
        return get().queue.filter((item) => item.claimId === claimId);
      },
    }),
    {
      name: 'upload-queue-storage',
      // Only persist certain fields, not the File objects
      partialize: (state) => ({
        queue: state.queue.map((item) => ({
          ...item,
          // Don't persist the actual File object - it can't be serialized
          // Items will need to be re-added if the page is refreshed
          file: null as unknown as File,
        })),
      }),
      // On rehydration, filter out items without files (they can't be retried)
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.queue = state.queue.filter((item) => item.file !== null);
        }
      },
    }
  )
);

// ============================================
// UPLOAD PROCESSOR
// ============================================

let isProcessing = false;

async function processQueue() {
  const store = useUploadQueue.getState();

  // Prevent concurrent processing
  if (isProcessing) return;
  isProcessing = true;
  store._setProcessingQueue(true);

  try {
    while (true) {
      const currentState = useUploadQueue.getState();
      const activeCount = currentState.queue.filter(
        (item) => item.status === 'uploading'
      ).length;

      // Check if we can start more uploads
      if (activeCount >= currentState.maxConcurrent) {
        break;
      }

      // Get next pending item
      const nextItem = currentState._getNextPending();
      if (!nextItem) {
        break;
      }

      // Start upload (don't await - let it run in background)
      uploadItem(nextItem.id).catch(console.error);

      // Small delay to allow state updates
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    isProcessing = false;
    useUploadQueue.getState()._setProcessingQueue(false);
  }
}

async function uploadItem(itemId: string): Promise<void> {
  const store = useUploadQueue.getState();
  const item = store.queue.find((i) => i.id === itemId);

  if (!item || item.status !== 'pending') {
    return;
  }

  // Mark as uploading
  store._updateItem(itemId, {
    status: 'uploading',
    startedAt: Date.now(),
    progress: 0,
  });

  try {
    // Create form data
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('type', item.type);
    if (item.claimId) formData.append('claimId', item.claimId);
    if (item.category) formData.append('category', item.category);

    // Upload with progress tracking using XMLHttpRequest
    const result = await uploadWithProgress(formData, (progress) => {
      store._updateItem(itemId, { progress });
    });

    // Upload successful - mark as processing (AI extraction pending)
    store._updateItem(itemId, {
      status: 'processing',
      progress: 100,
      documentId: result.id,
      processingStatus: 'pending',
    });

    // Start polling for processing status
    pollProcessingStatus(itemId, result.id);

    // Trigger next upload
    setTimeout(() => processQueue(), 0);

  } catch (error) {
    console.error(`Upload failed for ${item.fileName}:`, error);

    store._updateItem(itemId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Upload failed',
      completedAt: Date.now(),
    });

    // Trigger next upload
    setTimeout(() => processQueue(), 0);
  }
}

function uploadWithProgress(
  formData: FormData,
  onProgress: (progress: number) => void
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('POST', '/api/documents');
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

// ============================================
// PROCESSING STATUS POLLING
// ============================================

const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max

async function pollProcessingStatus(itemId: string, documentId: string): Promise<void> {
  const store = useUploadQueue.getState();
  let attempts = 0;

  const poll = async () => {
    attempts++;

    // Check if item still exists and is in processing state
    const currentState = useUploadQueue.getState();
    const item = currentState.queue.find((i) => i.id === itemId);

    if (!item || item.status !== 'processing') {
      return; // Stop polling
    }

    if (attempts > MAX_POLL_ATTEMPTS) {
      store._updateItem(itemId, {
        status: 'completed', // Still mark as completed, but processing may have timed out
        processingStatus: 'pending',
        completedAt: Date.now(),
      });
      return;
    }

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch document status');
      }

      const doc = await response.json();

      if (doc.processingStatus === 'completed') {
        store._updateItem(itemId, {
          status: 'completed',
          processingStatus: 'completed',
          completedAt: Date.now(),
        });
        return;
      }

      if (doc.processingStatus === 'failed') {
        store._updateItem(itemId, {
          status: 'completed', // Upload succeeded, just processing failed
          processingStatus: 'failed',
          completedAt: Date.now(),
        });
        return;
      }

      // Still processing, continue polling
      store._updateItem(itemId, {
        processingStatus: doc.processingStatus as ProcessingStatus,
      });

      setTimeout(poll, POLL_INTERVAL);

    } catch (error) {
      console.error('Error polling processing status:', error);
      // Continue polling on error
      setTimeout(poll, POLL_INTERVAL);
    }
  };

  // Start polling after a short delay
  setTimeout(poll, POLL_INTERVAL);
}

// ============================================
// BATCH STATUS POLLING (for multiple documents)
// ============================================

export async function pollBatchStatus(documentIds: string[]): Promise<Record<string, ProcessingStatus>> {
  try {
    const response = await fetch(`/api/documents/batch-status?ids=${documentIds.join(',')}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch batch status');
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching batch status:', error);
    return {};
  }
}

// ============================================
// HELPER HOOKS
// ============================================

export function useUploadQueueStats() {
  const queue = useUploadQueue((state) => state.queue);

  const pending = queue.filter((item) => item.status === 'pending').length;
  const uploading = queue.filter((item) => item.status === 'uploading').length;
  const processing = queue.filter((item) => item.status === 'processing').length;
  const completed = queue.filter((item) => item.status === 'completed').length;
  const failed = queue.filter((item) => item.status === 'failed').length;
  const total = queue.length;

  const activeItems = queue.filter(
    (item) => item.status === 'uploading' || item.status === 'processing' || item.status === 'pending'
  );

  const overallProgress = activeItems.length > 0
    ? Math.round(activeItems.reduce((sum, item) => sum + item.progress, 0) / activeItems.length)
    : 100;

  const isActive = pending > 0 || uploading > 0 || processing > 0;

  return {
    pending,
    uploading,
    processing,
    completed,
    failed,
    total,
    overallProgress,
    isActive,
    activeItems,
  };
}
