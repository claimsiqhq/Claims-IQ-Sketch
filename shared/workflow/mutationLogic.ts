/**
 * Workflow Mutation Logic
 *
 * Defines the mutation hooks and logic for live workflow updates.
 * Mutations keep the UI in sync without page reload.
 *
 * KEY DESIGN:
 * 1. Mutations are event-driven (room_added, photo_captured, etc.)
 * 2. State is updated atomically
 * 3. UI updates via subscriptions
 * 4. All mutations are audited
 */

import type {
  EvidenceBucket,
  WorkflowStep,
  WorkflowState,
  MutationTrigger,
  WorkflowMutation,
  BucketOrigin,
  EvidenceRequirement,
  RequirementFulfillment,
  ExportReadiness,
  EvidenceBucketCategory,
} from './redesignedWorkflowSchema';

// ============================================
// 1. MUTATION EVENT TYPES
// ============================================

/**
 * All possible mutation events.
 */
export type MutationEvent =
  | RoomAddedEvent
  | RoomRemovedEvent
  | DamageZoneAddedEvent
  | DamageZoneUpdatedEvent
  | PhotoCapturedEvent
  | MeasurementRecordedEvent
  | NoteAddedEvent
  | DiscoveryLoggedEvent
  | EndorsementActivatedEvent
  | ManualBucketAddedEvent
  | BucketSkippedEvent
  | WaiverAppliedEvent;

export interface RoomAddedEvent {
  type: 'room_added';
  roomId: string;
  roomName: string;
  structureId: string;
  hasDamage: boolean;
  damageTypes: string[];
}

export interface RoomRemovedEvent {
  type: 'room_removed';
  roomId: string;
}

export interface DamageZoneAddedEvent {
  type: 'damage_zone_added';
  zoneId: string;
  roomId: string;
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe';
}

export interface DamageZoneUpdatedEvent {
  type: 'damage_zone_updated';
  zoneId: string;
  changes: Partial<{
    damageType: string;
    severity: string;
    sourceTraced: boolean;
    sourceDescription: string;
  }>;
}

export interface PhotoCapturedEvent {
  type: 'photo_captured';
  photoId: string;
  bucketId: string;
  requirementId: string;
  metadata: {
    angle?: string;
    subject?: string;
    gps?: { lat: number; lng: number };
    timestamp: string;
  };
}

export interface MeasurementRecordedEvent {
  type: 'measurement_recorded';
  measurementId: string;
  bucketId: string;
  requirementId: string;
  data: {
    type: string;
    value: number;
    unit: string;
    location?: string;
  };
}

export interface NoteAddedEvent {
  type: 'note_added';
  noteId: string;
  bucketId: string;
  requirementId?: string;
  text: string;
  structuredData?: Record<string, unknown>;
}

export interface DiscoveryLoggedEvent {
  type: 'discovery_logged';
  discoveryId: string;
  discoveryType: DiscoveryType;
  description: string;
  details: Record<string, unknown>;
}

export type DiscoveryType =
  | 'additional_damage'
  | 'additional_room'
  | 'pre_existing_condition'
  | 'secondary_peril'
  | 'access_limitation'
  | 'safety_concern';

export interface EndorsementActivatedEvent {
  type: 'endorsement_activated';
  endorsementCode: string;
  title: string;
  inspectionRequirements: string[];
}

export interface ManualBucketAddedEvent {
  type: 'manual_bucket_added';
  bucket: Omit<EvidenceBucket, 'id'>;
}

export interface BucketSkippedEvent {
  type: 'bucket_skipped';
  bucketId: string;
  reason: string;
}

export interface WaiverAppliedEvent {
  type: 'waiver_applied';
  bucketId: string;
  requirementId?: string;
  reason: string;
  approvedBy?: string;
}

// ============================================
// 2. MUTATION RESULT TYPES
// ============================================

export interface MutationResult {
  success: boolean;
  error?: string;

  /** What changed */
  changes: {
    bucketsAdded: EvidenceBucket[];
    bucketsRemoved: string[];
    bucketsModified: { id: string; changes: Partial<EvidenceBucket> }[];
    stepsAdded: WorkflowStep[];
    stepsRemoved: string[];
    stepsModified: { id: string; changes: Partial<WorkflowStep> }[];
    fulfillmentUpdated: { bucketId: string; requirementId: string; fulfillment: RequirementFulfillment }[];
  };

  /** New export readiness */
  exportReadiness: ExportReadiness;

  /** User notification */
  notification?: {
    type: 'toast' | 'banner' | 'silent';
    message: string;
    actions?: { label: string; action: string }[];
  };

  /** Audit record */
  mutation: WorkflowMutation;
}

// ============================================
// 3. MUTATION HANDLERS
// ============================================

/**
 * Central mutation handler.
 * Processes events and returns state changes.
 */
export class WorkflowMutationHandler {
  private state: WorkflowState;
  private bucketTemplates: Map<string, EvidenceBucket>;

  constructor(state: WorkflowState, bucketTemplates: Map<string, EvidenceBucket>) {
    this.state = state;
    this.bucketTemplates = bucketTemplates;
  }

  /**
   * Process a mutation event.
   */
  async handleMutation(event: MutationEvent, triggeredBy: string): Promise<MutationResult> {
    const startTime = Date.now();
    const result: MutationResult = {
      success: false,
      changes: {
        bucketsAdded: [],
        bucketsRemoved: [],
        bucketsModified: [],
        stepsAdded: [],
        stepsRemoved: [],
        stepsModified: [],
        fulfillmentUpdated: [],
      },
      exportReadiness: this.state.exportState,
      mutation: {
        id: generateId(),
        timestamp: new Date().toISOString(),
        triggeredBy,
        trigger: event.type as MutationTrigger,
        triggerData: event as unknown as Record<string, unknown>,
        changes: {
          bucketsAdded: [],
          bucketsRemoved: [],
          stepsAdded: [],
          stepsRemoved: [],
          requirementsActivated: [],
          requirementsDeactivated: [],
        },
      },
    };

    try {
      switch (event.type) {
        case 'room_added':
          this.handleRoomAdded(event, result);
          break;

        case 'room_removed':
          this.handleRoomRemoved(event, result);
          break;

        case 'damage_zone_added':
          this.handleDamageZoneAdded(event, result);
          break;

        case 'damage_zone_updated':
          this.handleDamageZoneUpdated(event, result);
          break;

        case 'photo_captured':
          this.handlePhotoCaptured(event, result);
          break;

        case 'measurement_recorded':
          this.handleMeasurementRecorded(event, result);
          break;

        case 'note_added':
          this.handleNoteAdded(event, result);
          break;

        case 'discovery_logged':
          this.handleDiscoveryLogged(event, result);
          break;

        case 'endorsement_activated':
          this.handleEndorsementActivated(event, result);
          break;

        case 'manual_bucket_added':
          this.handleManualBucketAdded(event, result);
          break;

        case 'bucket_skipped':
          this.handleBucketSkipped(event, result);
          break;

        case 'waiver_applied':
          this.handleWaiverApplied(event, result);
          break;
      }

      // Recalculate export readiness
      result.exportReadiness = this.calculateExportReadiness();

      // Update mutation record
      result.mutation.changes = {
        bucketsAdded: result.changes.bucketsAdded.map(b => b.id),
        bucketsRemoved: result.changes.bucketsRemoved,
        stepsAdded: result.changes.stepsAdded.map(s => s.id),
        stepsRemoved: result.changes.stepsRemoved,
        requirementsActivated: [],
        requirementsDeactivated: [],
      };

      result.success = true;
    } catch (error) {
      result.success = false;
      result.error = (error as Error).message;
    }

    return result;
  }

  // ----------------------------------------
  // Individual Event Handlers
  // ----------------------------------------

  private handleRoomAdded(event: RoomAddedEvent, result: MutationResult): void {
    // Create room overview bucket
    const overviewBucket = this.createBucketFromTemplate('ROOM_OVERVIEW', {
      scope: { level: 'room', roomId: event.roomId, roomName: event.roomName },
      origin: { type: 'geometry' },
    });
    result.changes.bucketsAdded.push(overviewBucket);

    // Create room measurements bucket
    const measurementsBucket = this.createBucketFromTemplate('ROOM_MEASUREMENTS', {
      scope: { level: 'room', roomId: event.roomId, roomName: event.roomName },
      origin: { type: 'geometry' },
    });
    result.changes.bucketsAdded.push(measurementsBucket);

    // If room has damage, create damage detail bucket
    if (event.hasDamage) {
      const damageBucket = this.createBucketFromTemplate('ROOM_DAMAGE_DETAIL', {
        scope: { level: 'room', roomId: event.roomId, roomName: event.roomName },
        origin: { type: 'geometry' },
      });
      result.changes.bucketsAdded.push(damageBucket);
    }

    // Create corresponding steps
    for (const bucket of result.changes.bucketsAdded) {
      const step = this.createStepForBucket(bucket);
      result.changes.stepsAdded.push(step);
    }

    result.notification = {
      type: 'toast',
      message: `Room "${event.roomName}" added. ${result.changes.bucketsAdded.length} requirements added.`,
    };
  }

  private handleRoomRemoved(event: RoomRemovedEvent, result: MutationResult): void {
    // Find and deactivate room-scoped buckets
    const roomBuckets = this.state.buckets.filter(
      b => b.scope.roomId === event.roomId
    );

    for (const bucket of roomBuckets) {
      result.changes.bucketsRemoved.push(bucket.id);
      // Also remove associated steps
      const step = this.state.steps.find(s => s.bucketIds.includes(bucket.id));
      if (step) {
        result.changes.stepsRemoved.push(step.id);
      }
    }

    result.notification = {
      type: 'toast',
      message: `Room removed. ${roomBuckets.length} requirements deactivated.`,
    };
  }

  private handleDamageZoneAdded(event: DamageZoneAddedEvent, result: MutationResult): void {
    // Create damage detail bucket for the zone
    const damageBucket = this.createBucketFromTemplate('ROOM_DAMAGE_DETAIL', {
      scope: { level: 'zone', roomId: event.roomId, zoneId: event.zoneId },
      origin: { type: 'discovery', discoveryId: event.zoneId },
      tags: ['damage', event.damageType, event.severity],
    });
    result.changes.bucketsAdded.push(damageBucket);

    // If interior damage, may need source tracing
    const roomBucket = this.state.buckets.find(b => b.scope.roomId === event.roomId);
    if (roomBucket) {
      // Activate source tracing requirement if water damage
      if (event.damageType === 'water') {
        const sourceBucket = this.createBucketFromTemplate('WATER_SOURCE', {
          scope: { level: 'zone', roomId: event.roomId, zoneId: event.zoneId },
          origin: { type: 'peril' },
        });
        result.changes.bucketsAdded.push(sourceBucket);
      }
    }

    // Create step for damage bucket
    const step = this.createStepForBucket(damageBucket);
    result.changes.stepsAdded.push(step);

    result.notification = {
      type: 'toast',
      message: `Damage zone added: ${event.damageType} (${event.severity})`,
    };
  }

  private handleDamageZoneUpdated(event: DamageZoneUpdatedEvent, result: MutationResult): void {
    // Find bucket for this zone
    const zoneBucket = this.state.buckets.find(
      b => b.scope.zoneId === event.zoneId
    );

    if (zoneBucket) {
      // Update tags if severity changed
      if (event.changes.severity) {
        const newTags = zoneBucket.tags.filter(t => !['minor', 'moderate', 'severe'].includes(t));
        newTags.push(event.changes.severity);
        result.changes.bucketsModified.push({
          id: zoneBucket.id,
          changes: { tags: newTags },
        });
      }

      // If source traced, may resolve a blocker
      if (event.changes.sourceTraced) {
        result.notification = {
          type: 'toast',
          message: 'Damage source traced. Blocker resolved.',
        };
      }
    }
  }

  private handlePhotoCaptured(event: PhotoCapturedEvent, result: MutationResult): void {
    // Find the target bucket and requirement
    const bucket = this.state.buckets.find(b => b.id === event.bucketId);
    if (!bucket) return;

    const requirement = bucket.requirements.find(r => r.id === event.requirementId);
    if (!requirement) return;

    // Update fulfillment
    const fulfillment = requirement.fulfillment || {
      fulfilled: false,
      current: 0,
      required: requirement.photo?.minCount || 1,
      evidenceIds: [],
      lastUpdated: new Date().toISOString(),
    };

    fulfillment.current += 1;
    fulfillment.evidenceIds.push(event.photoId);
    fulfillment.fulfilled = fulfillment.current >= fulfillment.required;
    fulfillment.lastUpdated = new Date().toISOString();

    result.changes.fulfillmentUpdated.push({
      bucketId: event.bucketId,
      requirementId: event.requirementId,
      fulfillment,
    });

    // Check if bucket is now satisfied
    const allFulfilled = bucket.requirements
      .filter(r => r.mandatory)
      .every(r => {
        if (r.id === event.requirementId) {
          return fulfillment.fulfilled;
        }
        return r.fulfillment?.fulfilled || false;
      });

    if (allFulfilled) {
      // Update step status
      const step = this.state.steps.find(s => s.bucketIds.includes(event.bucketId));
      if (step) {
        result.changes.stepsModified.push({
          id: step.id,
          changes: { status: 'satisfied' },
        });
      }

      result.notification = {
        type: 'toast',
        message: `${bucket.name} satisfied!`,
      };
    } else {
      result.notification = {
        type: 'toast',
        message: `Photo captured (${fulfillment.current}/${fulfillment.required})`,
      };
    }
  }

  private handleMeasurementRecorded(event: MeasurementRecordedEvent, result: MutationResult): void {
    // Similar to photo capture
    const bucket = this.state.buckets.find(b => b.id === event.bucketId);
    if (!bucket) return;

    const requirement = bucket.requirements.find(r => r.id === event.requirementId);
    if (!requirement) return;

    const fulfillment = requirement.fulfillment || {
      fulfilled: false,
      current: 0,
      required: requirement.measurement?.minReadings || 1,
      evidenceIds: [],
      lastUpdated: new Date().toISOString(),
    };

    fulfillment.current += 1;
    fulfillment.evidenceIds.push(event.measurementId);
    fulfillment.fulfilled = fulfillment.current >= fulfillment.required;
    fulfillment.lastUpdated = new Date().toISOString();

    result.changes.fulfillmentUpdated.push({
      bucketId: event.bucketId,
      requirementId: event.requirementId,
      fulfillment,
    });

    result.notification = {
      type: 'toast',
      message: `Measurement recorded: ${event.data.value} ${event.data.unit}`,
    };
  }

  private handleNoteAdded(event: NoteAddedEvent, result: MutationResult): void {
    const bucket = this.state.buckets.find(b => b.id === event.bucketId);
    if (!bucket) return;

    if (event.requirementId) {
      const requirement = bucket.requirements.find(r => r.id === event.requirementId);
      if (requirement) {
        const fulfillment: RequirementFulfillment = {
          fulfilled: true,
          current: 1,
          required: 1,
          evidenceIds: [event.noteId],
          lastUpdated: new Date().toISOString(),
        };

        result.changes.fulfillmentUpdated.push({
          bucketId: event.bucketId,
          requirementId: event.requirementId,
          fulfillment,
        });
      }
    }

    result.notification = {
      type: 'silent',
      message: 'Note saved',
    };
  }

  private handleDiscoveryLogged(event: DiscoveryLoggedEvent, result: MutationResult): void {
    // Discovery may trigger new buckets
    switch (event.discoveryType) {
      case 'additional_damage':
        // Create damage bucket
        const damageBucket = this.createBucketFromTemplate('ROOM_DAMAGE_DETAIL', {
          origin: { type: 'discovery', discoveryId: event.discoveryId },
          tags: ['discovery', 'additional_damage'],
        });
        result.changes.bucketsAdded.push(damageBucket);
        break;

      case 'pre_existing_condition':
        // Note requirement for documentation
        result.notification = {
          type: 'banner',
          message: 'Pre-existing condition logged. Document thoroughly for claim differentiation.',
          actions: [{ label: 'Add Photos', action: 'open_camera' }],
        };
        break;

      case 'safety_concern':
        // May block further inspection
        result.notification = {
          type: 'banner',
          message: 'Safety concern logged. Assess before proceeding.',
          actions: [{ label: 'Document', action: 'add_note' }],
        };
        break;
    }
  }

  private handleEndorsementActivated(event: EndorsementActivatedEvent, result: MutationResult): void {
    // Create endorsement-driven buckets
    if (event.endorsementCode.includes('roof_schedule')) {
      const roofBucket = this.createBucketFromTemplate('ROOF_SCHEDULE_DOCUMENTATION', {
        origin: { type: 'endorsement', endorsementCode: event.endorsementCode },
      });
      result.changes.bucketsAdded.push(roofBucket);

      const step = this.createStepForBucket(roofBucket);
      result.changes.stepsAdded.push(step);
    }

    result.notification = {
      type: 'banner',
      message: `Policy endorsement activated: ${event.title}. Additional requirements added.`,
    };
  }

  private handleManualBucketAdded(event: ManualBucketAddedEvent, result: MutationResult): void {
    const bucket: EvidenceBucket = {
      ...event.bucket,
      id: generateId(),
    };
    result.changes.bucketsAdded.push(bucket);

    const step = this.createStepForBucket(bucket);
    result.changes.stepsAdded.push(step);

    result.notification = {
      type: 'toast',
      message: `Manual bucket added: ${bucket.name}`,
    };
  }

  private handleBucketSkipped(event: BucketSkippedEvent, result: MutationResult): void {
    // Mark bucket as skipped (but keep for audit)
    const bucket = this.state.buckets.find(b => b.id === event.bucketId);
    if (bucket && bucket.blocking.type !== 'always') {
      // Find associated step and mark skipped
      const step = this.state.steps.find(s => s.bucketIds.includes(event.bucketId));
      if (step) {
        result.changes.stepsModified.push({
          id: step.id,
          changes: { status: 'skipped' },
        });
      }

      result.notification = {
        type: 'toast',
        message: `${bucket.name} skipped: ${event.reason}`,
      };
    }
  }

  private handleWaiverApplied(event: WaiverAppliedEvent, result: MutationResult): void {
    // Mark as waived in export readiness
    result.notification = {
      type: 'toast',
      message: 'Waiver applied. Reason recorded for audit.',
    };
  }

  // ----------------------------------------
  // Helper Methods
  // ----------------------------------------

  private createBucketFromTemplate(
    templateId: string,
    overrides: Partial<{
      scope: EvidenceBucket['scope'];
      origin: BucketOrigin;
      tags: string[];
    }>
  ): EvidenceBucket {
    const template = this.bucketTemplates.get(templateId);
    if (!template) {
      throw new Error(`Unknown bucket template: ${templateId}`);
    }

    const bucket: EvidenceBucket = {
      ...template,
      id: generateId(),
      scope: overrides.scope || { level: 'claim' },
      origin: overrides.origin || { type: 'base' },
      tags: [...template.tags, ...(overrides.tags || [])],
      requirements: template.requirements.map(r => ({
        ...r,
        id: generateId(),
        fulfillment: {
          fulfilled: false,
          current: 0,
          required: r.photo?.minCount || r.measurement?.minReadings || 1,
          evidenceIds: [],
          lastUpdated: new Date().toISOString(),
        },
      })),
    };

    return bucket;
  }

  private createStepForBucket(bucket: EvidenceBucket): WorkflowStep {
    // Determine step type from bucket category
    const stepTypeByCategory: Record<EvidenceBucketCategory, 'capture' | 'assess' | 'verify' | 'classify' | 'interview' | 'review'> = {
      identity: 'verify',
      safety: 'verify',
      exterior_overview: 'capture',
      roof: 'capture',
      interior_overview: 'capture',
      damage_detail: 'capture',
      source_tracing: 'assess',
      measurement: 'capture',
      peril_specific: 'classify',
      endorsement: 'capture',
      synthesis: 'review',
    };

    const step: WorkflowStep = {
      id: generateId(),
      index: this.state.steps.length,
      type: stepTypeByCategory[bucket.category],
      title: bucket.name,
      instructions: bucket.purpose,
      phase: this.getPhaseForCategory(bucket.category),
      bucketIds: [bucket.id],
      primaryBucketId: bucket.id,
      roomId: bucket.scope.roomId,
      roomName: bucket.scope.roomName,
      tags: bucket.tags,
      estimatedMinutes: 5,
      status: 'pending',
      origin: bucket.origin.type === 'base' ? 'base_rule' : bucket.origin.type === 'peril' ? 'peril_rule' : bucket.origin.type === 'endorsement' ? 'policy_rule' : bucket.origin.type === 'geometry' ? 'geometry' : bucket.origin.type === 'discovery' ? 'discovery' : 'manual',
    };

    return step;
  }

  private getPhaseForCategory(category: EvidenceBucketCategory): 'arrival' | 'orientation' | 'exterior' | 'interior' | 'synthesis' | 'departure' {
    const phaseByCategory: Record<EvidenceBucketCategory, 'arrival' | 'orientation' | 'exterior' | 'interior' | 'synthesis' | 'departure'> = {
      identity: 'arrival',
      safety: 'arrival',
      exterior_overview: 'exterior',
      roof: 'exterior',
      interior_overview: 'interior',
      damage_detail: 'interior',
      source_tracing: 'interior',
      measurement: 'interior',
      peril_specific: 'interior',
      endorsement: 'exterior',
      synthesis: 'synthesis',
    };
    return phaseByCategory[category];
  }

  private calculateExportReadiness(): ExportReadiness {
    const issues: ExportReadiness['issues'] = {
      blocking: [],
      warning: [],
      advisory: [],
    };

    let satisfiedCount = 0;

    for (const bucket of this.state.buckets) {
      const mandatoryReqs = bucket.requirements.filter(r => r.mandatory);
      const allMandatoryFulfilled = mandatoryReqs.every(r => r.fulfillment?.fulfilled);

      if (allMandatoryFulfilled) {
        satisfiedCount++;
      } else {
        // Create issue
        const issue = {
          id: generateId(),
          severity: bucket.blocking.type === 'always' ? 'blocking' as const : 'warning' as const,
          title: `${bucket.name} incomplete`,
          description: `Missing required evidence for ${bucket.name}`,
          resolution: `Capture required ${mandatoryReqs.filter(r => !r.fulfillment?.fulfilled).map(r => r.type).join(', ')}`,
          bucketId: bucket.id,
          waivable: bucket.blocking.type !== 'always',
        };

        if (issue.severity === 'blocking') {
          issues.blocking.push(issue);
        } else {
          issues.warning.push(issue);
        }
      }
    }

    const canExport = issues.blocking.length === 0;
    const riskLevel = issues.blocking.length > 0 ? 'blocked' :
      issues.warning.length > 5 ? 'high' :
      issues.warning.length > 0 ? 'medium' :
      issues.advisory.length > 0 ? 'low' : 'none';

    // Calculate defensibility score
    const totalMandatory = this.state.buckets.flatMap(b => b.requirements.filter(r => r.mandatory)).length;
    const fulfilledMandatory = this.state.buckets.flatMap(b => b.requirements.filter(r => r.mandatory && r.fulfillment?.fulfilled)).length;
    const defensibilityScore = totalMandatory > 0 ? Math.round((fulfilledMandatory / totalMandatory) * 100) : 0;

    return {
      canExport,
      riskLevel,
      defensibilityScore,
      issues,
      summary: {
        totalBuckets: this.state.buckets.length,
        satisfiedBuckets: satisfiedCount,
        blockingGaps: issues.blocking.length,
        warningGaps: issues.warning.length,
      },
      lastValidated: new Date().toISOString(),
    };
  }
}

// ============================================
// 4. MUTATION SUBSCRIPTION SYSTEM
// ============================================

export type MutationSubscriber = (result: MutationResult) => void;

/**
 * Subscription manager for real-time UI updates.
 */
export class MutationSubscriptionManager {
  private subscribers: Set<MutationSubscriber> = new Set();

  subscribe(callback: MutationSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify(result: MutationResult): void {
    this.subscribers.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('Mutation subscriber error:', error);
      }
    });
  }
}

// ============================================
// 5. REACT HOOKS FOR MUTATIONS
// ============================================

/**
 * React hook signatures for workflow mutations.
 * Implementation would be in client/src/hooks/useWorkflowMutation.ts
 */
export interface UseWorkflowMutationHook {
  /** Trigger a mutation event */
  mutate: (event: MutationEvent) => Promise<MutationResult>;

  /** Current mutation state */
  isPending: boolean;

  /** Last mutation result */
  lastResult?: MutationResult;

  /** Error if mutation failed */
  error?: Error;
}

export interface UseWorkflowStateHook {
  /** Current workflow state */
  state: WorkflowState;

  /** Is state loading */
  isLoading: boolean;

  /** Refetch state */
  refetch: () => Promise<void>;

  /** Subscribe to mutations */
  subscribeToMutations: (callback: MutationSubscriber) => () => void;
}

export interface UseBucketFocusHook {
  /** Current focused bucket */
  currentBucket: EvidenceBucket | null;

  /** Navigate to next bucket */
  nextBucket: () => void;

  /** Navigate to previous bucket */
  prevBucket: () => void;

  /** Focus specific bucket */
  focusBucket: (bucketId: string) => void;

  /** Skip current bucket */
  skipBucket: (reason: string) => Promise<void>;
}

export interface UseExportReadinessHook {
  /** Current export readiness */
  exportReadiness: ExportReadiness;

  /** Validate for export */
  validate: () => Promise<ExportReadiness>;

  /** Apply waiver */
  applyWaiver: (bucketId: string, reason: string) => Promise<void>;

  /** Export workflow */
  export: () => Promise<{ success: boolean; reportUrl?: string }>;
}

// ============================================
// 6. SERVER ACTION SIGNATURES
// ============================================

/**
 * Server action signatures for workflow mutations.
 * Implementation would be in server/routes/workflow.ts
 */
export interface WorkflowServerActions {
  /** Process mutation event */
  processMutation: (
    workflowId: string,
    event: MutationEvent,
    userId: string
  ) => Promise<MutationResult>;

  /** Get current workflow state */
  getWorkflowState: (workflowId: string) => Promise<WorkflowState>;

  /** Validate export readiness */
  validateExport: (workflowId: string) => Promise<ExportReadiness>;

  /** Apply waiver */
  applyWaiver: (
    workflowId: string,
    bucketId: string,
    reason: string,
    userId: string
  ) => Promise<{ success: boolean }>;

  /** Generate export report */
  generateExport: (workflowId: string, userId: string) => Promise<{
    success: boolean;
    reportId?: string;
    reportUrl?: string;
  }>;
}

// ============================================
// 7. UTILITY FUNCTIONS
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate bucket fulfillment percentage.
 */
export function calculateBucketFulfillment(bucket: EvidenceBucket): number {
  const mandatoryReqs = bucket.requirements.filter(r => r.mandatory);
  if (mandatoryReqs.length === 0) return 100;

  const fulfilledCount = mandatoryReqs.filter(r => r.fulfillment?.fulfilled).length;
  return Math.round((fulfilledCount / mandatoryReqs.length) * 100);
}

/**
 * Get next unfulfilled bucket.
 */
export function getNextUnfulfilledBucket(
  buckets: EvidenceBucket[],
  currentBucketId?: string
): EvidenceBucket | null {
  const currentIndex = currentBucketId
    ? buckets.findIndex(b => b.id === currentBucketId)
    : -1;

  for (let i = currentIndex + 1; i < buckets.length; i++) {
    if (calculateBucketFulfillment(buckets[i]) < 100) {
      return buckets[i];
    }
  }

  // Wrap around
  for (let i = 0; i <= currentIndex; i++) {
    if (calculateBucketFulfillment(buckets[i]) < 100) {
      return buckets[i];
    }
  }

  return null;
}

/**
 * Get bucket completion summary.
 */
export function getBucketSummary(buckets: EvidenceBucket[]): {
  total: number;
  satisfied: number;
  partial: number;
  empty: number;
} {
  let satisfied = 0;
  let partial = 0;
  let empty = 0;

  for (const bucket of buckets) {
    const fulfillment = calculateBucketFulfillment(bucket);
    if (fulfillment === 100) {
      satisfied++;
    } else if (fulfillment > 0) {
      partial++;
    } else {
      empty++;
    }
  }

  return { total: buckets.length, satisfied, partial, empty };
}
