/**
 * Offline Storage Service
 * 
 * Uses IndexedDB for persistent offline storage of flow data, evidence, and sync queue.
 * Adapted for web (not React Native).
 */

const DB_NAME = 'claimsIQ_offline';
const DB_VERSION = 1;

const STORES = {
  CACHED_FLOWS: 'cached_flows',
  PENDING_COMPLETIONS: 'pending_completions',
  PENDING_EVIDENCE: 'pending_evidence',
  SYNC_QUEUE: 'sync_queue',
  METADATA: 'metadata',
};

interface PendingCompletion {
  id: string;
  flowInstanceId: string;
  movementId: string;
  notes?: string;
  completedAt: string;
  evidenceIds: string[];
  createdOffline: boolean;
}

interface PendingEvidence {
  id: string;
  type: 'photo' | 'voice_note' | 'sketch_zone';
  fileData: Blob | string; // Blob for files, string for data URLs
  fileName: string;
  flowInstanceId: string;
  movementId: string;
  claimId: string;
  metadata: any;
  createdAt: string;
}

interface SyncQueueItem {
  id: string;
  type: 'completion' | 'evidence' | 'observation';
  data: any;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

// Initialize IndexedDB
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.CACHED_FLOWS)) {
        db.createObjectStore(STORES.CACHED_FLOWS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PENDING_COMPLETIONS)) {
        db.createObjectStore(STORES.PENDING_COMPLETIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PENDING_EVIDENCE)) {
        db.createObjectStore(STORES.PENDING_EVIDENCE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
}

// Helper to perform IndexedDB operations
async function dbOperation<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await getDB();
  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const request = operation(store);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export const offlineStorage = {
  // ============ FLOW CACHING ============

  async cacheFlow(flowInstance: any): Promise<void> {
    await dbOperation(STORES.CACHED_FLOWS, 'readwrite', (store) => {
      return store.put({
        ...flowInstance,
        id: flowInstance.id,
        cachedAt: new Date().toISOString(),
      });
    });
  },

  async getCachedFlows(): Promise<Record<string, any>> {
    const flows = await dbOperation<any[]>(STORES.CACHED_FLOWS, 'readonly', (store) => {
      return store.getAll();
    });
    return flows.reduce((acc, flow) => {
      acc[flow.id] = flow;
      return acc;
    }, {} as Record<string, any>);
  },

  async getCachedFlow(flowInstanceId: string): Promise<any | null> {
    return await dbOperation<any | undefined>(STORES.CACHED_FLOWS, 'readonly', (store) => {
      return store.get(flowInstanceId);
    }) || null;
  },

  // ============ PENDING COMPLETIONS ============

  async queueCompletion(
    completion: Omit<PendingCompletion, 'id' | 'createdOffline'>
  ): Promise<PendingCompletion> {
    const item: PendingCompletion = {
      ...completion,
      id: `offline-completion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdOffline: true,
    };

    await dbOperation(STORES.PENDING_COMPLETIONS, 'readwrite', (store) => {
      return store.add(item);
    });

    await this.addToSyncQueue({ type: 'completion', data: item });
    return item;
  },

  async getPendingCompletions(): Promise<PendingCompletion[]> {
    return await dbOperation<PendingCompletion[]>(STORES.PENDING_COMPLETIONS, 'readonly', (store) => {
      return store.getAll();
    });
  },

  async removeCompletion(completionId: string): Promise<void> {
    await dbOperation(STORES.PENDING_COMPLETIONS, 'readwrite', (store) => {
      return store.delete(completionId);
    });
  },

  // ============ PENDING EVIDENCE ============

  async queueEvidence(
    evidence: Omit<PendingEvidence, 'id' | 'createdAt'>
  ): Promise<PendingEvidence> {
    const item: PendingEvidence = {
      ...evidence,
      id: `offline-evidence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    await dbOperation(STORES.PENDING_EVIDENCE, 'readwrite', (store) => {
      return store.add(item);
    });

    await this.addToSyncQueue({ type: 'evidence', data: item });
    return item;
  },

  async getPendingEvidence(): Promise<PendingEvidence[]> {
    return await dbOperation<PendingEvidence[]>(STORES.PENDING_EVIDENCE, 'readonly', (store) => {
      return store.getAll();
    });
  },

  async getEvidenceBlob(evidenceId: string): Promise<Blob | null> {
    const evidence = await dbOperation<PendingEvidence | undefined>(
      STORES.PENDING_EVIDENCE,
      'readonly',
      (store) => store.get(evidenceId)
    );

    if (!evidence) return null;

    if (evidence.fileData instanceof Blob) {
      return evidence.fileData;
    } else if (typeof evidence.fileData === 'string') {
      // Convert data URL to Blob
      const response = await fetch(evidence.fileData);
      return await response.blob();
    }

    return null;
  },

  async removeEvidence(evidenceId: string): Promise<void> {
    await dbOperation(STORES.PENDING_EVIDENCE, 'readwrite', (store) => {
      return store.delete(evidenceId);
    });
  },

  // ============ SYNC QUEUE ============

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'attempts'>): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      attempts: 0,
    };

    await dbOperation(STORES.SYNC_QUEUE, 'readwrite', (store) => {
      return store.add(queueItem);
    });
  },

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await dbOperation<SyncQueueItem[]>(STORES.SYNC_QUEUE, 'readonly', (store) => {
      return store.getAll();
    });
  },

  async updateQueueItem(itemId: string, updates: Partial<SyncQueueItem>): Promise<void> {
    const item = await dbOperation<SyncQueueItem | undefined>(
      STORES.SYNC_QUEUE,
      'readonly',
      (store) => store.get(itemId)
    );

    if (item) {
      await dbOperation(STORES.SYNC_QUEUE, 'readwrite', (store) => {
        return store.put({ ...item, ...updates });
      });
    }
  },

  async removeFromSyncQueue(itemId: string): Promise<void> {
    await dbOperation(STORES.SYNC_QUEUE, 'readwrite', (store) => {
      return store.delete(itemId);
    });
  },

  // ============ METADATA ============

  async setLastSync(timestamp: string): Promise<void> {
    await dbOperation(STORES.METADATA, 'readwrite', (store) => {
      return store.put({ key: 'lastSync', value: timestamp });
    });
  },

  async getLastSync(): Promise<string | null> {
    const result = await dbOperation<{ key: string; value: string } | undefined>(
      STORES.METADATA,
      'readonly',
      (store) => store.get('lastSync')
    );
    return result?.value || null;
  },

  // ============ UTILITIES ============

  async clearAll(): Promise<void> {
    const db = await getDB();
    const stores = [
      STORES.CACHED_FLOWS,
      STORES.PENDING_COMPLETIONS,
      STORES.PENDING_EVIDENCE,
      STORES.SYNC_QUEUE,
      STORES.METADATA,
    ];

    await Promise.all(
      stores.map((storeName) =>
        dbOperation(storeName, 'readwrite', (store) => {
          return store.clear();
        })
      )
    );
  },

  async getOfflineSummary() {
    const [completions, evidence, queue, lastSync] = await Promise.all([
      this.getPendingCompletions(),
      this.getPendingEvidence(),
      this.getSyncQueue(),
      this.getLastSync(),
    ]);

    return {
      pendingCompletions: completions.length,
      pendingEvidence: evidence.length,
      queueSize: queue.length,
      lastSync,
    };
  },
};
