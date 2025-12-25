/**
 * useOfflineDraft Hook
 *
 * Auto-saves workflow progress to localStorage with sync status tracking.
 * Provides offline-first capability for field adjusters in poor connectivity areas.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface DraftData {
  workflowId: string;
  claimId: string;
  steps: Record<string, StepDraft>;
  lastModified: string;
  syncedAt: string | null;
}

interface StepDraft {
  stepId: string;
  status: string;
  findings: string;
  photos: string[]; // Base64 or blob URLs
  actualMinutes: number;
  damageSeverity: string | null;
  completedAt: string | null;
  needsSync: boolean;
}

interface PendingUpdate {
  id: string;
  type: "step_update" | "step_complete" | "photo_upload";
  data: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
}

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
}

interface OfflineDraftControls {
  saveDraft: (stepId: string, data: Partial<StepDraft>) => void;
  getDraft: (stepId: string) => StepDraft | null;
  clearDraft: (stepId: string) => void;
  clearAllDrafts: () => void;
  queueUpdate: (update: Omit<PendingUpdate, "id" | "timestamp" | "retryCount">) => void;
  syncNow: () => Promise<void>;
  getPendingUpdates: () => PendingUpdate[];
}

const STORAGE_KEY_PREFIX = "workflow_draft_";
const PENDING_UPDATES_KEY = "workflow_pending_updates";
const MAX_RETRY_COUNT = 3;

export function useOfflineDraft(
  workflowId: string | null,
  claimId: string,
  onSync?: (updates: PendingUpdate[]) => Promise<void>
): [SyncStatus, OfflineDraftControls] {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    syncError: null,
  });

  const syncInProgress = useRef(false);
  const storageKey = workflowId ? `${STORAGE_KEY_PREFIX}${workflowId}` : null;

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true, syncError: null }));
      // Auto-sync when coming online
      if (onSync) {
        syncNow();
      }
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [onSync]);

  // Load pending updates count on mount
  useEffect(() => {
    const pending = getPendingUpdatesFromStorage();
    setSyncStatus(prev => ({ ...prev, pendingCount: pending.length }));
  }, []);

  // Get draft data from localStorage
  const getDraftData = useCallback((): DraftData | null => {
    if (!storageKey) return null;
    try {
      const data = localStorage.getItem(storageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  // Save draft data to localStorage
  const setDraftData = useCallback((data: DraftData) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  }, [storageKey]);

  // Save a step draft
  const saveDraft = useCallback((stepId: string, data: Partial<StepDraft>) => {
    if (!workflowId) return;

    const existing = getDraftData() || {
      workflowId,
      claimId,
      steps: {},
      lastModified: new Date().toISOString(),
      syncedAt: null,
    };

    const existingStep = existing.steps[stepId] || {
      stepId,
      status: "pending",
      findings: "",
      photos: [],
      actualMinutes: 0,
      damageSeverity: null,
      completedAt: null,
      needsSync: true,
    };

    existing.steps[stepId] = {
      ...existingStep,
      ...data,
      needsSync: true,
    };
    existing.lastModified = new Date().toISOString();

    setDraftData(existing);
  }, [workflowId, claimId, getDraftData, setDraftData]);

  // Get a specific step draft
  const getDraft = useCallback((stepId: string): StepDraft | null => {
    const data = getDraftData();
    return data?.steps[stepId] || null;
  }, [getDraftData]);

  // Clear a specific step draft
  const clearDraft = useCallback((stepId: string) => {
    const data = getDraftData();
    if (data && data.steps[stepId]) {
      delete data.steps[stepId];
      setDraftData(data);
    }
  }, [getDraftData, setDraftData]);

  // Clear all drafts for this workflow
  const clearAllDrafts = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Get pending updates from storage
  const getPendingUpdatesFromStorage = (): PendingUpdate[] => {
    try {
      const data = localStorage.getItem(PENDING_UPDATES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  // Save pending updates to storage
  const savePendingUpdates = (updates: PendingUpdate[]) => {
    try {
      localStorage.setItem(PENDING_UPDATES_KEY, JSON.stringify(updates));
      setSyncStatus(prev => ({ ...prev, pendingCount: updates.length }));
    } catch (error) {
      console.error("Failed to save pending updates:", error);
    }
  };

  // Queue an update for sync
  const queueUpdate = useCallback((update: Omit<PendingUpdate, "id" | "timestamp" | "retryCount">) => {
    const pending = getPendingUpdatesFromStorage();
    const newUpdate: PendingUpdate = {
      ...update,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    pending.push(newUpdate);
    savePendingUpdates(pending);

    // Try to sync immediately if online
    if (navigator.onLine && onSync) {
      syncNow();
    }
  }, [onSync]);

  // Get all pending updates
  const getPendingUpdates = useCallback((): PendingUpdate[] => {
    return getPendingUpdatesFromStorage();
  }, []);

  // Sync pending updates
  const syncNow = useCallback(async () => {
    if (syncInProgress.current || !onSync) return;

    const pending = getPendingUpdatesFromStorage();
    if (pending.length === 0) return;

    syncInProgress.current = true;
    setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      // Filter to updates that haven't exceeded retry limit
      const toSync = pending.filter(u => u.retryCount < MAX_RETRY_COUNT);

      if (toSync.length > 0) {
        await onSync(toSync);

        // Remove synced updates
        const remaining = pending.filter(u => u.retryCount >= MAX_RETRY_COUNT);
        savePendingUpdates(remaining);

        // Mark draft steps as synced
        const data = getDraftData();
        if (data) {
          Object.keys(data.steps).forEach(stepId => {
            data.steps[stepId].needsSync = false;
          });
          data.syncedAt = new Date().toISOString();
          setDraftData(data);
        }
      }

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: new Date().toISOString(),
        pendingCount: 0,
      }));
    } catch (error) {
      // Increment retry count for failed updates
      const updated = pending.map(u => ({
        ...u,
        retryCount: u.retryCount + 1,
      }));
      savePendingUpdates(updated);

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncError: error instanceof Error ? error.message : "Sync failed",
      }));
    } finally {
      syncInProgress.current = false;
    }
  }, [onSync, getDraftData, setDraftData]);

  return [
    syncStatus,
    {
      saveDraft,
      getDraft,
      clearDraft,
      clearAllDrafts,
      queueUpdate,
      syncNow,
      getPendingUpdates,
    },
  ];
}

export default useOfflineDraft;
