/**
 * Offline Storage Layer
 *
 * Provides IndexedDB-based offline storage for claims, zones, photos, and flow state.
 * Uses Dexie.js for a cleaner IndexedDB API with TypeScript support.
 */

import Dexie, { Table } from 'dexie';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface OfflineClaim {
  id: string;
  claimNumber: string;
  insuredName: string;
  propertyAddress: string;
  perilType: string;
  status: string;
  dateOfLoss: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastModified: Date;
  data: Record<string, unknown>; // Full claim data
}

export interface OfflineZone {
  id: string;
  claimId: string;
  name: string;
  level: number;
  zoneType: string;
  geometry: Record<string, unknown>;
  calculatedDimensions: Record<string, unknown>;
  syncStatus: 'synced' | 'pending';
  lastModified: Date;
}

export interface OfflinePhoto {
  id: string;
  claimId: string;
  zoneId?: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  thumbnailBlob?: Blob;
  taxonomyPrefix?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  syncStatus: 'synced' | 'pending' | 'uploading';
  uploadProgress?: number;
  lastModified: Date;
}

export interface OfflineDamageMarker {
  id: string;
  zoneId: string;
  damageType: string;
  severity: string;
  position: { x: number; y: number };
  notes?: string;
  photoIds?: string[];
  syncStatus: 'synced' | 'pending';
  lastModified: Date;
}

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  entity: 'claim' | 'zone' | 'photo' | 'damage_marker' | 'movement';
  entityId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastAttempt?: Date;
  error?: string;
  createdAt: Date;
}

export interface OfflineFlowState {
  id: string;
  claimId: string;
  flowDefinitionId: string;
  currentPhaseId?: string;
  currentMovementId?: string;
  completedMovements: string[];
  progress: number;
  lastModified: Date;
}

export interface CachedLineItem {
  id: string;
  code: string;
  description: string;
  categoryCode: string;
  unit: string;
  unitPrice: number;
  tags?: string[];
  perilTypes?: string[];
}

// ============================================
// DEXIE DATABASE CLASS
// ============================================

class SketchOfflineDB extends Dexie {
  claims!: Table<OfflineClaim>;
  zones!: Table<OfflineZone>;
  photos!: Table<OfflinePhoto>;
  damageMarkers!: Table<OfflineDamageMarker>;
  syncQueue!: Table<SyncQueueItem>;
  flowStates!: Table<OfflineFlowState>;
  lineItems!: Table<CachedLineItem>;

  constructor() {
    super('SketchOfflineDB');

    this.version(1).stores({
      claims: 'id, claimNumber, syncStatus, lastModified',
      zones: 'id, claimId, syncStatus, lastModified',
      photos: 'id, claimId, zoneId, syncStatus, taxonomyPrefix, lastModified',
      damageMarkers: 'id, zoneId, syncStatus, lastModified',
      syncQueue: 'id, entity, entityId, createdAt',
      flowStates: 'id, claimId, lastModified',
      lineItems: 'id, code, categoryCode, [categoryCode+code]',
    });
  }
}

export const offlineDB = new SketchOfflineDB();

// ============================================
// OFFLINE STORAGE HELPER CLASS
// ============================================

export class OfflineStorage {
  // ============================================
  // CLAIM OPERATIONS
  // ============================================

  /**
   * Save claim for offline access
   */
  static async saveClaim(claim: Record<string, unknown>): Promise<void> {
    await offlineDB.claims.put({
      id: claim.id as string,
      claimNumber: claim.claimNumber as string,
      insuredName: claim.insuredName as string,
      propertyAddress: claim.propertyAddress as string,
      perilType: claim.perilType as string || 'other',
      status: claim.status as string,
      dateOfLoss: claim.dateOfLoss as string,
      syncStatus: 'synced',
      lastModified: new Date(),
      data: claim,
    });
  }

  /**
   * Get claim from offline storage
   */
  static async getClaim(claimId: string): Promise<OfflineClaim | undefined> {
    return offlineDB.claims.get(claimId);
  }

  /**
   * Get all offline claims
   */
  static async getAllClaims(): Promise<OfflineClaim[]> {
    return offlineDB.claims.orderBy('lastModified').reverse().toArray();
  }

  /**
   * Update claim locally (marks as pending sync)
   */
  static async updateClaim(
    claimId: string,
    updates: Partial<Record<string, unknown>>
  ): Promise<void> {
    const existing = await offlineDB.claims.get(claimId);
    if (existing) {
      await offlineDB.claims.update(claimId, {
        ...existing,
        data: { ...existing.data, ...updates },
        syncStatus: 'pending',
        lastModified: new Date(),
      });
      await this.addToSyncQueue('update', 'claim', claimId, updates);
    }
  }

  // ============================================
  // ZONE OPERATIONS
  // ============================================

  /**
   * Save zone locally
   */
  static async saveZone(
    zone: Record<string, unknown>,
    syncStatus: 'synced' | 'pending' = 'synced'
  ): Promise<void> {
    await offlineDB.zones.put({
      id: zone.id as string,
      claimId: zone.claimId as string,
      name: zone.name as string,
      level: zone.level as number || 0,
      zoneType: zone.zoneType as string,
      geometry: zone.geometry as Record<string, unknown> || {},
      calculatedDimensions: zone.calculatedDimensions as Record<string, unknown> || {},
      syncStatus,
      lastModified: new Date(),
    });

    if (syncStatus === 'pending') {
      await this.addToSyncQueue('update', 'zone', zone.id as string, zone);
    }
  }

  /**
   * Get zones for a claim
   */
  static async getZonesForClaim(claimId: string): Promise<OfflineZone[]> {
    return offlineDB.zones.where('claimId').equals(claimId).toArray();
  }

  // ============================================
  // PHOTO OPERATIONS
  // ============================================

  /**
   * Save photo locally with blob
   */
  static async savePhoto(
    photo: {
      id: string;
      claimId: string;
      zoneId?: string;
      filename: string;
      mimeType: string;
      taxonomyPrefix?: string;
      gpsLatitude?: number;
      gpsLongitude?: number;
    },
    blob: Blob,
    thumbnail?: Blob
  ): Promise<void> {
    await offlineDB.photos.put({
      id: photo.id,
      claimId: photo.claimId,
      zoneId: photo.zoneId,
      filename: photo.filename,
      mimeType: photo.mimeType,
      blob,
      thumbnailBlob: thumbnail,
      taxonomyPrefix: photo.taxonomyPrefix,
      gpsLatitude: photo.gpsLatitude,
      gpsLongitude: photo.gpsLongitude,
      syncStatus: 'pending',
      lastModified: new Date(),
    });

    await this.addToSyncQueue('create', 'photo', photo.id, {
      ...photo,
      hasBlob: true,
    });
  }

  /**
   * Get photo with blob
   */
  static async getPhoto(photoId: string): Promise<OfflinePhoto | undefined> {
    return offlineDB.photos.get(photoId);
  }

  /**
   * Get photos for claim (offline)
   */
  static async getPhotosForClaim(claimId: string): Promise<OfflinePhoto[]> {
    return offlineDB.photos.where('claimId').equals(claimId).toArray();
  }

  /**
   * Get photos by taxonomy prefix
   */
  static async getPhotosByTaxonomy(
    claimId: string,
    prefix: string
  ): Promise<OfflinePhoto[]> {
    return offlineDB.photos
      .where(['claimId', 'taxonomyPrefix'])
      .equals([claimId, prefix])
      .toArray();
  }

  /**
   * Update photo sync status
   */
  static async updatePhotoStatus(
    photoId: string,
    status: 'synced' | 'pending' | 'uploading',
    progress?: number
  ): Promise<void> {
    await offlineDB.photos.update(photoId, {
      syncStatus: status,
      uploadProgress: progress,
    });
  }

  /**
   * Clear photo blob after sync (to save space)
   */
  static async clearPhotoBlob(photoId: string): Promise<void> {
    const photo = await offlineDB.photos.get(photoId);
    if (photo) {
      await offlineDB.photos.update(photoId, {
        blob: undefined as unknown as Blob,
        syncStatus: 'synced',
      });
    }
  }

  // ============================================
  // DAMAGE MARKER OPERATIONS
  // ============================================

  /**
   * Save damage marker locally
   */
  static async saveDamageMarker(
    marker: Record<string, unknown>,
    syncStatus: 'synced' | 'pending' = 'synced'
  ): Promise<void> {
    await offlineDB.damageMarkers.put({
      id: marker.id as string,
      zoneId: marker.zoneId as string,
      damageType: marker.damageType as string,
      severity: marker.severity as string || 'moderate',
      position: marker.position as { x: number; y: number },
      notes: marker.notes as string,
      photoIds: marker.photoIds as string[],
      syncStatus,
      lastModified: new Date(),
    });

    if (syncStatus === 'pending') {
      await this.addToSyncQueue('create', 'damage_marker', marker.id as string, marker);
    }
  }

  /**
   * Get damage markers for zone
   */
  static async getDamageMarkersForZone(zoneId: string): Promise<OfflineDamageMarker[]> {
    return offlineDB.damageMarkers.where('zoneId').equals(zoneId).toArray();
  }

  // ============================================
  // SYNC QUEUE OPERATIONS
  // ============================================

  /**
   * Add item to sync queue
   */
  static async addToSyncQueue(
    action: 'create' | 'update' | 'delete',
    entity: SyncQueueItem['entity'],
    entityId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const id = `${entity}-${entityId}-${Date.now()}`;
    await offlineDB.syncQueue.put({
      id,
      action,
      entity,
      entityId,
      payload,
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
    });
  }

  /**
   * Get pending sync items
   */
  static async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return offlineDB.syncQueue.orderBy('createdAt').toArray();
  }

  /**
   * Get sync queue count
   */
  static async getSyncQueueCount(): Promise<number> {
    return offlineDB.syncQueue.count();
  }

  /**
   * Remove from sync queue after successful sync
   */
  static async removeSyncItem(id: string): Promise<void> {
    await offlineDB.syncQueue.delete(id);
  }

  /**
   * Update sync item after failed attempt
   */
  static async markSyncItemFailed(id: string, error: string): Promise<void> {
    const item = await offlineDB.syncQueue.get(id);
    if (item) {
      await offlineDB.syncQueue.update(id, {
        attempts: item.attempts + 1,
        lastAttempt: new Date(),
        error,
      });
    }
  }

  // ============================================
  // FLOW STATE OPERATIONS
  // ============================================

  /**
   * Save flow state for offline resume
   */
  static async saveFlowState(state: OfflineFlowState): Promise<void> {
    await offlineDB.flowStates.put(state);
  }

  /**
   * Get flow state for claim
   */
  static async getFlowState(claimId: string): Promise<OfflineFlowState | undefined> {
    return offlineDB.flowStates.where('claimId').equals(claimId).first();
  }

  /**
   * Update flow progress
   */
  static async updateFlowProgress(
    claimId: string,
    currentMovementId: string,
    completedMovements: string[],
    progress: number
  ): Promise<void> {
    const existing = await this.getFlowState(claimId);
    if (existing) {
      await offlineDB.flowStates.update(existing.id, {
        currentMovementId,
        completedMovements,
        progress,
        lastModified: new Date(),
      });
    }
  }

  // ============================================
  // LINE ITEM CACHE
  // ============================================

  /**
   * Cache line items catalog for offline search
   */
  static async cacheLineItems(items: CachedLineItem[]): Promise<void> {
    await offlineDB.lineItems.bulkPut(items);
  }

  /**
   * Search line items offline
   */
  static async searchLineItemsOffline(query: string): Promise<CachedLineItem[]> {
    const items = await offlineDB.lineItems.toArray();
    const lower = query.toLowerCase();
    return items
      .filter(
        (item) =>
          item.description?.toLowerCase().includes(lower) ||
          item.code?.toLowerCase().includes(lower)
      )
      .slice(0, 20);
  }

  /**
   * Get line items by category
   */
  static async getLineItemsByCategory(categoryCode: string): Promise<CachedLineItem[]> {
    return offlineDB.lineItems.where('categoryCode').equals(categoryCode).toArray();
  }

  // ============================================
  // UTILITY OPERATIONS
  // ============================================

  /**
   * Clear all offline data
   */
  static async clearAll(): Promise<void> {
    await offlineDB.claims.clear();
    await offlineDB.zones.clear();
    await offlineDB.photos.clear();
    await offlineDB.damageMarkers.clear();
    await offlineDB.syncQueue.clear();
    await offlineDB.flowStates.clear();
  }

  /**
   * Get storage usage stats
   */
  static async getStorageStats(): Promise<{
    claims: number;
    zones: number;
    photos: number;
    damageMarkers: number;
    pendingSync: number;
    estimatedSizeMB: number;
  }> {
    const claimsCount = await offlineDB.claims.count();
    const zonesCount = await offlineDB.zones.count();
    const photosCount = await offlineDB.photos.count();
    const damageMarkersCount = await offlineDB.damageMarkers.count();
    const pendingCount = await offlineDB.syncQueue.count();

    // Estimate storage from photos
    const photos = await offlineDB.photos.toArray();
    const photoSize = photos.reduce((sum, p) => sum + (p.blob?.size || 0), 0);

    return {
      claims: claimsCount,
      zones: zonesCount,
      photos: photosCount,
      damageMarkers: damageMarkersCount,
      pendingSync: pendingCount,
      estimatedSizeMB: Math.round(photoSize / (1024 * 1024)),
    };
  }

  /**
   * Check if we have offline data for a claim
   */
  static async hasOfflineData(claimId: string): Promise<boolean> {
    const claim = await offlineDB.claims.get(claimId);
    return !!claim;
  }

  /**
   * Get pending items count for a claim
   */
  static async getPendingCountForClaim(claimId: string): Promise<number> {
    const claimItems = await offlineDB.syncQueue
      .filter((item) => item.payload?.claimId === claimId)
      .count();
    return claimItems;
  }
}
