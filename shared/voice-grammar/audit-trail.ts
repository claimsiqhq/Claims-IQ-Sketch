/**
 * Audit Trail Service
 *
 * Provides comprehensive auditing for voice grammar inferences.
 * All inferences are logged, timestamped, and can be reviewed/reversed.
 *
 * Key capabilities:
 * - Log all inference decisions with reasoning
 * - Track confidence levels
 * - Enable reversibility of inferences
 * - Generate audit reports
 * - Export audit data for compliance
 */

import type { NormalizedIntent, InferenceLogEntry } from './types';

// ============================================
// TYPES
// ============================================

export interface AuditRecord {
  id: string;
  timestamp: string;
  sessionId?: string;
  userId?: string;

  // Input
  rawInput: string;

  // Parsed result
  intent: NormalizedIntent;

  // Inference details
  inferences: InferenceLogEntry[];
  totalInferences: number;
  reversibleCount: number;
  averageConfidence: number;

  // Warnings
  warnings: string[];
  hasLowConfidence: boolean;

  // Execution
  executed: boolean;
  executionResult?: 'success' | 'failed' | 'cancelled';
  executionMessage?: string;

  // Reversals
  reversals: ReversalRecord[];
}

export interface ReversalRecord {
  timestamp: string;
  field: string;
  originalValue: unknown;
  reversedTo: unknown;
  reason: string;
}

export interface AuditSummary {
  totalRecords: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  averageConfidence: number;
  mostCommonIntents: Array<{ intent: string; count: number }>;
  mostInferredFields: Array<{ field: string; count: number }>;
  reversalRate: number;
  lowConfidenceRate: number;
}

// ============================================
// AUDIT STORE
// ============================================

class AuditTrailStore {
  private records: Map<string, AuditRecord> = new Map();
  private sessionRecords: Map<string, string[]> = new Map();

  /**
   * Create a new audit record for an intent
   */
  createRecord(
    intent: NormalizedIntent,
    rawInput: string,
    sessionId?: string,
    userId?: string
  ): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const inferences = intent.inferenceLog;
    const totalInferences = inferences.length;
    const reversibleCount = inferences.filter(i => i.reversible).length;
    const averageConfidence = totalInferences > 0
      ? inferences.reduce((sum, i) => sum + i.confidence, 0) / totalInferences
      : 1;

    // Generate warnings
    const warnings: string[] = [];
    for (const inf of inferences) {
      if (inf.confidence < 0.5) {
        warnings.push(
          `Low confidence (${Math.round(inf.confidence * 100)}%) for ${inf.field}: ${inf.reason}`
        );
      }
    }
    if (intent.confidence < 0.7) {
      warnings.push(
        `Overall intent confidence is low (${Math.round(intent.confidence * 100)}%)`
      );
    }

    const record: AuditRecord = {
      id,
      timestamp: now,
      sessionId,
      userId,
      rawInput,
      intent,
      inferences,
      totalInferences,
      reversibleCount,
      averageConfidence,
      warnings,
      hasLowConfidence: averageConfidence < 0.6 || intent.confidence < 0.7,
      executed: false,
      reversals: [],
    };

    this.records.set(id, record);

    // Track by session
    if (sessionId) {
      const sessionIds = this.sessionRecords.get(sessionId) || [];
      sessionIds.push(id);
      this.sessionRecords.set(sessionId, sessionIds);
    }

    return id;
  }

  /**
   * Mark a record as executed
   */
  markExecuted(
    recordId: string,
    result: 'success' | 'failed' | 'cancelled',
    message?: string
  ): void {
    const record = this.records.get(recordId);
    if (record) {
      record.executed = true;
      record.executionResult = result;
      record.executionMessage = message;
    }
  }

  /**
   * Record a reversal
   */
  addReversal(
    recordId: string,
    field: string,
    originalValue: unknown,
    reversedTo: unknown,
    reason: string
  ): void {
    const record = this.records.get(recordId);
    if (record) {
      record.reversals.push({
        timestamp: new Date().toISOString(),
        field,
        originalValue,
        reversedTo,
        reason,
      });
    }
  }

  /**
   * Get a record by ID
   */
  getRecord(recordId: string): AuditRecord | undefined {
    return this.records.get(recordId);
  }

  /**
   * Get all records for a session
   */
  getSessionRecords(sessionId: string): AuditRecord[] {
    const ids = this.sessionRecords.get(sessionId) || [];
    return ids
      .map(id => this.records.get(id))
      .filter((r): r is AuditRecord => r !== undefined);
  }

  /**
   * Get recent records
   */
  getRecentRecords(limit: number = 100): AuditRecord[] {
    const allRecords = Array.from(this.records.values());
    return allRecords
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Generate audit summary
   */
  getSummary(sessionId?: string): AuditSummary {
    const records = sessionId
      ? this.getSessionRecords(sessionId)
      : Array.from(this.records.values());

    if (records.length === 0) {
      return {
        totalRecords: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        cancelledExecutions: 0,
        averageConfidence: 1,
        mostCommonIntents: [],
        mostInferredFields: [],
        reversalRate: 0,
        lowConfidenceRate: 0,
      };
    }

    // Count execution results
    const successfulExecutions = records.filter(r => r.executionResult === 'success').length;
    const failedExecutions = records.filter(r => r.executionResult === 'failed').length;
    const cancelledExecutions = records.filter(r => r.executionResult === 'cancelled').length;

    // Calculate average confidence
    const totalConfidence = records.reduce((sum, r) => sum + r.averageConfidence, 0);
    const averageConfidence = totalConfidence / records.length;

    // Count intents
    const intentCounts = new Map<string, number>();
    for (const record of records) {
      const count = intentCounts.get(record.intent.intent) || 0;
      intentCounts.set(record.intent.intent, count + 1);
    }
    const mostCommonIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Count inferred fields
    const fieldCounts = new Map<string, number>();
    for (const record of records) {
      for (const inf of record.inferences) {
        const count = fieldCounts.get(inf.field) || 0;
        fieldCounts.set(inf.field, count + 1);
      }
    }
    const mostInferredFields = Array.from(fieldCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate reversal rate
    const totalReversals = records.reduce((sum, r) => sum + r.reversals.length, 0);
    const totalInferences = records.reduce((sum, r) => sum + r.totalInferences, 0);
    const reversalRate = totalInferences > 0 ? totalReversals / totalInferences : 0;

    // Calculate low confidence rate
    const lowConfidenceCount = records.filter(r => r.hasLowConfidence).length;
    const lowConfidenceRate = lowConfidenceCount / records.length;

    return {
      totalRecords: records.length,
      successfulExecutions,
      failedExecutions,
      cancelledExecutions,
      averageConfidence,
      mostCommonIntents,
      mostInferredFields,
      reversalRate,
      lowConfidenceRate,
    };
  }

  /**
   * Export records for compliance/debugging
   */
  exportRecords(sessionId?: string): string {
    const records = sessionId
      ? this.getSessionRecords(sessionId)
      : Array.from(this.records.values());

    return JSON.stringify(records, null, 2);
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
    this.sessionRecords.clear();
  }

  /**
   * Clear old records (retention policy)
   */
  clearOlderThan(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [id, record] of this.records.entries()) {
      const recordTime = new Date(record.timestamp).getTime();
      if (recordTime < cutoff) {
        this.records.delete(id);
        cleared++;
      }
    }

    // Also clean up session records
    for (const [sessionId, ids] of this.sessionRecords.entries()) {
      const validIds = ids.filter(id => this.records.has(id));
      if (validIds.length === 0) {
        this.sessionRecords.delete(sessionId);
      } else {
        this.sessionRecords.set(sessionId, validIds);
      }
    }

    return cleared;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const auditTrail = new AuditTrailStore();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format an audit record for display
 */
export function formatAuditRecord(record: AuditRecord): string {
  const lines = [
    `=== Audit Record ${record.id} ===`,
    `Timestamp: ${record.timestamp}`,
    `Session: ${record.sessionId || 'N/A'}`,
    `Intent: ${record.intent.intent}`,
    `Confidence: ${Math.round(record.intent.confidence * 100)}%`,
    '',
    `Raw Input: "${record.rawInput}"`,
    '',
    `Inferences (${record.totalInferences} total, ${record.reversibleCount} reversible):`,
  ];

  for (const inf of record.inferences) {
    const value = typeof inf.inferredValue === 'object'
      ? JSON.stringify(inf.inferredValue)
      : String(inf.inferredValue);
    lines.push(`  - ${inf.field}: ${value}`);
    lines.push(`    Reason: ${inf.reason}`);
    lines.push(`    Confidence: ${Math.round(inf.confidence * 100)}%`);
    lines.push(`    Reversible: ${inf.reversible ? 'Yes' : 'No'}`);
  }

  if (record.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of record.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
  }

  if (record.executed) {
    lines.push('');
    lines.push(`Execution: ${record.executionResult}`);
    if (record.executionMessage) {
      lines.push(`Message: ${record.executionMessage}`);
    }
  }

  if (record.reversals.length > 0) {
    lines.push('');
    lines.push(`Reversals (${record.reversals.length}):`);
    for (const rev of record.reversals) {
      lines.push(`  - ${rev.field}: ${JSON.stringify(rev.originalValue)} → ${JSON.stringify(rev.reversedTo)}`);
      lines.push(`    Reason: ${rev.reason}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format audit summary for display
 */
export function formatAuditSummary(summary: AuditSummary): string {
  const lines = [
    '=== Audit Summary ===',
    '',
    `Total Records: ${summary.totalRecords}`,
    `Successful: ${summary.successfulExecutions}`,
    `Failed: ${summary.failedExecutions}`,
    `Cancelled: ${summary.cancelledExecutions}`,
    '',
    `Average Confidence: ${Math.round(summary.averageConfidence * 100)}%`,
    `Low Confidence Rate: ${Math.round(summary.lowConfidenceRate * 100)}%`,
    `Reversal Rate: ${Math.round(summary.reversalRate * 100)}%`,
    '',
    'Most Common Intents:',
  ];

  for (const { intent, count } of summary.mostCommonIntents) {
    lines.push(`  - ${intent}: ${count}`);
  }

  lines.push('');
  lines.push('Most Inferred Fields:');
  for (const { field, count } of summary.mostInferredFields) {
    lines.push(`  - ${field}: ${count}`);
  }

  return lines.join('\n');
}
