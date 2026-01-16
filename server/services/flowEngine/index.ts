/**
 * Flow Engine Service
 *
 * New movement-based inspection flow system.
 * Replaces the old step-based inspectionWorkflowService.
 *
 * Key concepts:
 * - Flows: Declarative JSON definitions of inspection sequences
 * - Phases: Logical groupings (arrival, exterior, interior, closeout)
 * - Movements: Individual inspection actions with evidence requirements
 * - Gates: Conditional checkpoints that can block/escalate
 */

import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getPromptConfig, substituteVariables } from "../promptService";

// ============================================================================
// TYPES
// ============================================================================

export interface FlowDefinition {
  id: string;
  flowKey: string;
  perilType: string;
  propertyType: string;
  version: number;
  definition: FlowDefinitionJson;
  isActive: boolean;
}

export interface FlowDefinitionJson {
  metadata: {
    name: string;
    version: string;
    peril: string;
    propertyType: string;
  };
  phases: FlowPhase[];
  escalationTriggers?: EscalationTrigger[];
}

export interface FlowPhase {
  key: string;
  name: string;
  order: number;
  movements: FlowMovement[];
  gates?: FlowGate[];
}

export interface FlowMovement {
  id: string;
  type: 'photo' | 'observation' | 'measurement' | 'voice_note' | 'safety_check' | 'interview' | 'documentation';
  title: string;
  instruction: string;
  tips?: string[];
  evidenceRequirements: EvidenceRequirement[];
  optional?: boolean;
  skipConditions?: string[];
}

export interface EvidenceRequirement {
  id: string;
  type: 'photo' | 'measurement' | 'note' | 'voice' | 'checklist';
  label: string;
  required: boolean;
  minCount?: number;
  expectedContent?: string;
  framingGuidance?: string;
}

export interface FlowGate {
  id: string;
  title: string;
  condition: string;
  blockingBehavior: 'hard' | 'soft' | 'escalate';
  failureAction: string;
}

export interface EscalationTrigger {
  id: string;
  condition: string;
  action: string;
  notifyRoles: string[];
}

export interface ClaimFlowInstance {
  id: string;
  claimId: string;
  flowDefinitionId: string;
  status: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'escalated' | 'cancelled';
  currentPhase: string;
  currentMovementId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata: Record<string, any>;
}

export interface MovementCompletion {
  id: string;
  flowInstanceId: string;
  movementId: string;
  phaseKey: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  startedAt: Date | null;
  completedAt: Date | null;
  skippedReason: string | null;
  evidenceCollected: any[];
  extractedEntities: any;
  notes: string | null;
}

// ============================================================================
// FLOW DEFINITION MANAGEMENT
// ============================================================================

/**
 * Get flow definition for a claim based on peril and property type
 */
export async function getFlowForClaim(
  perilType: string,
  propertyType: string = 'residential'
): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .filter('perils', 'cs', JSON.stringify([perilType.toLowerCase()]))
      .filter('property_types', 'cs', JSON.stringify([propertyType.toLowerCase()]))
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // If no specific match found, try to find a generic flow
      const { data: genericFlow, error: genericError } = await supabaseAdmin
        .from('flow_definitions')
        .select('*')
        .eq('flow_key', 'generic')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (genericError || !genericFlow) {
        console.error(`[FlowEngine] No flow found for ${perilType}/${propertyType} and no generic flow found:`, error?.message);
        return null;
      }
      return normalizeFlowDefinition(genericFlow);
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definition:', error);
    return null;
  }
}

/**
 * Get all active flow definitions
 */
export async function getAllFlowDefinitions(
  organizationId?: string
): Promise<FlowDefinition[]> {
  try {
    let query = supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('is_active', true)
      .order('version', { ascending: false });

    // Note: organization_id might not exist on flow_definitions in HEAD schema,
    // keeping simplistic query for now unless organization filtering is required and schema supports it.
    // If organizationId is passed, we might want to filter, but checking schema support first is better.
    // Assuming simplistic implementation for now.

    const { data, error } = await query;

    if (error || !data) {
      console.error('[FlowEngine] Error fetching flow definitions:', error);
      return [];
    }

    return data.map(normalizeFlowDefinition);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definitions:', error);
    return [];
  }
}

/**
 * Get flow definition by key
 */
export async function getFlowByKey(flowKey: string): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('flow_key', flowKey)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error(`[FlowEngine] No flow found for key ${flowKey}:`, error.message);
      return null;
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow by key:', error);
    return null;
  }
}

/**
 * Get a specific flow definition by ID
 */
export async function getFlowDefinitionById(
  flowId: string
): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('id', flowId)
      .single();

    if (error || !data) {
      return null;
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definition by ID:', error);
    return null;
  }
}

// ============================================================================
// FLOW INSTANCE MANAGEMENT
// ============================================================================

/**
 * Start a new flow instance for a claim
 */
export async function startFlow(
  claimId: string,
  flowDefinitionId: string,
  userId?: string
): Promise<ClaimFlowInstance | null> {
  try {
    // Get the flow definition to find first phase
    const { data: flowDef, error: flowError } = await supabaseAdmin
      .from('flow_definitions')
      .select('definition')
      .eq('id', flowDefinitionId)
      .single();

    if (flowError || !flowDef) {
      console.error('[FlowEngine] Flow definition not found:', flowError?.message);
      return null;
    }

    const definition = flowDef.definition as FlowDefinitionJson;
    const firstPhase = definition.phases[0];

    // Create the flow instance
    const { data, error } = await supabaseAdmin
      .from('claim_flow_instances')
      .insert({
        claim_id: claimId,
        flow_definition_id: flowDefinitionId,
        status: 'in_progress',
        current_phase: firstPhase?.key || null,
        current_movement_id: firstPhase?.movements[0]?.id || null,
        started_at: new Date().toISOString(),
        started_by: userId,
        metadata: {}
      })
      .select()
      .single();

    if (error) {
      console.error('[FlowEngine] Failed to create flow instance:', error.message);
      return null;
    }

    // Initialize movement completions for first phase
    if (firstPhase) {
      await initializePhaseMovements(data.id, firstPhase);
    }

    return normalizeFlowInstance(data);
  } catch (error) {
    console.error('[FlowEngine] Error starting flow:', error);
    return null;
  }
}

/**
 * Get current flow instance for a claim
 */
export async function getClaimFlowInstance(claimId: string): Promise<ClaimFlowInstance | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('claim_flow_instances')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No flow instance is not necessarily an error
      return null;
    }

    return normalizeFlowInstance(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow instance:', error);
    return null;
  }
}

/**
 * Get current movement for a flow instance
 */
export async function getCurrentMovement(flowInstanceId: string): Promise<{
  movement: FlowMovement;
  phase: FlowPhase;
  completion: MovementCompletion;
} | null> {
  try {
    // Get the flow instance with its definition
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (definition)
      `)
      .eq('id', flowInstanceId)
      .single();

    if (instanceError || !instance) {
      return null;
    }

    const definition = instance.flow_definitions?.definition as FlowDefinitionJson;
    if (!definition || !instance.current_phase || !instance.current_movement_id) {
      return null;
    }

    // Find current phase and movement
    const phase = definition.phases.find(p => p.key === instance.current_phase);
    if (!phase) return null;

    const movement = phase.movements.find(m => m.id === instance.current_movement_id);
    if (!movement) return null;

    // Get completion record
    const { data: completion } = await supabaseAdmin
      .from('movement_completions')
      .select('*')
      .eq('flow_instance_id', flowInstanceId)
      .eq('movement_id', instance.current_movement_id)
      .single();

    return {
      movement,
      phase,
      completion: completion ? normalizeMovementCompletion(completion) : {
        id: '',
        flowInstanceId,
        movementId: movement.id,
        phaseKey: phase.key,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        skippedReason: null,
        evidenceCollected: [],
        extractedEntities: null,
        notes: null
      }
    };
  } catch (error) {
    console.error('[FlowEngine] Error getting current movement:', error);
    return null;
  }
}

// ============================================================================
// MOVEMENT EXECUTION
// ============================================================================

/**
 * Complete a movement and advance to next
 */
export async function completeMovement(
  flowInstanceId: string,
  movementId: string,
  evidence: any[] = [],
  notes?: string
): Promise<{ success: boolean; nextMovement: FlowMovement | null; error?: string }> {
  try {
    // Update movement completion
    const { error: updateError } = await supabaseAdmin
      .from('movement_completions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        evidence_collected: evidence,
        notes: notes || null
      })
      .eq('flow_instance_id', flowInstanceId)
      .eq('movement_id', movementId);

    if (updateError) {
      return { success: false, nextMovement: null, error: updateError.message };
    }

    // Advance to next movement
    const next = await advanceToNextMovement(flowInstanceId);

    return { success: true, nextMovement: next };
  } catch (error) {
    console.error('[FlowEngine] Error completing movement:', error);
    return { success: false, nextMovement: null, error: String(error) };
  }
}

/**
 * Skip a movement with reason
 */
export async function skipMovement(
  flowInstanceId: string,
  movementId: string,
  reason: string,
  userId?: string
): Promise<{ success: boolean; nextMovement: FlowMovement | null; error?: string }> {
  try {
    const { error: updateError } = await supabaseAdmin
      .from('movement_completions')
      .update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        skipped_reason: reason,
        skipped_by: userId
      })
      .eq('flow_instance_id', flowInstanceId)
      .eq('movement_id', movementId);

    if (updateError) {
      return { success: false, nextMovement: null, error: updateError.message };
    }

    const next = await advanceToNextMovement(flowInstanceId);

    return { success: true, nextMovement: next };
  } catch (error) {
    console.error('[FlowEngine] Error skipping movement:', error);
    return { success: false, nextMovement: null, error: String(error) };
  }
}

/**
 * Cancel a flow instance
 */
export async function cancelFlow(
  instanceId: string,
  reason?: string
): Promise<boolean> {
  try {
    const { data: currentInstance, error: fetchError } = await supabaseAdmin
      .from('claim_flow_instances')
      .select('metadata')
      .eq('id', instanceId)
      .single();

    if (fetchError) {
      return false;
    }

    const updatedMetadata = {
      ...(currentInstance?.metadata || {}),
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason
    };

    const { error } = await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        status: 'cancelled',
        metadata: updatedMetadata,
        completed_at: new Date().toISOString() // Using completed_at for cancellation time as well?
      })
      .eq('id', instanceId);

    return !error;
  } catch (error) {
    console.error('[FlowEngine] Error cancelling flow:', error);
    return false;
  }
}

// ============================================================================
// AI PROMPT INTEGRATION
// ============================================================================

/**
 * Extract entities from a voice note using flow.voice_note_extraction prompt
 */
export async function extractVoiceNoteEntities(
  transcription: string,
  context: {
    claimNumber?: string;
    perilType?: string;
    currentLocation?: string;
    movementContext?: string;
  }
): Promise<any> {
  const promptConfig = await getPromptConfig('flow.voice_note_extraction');
  if (!promptConfig) {
    throw new Error('flow.voice_note_extraction prompt not found');
  }

  const userPrompt = substituteVariables(promptConfig.userPromptTemplate || '', {
    transcription,
    claim_number: context.claimNumber || '',
    peril_type: context.perilType || '',
    current_location: context.currentLocation || '',
    movement_context: context.movementContext || ''
  });

  // Note: Actual OpenAI call would go here
  // For now, return the prepared prompt config
  return {
    systemPrompt: promptConfig.systemPrompt,
    userPrompt,
    model: promptConfig.model,
    temperature: promptConfig.temperature,
    maxTokens: promptConfig.maxTokens
  };
}

/**
 * Validate evidence using flow.evidence_validation prompt
 */
export async function validateEvidence(
  evidenceData: string,
  requirement: EvidenceRequirement
): Promise<any> {
  const promptConfig = await getPromptConfig('flow.evidence_validation');
  if (!promptConfig) {
    throw new Error('flow.evidence_validation prompt not found');
  }

  const userPrompt = substituteVariables(promptConfig.userPromptTemplate || '', {
    requirement_id: requirement.id,
    evidence_type: requirement.type,
    requirement_label: requirement.label,
    is_required: String(requirement.required),
    expected_content: requirement.expectedContent || '',
    reject_if_missing: '',
    framing_guidance: requirement.framingGuidance || '',
    evidence_data: evidenceData
  });

  return {
    systemPrompt: promptConfig.systemPrompt,
    userPrompt,
    model: promptConfig.model,
    temperature: promptConfig.temperature,
    maxTokens: promptConfig.maxTokens
  };
}

/**
 * Generate TTS guidance for a movement using flow.movement_guidance_tts prompt
 */
export async function generateMovementGuidance(
  movement: FlowMovement,
  context: {
    phase: string;
    perilType: string;
    propertyType?: string;
    adjusterExperience?: string;
  }
): Promise<any> {
  const promptConfig = await getPromptConfig('flow.movement_guidance_tts');
  if (!promptConfig) {
    throw new Error('flow.movement_guidance_tts prompt not found');
  }

  const userPrompt = substituteVariables(promptConfig.userPromptTemplate || '', {
    movement_type: movement.type,
    movement_title: movement.title,
    phase: context.phase,
    base_instruction: movement.instruction,
    tips: movement.tips?.join('. ') || '',
    safety_warnings: '',
    evidence_summary: movement.evidenceRequirements.map(e => e.label).join(', '),
    peril_type: context.perilType,
    property_type: context.propertyType || 'residential',
    adjuster_experience: context.adjusterExperience || 'standard'
  });

  return {
    systemPrompt: promptConfig.systemPrompt,
    userPrompt,
    model: promptConfig.model,
    temperature: promptConfig.temperature,
    maxTokens: promptConfig.maxTokens
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeFlowDefinition(row: any): FlowDefinition {
  return {
    id: row.id,
    flowKey: row.flow_key,
    perilType: row.peril_type,
    propertyType: row.property_type,
    version: row.version,
    definition: row.definition,
    isActive: row.is_active
  };
}

function normalizeFlowInstance(row: any): ClaimFlowInstance {
  return {
    id: row.id,
    claimId: row.claim_id,
    flowDefinitionId: row.flow_definition_id,
    status: row.status,
    currentPhase: row.current_phase,
    currentMovementId: row.current_movement_id,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    metadata: row.metadata || {}
  };
}

function normalizeMovementCompletion(row: any): MovementCompletion {
  return {
    id: row.id,
    flowInstanceId: row.flow_instance_id,
    movementId: row.movement_id,
    phaseKey: row.phase_key,
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    skippedReason: row.skipped_reason,
    evidenceCollected: row.evidence_collected || [],
    extractedEntities: row.extracted_entities,
    notes: row.notes
  };
}

async function initializePhaseMovements(flowInstanceId: string, phase: FlowPhase): Promise<void> {
  const movements = phase.movements.map(m => ({
    flow_instance_id: flowInstanceId,
    movement_id: m.id,
    phase_key: phase.key,
    status: 'pending',
    evidence_collected: []
  }));

  await supabaseAdmin
    .from('movement_completions')
    .insert(movements);
}

async function advanceToNextMovement(flowInstanceId: string): Promise<FlowMovement | null> {
  // Get current state
  const { data: instance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (definition)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (!instance) return null;

  const definition = instance.flow_definitions?.definition as FlowDefinitionJson;
  const currentPhase = definition.phases.find(p => p.key === instance.current_phase);
  if (!currentPhase) return null;

  // Find current movement index
  const currentIndex = currentPhase.movements.findIndex(m => m.id === instance.current_movement_id);

  // Try next movement in same phase
  if (currentIndex < currentPhase.movements.length - 1) {
    const nextMovement = currentPhase.movements[currentIndex + 1];
    await supabaseAdmin
      .from('claim_flow_instances')
      .update({ current_movement_id: nextMovement.id })
      .eq('id', flowInstanceId);
    return nextMovement;
  }

  // Try next phase
  const currentPhaseIndex = definition.phases.findIndex(p => p.key === instance.current_phase);
  if (currentPhaseIndex < definition.phases.length - 1) {
    const nextPhase = definition.phases[currentPhaseIndex + 1];
    const nextMovement = nextPhase.movements[0];

    // Initialize next phase movements
    await initializePhaseMovements(flowInstanceId, nextPhase);

    await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        current_phase: nextPhase.key,
        current_movement_id: nextMovement?.id || null
      })
      .eq('id', flowInstanceId);

    return nextMovement || null;
  }

  // Flow complete
  await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_movement_id: null
    })
    .eq('id', flowInstanceId);

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Flow definitions
  getFlowForClaim,
  getAllFlowDefinitions,
  getFlowByKey,
  getFlowDefinitionById,

  // Flow instances
  startFlow,
  getClaimFlowInstance,
  getCurrentMovement,

  // Movement execution
  completeMovement,
  skipMovement,
  cancelFlow,

  // AI integration
  extractVoiceNoteEntities,
  validateEvidence,
  generateMovementGuidance
};
