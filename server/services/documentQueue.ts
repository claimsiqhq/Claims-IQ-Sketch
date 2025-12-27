/**
 * Document Processing Queue - Server-side background processing
 *
 * This module implements a simple in-memory queue for processing documents
 * after they're uploaded. Processing happens asynchronously so uploads
 * return immediately.
 *
 * Features:
 * - Parallel processing (configurable concurrency)
 * - Automatic retry on failures
 * - Status tracking per document
 * - Fire-and-forget pattern for non-blocking uploads
 * - Auto-classification support for unknown document types
 */

import { processDocument as processDocumentAI } from './documentProcessor';
import { classifyDocumentFromStorage } from './documentClassifier';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// ============================================
// TYPES
// ============================================

export type ProcessingStatus = 'pending' | 'classifying' | 'processing' | 'completed' | 'failed';

interface QueueItem {
  documentId: string;
  organizationId: string;
  needsClassification: boolean; // If true, classify before processing
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  error?: string;
}

interface ProcessingStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

// ============================================
// QUEUE STATE
// ============================================

const queue: QueueItem[] = [];
const processing: Set<string> = new Set();
const completed: Map<string, { success: boolean; error?: string }> = new Map();

const MAX_CONCURRENT = 4; // Process up to 4 documents simultaneously
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

let isProcessing = false;

// ============================================
// QUEUE MANAGEMENT
// ============================================

/**
 * Add a document to the processing queue
 * Returns immediately - processing happens in background
 *
 * @param documentId - The document ID
 * @param organizationId - The organization ID
 * @param needsClassification - If true, auto-classify before processing
 */
export function queueDocumentProcessing(
  documentId: string,
  organizationId: string,
  needsClassification: boolean = false
): void {
  // Check if already in queue or processing
  if (queue.some(item => item.documentId === documentId) || processing.has(documentId)) {
    console.log(`[DocumentQueue] Document ${documentId} already queued or processing`);
    return;
  }

  const item: QueueItem = {
    documentId,
    organizationId,
    needsClassification,
    addedAt: Date.now(),
    retryCount: 0,
  };

  queue.push(item);
  console.log(`[DocumentQueue] Added document ${documentId} to queue (classification: ${needsClassification}, queue size: ${queue.length})`);

  // Trigger processing
  processQueueAsync();
}

/**
 * Add multiple documents to the processing queue
 */
export function queueDocumentsProcessing(
  documents: Array<{ documentId: string; organizationId: string; needsClassification?: boolean }>
): void {
  for (const doc of documents) {
    queueDocumentProcessing(doc.documentId, doc.organizationId, doc.needsClassification ?? false);
  }
}

/**
 * Get the processing status of a document
 */
export function getDocumentProcessingStatus(documentId: string): ProcessingStatus {
  if (processing.has(documentId)) {
    return 'processing';
  }

  const completedResult = completed.get(documentId);
  if (completedResult) {
    return completedResult.success ? 'completed' : 'failed';
  }

  if (queue.some(item => item.documentId === documentId)) {
    return 'pending';
  }

  // Not in queue, check database status
  return 'pending';
}

/**
 * Get batch status for multiple documents
 */
export function getBatchProcessingStatus(
  documentIds: string[]
): Record<string, ProcessingStatus> {
  const result: Record<string, ProcessingStatus> = {};

  for (const id of documentIds) {
    result[id] = getDocumentProcessingStatus(id);
  }

  return result;
}

/**
 * Get queue statistics
 */
export function getQueueStats(): ProcessingStats {
  return {
    queued: queue.length,
    processing: processing.size,
    completed: Array.from(completed.values()).filter(r => r.success).length,
    failed: Array.from(completed.values()).filter(r => !r.success).length,
  };
}

// ============================================
// QUEUE PROCESSOR
// ============================================

async function processQueueAsync(): Promise<void> {
  // Prevent concurrent queue processing
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (queue.length > 0 && processing.size < MAX_CONCURRENT) {
      const item = queue.shift();
      if (!item) break;

      // Process in background (don't await)
      processItemAsync(item).catch(err => {
        console.error(`[DocumentQueue] Unexpected error processing ${item.documentId}:`, err);
      });
    }
  } finally {
    isProcessing = false;

    // If there are still items in queue and we have capacity, continue processing
    if (queue.length > 0 && processing.size < MAX_CONCURRENT) {
      setImmediate(() => processQueueAsync());
    }
  }
}

async function processItemAsync(item: QueueItem): Promise<void> {
  const { documentId, organizationId, needsClassification } = item;

  processing.add(documentId);
  item.startedAt = Date.now();

  console.log(`[DocumentQueue] Starting processing for document ${documentId} (attempt ${item.retryCount + 1}, classification: ${needsClassification})`);

  try {
    // Step 1: Classification (if needed)
    if (needsClassification) {
      console.log(`[DocumentQueue] Classifying document ${documentId}...`);

      // Get document info to find storage path
      const { data: doc, error: docError } = await supabaseAdmin
        .from('documents')
        .select('storage_path, type')
        .eq('id', documentId)
        .single();

      if (docError || !doc) {
        throw new Error(`Document not found: ${docError?.message || 'No data'}`);
      }

      // Update status to classifying
      await supabaseAdmin
        .from('documents')
        .update({ processing_status: 'classifying', updated_at: new Date().toISOString() })
        .eq('id', documentId);

      // Run classification
      const classification = await classifyDocumentFromStorage(doc.storage_path);

      console.log(`[DocumentQueue] Document ${documentId} classified as: ${classification.documentType} (confidence: ${classification.confidence})`);

      // Update document with classified type
      const { error: classifyUpdateError } = await supabaseAdmin
        .from('documents')
        .update({
          type: classification.documentType,
          extracted_data: {
            ...((doc as any).extracted_data || {}),
            _classification: {
              documentType: classification.documentType,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              detectedFormCode: classification.detectedFormCode,
              detectedTitle: classification.detectedTitle,
              classifiedAt: new Date().toISOString(),
            },
          },
          processing_status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (classifyUpdateError) {
        console.error(`[DocumentQueue] Failed to update document type after classification: ${classifyUpdateError.message}`);
      } else {
        console.log(`[DocumentQueue] Successfully updated document ${documentId} type to: ${classification.documentType}`);
      }

      // Skip AI extraction for photos and correspondence - they don't need it
      if (classification.documentType === 'photo' || classification.documentType === 'correspondence') {
        console.log(`[DocumentQueue] Document ${documentId} is ${classification.documentType}, skipping AI extraction`);

        await supabaseAdmin
          .from('documents')
          .update({ processing_status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', documentId);

        processing.delete(documentId);
        completed.set(documentId, { success: true });
        item.completedAt = Date.now();

        console.log(`[DocumentQueue] Document ${documentId} completed (classification only) in ${Date.now() - item.startedAt}ms`);
        processQueueAsync();
        return;
      }
    }

    // Step 2: AI Extraction
    console.log(`[DocumentQueue] Starting AI extraction for document ${documentId}...`);
    const extractionResult = await processDocumentAI(documentId, organizationId);
    console.log(`[DocumentQueue] AI extraction completed for document ${documentId}, result type: ${typeof extractionResult}`);

    // Success
    processing.delete(documentId);
    completed.set(documentId, { success: true });
    item.completedAt = Date.now();

    console.log(`[DocumentQueue] Document ${documentId} processed successfully in ${Date.now() - item.startedAt}ms`);

  } catch (error) {
    processing.delete(documentId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[DocumentQueue] Processing failed for document ${documentId}:`, errorMessage);

    // Retry logic
    if (item.retryCount < MAX_RETRIES) {
      item.retryCount++;
      item.error = errorMessage;

      console.log(`[DocumentQueue] Scheduling retry ${item.retryCount}/${MAX_RETRIES} for document ${documentId} in ${RETRY_DELAY_MS}ms`);

      // Add back to queue after delay
      setTimeout(() => {
        queue.push(item);
        processQueueAsync();
      }, RETRY_DELAY_MS);

    } else {
      // Max retries exceeded
      completed.set(documentId, { success: false, error: errorMessage });
      item.completedAt = Date.now();

      console.error(`[DocumentQueue] Document ${documentId} failed after ${MAX_RETRIES} retries: ${errorMessage}`);
    }
  }

  // Trigger next item
  processQueueAsync();
}

// ============================================
// CLEANUP
// ============================================

// Clear old completed entries periodically (keep for 1 hour)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_COMPLETED_AGE = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [documentId] of completed) {
    // In a real implementation, we'd track when items were completed
    // For now, just keep the last 1000 entries
    if (completed.size > 1000) {
      completed.delete(documentId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[DocumentQueue] Cleaned up ${cleaned} old completed entries`);
  }
}, CLEANUP_INTERVAL);

// ============================================
// INITIALIZATION
// ============================================

console.log('[DocumentQueue] Document processing queue initialized (max concurrent: ' + MAX_CONCURRENT + ')');
