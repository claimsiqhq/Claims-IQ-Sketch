/**
 * Sync Service
 *
 * Manages synchronization of offline data with the server.
 * Handles queue processing, retry logic, and conflict resolution.
 */

import { OfflineStorage, offlineDB, SyncQueueItem } from './offlineStorage';

// ============================================
// TYPE DEFINITIONS
// ============================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncProgress {
  total: number;
  completed: number;
  current?: string;
  errors: string[];
}

export type SyncListener = (status: SyncStatus, progress: SyncProgress) => void;

// ============================================
// SYNC SERVICE CLASS
// ============================================

export class SyncService {
  private status: SyncStatus = 'idle';
  private listeners: SyncListener[] = [];
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress = false;
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      // Listen for online/offline events
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());

      // Listen for service worker sync messages
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_TRIGGERED') {
            this.processQueue();
          }
        });
      }
    }
  }

  // ============================================
  // SUBSCRIPTION
  // ============================================

  /**
   * Subscribe to sync status updates
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notify(progress: SyncProgress): void {
    this.listeners.forEach((l) => l(this.status, progress));
  }

  // ============================================
  // ONLINE/OFFLINE HANDLING
  // ============================================

  /**
   * Handle coming online
   */
  private async handleOnline(): Promise<void> {
    console.log('[SyncService] Device came online');
    this.isOnline = true;
    this.status = 'idle';
    await this.processQueue();
  }

  /**
   * Handle going offline
   */
  private handleOffline(): void {
    console.log('[SyncService] Device went offline');
    this.isOnline = false;
    this.status = 'offline';
    this.notify({ total: 0, completed: 0, errors: [] });
  }

  // ============================================
  // QUEUE PROCESSING
  // ============================================

  /**
   * Process the sync queue
   */
  async processQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      console.log('[SyncService] Skip processing:', {
        syncInProgress: this.syncInProgress,
        isOnline: this.isOnline,
      });
      return;
    }

    this.syncInProgress = true;
    this.status = 'syncing';

    const items = await OfflineStorage.getPendingSyncItems();
    const progress: SyncProgress = {
      total: items.length,
      completed: 0,
      errors: [],
    };

    console.log(`[SyncService] Processing ${items.length} items`);
    this.notify(progress);

    for (const item of items) {
      // Skip if max attempts reached
      if (item.attempts >= item.maxAttempts) {
        console.log(`[SyncService] Skipping item ${item.id} - max attempts reached`);
        progress.completed++;
        continue;
      }

      try {
        progress.current = `${item.entity}: ${item.action}`;
        this.notify(progress);

        await this.processItem(item);
        await OfflineStorage.removeSyncItem(item.id);

        progress.completed++;
        this.notify(progress);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SyncService] Failed to sync ${item.entity} ${item.entityId}:`, message);
        progress.errors.push(`${item.entity} ${item.entityId}: ${message}`);

        await OfflineStorage.markSyncItemFailed(item.id, message);

        // If max attempts reached, count as completed (failed)
        if (item.attempts >= item.maxAttempts - 1) {
          progress.completed++;
        }
      }

      // Small delay between items
      await this.delay(100);
    }

    this.status = progress.errors.length > 0 ? 'error' : 'idle';
    this.syncInProgress = false;
    this.notify(progress);
    console.log('[SyncService] Queue processing complete:', progress);
  }

  /**
   * Process a single sync item
   */
  private async processItem(item: SyncQueueItem): Promise<void> {
    const baseUrl = '/api';

    switch (item.entity) {
      case 'zone':
        await this.syncZone(item, baseUrl);
        break;
      case 'photo':
        await this.syncPhoto(item, baseUrl);
        break;
      case 'damage_marker':
        await this.syncDamageMarker(item, baseUrl);
        break;
      case 'movement':
        await this.syncMovement(item, baseUrl);
        break;
      case 'claim':
        await this.syncClaim(item, baseUrl);
        break;
      default:
        throw new Error(`Unknown entity type: ${item.entity}`);
    }
  }

  // ============================================
  // ENTITY-SPECIFIC SYNC
  // ============================================

  /**
   * Sync a claim
   */
  private async syncClaim(item: SyncQueueItem, baseUrl: string): Promise<void> {
    const claim = await offlineDB.claims.get(item.entityId);
    if (!claim) return;

    const response = await fetch(`${baseUrl}/claims/${claim.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.payload),
    });

    if (!response.ok) {
      throw new Error(`Claim sync failed: ${response.status}`);
    }

    // Update local sync status
    await offlineDB.claims.update(claim.id, { syncStatus: 'synced' });
  }

  /**
   * Sync a zone
   */
  private async syncZone(item: SyncQueueItem, baseUrl: string): Promise<void> {
    const zone = await offlineDB.zones.get(item.entityId);
    if (!zone) return;

    const endpoint =
      item.action === 'create'
        ? `${baseUrl}/claims/${zone.claimId}/zones`
        : `${baseUrl}/zones/${zone.id}`;

    const method =
      item.action === 'delete' ? 'DELETE' : item.action === 'create' ? 'POST' : 'PUT';

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'DELETE' ? JSON.stringify(zone) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Zone sync failed: ${response.status}`);
    }

    // Update local sync status
    await offlineDB.zones.update(zone.id, { syncStatus: 'synced' });
  }

  /**
   * Sync a photo (with blob upload)
   */
  private async syncPhoto(item: SyncQueueItem, baseUrl: string): Promise<void> {
    const photo = await offlineDB.photos.get(item.entityId);
    if (!photo || !photo.blob) return;

    // Update status to uploading
    await offlineDB.photos.update(photo.id, {
      syncStatus: 'uploading',
      uploadProgress: 0,
    });

    const formData = new FormData();
    formData.append('photo', photo.blob, photo.filename);
    formData.append('claimId', photo.claimId);
    if (photo.zoneId) formData.append('zoneId', photo.zoneId);
    if (photo.taxonomyPrefix) formData.append('taxonomyPrefix', photo.taxonomyPrefix);
    if (photo.gpsLatitude) formData.append('gpsLatitude', photo.gpsLatitude.toString());
    if (photo.gpsLongitude) formData.append('gpsLongitude', photo.gpsLongitude.toString());

    // Upload with progress tracking
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = async (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          await offlineDB.photos.update(photo.id, { uploadProgress: progress });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));

      xhr.open('POST', `${baseUrl}/claims/${photo.claimId}/photos`);
      xhr.send(formData);
    });

    // Update local status and clear blob to save space
    await offlineDB.photos.update(photo.id, {
      syncStatus: 'synced',
      uploadProgress: 100,
      blob: undefined as unknown as Blob,
    });
  }

  /**
   * Sync a damage marker
   */
  private async syncDamageMarker(item: SyncQueueItem, baseUrl: string): Promise<void> {
    const marker = await offlineDB.damageMarkers.get(item.entityId);
    if (!marker) return;

    const endpoint =
      item.action === 'create'
        ? `${baseUrl}/zones/${marker.zoneId}/damage-markers`
        : `${baseUrl}/damage-markers/${marker.id}`;

    const method =
      item.action === 'delete' ? 'DELETE' : item.action === 'create' ? 'POST' : 'PUT';

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'DELETE' ? JSON.stringify(marker) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Damage marker sync failed: ${response.status}`);
    }

    await offlineDB.damageMarkers.update(marker.id, { syncStatus: 'synced' });
  }

  /**
   * Sync a movement completion
   */
  private async syncMovement(item: SyncQueueItem, baseUrl: string): Promise<void> {
    const payload = item.payload as { flowInstanceId?: string };
    const response = await fetch(
      `${baseUrl}/flows/${payload.flowInstanceId}/movements/${item.entityId}/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      }
    );

    if (!response.ok) {
      throw new Error(`Movement sync failed: ${response.status}`);
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<void> {
    if (this.isOnline) {
      await this.processQueue();
    }
  }

  /**
   * Get current status
   */
  getStatus(): { status: SyncStatus; isOnline: boolean } {
    return { status: this.status, isOnline: this.isOnline };
  }

  /**
   * Get pending sync count
   */
  async getPendingCount(): Promise<number> {
    return OfflineStorage.getSyncQueueCount();
  }

  /**
   * Register for background sync (if supported)
   */
  async registerBackgroundSync(): Promise<boolean> {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-data');
        console.log('[SyncService] Background sync registered');
        return true;
      } catch (error) {
        console.warn('[SyncService] Background sync registration failed:', error);
        return false;
      }
    }
    return false;
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const syncService = new SyncService();
