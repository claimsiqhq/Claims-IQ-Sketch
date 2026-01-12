/**
 * Dynamic Workflow Service
 *
 * Integrates the workflow rules engine with the database layer,
 * handling workflow generation, mutation, and evidence binding.
 *
 * Key Features:
 * - Rule-driven workflow generation
 * - Photo-step binding with evidence tracking
 * - Dynamic mutation on room/damage changes
 * - Export validation with evidence completeness
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  workflowRulesEngine,
  evaluateConditionGroup,
  BASE_WORKFLOW_RULES,
  WATER_DAMAGE_RULES,
  WIND_HAIL_RULES,
  FIRE_DAMAGE_RULES,
  POLICY_DRIVEN_RULES,
  ROOM_INSPECTION_RULES,
} from './workflowRulesEngine';
import {
  RuleEvaluationContext,
  DynamicWorkflowStep,
  EvidenceRequirement,
  WorkflowMutationEvent,
  WorkflowMutationResult,
  ExportValidationResult,
  StepOrigin,
  BlockingBehavior,
} from '../../shared/workflowTypes';
import {
  InspectionWorkflowStatus,
  InspectionStepStatus,
  InspectionWorkflow,
  InspectionWorkflowStep,
  InspectionWorkflowJson,
  WorkflowJsonStep,
  InspectionPhase,
  InspectionStepType,
  WorkflowStepEvidence,
  WorkflowMutation,
} from '../../shared/schema';
import { buildUnifiedClaimContext } from './unifiedClaimContextService';

// ============================================
// TYPES
// ============================================

export interface GenerateDynamicWorkflowResult {
  success: boolean;
  workflowId?: string;
  version?: number;
  stepsGenerated?: number;
  error?: string;
}

export interface AttachEvidenceResult {
  success: boolean;
  evidenceId?: string;
  fulfilled?: boolean;
  error?: string;
}

export interface WorkflowWithEvidence {
  workflow: InspectionWorkflow;
  steps: (InspectionWorkflowStep & {
    evidenceRequirements: EvidenceRequirement[];
    evidenceFulfilled: {
      requirementId: string;
      fulfilled: boolean;
      evidenceId?: string;
    }[];
    isBlocking: boolean;
    origin: StepOrigin;
  })[];
  stats: {
    totalSteps: number;
    completedSteps: number;
    blockedSteps: number;
    evidenceComplete: number;
    evidenceMissing: number;
  };
}

// ============================================
// WORKFLOW JSON VALIDATION
// ============================================

/**
 * Validate that workflow_json.steps exists and is non-empty.
 * This is a CRITICAL invariant: inspection_workflow_steps can ONLY be created
 * if workflow_json.steps is present and non-empty.
 *
 * @throws Error if workflow_json.steps is missing or empty
 */
function validateWorkflowJsonSteps(workflowJson: InspectionWorkflowJson): void {
  if (!workflowJson.steps) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is missing. ' +
      'Cannot create inspection_workflow_steps without a source of truth.'
    );
  }

  if (!Array.isArray(workflowJson.steps)) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is not an array. ' +
      'Cannot create inspection_workflow_steps without a valid steps array.'
    );
  }

  if (workflowJson.steps.length === 0) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is empty. ' +
      'Cannot create inspection_workflow_steps without at least one step in the source of truth.'
    );
  }

  // Validate each step has required fields
  for (let i = 0; i < workflowJson.steps.length; i++) {
    const step = workflowJson.steps[i];
    if (!step.phase || !step.step_type || !step.title || !step.instructions) {
      throw new Error(
        `WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps[${i}] is missing required fields. ` +
        `Required: phase, step_type, title, instructions. Got: ${JSON.stringify(Object.keys(step))}`
      );
    }
  }

  console.log(`[DynamicWorkflow] Validated workflow_json.steps: ${workflowJson.steps.length} steps`);
}

/**
 * Creates inspection_workflow_steps from workflow_json.steps (source of truth).
 * step_index is assigned based on array position (1-indexed).
 *
 * @throws Error if workflow_json.steps validation fails
 */
async function createStepsFromWorkflowJson(
  workflowId: string,
  workflowJson: InspectionWorkflowJson
): Promise<{ stepsCreated: number; error?: string }> {
  // CRITICAL: Validate workflow_json.steps before creating any step records
  validateWorkflowJsonSteps(workflowJson);

  // Build base step data - only include columns that exist in the database
  // Dynamic workflow columns (origin, blocking, etc.) require database migration
  const stepsToInsert = workflowJson.steps.map((step, index) => ({
    workflow_id: workflowId,
    // step_index is 1-indexed: steps[0] → step_index=1, steps[n-1] → step_index=n
    step_index: index + 1,
    phase: step.phase,
    step_type: step.step_type,
    title: step.title,
    instructions: step.instructions,
    required: step.required,
    tags: step.tags || [],
    estimated_minutes: step.estimated_minutes,
    status: InspectionStepStatus.PENDING,
    room_id: step.room_id || null,
    room_name: step.room_name || null,
    peril_specific: step.peril_specific || null,
    // Store extended data in a JSONB field if available, or omit for now
    // Dynamic workflow columns commented out until migration is applied:
    // origin, source_rule_id, conditions, evidence_requirements,
    // blocking, blocking_condition, geometry_binding, endorsement_source
  }));

  const { error: stepsError } = await supabaseAdmin
    .from('inspection_workflow_steps')
    .insert(stepsToInsert);

  if (stepsError) {
    console.error('[DynamicWorkflow] Error inserting workflow steps:', stepsError);
    return { stepsCreated: 0, error: stepsError.message };
  }

  return { stepsCreated: stepsToInsert.length };
}

// ============================================
// CONTEXT BUILDING
// ============================================

/**
 * Build rule evaluation context from claim data
 */
export async function buildRuleContext(
  claimId: string,
  organizationId: string
): Promise<RuleEvaluationContext | null> {
  // Get unified claim context
  const unifiedContext = await buildUnifiedClaimContext(claimId, organizationId);
  if (!unifiedContext) return null;

  // Get rooms and damage zones
  const { data: rooms } = await supabaseAdmin
    .from('claim_rooms')
    .select('id, name, room_type, geometry_json')
    .eq('claim_id', claimId);

  const { data: damageZones } = await supabaseAdmin
    .from('claim_damage_zones')
    .select('id, room_id, damage_type, severity, affected_area')
    .eq('claim_id', claimId);

  // Get structures
  const { data: structures } = await supabaseAdmin
    .from('claim_structures')
    .select('id, name, structure_type')
    .eq('claim_id', claimId);

  // Build the context
  const context: RuleEvaluationContext = {
    fnol: {
      dateOfLoss: unifiedContext.dateOfLossFormatted,
      lossDescription: unifiedContext.loss.description,
      reportedDamage: [], // Could extract from loss context
    },
    peril: {
      primary: unifiedContext.peril.primary,
      secondary: unifiedContext.peril.secondary || [],
      metadata: unifiedContext.peril.metadata,
    },
    policy: {
      number: unifiedContext.policyNumber,
      coverageA: unifiedContext.coverages.dwelling?.limit,
      coverageB: unifiedContext.coverages.otherStructures?.limit,
      coverageC: unifiedContext.coverages.personalProperty?.limit,
      coverageD: unifiedContext.coverages.additionalLivingExpense?.limit,
      deductible: unifiedContext.deductibles.standard.amount,
      lossSettlement: {
        dwelling: unifiedContext.lossSettlement.dwelling.basis,
        roofing: {
          basis: unifiedContext.lossSettlement.roofing.basis,
          isScheduled: unifiedContext.lossSettlement.roofing.isScheduled,
          metalFunctionalRequirement: unifiedContext.lossSettlement.roofing.metalFunctionalRequirement,
        },
      },
    },
    endorsements: unifiedContext.endorsements.extracted.map((e) => ({
      formCode: e.formCode,
      title: e.title,
      category: e.category,
      inspectionRequirements: e.inspectionRequirements,
    })),
    property: {
      type: unifiedContext.property.type,
      yearBuilt: unifiedContext.property.yearBuilt,
      stories: unifiedContext.property.stories,
      roofType: unifiedContext.property.roof.material,
      roofAge: unifiedContext.property.roof.ageAtLoss,
      exteriorDamaged: unifiedContext.property.exteriorDamaged,
      interiorDamaged: unifiedContext.property.interiorDamaged,
    },
    geometry: {
      structures: (structures || []).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.structure_type,
      })),
      rooms: (rooms || []).map((r) => {
        const roomDamageZones = (damageZones || []).filter((z) => z.room_id === r.id);
        return {
          id: r.id,
          name: r.name,
          structureId: '',
          hasDamage: roomDamageZones.length > 0,
          damageTypes: roomDamageZones.map((z) => z.damage_type),
        };
      }),
      damageZones: (damageZones || []).map((z) => ({
        id: z.id,
        roomId: z.room_id,
        damageType: z.damage_type,
        severity: z.severity,
      })),
    },
    discoveries: [], // Populated during inspection
  };

  return context;
}

// ============================================
// WORKFLOW GENERATION
// ============================================

/**
 * Generate a dynamic, rule-driven workflow for a claim
 */
export async function generateDynamicWorkflow(
  claimId: string,
  organizationId: string,
  userId?: string,
  forceRegenerate: boolean = false
): Promise<GenerateDynamicWorkflowResult> {
  try {
    // Build rule evaluation context
    const context = await buildRuleContext(claimId, organizationId);
    if (!context) {
      return { success: false, error: 'Failed to build rule context for claim' };
    }

    // Check for existing active workflow
    if (!forceRegenerate) {
      const { data: existingWorkflows } = await supabaseAdmin
        .from('inspection_workflows')
        .select('id, version')
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active'])
        .order('version', { ascending: false })
        .limit(1);

      if (existingWorkflows && existingWorkflows.length > 0) {
        return {
          success: true,
          workflowId: existingWorkflows[0].id,
          version: existingWorkflows[0].version,
        };
      }
    }

    // Get next version number
    const { data: versionData } = await supabaseAdmin
      .from('inspection_workflows')
      .select('version')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (versionData?.[0]?.version || 0) + 1;

    // Archive previous active workflows
    if (forceRegenerate) {
      await supabaseAdmin
        .from('inspection_workflows')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active']);
    }

    // Generate steps using rules engine
    const dynamicSteps = workflowRulesEngine.generateSteps(context);

    // Build steps array FIRST (source of truth)
    // Cast complex types to Record<string, unknown> for JSONB storage
    const workflowSteps: WorkflowJsonStep[] = dynamicSteps.map((step) => ({
      phase: step.phase as InspectionPhase,
      step_type: step.stepType as InspectionStepType,
      title: step.title,
      instructions: step.instructions,
      required: step.blocking === 'blocking',
      tags: step.tags,
      estimated_minutes: step.estimatedMinutes,
      peril_specific: step.tags.find((t) => t.endsWith('_peril')) || null,
      // Dynamic workflow fields - cast to Record<string, unknown> for JSONB
      origin: step.origin,
      source_rule_id: step.sourceRuleId,
      conditions: step.conditions as Record<string, unknown> | undefined,
      evidence_requirements: step.evidenceRequirements as Record<string, unknown>[] | undefined,
      blocking: step.blocking,
      blocking_condition: step.blockingCondition as Record<string, unknown> | undefined,
      geometry_binding: step.geometryBinding as Record<string, unknown> | undefined,
      room_id: step.roomId,
      room_name: step.roomName,
    }));

    // Build workflow JSON with steps as SOURCE OF TRUTH
    const workflowJson: InspectionWorkflowJson = {
      metadata: {
        claim_number: claimId,
        primary_peril: context.peril.primary,
        secondary_perils: context.peril.secondary,
        generated_at: new Date().toISOString(),
        estimated_total_time_minutes: dynamicSteps.reduce(
          (sum, s) => sum + s.estimatedMinutes,
          0
        ),
        rules_applied: dynamicSteps.map((s) => s.sourceRuleId).filter(Boolean) as string[],
      },
      phases: generatePhaseSummary(dynamicSteps),
      // SOURCE OF TRUTH: All steps in order
      steps: workflowSteps,
      tools_and_equipment: [], // Could be generated from rules
      open_questions: [],
    };

    // CRITICAL INVARIANT: Validate workflow_json.steps BEFORE saving
    // This throws if steps is missing or empty - generation will abort
    try {
      validateWorkflowJsonSteps(workflowJson);
    } catch (validationError) {
      console.error('[DynamicWorkflow] Workflow JSON steps validation failed:', validationError);
      return { success: false, error: (validationError as Error).message };
    }

    // Create workflow record with workflow_json containing steps
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .insert({
        organization_id: organizationId,
        claim_id: claimId,
        version: nextVersion,
        status: InspectionWorkflowStatus.DRAFT,
        primary_peril: context.peril.primary,
        secondary_perils: context.peril.secondary,
        workflow_json: workflowJson,
        generated_from: {
          type: 'rules_engine',
          rules_version: '1.0',
          generated_at: new Date().toISOString(),
          context_snapshot: {
            rooms: context.geometry.rooms.length,
            damageZones: context.geometry.damageZones.length,
            endorsements: context.endorsements.length,
          },
        },
        created_by: userId,
      })
      .select()
      .single();

    if (workflowError || !workflowData) {
      return { success: false, error: `Failed to create workflow: ${workflowError?.message}` };
    }

    // Create inspection_workflow_steps FROM workflow_json.steps (source of truth)
    // This function validates that workflow_json.steps exists and is non-empty,
    // and creates step records with step_index matching array position (1-indexed)
    const { stepsCreated, error: stepsError } = await createStepsFromWorkflowJson(
      workflowData.id,
      workflowJson
    );

    if (stepsError) {
      console.error('[DynamicWorkflow] Error creating steps from workflow_json:', stepsError);
      return { success: false, error: `Failed to insert steps: ${stepsError}` };
    }

    console.log(
      `[DynamicWorkflow] Generated workflow v${nextVersion} for claim ${claimId}: ${stepsCreated} steps created from workflow_json.steps (${workflowJson.steps.length} in source)`
    );

    return {
      success: true,
      workflowId: workflowData.id,
      version: nextVersion,
      stepsGenerated: stepsCreated,
    };
  } catch (error) {
    console.error('[DynamicWorkflow] Error generating workflow:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Generate phase summary from steps
 */
function generatePhaseSummary(
  steps: DynamicWorkflowStep[]
): { phase: string; title: string; step_count: number; estimated_minutes: number }[] {
  const phases = new Map<
    string,
    { phase: string; title: string; step_count: number; estimated_minutes: number }
  >();

  const phaseOrder = [
    'pre_inspection',
    'initial_walkthrough',
    'exterior',
    'interior',
    'documentation',
    'wrap_up',
  ];

  const phaseTitles: Record<string, string> = {
    pre_inspection: 'Pre-Inspection',
    initial_walkthrough: 'Initial Walkthrough',
    exterior: 'Exterior',
    interior: 'Interior',
    documentation: 'Documentation',
    wrap_up: 'Wrap Up',
  };

  for (const step of steps) {
    const existing = phases.get(step.phase);
    if (existing) {
      existing.step_count++;
      existing.estimated_minutes += step.estimatedMinutes;
    } else {
      phases.set(step.phase, {
        phase: step.phase,
        title: phaseTitles[step.phase] || step.phase,
        step_count: 1,
        estimated_minutes: step.estimatedMinutes,
      });
    }
  }

  // Return in phase order
  return phaseOrder
    .filter((p) => phases.has(p))
    .map((p) => phases.get(p)!);
}

// ============================================
// EVIDENCE BINDING
// ============================================

/**
 * Attach evidence to a workflow step
 */
export async function attachEvidenceToStep(
  stepId: string,
  requirementId: string,
  evidence: {
    type: 'photo' | 'measurement' | 'note';
    photoId?: string;
    measurementData?: {
      type: string;
      value: number;
      unit: string;
      location?: string;
    };
    noteData?: {
      text: string;
      structuredData?: Record<string, unknown>;
    };
  },
  capturedBy?: string
): Promise<AttachEvidenceResult> {
  try {
    // Insert evidence record
    const { data, error } = await supabaseAdmin
      .from('workflow_step_evidence')
      .insert({
        step_id: stepId,
        requirement_id: requirementId,
        evidence_type: evidence.type,
        photo_id: evidence.photoId,
        measurement_data: evidence.measurementData,
        note_data: evidence.noteData,
        captured_by: capturedBy,
        captured_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: `Failed to attach evidence: ${error?.message}` };
    }

    // If it's a photo, update the photo record with step binding
    if (evidence.type === 'photo' && evidence.photoId) {
      await supabaseAdmin
        .from('claim_photos')
        .update({
          workflow_step_id: stepId,
          evidence_context: {
            requirementId,
            attachedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', evidence.photoId);
    }

    // Check if requirement is now fulfilled
    const fulfilled = await checkRequirementFulfilled(stepId, requirementId);

    return {
      success: true,
      evidenceId: data.id,
      fulfilled,
    };
  } catch (error) {
    console.error('[DynamicWorkflow] Error attaching evidence:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if an evidence requirement is fulfilled
 */
async function checkRequirementFulfilled(
  stepId: string,
  requirementId: string
): Promise<boolean> {
  // Get the step to check requirements
  const { data: step } = await supabaseAdmin
    .from('inspection_workflow_steps')
    .select('evidence_requirements')
    .eq('id', stepId)
    .single();

  if (!step?.evidence_requirements) return true;

  const requirements = step.evidence_requirements as EvidenceRequirement[];
  const requirement = requirements.find(
    (r, i) => `${stepId}-evidence-${i}` === requirementId || r.label === requirementId
  );

  if (!requirement) return true;

  // Count evidence attached for this requirement
  const { count } = await supabaseAdmin
    .from('workflow_step_evidence')
    .select('id', { count: 'exact' })
    .eq('step_id', stepId)
    .eq('requirement_id', requirementId);

  // Check if minimum count met for photos
  if (requirement.type === 'photo' && requirement.photo?.minCount) {
    return (count || 0) >= requirement.photo.minCount;
  }

  // For other types, any evidence counts as fulfilled
  return (count || 0) > 0;
}

/**
 * Get evidence attached to a step
 */
export async function getStepEvidence(
  stepId: string
): Promise<WorkflowStepEvidence[]> {
  const { data } = await supabaseAdmin
    .from('workflow_step_evidence')
    .select('*')
    .eq('step_id', stepId)
    .order('captured_at', { ascending: true });

  return data || [];
}

// ============================================
// WORKFLOW MUTATION
// ============================================

/**
 * Handle workflow mutation when claim data changes
 */
export async function handleWorkflowMutation(
  workflowId: string,
  event: WorkflowMutationEvent,
  triggeredBy?: string
): Promise<WorkflowMutationResult> {
  try {
    // Get workflow and context
    const { data: workflow } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*, claim_id, organization_id')
      .eq('id', workflowId)
      .single();

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Build context
    const context = await buildRuleContext(workflow.claim_id, workflow.organization_id);
    if (!context) {
      throw new Error('Failed to build context');
    }

    // Get current steps
    const { data: currentSteps } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: true });

    // Map to DynamicWorkflowStep format
    const mappedSteps: DynamicWorkflowStep[] = (currentSteps || []).map((s) => ({
      id: s.id,
      workflowId: s.workflow_id,
      stepIndex: s.step_index,
      phase: s.phase,
      stepType: s.step_type,
      title: s.title,
      instructions: s.instructions,
      required: s.required,
      estimatedMinutes: s.estimated_minutes,
      tags: s.tags || [],
      origin: (s.origin as StepOrigin) || 'manual',
      sourceRuleId: s.source_rule_id,
      conditions: s.conditions,
      evidenceRequirements: s.evidence_requirements || [],
      evidenceFulfilled: [],
      blocking: (s.blocking as BlockingBehavior) || 'advisory',
      blockingCondition: s.blocking_condition,
      isCurrentlyBlocking: s.blocking === 'blocking',
      geometryBinding: s.geometry_binding,
      status: s.status,
      roomId: s.room_id,
      roomName: s.room_name,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    // Process mutation through rules engine
    const result = workflowRulesEngine.handleMutation(event, mappedSteps, context);

    // Get current workflow_json (source of truth)
    const workflowJson = workflow.workflow_json as InspectionWorkflowJson;
    if (!workflowJson.steps) {
      workflowJson.steps = [];
    }

    // Apply changes to workflow_json.steps FIRST (source of truth)
    // 1. Add new steps to workflow_json.steps
    if (result.stepsAdded.length > 0) {
      // Cast complex types to Record<string, unknown> for JSONB storage
      const newWorkflowJsonSteps: WorkflowJsonStep[] = result.stepsAdded.map((step) => ({
        phase: step.phase as InspectionPhase,
        step_type: step.stepType as InspectionStepType,
        title: step.title,
        instructions: step.instructions,
        required: step.blocking === 'blocking',
        tags: step.tags,
        estimated_minutes: step.estimatedMinutes,
        peril_specific: step.tags.find((t) => t.endsWith('_peril')) || null,
        origin: step.origin,
        source_rule_id: step.sourceRuleId,
        evidence_requirements: step.evidenceRequirements as Record<string, unknown>[] | undefined,
        blocking: step.blocking,
        geometry_binding: step.geometryBinding as Record<string, unknown> | undefined,
        room_id: step.roomId,
        room_name: step.roomName,
      }));

      workflowJson.steps = [...workflowJson.steps, ...newWorkflowJsonSteps];
    }

    // 2. Mark removed steps in workflow_json.steps (we don't delete to preserve structure)
    // Note: For simplicity, we track removed step indices but keep them in the array
    // The step_index in inspection_workflow_steps still maps to array position

    // Update workflow with new workflow_json
    const { error: updateWorkflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .update({
        workflow_json: workflowJson,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateWorkflowError) {
      console.error('[DynamicWorkflow] Error updating workflow_json:', updateWorkflowError);
    }

    // Now apply changes to inspection_workflow_steps table
    // 1. Insert new steps (step_index based on workflow_json.steps position)
    if (result.stepsAdded.length > 0) {
      const baseIndex = workflowJson.steps.length - result.stepsAdded.length;
      const stepsToInsert = result.stepsAdded.map((step, i) => ({
        workflow_id: workflowId,
        // step_index = position in workflow_json.steps + 1 (1-indexed)
        step_index: baseIndex + i + 1,
        phase: step.phase,
        step_type: step.stepType,
        title: step.title,
        instructions: step.instructions,
        required: step.blocking === 'blocking',
        tags: step.tags,
        estimated_minutes: step.estimatedMinutes,
        status: InspectionStepStatus.PENDING,
        room_id: step.roomId,
        room_name: step.roomName,
        origin: step.origin,
        source_rule_id: step.sourceRuleId,
        evidence_requirements: step.evidenceRequirements,
        blocking: step.blocking,
        geometry_binding: step.geometryBinding,
      }));

      await supabaseAdmin.from('inspection_workflow_steps').insert(stepsToInsert);
    }

    // 2. Remove steps (actually just mark as skipped to preserve audit trail)
    if (result.stepsRemoved.length > 0) {
      await supabaseAdmin
        .from('inspection_workflow_steps')
        .update({
          status: InspectionStepStatus.SKIPPED,
          notes: 'Removed by workflow mutation',
          updated_at: new Date().toISOString(),
        })
        .in('id', result.stepsRemoved);
    }

    // 3. Modify steps
    for (const mod of result.stepsModified) {
      await supabaseAdmin
        .from('inspection_workflow_steps')
        .update({
          ...mod.changes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mod.stepId);
    }

    // Log mutation for audit
    await supabaseAdmin.from('workflow_mutations').insert({
      workflow_id: workflowId,
      trigger: event.trigger,
      mutation_data: event.data,
      steps_added: result.stepsAdded.map((s) => s.id),
      steps_removed: result.stepsRemoved,
      steps_modified: result.stepsModified,
      triggered_by: triggeredBy,
      triggered_at: event.timestamp,
    });

    console.log(
      `[DynamicWorkflow] Mutation ${event.trigger}: +${result.stepsAdded.length}, -${result.stepsRemoved.length}, ~${result.stepsModified.length}`
    );

    return result;
  } catch (error) {
    console.error('[DynamicWorkflow] Mutation error:', error);
    return {
      stepsAdded: [],
      stepsRemoved: [],
      stepsModified: [],
    };
  }
}

/**
 * Trigger mutation when a room is added
 */
export async function onRoomAdded(
  workflowId: string,
  roomId: string,
  roomName: string,
  triggeredBy?: string
): Promise<WorkflowMutationResult> {
  return handleWorkflowMutation(
    workflowId,
    {
      trigger: 'room_added',
      timestamp: new Date().toISOString(),
      data: { roomId, roomName },
    },
    triggeredBy
  );
}

/**
 * Trigger mutation when a damage zone is added
 */
export async function onDamageZoneAdded(
  workflowId: string,
  zoneId: string,
  roomId: string,
  damageType: string,
  triggeredBy?: string
): Promise<WorkflowMutationResult> {
  return handleWorkflowMutation(
    workflowId,
    {
      trigger: 'damage_zone_added',
      timestamp: new Date().toISOString(),
      data: { zoneId, roomId, damageType },
    },
    triggeredBy
  );
}

// ============================================
// EXPORT VALIDATION
// ============================================

/**
 * Validate workflow for export readiness
 */
export async function validateWorkflowForExport(
  workflowId: string,
  organizationId: string
): Promise<ExportValidationResult> {
  // Get workflow and steps
  const { data: workflow } = await supabaseAdmin
    .from('inspection_workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('organization_id', organizationId)
    .single();

  if (!workflow) {
    return {
      canExport: false,
      riskLevel: 'blocked',
      gaps: [],
      summary: {
        totalSteps: 0,
        completedSteps: 0,
        blockedSteps: 0,
        evidenceComplete: 0,
        evidenceMissing: 0,
      },
      warnings: ['Workflow not found'],
    };
  }

  // Get steps with evidence counts
  const { data: steps } = await supabaseAdmin
    .from('inspection_workflow_steps')
    .select(`
      *,
      evidence:workflow_step_evidence(id, requirement_id, evidence_type)
    `)
    .eq('workflow_id', workflowId)
    .order('step_index', { ascending: true });

  // Build context for evaluation
  const context = await buildRuleContext(workflow.claim_id, organizationId);

  // Map steps and check evidence
  const mappedSteps: DynamicWorkflowStep[] = (steps || []).map((s) => {
    const evidenceRequirements = (s.evidence_requirements || []) as EvidenceRequirement[];
    const attachedEvidence = s.evidence || [];

    return {
      id: s.id,
      workflowId: s.workflow_id,
      stepIndex: s.step_index,
      phase: s.phase,
      stepType: s.step_type,
      title: s.title,
      instructions: s.instructions,
      required: s.required,
      estimatedMinutes: s.estimated_minutes,
      tags: s.tags || [],
      origin: s.origin as StepOrigin || 'manual',
      sourceRuleId: s.source_rule_id,
      conditions: s.conditions,
      evidenceRequirements,
      evidenceFulfilled: evidenceRequirements.map((req, i) => {
        const reqId = `${s.id}-evidence-${i}`;
        const matching = attachedEvidence.filter((e: any) => e.requirement_id === reqId);
        const minCount = req.photo?.minCount || 1;
        return {
          requirementId: reqId,
          fulfilled: matching.length >= minCount,
          fulfilledBy: matching.map((e: any) => e.id),
        };
      }),
      blocking: s.blocking as BlockingBehavior || 'advisory',
      blockingCondition: s.blocking_condition,
      isCurrentlyBlocking: s.blocking === 'blocking',
      geometryBinding: s.geometry_binding,
      status: s.status,
      roomId: s.room_id,
      roomName: s.room_name,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  });

  // Use rules engine for validation
  const validationResult = workflowRulesEngine.validateForExport(
    mappedSteps,
    context!
  );

  // Store validation result on workflow
  await supabaseAdmin
    .from('inspection_workflows')
    .update({
      export_validation: validationResult,
      evidence_summary: validationResult.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workflowId);

  return validationResult;
}

// ============================================
// PHOTO-TO-STEP LINKING
// ============================================

export interface LinkPhotoToStepResult {
  success: boolean;
  stepId?: string;
  stepProgress?: string;
  stepComplete?: boolean;
  error?: string;
}

/**
 * Link a photo to a workflow step.
 * If no explicit step is provided, attempts to auto-match based on context.
 */
export async function linkPhotoToWorkflowStep(params: {
  claimId: string;
  photoId: string;
  roomId?: string;
  damageZoneId?: string;
  explicitStepId?: string;
  organizationId: string;
}): Promise<LinkPhotoToStepResult> {
  const { claimId, photoId, roomId, damageZoneId, explicitStepId, organizationId } = params;

  try {
    // Get the active workflow for this claim
    const { data: workflow } = await supabaseAdmin
      .from('inspection_workflows')
      .select('id')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'active'])
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (!workflow) {
      return { success: false, error: 'No active workflow found for claim' };
    }

    // Get workflow steps
    const { data: steps } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select(`
        id,
        title,
        step_type,
        status,
        room_id,
        geometry_binding,
        evidence_requirements
      `)
      .eq('workflow_id', workflow.id)
      .order('step_index', { ascending: true });

    if (!steps || steps.length === 0) {
      return { success: false, error: 'No steps in workflow' };
    }

    let targetStepId = explicitStepId;

    // If no explicit step, find matching step based on context
    if (!targetStepId) {
      // Priority 1: Match by damage zone
      if (damageZoneId) {
        const damageStep = steps.find(s => {
          const binding = s.geometry_binding as { zoneId?: string } | null;
          return binding?.zoneId === damageZoneId &&
            s.step_type === 'photo' &&
            s.status !== 'completed';
        });
        if (damageStep) targetStepId = damageStep.id;
      }

      // Priority 2: Match by room
      if (!targetStepId && roomId) {
        const roomStep = steps.find(s => {
          const binding = s.geometry_binding as { roomId?: string } | null;
          return (s.room_id === roomId || binding?.roomId === roomId) &&
            s.step_type === 'photo' &&
            s.status !== 'completed';
        });
        if (roomStep) targetStepId = roomStep.id;
      }

      // Priority 3: Find any pending photo step
      if (!targetStepId) {
        const anyPhotoStep = steps.find(s =>
          s.step_type === 'photo' &&
          s.status !== 'completed'
        );
        if (anyPhotoStep) targetStepId = anyPhotoStep.id;
      }
    }

    // If we found a step, link the photo
    if (targetStepId) {
      // Get the step for context
      const step = steps.find(s => s.id === targetStepId);

      // Generate requirement ID based on step
      const evidenceReqs = step?.evidence_requirements as Array<{ type: string; label?: string }> | null;
      const photoReqIndex = evidenceReqs?.findIndex(r => r.type === 'photo') ?? 0;
      const requirementId = `${targetStepId}-evidence-${photoReqIndex}`;

      // Insert evidence record
      const { error: insertError } = await supabaseAdmin
        .from('workflow_step_evidence')
        .insert({
          step_id: targetStepId,
          requirement_id: requirementId,
          evidence_type: 'photo',
          photo_id: photoId,
          captured_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[linkPhotoToWorkflowStep] Failed to insert evidence:', insertError);
        return { success: false, error: insertError.message };
      }

      // Update the photo record with step binding
      await supabaseAdmin
        .from('claim_photos')
        .update({
          workflow_step_id: targetStepId,
          evidence_context: {
            requirementId,
            attachedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', photoId);

      // Check step progress
      const { data: evidenceData } = await supabaseAdmin
        .from('workflow_step_evidence')
        .select('id')
        .eq('step_id', targetStepId)
        .eq('evidence_type', 'photo');

      const photoCount = evidenceData?.length || 0;
      const evidenceReqsTyped = evidenceReqs as Array<{
        type: string;
        required: boolean;
        photo?: { minCount?: number; count?: number };
      }> | null;
      const photoReq = evidenceReqsTyped?.find(r => r.type === 'photo' && r.required);
      const requiredCount = photoReq?.photo?.minCount || photoReq?.photo?.count || 1;
      const stepComplete = photoCount >= requiredCount;

      // Update step if evidence requirements are now met
      if (stepComplete) {
        await supabaseAdmin
          .from('inspection_workflow_steps')
          .update({
            evidence_fulfilled: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetStepId);
      }

      return {
        success: true,
        stepId: targetStepId,
        stepProgress: `${photoCount}/${requiredCount} photos`,
        stepComplete,
      };
    }

    return { success: false, error: 'No matching workflow step found' };
  } catch (error) {
    console.error('[linkPhotoToWorkflowStep] Error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get workflow with full evidence status
 */
export async function getWorkflowWithEvidence(
  workflowId: string,
  organizationId: string
): Promise<WorkflowWithEvidence | null> {
  const { data: workflow } = await supabaseAdmin
    .from('inspection_workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('organization_id', organizationId)
    .single();

  if (!workflow) return null;

  const { data: steps } = await supabaseAdmin
    .from('inspection_workflow_steps')
    .select(`
      *,
      evidence:workflow_step_evidence(id, requirement_id, evidence_type, photo_id)
    `)
    .eq('workflow_id', workflowId)
    .order('step_index', { ascending: true });

  const mappedSteps = (steps || []).map((s) => {
    const evidenceRequirements = (s.evidence_requirements || []) as EvidenceRequirement[];
    const attachedEvidence = s.evidence || [];

    return {
      ...s,
      evidenceRequirements,
      evidenceFulfilled: evidenceRequirements.map((req, i) => {
        const reqId = `${s.id}-evidence-${i}`;
        const matching = attachedEvidence.filter((e: any) => e.requirement_id === reqId);
        return {
          requirementId: reqId,
          fulfilled: matching.length >= (req.photo?.minCount || 1),
          evidenceId: matching[0]?.id,
        };
      }),
      isBlocking: s.blocking === 'blocking',
      origin: s.origin as StepOrigin || 'manual',
    };
  });

  // Calculate stats
  const stats = {
    totalSteps: mappedSteps.length,
    completedSteps: mappedSteps.filter((s) => s.status === 'completed').length,
    blockedSteps: mappedSteps.filter((s) => s.isBlocking && s.status === 'pending').length,
    evidenceComplete: mappedSteps.flatMap((s) => s.evidenceFulfilled).filter((e) => e.fulfilled)
      .length,
    evidenceMissing: mappedSteps.flatMap((s) => s.evidenceFulfilled).filter((e) => !e.fulfilled)
      .length,
  };

  return {
    workflow,
    steps: mappedSteps,
    stats,
  };
}
