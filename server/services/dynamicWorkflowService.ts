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

    // Build workflow JSON
    const workflowJson = {
      metadata: {
        claim_number: claimId,
        primary_peril: context.peril.primary,
        secondary_perils: context.peril.secondary,
        generated_at: new Date().toISOString(),
        estimated_total_time_minutes: dynamicSteps.reduce(
          (sum, s) => sum + s.estimatedMinutes,
          0
        ),
        rules_applied: dynamicSteps.map((s) => s.sourceRuleId).filter(Boolean),
      },
      phases: generatePhaseSummary(dynamicSteps),
      tools_and_equipment: [], // Could be generated from rules
      open_questions: [],
    };

    // Create workflow record
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

    // Insert workflow steps
    const stepsToInsert = dynamicSteps.map((step, index) => ({
      workflow_id: workflowData.id,
      step_index: index,
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
      peril_specific: step.tags.find((t) => t.endsWith('_peril')) || null,
      // New fields for dynamic workflow
      origin: step.origin,
      source_rule_id: step.sourceRuleId,
      conditions: step.conditions,
      evidence_requirements: step.evidenceRequirements,
      blocking: step.blocking,
      blocking_condition: step.blockingCondition,
      geometry_binding: step.geometryBinding,
    }));

    const { error: stepsError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .insert(stepsToInsert);

    if (stepsError) {
      console.error('Error inserting workflow steps:', stepsError);
      return { success: false, error: `Failed to insert steps: ${stepsError.message}` };
    }

    console.log(
      `[DynamicWorkflow] Generated workflow v${nextVersion} for claim ${claimId}: ${dynamicSteps.length} steps`
    );

    return {
      success: true,
      workflowId: workflowData.id,
      version: nextVersion,
      stepsGenerated: dynamicSteps.length,
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

    // Apply changes to database
    // 1. Insert new steps
    if (result.stepsAdded.length > 0) {
      const maxIndex = Math.max(...(currentSteps || []).map((s) => s.step_index), 0);
      const stepsToInsert = result.stepsAdded.map((step, i) => ({
        workflow_id: workflowId,
        step_index: maxIndex + 1 + i,
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

    // Update workflow timestamp
    await supabaseAdmin
      .from('inspection_workflows')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', workflowId);

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
