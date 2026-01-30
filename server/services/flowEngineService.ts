/**
 * Flow Engine Service
 * 
 * Replaces the old static workflow system with dynamic, phase-based inspection flows.
 * Each claim gets a claim_flow_instances record that progresses through phases → movements → evidence collection.
 * 
 * NOTE: Flow definitions store phases/movements/gates as JSON in the flow_json column.
 * This service extracts and works with that JSON structure.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPromptConfig, substituteVariables } from './promptService';
import OpenAI from 'openai';
import { FlowJson, FlowJsonPhase, FlowJsonMovement, FlowJsonGate } from '@shared/schema';

const openai = new OpenAI();

// ============================================================================
// TYPES
// ============================================================================

export interface FlowInstance {
  id: string;
  claimId: string;
  flowDefinitionId: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  currentPhaseId: string | null;
  currentPhaseIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  flowName?: string;
  flowDescription?: string;
  currentPhaseName?: string;
  currentPhaseDescription?: string;
  completedMovements: string[];
}

export interface FlowProgress {
  total: number;
  completed: number;
  percentComplete: number;
}

export interface Movement {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  sequenceOrder: number;
  isRequired: boolean;
  roomSpecific: boolean;
  roomName: string | null;
  validationRequirements: any;
  completionStatus?: 'pending' | 'completed' | 'skipped';
  completedAt?: Date | null;
  notes?: string | null;
}

export interface Phase {
  id: string;
  flowDefinitionId: string;
  name: string;
  description: string;
  sequenceOrder: number;
  isCompleted: boolean;
  movementCount: number;
  completedMovementCount: number;
}

export interface GateResult {
  type: 'gate';
  gate: {
    id: string;
    name: string;
    description: string;
    evaluationCriteria: any;
    aiPromptKey: string | null;
  };
}

export interface MovementCompletion {
  id: string;
  flowInstanceId: string;
  movementId: string;
  claimId: string;
  status: 'completed' | 'skipped';
  completedAt: Date;
  completedBy: string;
  notes: string | null;
  evidenceData: any;
  phaseAdvanced?: boolean;
  flowComplete?: boolean;
}

export interface EvidenceValidation {
  isValid: boolean;
  missingItems: string[];
  qualityIssues: string[];
  confidence: number;
}

// ============================================================================
// HELPER: Load flow definition with parsed JSON
// ============================================================================

interface FlowDefinitionWithJson {
  id: string;
  name: string;
  description: string | null;
  peril_type: string;
  property_type: string;
  flow_json: FlowJson;
  is_active: boolean;
}

async function loadFlowDefinition(flowDefinitionId: string): Promise<FlowDefinitionWithJson | null> {
  const { data, error } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .eq('id', flowDefinitionId)
    .maybeSingle();

  if (error) {
    console.error('[FlowEngineService] Error loading flow definition:', error);
    throw new Error(`Failed to load flow definition: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    peril_type: data.peril_type,
    property_type: data.property_type,
    flow_json: data.flow_json as FlowJson,
    is_active: data.is_active
  };
}

// ============================================================================
// 1. FLOW INSTANCE MANAGEMENT
// ============================================================================

/**
 * Find flow definitions that match a given peril type
 * Returns matching active flow definitions sorted by version (newest first)
 */
export async function findMatchingFlowDefinitions(
  perilType: string
): Promise<FlowDefinitionWithJson[]> {
  const { data: flowDefs, error: flowDefError } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .eq('is_active', true)
    .order('version', { ascending: false });

  if (flowDefError) {
    console.error('[FlowEngineService] Error finding flow definitions:', flowDefError);
    throw new Error(`Database error finding flow definitions: ${flowDefError.message}`);
  }

  if (!flowDefs || flowDefs.length === 0) {
    return [];
  }

  // Normalize peril type for matching
  const normalizedPeril = perilType.toLowerCase().replace(/[\s-]/g, '_');

  // Find all flows that match the peril type
  const matchingFlows = flowDefs.filter(fd => {
    // Check peril_type column
    if (fd.peril_type?.toLowerCase().replace(/[\s-]/g, '_') === normalizedPeril) return true;
    // Also check flow_json metadata
    const flowJson = fd.flow_json as FlowJson;
    if (flowJson?.metadata?.primary_peril?.toLowerCase().replace(/[\s-]/g, '_') === normalizedPeril) return true;
    if (flowJson?.metadata?.secondary_perils?.some((p: string) =>
      p.toLowerCase().replace(/[\s-]/g, '_') === normalizedPeril
    )) return true;
    return false;
  });

  return matchingFlows.map(fd => ({
    id: fd.id,
    name: fd.name,
    description: fd.description,
    peril_type: fd.peril_type,
    property_type: fd.property_type,
    flow_json: fd.flow_json as FlowJson,
    is_active: fd.is_active
  }));
}

/**
 * Find a general/fallback flow definition when no peril-specific flow exists
 */
export async function findGeneralFlowDefinition(): Promise<FlowDefinitionWithJson | null> {
  const { data: flowDefs, error: flowDefError } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .eq('is_active', true)
    .or('peril_type.eq.general,peril_type.eq.other,peril_type.ilike.%general%')
    .order('version', { ascending: false })
    .limit(1);

  if (flowDefError) {
    console.error('[FlowEngineService] Error finding general flow definition:', flowDefError);
    return null;
  }

  if (!flowDefs || flowDefs.length === 0) {
    return null;
  }

  const fd = flowDefs[0];
  return {
    id: fd.id,
    name: fd.name,
    description: fd.description,
    peril_type: fd.peril_type,
    property_type: fd.property_type,
    flow_json: fd.flow_json as FlowJson,
    is_active: fd.is_active
  };
}

/**
 * Auto-select the best flow definition for a claim
 * Returns the selected flow, available options, or error info
 */
export async function autoSelectFlowForClaim(
  claimId: string
): Promise<{
  selectedFlow: FlowDefinitionWithJson | null;
  availableFlows: FlowDefinitionWithJson[];
  perilType: string | null;
  requiresSelection: boolean;
  message: string;
}> {
  // Get the claim to read its primaryPeril
  const { data: claim, error: claimError } = await supabaseAdmin
    .from('claims')
    .select('id, primary_peril, loss_type')
    .eq('id', claimId)
    .single();

  if (claimError || !claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  // Use primaryPeril, fall back to lossType for legacy claims
  const perilType = claim.primary_peril || claim.loss_type;

  if (!perilType) {
    // No peril type on claim - check for general flow
    const generalFlow = await findGeneralFlowDefinition();
    if (generalFlow) {
      return {
        selectedFlow: generalFlow,
        availableFlows: [generalFlow],
        perilType: null,
        requiresSelection: false,
        message: 'Using general inspection flow (no peril type specified on claim)'
      };
    }
    return {
      selectedFlow: null,
      availableFlows: [],
      perilType: null,
      requiresSelection: true,
      message: 'No peril type specified on claim and no general flow available'
    };
  }

  // Find matching flows for this peril
  const matchingFlows = await findMatchingFlowDefinitions(perilType);

  if (matchingFlows.length === 0) {
    // No matching flow - try fallback to general
    const generalFlow = await findGeneralFlowDefinition();
    if (generalFlow) {
      return {
        selectedFlow: generalFlow,
        availableFlows: [generalFlow],
        perilType,
        requiresSelection: false,
        message: `No inspection flow configured for "${perilType}" claims. Using general flow.`
      };
    }
    return {
      selectedFlow: null,
      availableFlows: [],
      perilType,
      requiresSelection: true,
      message: `No inspection flow configured for "${perilType}" claims`
    };
  }

  if (matchingFlows.length === 1) {
    // Exactly one match - auto-select it
    return {
      selectedFlow: matchingFlows[0],
      availableFlows: matchingFlows,
      perilType,
      requiresSelection: false,
      message: `Auto-selected "${matchingFlows[0].name}" for ${perilType} claim`
    };
  }

  // Multiple matches - select the newest version but indicate options are available
  return {
    selectedFlow: matchingFlows[0], // Already sorted by version desc
    availableFlows: matchingFlows,
    perilType,
    requiresSelection: false, // Auto-select newest, but client can override
    message: `Auto-selected "${matchingFlows[0].name}" (${matchingFlows.length} flows available for ${perilType})`
  };
}

/**
 * Start a flow for a claim based on peril type
 * If an active flow already exists, cancels it and creates a new one
 */
export async function startFlowForClaim(
  claimId: string,
  perilType: string
): Promise<string> {
  // Step 0: Check for and cancel any existing active flows for this claim
  const { data: existingFlows, error: existingError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('id')
    .eq('claim_id', claimId)
    .eq('status', 'active');

  if (existingError) {
    console.error('[FlowEngineService] Error checking existing flows:', existingError);
  } else if (existingFlows && existingFlows.length > 0) {
    console.log(`[FlowEngineService] Found ${existingFlows.length} existing active flow(s) for claim ${claimId}, cancelling them`);
    // Cancel all existing active flows
    const { error: cancelError } = await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('claim_id', claimId)
      .eq('status', 'active');

    if (cancelError) {
      console.error('[FlowEngineService] Error cancelling existing flows:', cancelError);
    }
  }

  // Step 1: Find matching flow_definitions by checking flow_json metadata
  const { data: flowDefs, error: flowDefError } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .eq('is_active', true)
    .order('version', { ascending: false });

  if (flowDefError) {
    console.error('[FlowEngineService] Error finding flow definitions:', flowDefError);
    throw new Error(`Database error finding flow definition: ${flowDefError.message}`);
  }

  // Find a flow that matches the peril type
  const normalizedPeril = perilType.toLowerCase().replace(/_/g, '_');
  const flowDef = flowDefs?.find(fd => {
    // Check peril_type column
    if (fd.peril_type?.toLowerCase() === normalizedPeril) return true;
    // Also check flow_json metadata
    const flowJson = fd.flow_json as FlowJson;
    if (flowJson?.metadata?.primary_peril?.toLowerCase() === normalizedPeril) return true;
    if (flowJson?.metadata?.secondary_perils?.some((p: string) => p.toLowerCase() === normalizedPeril)) return true;
    return false;
  });

  if (!flowDef) {
    throw new Error(`No flow definition for peril type: ${perilType}`);
  }

  const flowJson = flowDef.flow_json as FlowJson;
  const firstPhaseId = flowJson.phases?.[0]?.id || null;

  // Step 2: Create claim_flow_instances record
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .insert({
      claim_id: claimId,
      flow_definition_id: flowDef.id,
      status: 'active',
      current_phase_id: firstPhaseId,
      current_phase_index: 0,
      completed_movements: [],
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (instanceError) {
    console.error('[FlowEngineService] Error creating flow instance:', instanceError);
    throw new Error(`Failed to create flow instance: ${instanceError.message}`);
  }

  return flowInstance.id;
}

/**
 * Get current flow for a claim
 * Returns the most recent active flow if multiple exist
 */
export async function getCurrentFlow(claimId: string): Promise<FlowInstance | null> {
  const { data, error } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions!inner (
        id,
        name,
        description,
        flow_json
      )
    `)
    .eq('claim_id', claimId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[FlowEngineService] Error getting current flow:', error);
    throw new Error(`Failed to get current flow: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const flowDef = data.flow_definitions as any;
  const flowJson = flowDef?.flow_json as FlowJson;
  const currentPhaseIndex = data.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  return {
    id: data.id,
    claimId: data.claim_id,
    flowDefinitionId: data.flow_definition_id,
    status: data.status,
    currentPhaseId: data.current_phase_id,
    currentPhaseIndex,
    startedAt: data.started_at ? new Date(data.started_at) : null,
    completedAt: data.completed_at ? new Date(data.completed_at) : null,
    flowName: flowDef?.name,
    flowDescription: flowDef?.description,
    currentPhaseName: currentPhase?.name,
    currentPhaseDescription: currentPhase?.description,
    completedMovements: data.completed_movements || []
  };
}

/**
 * Cancel a flow instance
 */
export async function cancelFlow(flowInstanceId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString()
    })
    .eq('id', flowInstanceId);

  if (error) {
    throw new Error(`Failed to cancel flow: ${error.message}`);
  }
}

/**
 * Get flow progress
 */
export async function getFlowProgress(flowInstanceId: string): Promise<FlowProgress> {
  // Get flow instance with definition
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  if (!flowJson?.phases) {
    return { total: 0, completed: 0, percentComplete: 0 };
  }

  // Count total movements across all phases
  let total = 0;
  flowJson.phases.forEach(phase => {
    total += phase.movements?.length || 0;
  });

  const completedMovements = flowInstance.completed_movements || [];
  const completed = completedMovements.length;

  const percentComplete = total > 0 
    ? Math.round((completed / total) * 10000) / 100 
    : 0;

  return { total, completed, percentComplete };
}

// ============================================================================
// 2. MOVEMENT EXECUTION
// ============================================================================

/**
 * Get next movement for a flow instance
 * Now includes dynamic movements from the dynamic_movements array
 */
export async function getNextMovement(
  flowInstanceId: string
): Promise<Movement | GateResult | null> {
  // Get flow instance with definition
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (id, name, flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  if (flowInstance.status === 'completed') {
    return null;
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  if (!flowJson?.phases?.length) {
    return null;
  }

  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = flowJson.phases[currentPhaseIndex];
  if (!currentPhase) {
    return null;
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  const dynamicMovements = (flowInstance.dynamic_movements || []) as any[];

  // First, check for pending dynamic movements in current phase
  const pendingDynamic = dynamicMovements.find(dm => {
    const dmPhaseId = dm.phase_id || dm.phaseId;
    const dmKey = `${dmPhaseId}:${dm.id}`;
    return dmPhaseId === currentPhase.id && !completedMovements.has(dmKey);
  });

  if (pendingDynamic) {
    const dmPhaseId = pendingDynamic.phase_id || pendingDynamic.phaseId;
    return {
      id: pendingDynamic.id,
      phaseId: dmPhaseId,
      name: pendingDynamic.name,
      description: pendingDynamic.description || '',
      sequenceOrder: -1, // Dynamic movements don't have fixed order
      isRequired: pendingDynamic.is_required !== false,
      roomSpecific: !!pendingDynamic.roomName || !!pendingDynamic.room_name,
      roomName: pendingDynamic.roomName || pendingDynamic.room_name || null,
      validationRequirements: pendingDynamic.evidence_requirements || null,
      completionStatus: 'pending'
    };
  }

  // Then check regular movements in current phase
  for (let i = 0; i < (currentPhase.movements?.length || 0); i++) {
    const movement = currentPhase.movements[i];
    const movementKey = `${currentPhase.id}:${movement.id}`;

    if (!completedMovements.has(movementKey)) {
      return {
        id: movement.id,
        phaseId: currentPhase.id,
        name: movement.name,
        description: movement.description || '',
        sequenceOrder: i,
        isRequired: movement.is_required !== false,
        roomSpecific: false,
        roomName: null,
        validationRequirements: movement.evidence_requirements || null,
        completionStatus: 'pending'
      };
    }
  }

  // All movements in current phase complete - check for gate
  const gate = flowJson.gates?.find(g => g.from_phase === currentPhase.id);
  if (gate) {
    return {
      type: 'gate',
      gate: {
        id: gate.id,
        name: gate.name,
        description: '',
        evaluationCriteria: gate.evaluation_criteria,
        aiPromptKey: gate.evaluation_criteria?.ai_prompt_key || null
      }
    };
  }

  // No gate - try to advance to next phase
  const nextPhaseIndex = currentPhaseIndex + 1;
  if (nextPhaseIndex < flowJson.phases.length) {
    // Update to next phase
    const nextPhase = flowJson.phases[nextPhaseIndex];
    await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        current_phase_id: nextPhase.id,
        current_phase_index: nextPhaseIndex
      })
      .eq('id', flowInstanceId);

    // Recursively get next movement from new phase
    return getNextMovement(flowInstanceId);
  }

  // No more phases - mark flow complete
  await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', flowInstanceId);

  return null;
}

/**
 * Complete a movement with evidence
 */
export async function completeMovement(
  flowInstanceId: string,
  movementId: string,
  evidence: {
    userId: string;
    notes?: string;
    photos?: string[];
    audioId?: string;
    measurements?: any;
  }
): Promise<MovementCompletion> {
  // Get flow instance
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  if (!currentPhase) {
    throw new Error('No current phase');
  }

  // Find the movement - check both regular and dynamic movements
  let movement = currentPhase.movements?.find(m => m.id === movementId);
  let isDynamic = false;

  // Also check dynamic movements
  if (!movement) {
    const dynamicMovements = (flowInstance.dynamic_movements || []) as any[];
    const dynamicMatch = dynamicMovements.find(dm => dm.id === movementId);
    if (dynamicMatch) {
      movement = {
        id: dynamicMatch.id,
        name: dynamicMatch.name,
        is_required: dynamicMatch.is_required,
        evidence_requirements: dynamicMatch.evidence_requirements
      } as FlowJsonMovement;
      isDynamic = true;
    }
  }

  if (!movement) {
    throw new Error(`Movement ${movementId} not found in current phase`);
  }

  // Create movement key and add to completed list
  const movementKey = `${currentPhase.id}:${movementId}`;
  const completedMovements = [...(flowInstance.completed_movements || []), movementKey];

  // Get sketch evidence IDs for this movement
  const sketchEvidence = await getMovementEvidence(flowInstanceId, movementKey);
  const sketchEvidenceIds = sketchEvidence
    .filter(e => e.type === 'sketch_zone' || e.type === 'damage_marker')
    .map(e => e.id);

  // Update flow instance
  const { error: updateError } = await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      completed_movements: completedMovements
    })
    .eq('id', flowInstanceId);

  if (updateError) {
    throw new Error(`Failed to update flow instance: ${updateError.message}`);
  }

  // Record the completion
  const { data: completion, error: completionError } = await supabaseAdmin
    .from('movement_completions')
    .insert({
      flow_instance_id: flowInstanceId,
      movement_id: movementKey,
      movement_phase: currentPhase.id,
      claim_id: flowInstance.claim_id,
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: evidence.userId,
      notes: evidence.notes || null,
      evidence_data: {
        photos: evidence.photos || [],
        audioId: evidence.audioId || null,
        measurements: evidence.measurements || null,
        evidence_sketch_ids: sketchEvidenceIds
      }
    })
    .select()
    .single();

  if (completionError) {
    console.error('[FlowEngineService] Error recording completion:', completionError);
  }

  // Check for phase advancement after movement completion
  const advanceResult = await checkPhaseAdvancement(flowInstanceId);

  return {
    id: completion?.id || movementKey,
    flowInstanceId,
    movementId: movementKey,
    claimId: flowInstance.claim_id,
    status: 'completed',
    completedAt: new Date(),
    completedBy: evidence.userId,
    notes: evidence.notes || null,
    evidenceData: evidence,
    phaseAdvanced: advanceResult.phaseAdvanced,
    flowComplete: advanceResult.flowComplete
  };
}

/**
 * Skip movement response type
 */
export interface SkipMovementResult {
  skipped: boolean;
  wasRequired: boolean;
  warning?: string;
  completion: MovementCompletion | null;
  phaseAdvanced?: boolean;
  flowComplete?: boolean;
}

/**
 * Skip a movement with reason
 * Now supports forceSkipRequired flag to allow skipping required movements
 */
export async function skipMovement(
  flowInstanceId: string,
  movementId: string,
  reason: string,
  userId: string,
  forceSkipRequired: boolean = false
): Promise<SkipMovementResult> {
  // Get flow instance
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  if (!currentPhase) {
    throw new Error('No current phase');
  }

  // Find the movement - check both regular and dynamic movements
  let movement = currentPhase.movements?.find(m => m.id === movementId);
  let isDynamic = false;

  // Also check dynamic movements
  if (!movement) {
    const dynamicMovements = (flowInstance.dynamic_movements || []) as any[];
    const dynamicMatch = dynamicMovements.find(dm => dm.id === movementId);
    if (dynamicMatch) {
      movement = {
        id: dynamicMatch.id,
        name: dynamicMatch.name,
        is_required: dynamicMatch.is_required
      } as FlowJsonMovement;
      isDynamic = true;
    }
  }

  if (!movement) {
    throw new Error(`Movement ${movementId} not found in current phase`);
  }

  const wasRequired = movement.is_required !== false;

  // If required and not force-skipping, return warning instead of error
  if (wasRequired && !forceSkipRequired) {
    return {
      skipped: false,
      wasRequired: true,
      warning: `Movement "${movement.name}" is required. The inspection cannot be finalized without completing it. Set forceSkipRequired=true to skip anyway.`,
      completion: null
    };
  }

  // Create movement key and add to completed list
  const movementKey = isDynamic ? `${currentPhase.id}:${movementId}` : `${currentPhase.id}:${movementId}`;
  const completedMovements = [...(flowInstance.completed_movements || []), movementKey];

  // Update flow instance
  const { error: updateError } = await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      completed_movements: completedMovements
    })
    .eq('id', flowInstanceId);

  if (updateError) {
    throw new Error(`Failed to update flow instance: ${updateError.message}`);
  }

  // Record the skip with appropriate flags
  const { data: completionData, error: completionError } = await supabaseAdmin
    .from('movement_completions')
    .insert({
      flow_instance_id: flowInstanceId,
      movement_id: movementKey,
      movement_phase: currentPhase.id,
      claim_id: flowInstance.claim_id,
      status: 'skipped',
      skipped_required: wasRequired, // Track that a required step was skipped
      completed_at: new Date().toISOString(),
      completed_by: userId,
      notes: reason || (wasRequired ? 'Required step skipped by user' : 'Skipped'),
      evidence_data: null
    })
    .select()
    .single();

  if (completionError) {
    console.error('[FlowEngineService] Error recording skip:', completionError);
  }

  // Check for phase advancement
  const advanceResult = await checkPhaseAdvancement(flowInstanceId);

  const completion: MovementCompletion = {
    id: completionData?.id || movementKey,
    flowInstanceId,
    movementId: movementKey,
    claimId: flowInstance.claim_id,
    status: 'skipped',
    completedAt: new Date(),
    completedBy: userId,
    notes: reason,
    evidenceData: null
  };

  return {
    skipped: true,
    wasRequired,
    warning: wasRequired ? 'This required step was skipped. Claim cannot be finalized until addressed.' : undefined,
    completion,
    phaseAdvanced: advanceResult.phaseAdvanced,
    flowComplete: advanceResult.flowComplete
  };
}

/**
 * Check if a flow can be finalized (no skipped required movements)
 */
export async function canFinalizeFlow(flowInstanceId: string): Promise<{
  canFinalize: boolean;
  blockers: Array<{ movementId: string; reason: string }>;
}> {
  // Check for skipped required movements
  const { data: skippedRequired, error } = await supabaseAdmin
    .from('movement_completions')
    .select('movement_id, notes')
    .eq('flow_instance_id', flowInstanceId)
    .eq('status', 'skipped')
    .eq('skipped_required', true);

  if (error) {
    console.error('[FlowEngineService] Error checking skipped required:', error);
    // On error, assume we can't finalize safely
    return { canFinalize: false, blockers: [{ movementId: 'unknown', reason: 'Error checking skipped movements' }] };
  }

  const blockers = (skippedRequired || []).map(sr => ({
    movementId: sr.movement_id,
    reason: `Required step was skipped: ${sr.notes || 'No reason provided'}`
  }));

  return {
    canFinalize: blockers.length === 0,
    blockers
  };
}

/**
 * Get evidence for a movement
 * Queries movement_evidence table and joins with claim_photos and audio_observations
 */
export async function getMovementEvidence(
  flowInstanceId: string,
  movementId: string
): Promise<any[]> {
  // First try to get evidence from the movement_evidence table
  const { data: movementEvidence, error: evidenceError } = await supabaseAdmin
    .from('movement_evidence')
    .select('*')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (evidenceError) {
    console.error('[FlowEngineService] Error getting movement_evidence:', evidenceError);
  }

  // Get photos linked to this movement (include analysis status for "needs rework" in workflow)
  const { data: photos, error: photosError } = await supabaseAdmin
    .from('claim_photos')
    .select('id, public_url, file_name, label, description, ai_analysis, analysis_status, analysis_error, quality_score, created_at')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (photosError) {
    console.error('[FlowEngineService] Error getting linked photos:', photosError);
  }

  // Get audio observations linked to this movement
  const { data: audioObs, error: audioError } = await supabaseAdmin
    .from('audio_observations')
    .select('id, transcription, transcription_status, audio_url, duration_seconds, created_at')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (audioError) {
    console.error('[FlowEngineService] Error getting linked audio:', audioError);
  }

  // Also check movement_completions for inline evidence_data
  const { data: completions, error: completionsError } = await supabaseAdmin
    .from('movement_completions')
    .select('id, evidence_data, notes, completed_at')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (completionsError) {
    console.error('[FlowEngineService] Error getting completions:', completionsError);
  }

  // Combine all evidence sources
  const result: any[] = [];

  // Add movement_evidence records
  if (movementEvidence?.length) {
    for (const ev of movementEvidence) {
      result.push({
        id: ev.id,
        type: ev.evidence_type,
        referenceId: ev.reference_id || ev.evidence_id,
        data: ev.evidence_data,
        notes: ev.notes,
        createdAt: ev.created_at,
        source: 'movement_evidence'
      });
    }
  }

  // Add photos
  if (photos?.length) {
    for (const photo of photos) {
      // Check if already added via movement_evidence
      const alreadyAdded = result.some(r => r.referenceId === photo.id);
      if (!alreadyAdded) {
        result.push({
          id: photo.id,
          type: 'photo',
          referenceId: photo.id,
          data: {
            url: photo.public_url,
            publicUrl: photo.public_url,
            fileName: photo.file_name,
            label: photo.label,
            description: photo.description,
            aiAnalysis: photo.ai_analysis,
            analysisStatus: photo.analysis_status,
            analysisError: photo.analysis_error,
            qualityScore: photo.quality_score
          },
          createdAt: photo.created_at,
          source: 'claim_photos'
        });
      }
    }
  }

  // Add audio observations
  if (audioObs?.length) {
    for (const audio of audioObs) {
      const alreadyAdded = result.some(r => r.referenceId === audio.id);
      if (!alreadyAdded) {
        result.push({
          id: audio.id,
          type: 'voice_note',
          referenceId: audio.id,
          data: {
            transcription: audio.transcription,
            transcriptionStatus: audio.transcription_status,
            audioUrl: audio.audio_url,
            durationSeconds: audio.duration_seconds
          },
          createdAt: audio.created_at,
          source: 'audio_observations'
        });
      }
    }
  }

  // Get sketch zones (rooms) linked to this movement
  const { data: sketchZones, error: zonesError } = await supabaseAdmin
    .from('claim_rooms')
    .select('id, name, room_type, width_ft, length_ft, polygon, created_at')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (zonesError) {
    console.error('[FlowEngineService] Error getting sketch zones:', zonesError);
  }

  // Get damage markers (damage zones) linked to this movement
  const { data: damageMarkers, error: markersError } = await supabaseAdmin
    .from('claim_damage_zones')
    .select('id, damage_type, severity, category, affected_walls, polygon, created_at')
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  if (markersError) {
    console.error('[FlowEngineService] Error getting damage markers:', markersError);
  }

  // Add sketch zones
  if (sketchZones?.length) {
    for (const zone of sketchZones) {
      const alreadyAdded = result.some(r => r.referenceId === zone.id && r.type === 'sketch_zone');
      if (!alreadyAdded) {
        result.push({
          id: zone.id,
          type: 'sketch_zone',
          referenceId: zone.id,
          data: {
            name: zone.name,
            roomType: zone.room_type,
            widthFt: zone.width_ft,
            lengthFt: zone.length_ft,
            polygon: zone.polygon
          },
          createdAt: zone.created_at,
          source: 'claim_rooms'
        });
      }
    }
  }

  // Add damage markers
  if (damageMarkers?.length) {
    for (const marker of damageMarkers) {
      const alreadyAdded = result.some(r => r.referenceId === marker.id && r.type === 'damage_marker');
      if (!alreadyAdded) {
        result.push({
          id: marker.id,
          type: 'damage_marker',
          referenceId: marker.id,
          data: {
            damageType: marker.damage_type,
            severity: marker.severity,
            category: marker.category,
            affectedWalls: marker.affected_walls,
            polygon: marker.polygon
          },
          createdAt: marker.created_at,
          source: 'claim_damage_zones'
        });
      }
    }
  }

  // Add evidence from completions (inline evidence_data)
  if (completions?.length) {
    for (const completion of completions) {
      if (completion.evidence_data) {
        const evidenceData = completion.evidence_data as any;
        // Add photos from evidence_data
        if (evidenceData.photos?.length) {
          for (const photoId of evidenceData.photos) {
            const alreadyAdded = result.some(r => r.referenceId === photoId);
            if (!alreadyAdded) {
              result.push({
                id: `completion:${completion.id}:photo:${photoId}`,
                type: 'photo',
                referenceId: photoId,
                data: { photoId },
                createdAt: completion.completed_at,
                source: 'movement_completions'
              });
            }
          }
        }
        // Add audio from evidence_data
        if (evidenceData.audioId) {
          const alreadyAdded = result.some(r => r.referenceId === evidenceData.audioId);
          if (!alreadyAdded) {
            result.push({
              id: `completion:${completion.id}:audio:${evidenceData.audioId}`,
              type: 'voice_note',
              referenceId: evidenceData.audioId,
              data: { audioId: evidenceData.audioId },
              createdAt: completion.completed_at,
              source: 'movement_completions'
            });
          }
        }
      }
    }
  }

  return result;
}

// ============================================================================
// 3. PHASE QUERIES
// ============================================================================

/**
 * Get all phases for a flow with completion status
 */
export async function getFlowPhases(flowInstanceId: string): Promise<Phase[]> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (id, flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  if (!flowJson?.phases) {
    return [];
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  const currentPhaseIndex = flowInstance.current_phase_index || 0;

  return flowJson.phases.map((phase, index) => {
    const totalMovements = phase.movements?.length || 0;
    let completedCount = 0;

    phase.movements?.forEach(m => {
      const key = `${phase.id}:${m.id}`;
      if (completedMovements.has(key)) {
        completedCount++;
      }
    });

    const isCompleted = index < currentPhaseIndex || 
      (index === currentPhaseIndex && completedCount === totalMovements);

    return {
      id: phase.id,
      flowDefinitionId: (flowInstance.flow_definitions as any).id,
      name: phase.name,
      description: phase.description || '',
      sequenceOrder: index,
      isCompleted,
      movementCount: totalMovements,
      completedMovementCount: completedCount
    };
  });
}

/**
 * Get movements for a phase
 */
export async function getPhaseMovements(
  flowInstanceId: string,
  phaseId: string
): Promise<Movement[]> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phase = flowJson?.phases?.find(p => p.id === phaseId);

  if (!phase) {
    throw new Error(`Phase ${phaseId} not found`);
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);

  return (phase.movements || []).map((m, index) => {
    const movementKey = `${phaseId}:${m.id}`;
    const isCompleted = completedMovements.has(movementKey);

    return {
      id: m.id,
      phaseId,
      name: m.name,
      description: m.description || '',
      sequenceOrder: index,
      isRequired: m.is_required !== false,
      roomSpecific: false,
      roomName: null,
      validationRequirements: m.evidence_requirements || null,
      completionStatus: isCompleted ? 'completed' : 'pending'
    };
  });
}

/**
 * Get flow timeline
 */
export async function getFlowTimeline(flowInstanceId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('movement_completions')
    .select('*')
    .eq('flow_instance_id', flowInstanceId)
    .order('completed_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get timeline: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// 4. GATE EVALUATION
// ============================================================================

/**
 * Evaluate a gate
 */
export async function evaluateGate(
  flowInstanceId: string,
  gateId: string,
  context?: any
): Promise<{ passed: boolean; reason: string; nextPhaseId?: string }> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const gate = flowJson?.gates?.find(g => g.id === gateId);

  if (!gate) {
    throw new Error(`Gate ${gateId} not found`);
  }

  // Simple evaluation - check if from_phase movements are complete
  const fromPhase = flowJson.phases?.find(p => p.id === gate.from_phase);
  if (!fromPhase) {
    return { passed: false, reason: 'Invalid gate configuration' };
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  const requiredComplete = fromPhase.movements?.every(m => {
    if (!m.is_required) return true;
    return completedMovements.has(`${fromPhase.id}:${m.id}`);
  });

  if (!requiredComplete) {
    return { passed: false, reason: 'Required movements not completed' };
  }

  // AI evaluation if configured
  if (gate.evaluation_criteria?.type === 'ai' && gate.evaluation_criteria.ai_prompt_key) {
    try {
      const promptConfig = await getPromptConfig(gate.evaluation_criteria.ai_prompt_key);
      if (promptConfig) {
        const systemPrompt = promptConfig.systemPrompt || '';
        const userPrompt = substituteVariables(
          promptConfig.userPromptTemplate || '',
          { gate: JSON.stringify(gate), context: JSON.stringify(context), flowInstance: JSON.stringify(flowInstance) }
        );

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
          passed: result.passed === true,
          reason: result.reason || 'AI evaluation',
          nextPhaseId: result.passed ? gate.to_phase : undefined
        };
      }
    } catch (err) {
      console.error('[FlowEngineService] AI gate evaluation failed:', err);
    }
  }

  // Default: pass if all required movements complete
  return {
    passed: true,
    reason: 'All required movements completed',
    nextPhaseId: gate.to_phase
  };
}

// ============================================================================
// 5. DYNAMIC EXPANSION
// ============================================================================

/**
 * Add room-specific movements dynamically based on templates
 * Creates fully-formed dynamic movements that can be executed
 */
export async function addRoomMovements(
  flowInstanceId: string,
  roomName: string,
  movementTemplateIds: string[]
): Promise<any[]> {
  // Get flow instance with definition to find template movements
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  if (!currentPhase) {
    throw new Error('No current phase found');
  }

  // Create dynamic movements based on templates
  const newMovements = movementTemplateIds.map(templateId => {
    // Find the template movement in the flow definition
    let template: FlowJsonMovement | undefined;

    // Search all phases for the template
    for (const phase of flowJson.phases || []) {
      template = phase.movements?.find(m => m.id === templateId);
      if (template) break;
    }

    if (!template) {
      console.warn(`[FlowEngine] Movement template ${templateId} not found`);
      return null;
    }

    // Create sanitized room name for ID
    const sanitizedRoomName = roomName.toLowerCase().replace(/\s+/g, '_');

    return {
      id: `${templateId}_${sanitizedRoomName}_${Date.now()}`,
      name: `${template.name} - ${roomName}`,
      description: template.description?.replace(/\{\{room\}\}/g, roomName) || '',
      phase_id: currentPhase.id,
      is_required: template.is_required,
      criticality: template.criticality || 'medium',
      guidance: template.guidance ? {
        ...template.guidance,
        instruction: template.guidance.instruction?.replace(/\{\{room\}\}/g, roomName),
        tts_text: template.guidance.tts_text?.replace(/\{\{room\}\}/g, roomName)
      } : undefined,
      evidence_requirements: template.evidence_requirements,
      room_name: roomName,
      template_id: templateId,
      created_at: new Date().toISOString(),
      is_dynamic: true
    };
  }).filter(Boolean);

  if (newMovements.length === 0) {
    return [];
  }

  // Append to dynamic_movements
  const existingDynamic = flowInstance.dynamic_movements || [];
  const updatedDynamic = [...existingDynamic, ...newMovements];

  await supabaseAdmin
    .from('claim_flow_instances')
    .update({ dynamic_movements: updatedDynamic })
    .eq('id', flowInstanceId);

  console.log(`[FlowEngine] Added ${newMovements.length} dynamic movements for room "${roomName}"`);

  return newMovements;
}

/**
 * Get AI suggestions for additional movements
 */
export async function getSuggestedMovements(
  flowInstanceId: string,
  context: any
): Promise<any[]> {
  try {
    const promptConfig = await getPromptConfig('flow.movement_suggestions');
    if (!promptConfig) {
      return [];
    }

    const { data: flowInstance } = await supabaseAdmin
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json),
        claims (*)
      `)
      .eq('id', flowInstanceId)
      .single();

    if (!flowInstance) return [];

    const systemPrompt = promptConfig.systemPrompt || '';
    const userPrompt = substituteVariables(
      promptConfig.userPromptTemplate || '',
      { flowInstance, context, claim: flowInstance.claims }
    );

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result.suggestions || [];
  } catch (err) {
    console.error('[FlowEngineService] Failed to get suggestions:', err);
    return [];
  }
}

/**
 * Insert a custom movement
 */
export async function insertCustomMovement(
  flowInstanceId: string,
  movement: {
    name: string;
    description: string;
    phaseId: string;
    afterMovementId?: string;
  }
): Promise<string> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('dynamic_movements')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const movementId = `custom:${Date.now()}`;
  const dynamicMovements = flowInstance.dynamic_movements || [];

  const newMovement = {
    id: movementId,
    phaseId: movement.phaseId,
    name: movement.name,
    description: movement.description,
    afterMovementId: movement.afterMovementId,
    isCustom: true,
    createdAt: new Date().toISOString()
  };

  await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      dynamic_movements: [...dynamicMovements, newMovement]
    })
    .eq('id', flowInstanceId);

  return movementId;
}

// ============================================================================
// 6. EVIDENCE MANAGEMENT
// ============================================================================

/**
 * Attach evidence to a movement
 * Also updates the source record (claim_photos or audio_observations) with flow context
 */
export async function attachEvidence(
  flowInstanceId: string,
  movementId: string,
  evidence: {
    type: 'photo' | 'audio' | 'voice_note' | 'measurement' | 'note';
    referenceId?: string;
    data?: any;
    userId: string;
    notes?: string;
  }
): Promise<string> {
  const evidenceId = `evidence:${Date.now()}`;
  const normalizedType = evidence.type === 'voice_note' ? 'audio' : evidence.type;

  // Insert into movement_evidence table
  const { error } = await supabaseAdmin
    .from('movement_evidence')
    .insert({
      id: evidenceId,
      flow_instance_id: flowInstanceId,
      movement_id: movementId,
      evidence_type: normalizedType,
      reference_id: evidence.referenceId,
      evidence_id: evidence.referenceId, // Also set evidence_id for FK relationships
      evidence_data: evidence.data,
      notes: evidence.notes,
      attached_by: evidence.userId,
      attached_at: new Date().toISOString(),
      created_by: evidence.userId,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('[FlowEngineService] Error attaching evidence:', error);
    // Continue anyway to update source records
  }

  // Also update the source record with flow context
  if (evidence.referenceId) {
    if (evidence.type === 'photo') {
      // Update claim_photos with flow context
      const { error: photoError } = await supabaseAdmin
        .from('claim_photos')
        .update({
          flow_instance_id: flowInstanceId,
          movement_id: movementId,
          captured_context: evidence.notes || `Attached to movement: ${movementId}`
        })
        .eq('id', evidence.referenceId);

      if (photoError) {
        console.error('[FlowEngineService] Error updating photo flow context:', photoError);
      }
    } else if (evidence.type === 'audio' || evidence.type === 'voice_note') {
      // Update audio_observations with flow context
      const { error: audioError } = await supabaseAdmin
        .from('audio_observations')
        .update({
          flow_instance_id: flowInstanceId,
          movement_id: movementId
        })
        .eq('id', evidence.referenceId);

      if (audioError) {
        console.error('[FlowEngineService] Error updating audio flow context:', audioError);
      }
    }
  }

  return evidenceId;
}

/**
 * Validate evidence for a movement
 */
export async function validateEvidence(
  flowInstanceId: string,
  movementId: string
): Promise<EvidenceValidation> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  
  // Find the movement
  let foundMovement: FlowJsonMovement | undefined;
  for (const phase of flowJson?.phases || []) {
    foundMovement = phase.movements?.find(m => m.id === movementId);
    if (foundMovement) break;
  }

  if (!foundMovement) {
    return { isValid: true, missingItems: [], qualityIssues: [], confidence: 1.0 };
  }

  const requirements = foundMovement.evidence_requirements;
  if (!requirements) {
    return { isValid: true, missingItems: [], qualityIssues: [], confidence: 1.0 };
  }

  // Get evidence for this movement
  const { data: evidence } = await supabaseAdmin
    .from('movement_evidence')
    .select('*')
    .eq('flow_instance_id', flowInstanceId)
    .eq('movement_id', movementId);

  const hasPhoto = evidence?.some(e => e.evidence_type === 'photo');
  const hasAudio = evidence?.some(e => e.evidence_type === 'audio' || e.evidence_type === 'voice_note');
  const hasMeasurement = evidence?.some(e => e.evidence_type === 'measurement');

  const missingItems: string[] = [];
  
  // Check each evidence requirement from the array
  for (const req of requirements) {
    if (!req.is_required) continue;
    
    if (req.type === 'photo' && !hasPhoto) {
      missingItems.push(req.description || 'Photo required');
    }
    if (req.type === 'voice_note' && !hasAudio) {
      missingItems.push(req.description || 'Audio observation required');
    }
    if (req.type === 'measurement' && !hasMeasurement) {
      missingItems.push(req.description || 'Measurements required');
    }
  }

  return {
    isValid: missingItems.length === 0,
    missingItems,
    qualityIssues: [],
    confidence: missingItems.length === 0 ? 1.0 : 0.5
  };
}

/**
 * AI-powered evidence validation response
 */
export interface AIEvidenceValidation {
  isValid: boolean;
  confidence: number;
  missingItems: string[];
  qualityIssues: string[];
  suggestions: string[];
  canProceed: boolean;
  reason: string;
}

/**
 * Validate evidence using AI for quality assessment
 */
export async function validateEvidenceWithAI(
  flowInstanceId: string,
  movementId: string
): Promise<AIEvidenceValidation> {
  // Get flow instance with definition
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json),
      claims (peril_type, property_type)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  // Find the movement
  let foundMovement: FlowJsonMovement | undefined;
  let foundPhaseName = '';
  for (const phase of flowJson?.phases || []) {
    foundMovement = phase.movements?.find(m => m.id === movementId);
    if (foundMovement) {
      foundPhaseName = phase.name;
      break;
    }
  }

  if (!foundMovement) {
    return {
      isValid: true,
      confidence: 1.0,
      missingItems: [],
      qualityIssues: [],
      suggestions: [],
      canProceed: true,
      reason: 'Movement not found - assuming valid'
    };
  }

  // Get captured evidence for this movement
  const { data: evidence } = await supabaseAdmin
    .from('movement_evidence')
    .select(`
      *,
      photo:claim_photos(id, public_url, file_name, description, ai_analysis),
      audio:audio_observations(id, transcription, transcription_status)
    `)
    .eq('flow_instance_id', flowInstanceId)
    .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

  // Build context for AI
  const requirements = foundMovement.evidence_requirements || [];
  const captured = (evidence || []).map(e => ({
    type: e.evidence_type,
    description: (e as any).photo?.description || (e as any).audio?.transcription || 'No description',
    metadata: (e as any).photo?.ai_analysis || null
  }));

  // Get the validation prompt
  const promptConfig = await getPromptConfig('flow.evidence_validation');

  if (!promptConfig) {
    // Fallback to basic validation if prompt not found
    console.warn('[FlowEngineService] AI validation prompt not found, using basic validation');
    const basicResult = await validateEvidence(flowInstanceId, movementId);
    return {
      isValid: basicResult.isValid,
      confidence: basicResult.confidence,
      missingItems: basicResult.missingItems,
      qualityIssues: basicResult.qualityIssues,
      suggestions: [],
      canProceed: basicResult.isValid,
      reason: basicResult.isValid ? 'Basic validation passed' : 'Missing required evidence'
    };
  }

  // Build the user prompt from template
  const claim = flowInstance.claims as any;
  const requirementsText = requirements.map(r =>
    `- ${r.type}: ${r.description || 'Required'} (Required: ${r.is_required !== false}, Min: ${r.quantity_min || 1})`
  ).join('\n');

  const capturedText = captured.map(c =>
    `- ${c.type}: ${c.description}${c.metadata ? `\n  Metadata: ${JSON.stringify(c.metadata)}` : ''}`
  ).join('\n');

  const userPrompt = substituteVariables(promptConfig.userPromptTemplate || '', {
    movement_name: foundMovement.name,
    phase_name: foundPhaseName || currentPhase?.name || 'Unknown',
    peril_type: claim?.peril_type || flowJson?.metadata?.primary_peril || 'unknown',
    requirements: requirementsText,
    captured: capturedText
  });

  try {
    // GPT-5.x models require max_completion_tokens instead of max_tokens
    const model = promptConfig.model || 'gpt-5.2';
    const isGpt5Model = model.startsWith('gpt-5') || model.includes('gpt-5');
    const requestParams: Record<string, unknown> = {
      model,
      temperature: promptConfig.temperature || 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptConfig.systemPrompt || '' },
        { role: 'user', content: userPrompt }
      ]
    };

    // Use max_completion_tokens for GPT-5.x, max_tokens for GPT-4.x and older
    const tokenLimit = promptConfig.maxTokens || 1000;
    if (isGpt5Model) {
      requestParams.max_completion_tokens = tokenLimit;
    } else {
      requestParams.max_tokens = tokenLimit;
    }

    const response = await openai.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const result = JSON.parse(content) as AIEvidenceValidation;

    // Store validation result in movement_completions
    await supabaseAdmin
      .from('movement_completions')
      .update({
        evidence_validated: true,
        evidence_validation_result: result
      })
      .eq('flow_instance_id', flowInstanceId)
      .or(`movement_id.eq.${movementId},movement_id.like.%:${movementId}`);

    return result;
  } catch (error) {
    console.error('[FlowEngineService] AI evidence validation failed:', error);
    // Fallback to basic validation
    const basicResult = await validateEvidence(flowInstanceId, movementId);
    return {
      isValid: basicResult.isValid,
      confidence: 0.5,
      missingItems: basicResult.missingItems,
      qualityIssues: ['AI validation unavailable'],
      suggestions: [],
      canProceed: basicResult.isValid,
      reason: 'Fallback to basic validation due to AI error'
    };
  }
}

/**
 * Get flow instance details
 */
export async function getFlowInstance(flowInstanceId: string): Promise<FlowInstance | null> {
  // Use consistent query format with other working functions (getFlowPhases, getNextMovement)
  const { data, error } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('*, flow_definitions (id, name, description, flow_json)')
    .eq('id', flowInstanceId)
    .maybeSingle();

  if (error) {
    console.error('[FlowEngineService] Error getting flow instance:', error);
    throw new Error(`Failed to get flow instance: ${error.message}`);
  }

  if (!data) return null;

  const flowDef = data.flow_definitions as any;
  const flowJson = flowDef?.flow_json as FlowJson;
  const currentPhaseIndex = data.current_phase_index || 0;
  const currentPhase = flowJson?.phases?.[currentPhaseIndex];

  return {
    id: data.id,
    claimId: data.claim_id,
    flowDefinitionId: data.flow_definition_id,
    status: data.status,
    currentPhaseId: data.current_phase_id,
    currentPhaseIndex,
    startedAt: data.started_at ? new Date(data.started_at) : null,
    completedAt: data.completed_at ? new Date(data.completed_at) : null,
    flowName: flowDef?.name,
    flowDescription: flowDef?.description,
    currentPhaseName: currentPhase?.name,
    currentPhaseDescription: currentPhase?.description,
    completedMovements: data.completed_movements || []
  };
}

/**
 * Get current movement details
 */
export async function getCurrentMovement(flowInstanceId: string): Promise<Movement> {
  const instance = await getFlowInstance(flowInstanceId);
  if (!instance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: flowInstance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhase = phases[instance.currentPhaseIndex];
  
  if (!currentPhase) {
    throw new Error('No current phase');
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  
  // Find first incomplete movement in current phase
  for (let i = 0; i < (currentPhase.movements?.length || 0); i++) {
    const movement = currentPhase.movements[i];
    const movementKey = `${currentPhase.id}:${movement.id}`;
    
    if (!completedMovements.has(movementKey)) {
      return {
        id: movement.id,
        phaseId: currentPhase.id,
        name: movement.name,
        description: movement.description || '',
        sequenceOrder: i,
        isRequired: movement.is_required !== false,
        roomSpecific: false,
        roomName: null,
        validationRequirements: movement.evidence_requirements || null,
        completionStatus: 'pending'
      };
    }
  }
  
  throw new Error('No current movement (all movements in current phase are complete)');
}

/**
 * Get current phase
 */
export async function getCurrentPhase(flowInstanceId: string): Promise<FlowJsonPhase> {
  const instance = await getFlowInstance(flowInstanceId);
  if (!instance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: flowInstance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhase = phases[instance.currentPhaseIndex];
  
  if (!currentPhase) {
    throw new Error('No current phase');
  }

  return currentPhase;
}

/**
 * Peek at next movement without advancing
 */
export async function peekNextMovement(flowInstanceId: string): Promise<Movement | null> {
  const instance = await getFlowInstance(flowInstanceId);
  if (!instance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: flowInstance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhaseIndex = instance.currentPhaseIndex;
  const currentPhase = phases[currentPhaseIndex];
  
  if (!currentPhase) {
    return null;
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  
  // Find first incomplete movement in current phase
  let foundCurrent = false;
  for (let i = 0; i < (currentPhase.movements?.length || 0); i++) {
    const movement = currentPhase.movements[i];
    const movementKey = `${currentPhase.id}:${movement.id}`;
    
    if (!completedMovements.has(movementKey)) {
      foundCurrent = true;
      // Check if there's a next movement in this phase
      if (i < (currentPhase.movements?.length || 0) - 1) {
        const nextMovement = currentPhase.movements[i + 1];
        return {
          id: nextMovement.id,
          phaseId: currentPhase.id,
          name: nextMovement.name,
          description: nextMovement.description || '',
          sequenceOrder: i + 1,
          isRequired: nextMovement.is_required !== false,
          roomSpecific: false,
          roomName: null,
          validationRequirements: nextMovement.evidence_requirements || null,
          completionStatus: 'pending'
        };
      }
      break;
    }
  }
  
  // All movements in current phase complete - check next phase
  if (currentPhaseIndex < phases.length - 1) {
    const nextPhase = phases[currentPhaseIndex + 1];
    const firstMovement = nextPhase.movements?.[0];
    if (firstMovement) {
      return {
        id: firstMovement.id,
        phaseId: nextPhase.id,
        name: firstMovement.name,
        description: firstMovement.description || '',
        sequenceOrder: 0,
        isRequired: firstMovement.is_required !== false,
        roomSpecific: false,
        roomName: null,
        validationRequirements: firstMovement.evidence_requirements || null,
        completionStatus: 'pending'
      };
    }
  }
  
  return null; // At end of flow
}

/**
 * Get previous movement
 */
export async function getPreviousMovement(flowInstanceId: string): Promise<Movement | null> {
  const instance = await getFlowInstance(flowInstanceId);
  if (!instance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: flowInstance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhaseIndex = instance.currentPhaseIndex;
  const currentPhase = phases[currentPhaseIndex];
  
  if (!currentPhase) {
    return null;
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);
  
  // Find current movement index
  let currentMovementIndex = -1;
  for (let i = 0; i < (currentPhase.movements?.length || 0); i++) {
    const movement = currentPhase.movements[i];
    const movementKey = `${currentPhase.id}:${movement.id}`;
    if (!completedMovements.has(movementKey)) {
      currentMovementIndex = i;
      break;
    }
  }
  
  // Check if there's a previous movement in current phase
  if (currentMovementIndex > 0) {
    const prevMovement = currentPhase.movements[currentMovementIndex - 1];
    return {
      id: prevMovement.id,
      phaseId: currentPhase.id,
      name: prevMovement.name,
      description: prevMovement.description || '',
      sequenceOrder: currentMovementIndex - 1,
      isRequired: prevMovement.is_required !== false,
      roomSpecific: false,
      roomName: null,
      validationRequirements: prevMovement.evidence_requirements || null,
      completionStatus: 'pending'
    };
  }
  
  // Check if there's a previous phase
  if (currentPhaseIndex > 0) {
    const prevPhase = phases[currentPhaseIndex - 1];
    const lastMovementIndex = (prevPhase.movements?.length || 0) - 1;
    if (lastMovementIndex >= 0) {
      const lastMovement = prevPhase.movements[lastMovementIndex];
      return {
        id: lastMovement.id,
        phaseId: prevPhase.id,
        name: lastMovement.name,
        description: lastMovement.description || '',
        sequenceOrder: lastMovementIndex,
        isRequired: lastMovement.is_required !== false,
        roomSpecific: false,
        roomName: null,
        validationRequirements: lastMovement.evidence_requirements || null,
        completionStatus: 'pending'
      };
    }
  }
  
  return null; // At start of flow
}

/**
 * Navigate to specific movement
 */
export async function goToMovement(flowInstanceId: string, movementId: string): Promise<void> {
  const instance = await getFlowInstance(flowInstanceId);
  if (!instance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: flowInstance } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  
  // Find movement position
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi];
    for (let mi = 0; mi < (phase.movements?.length || 0); mi++) {
      if (phase.movements[mi].id === movementId) {
        await supabaseAdmin
          .from('claim_flow_instances')
          .update({ 
            current_phase_index: pi,
            current_phase_id: phase.id
          })
          .eq('id', flowInstanceId);
        return;
      }
    }
  }
  
  throw new Error(`Movement ${movementId} not found in flow`);
}

// ============================================================================
// 7. PHASE ADVANCEMENT
// ============================================================================

/**
 * Find a gate that controls transition between two phases
 */
function findGateForTransition(
  gates: FlowJsonGate[] | undefined,
  fromPhaseId: string,
  toPhaseId: string
): FlowJsonGate | null {
  if (!gates) return null;
  return gates.find(g => g.from_phase === fromPhaseId && g.to_phase === toPhaseId) || null;
}

/**
 * Check if all required movements in a phase are complete
 */
function areRequiredMovementsComplete(
  phase: FlowJsonPhase,
  completedMovements: Set<string>
): boolean {
  const requiredMovements = (phase.movements || []).filter(m => m.is_required !== false);
  return requiredMovements.every(m => completedMovements.has(`${phase.id}:${m.id}`));
}

/**
 * Check if all movements in a phase are complete (required and optional)
 */
function areAllMovementsComplete(
  phase: FlowJsonPhase,
  completedMovements: Set<string>
): boolean {
  return (phase.movements || []).every(m => completedMovements.has(`${phase.id}:${m.id}`));
}

/**
 * Advance the flow to the next phase after current phase is complete.
 * Called automatically when the last movement of a phase is completed.
 */
export async function advanceToNextPhase(flowInstanceId: string): Promise<{
  advanced: boolean;
  previousPhase: string;
  currentPhase: string | null;
  flowComplete: boolean;
  gateBlocked?: boolean;
  gateReason?: string;
}> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = phases[currentPhaseIndex];

  if (!currentPhase) {
    throw new Error('No current phase found');
  }

  // Check if there's a next phase
  if (currentPhaseIndex >= phases.length - 1) {
    // This was the last phase - mark flow as complete
    await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', flowInstanceId);

    console.log(`[FlowEngine] Flow ${flowInstanceId}: Completed (last phase "${currentPhase.id}")`);

    return {
      advanced: false,
      previousPhase: currentPhase.id,
      currentPhase: null,
      flowComplete: true
    };
  }

  // Check gate if one exists for this transition
  const nextPhase = phases[currentPhaseIndex + 1];
  const gate = findGateForTransition(flowJson.gates, currentPhase.id, nextPhase.id);

  if (gate) {
    const gateResult = await evaluateGate(flowInstanceId, gate.id);
    if (!gateResult.passed) {
      return {
        advanced: false,
        previousPhase: currentPhase.id,
        currentPhase: currentPhase.id,
        flowComplete: false,
        gateBlocked: true,
        gateReason: gateResult.reason
      };
    }
  }

  // Advance to next phase
  await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      current_phase_index: currentPhaseIndex + 1,
      current_phase_id: nextPhase.id
    })
    .eq('id', flowInstanceId);

  console.log(`[FlowEngine] Flow ${flowInstanceId}: Advanced from phase "${currentPhase.id}" to "${nextPhase.id}"`);

  return {
    advanced: true,
    previousPhase: currentPhase.id,
    currentPhase: nextPhase.id,
    flowComplete: false
  };
}

/**
 * Check if phase should be advanced and do so if appropriate.
 * Called after movement completion or skip.
 */
export async function checkPhaseAdvancement(flowInstanceId: string): Promise<{
  phaseAdvanced: boolean;
  flowComplete: boolean;
  newPhaseId?: string;
}> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (flow_json)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const flowJson = (flowInstance.flow_definitions as any)?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhaseIndex = flowInstance.current_phase_index || 0;
  const currentPhase = phases[currentPhaseIndex];

  if (!currentPhase) {
    return { phaseAdvanced: false, flowComplete: false };
  }

  const completedMovements = new Set(flowInstance.completed_movements || []);

  // Check if all required movements are complete
  const requiredComplete = areRequiredMovementsComplete(currentPhase, completedMovements);
  const allComplete = areAllMovementsComplete(currentPhase, completedMovements);

  if (requiredComplete && allComplete) {
    // All movements done - advance phase
    const result = await advanceToNextPhase(flowInstanceId);
    return {
      phaseAdvanced: result.advanced,
      flowComplete: result.flowComplete,
      newPhaseId: result.currentPhase || undefined
    };
  }

  return { phaseAdvanced: false, flowComplete: false };
}

/**
 * Get flow instance with enriched phase status
 */
export async function getFlowInstanceWithPhaseStatus(flowInstanceId: string): Promise<{
  instance: FlowInstance;
  phaseStatus: Array<{
    phaseId: string;
    phaseName: string;
    isComplete: boolean;
    isCurrent: boolean;
    progress: {
      completed: number;
      required: number;
      total: number;
    };
  }>;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions (
        id,
        name,
        description,
        flow_json
      )
    `)
    .eq('id', flowInstanceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const flowDef = data.flow_definitions as any;
  const flowJson = flowDef?.flow_json as FlowJson;
  const phases = flowJson?.phases || [];
  const currentPhaseIndex = data.current_phase_index || 0;
  const completedMovements = new Set(data.completed_movements || []);

  // Build phase status
  const phaseStatus = phases.map((phase, index) => {
    const requiredMovements = (phase.movements || []).filter(m => m.is_required !== false);
    const totalMovements = phase.movements?.length || 0;

    let completedInPhase = 0;
    let completedRequired = 0;

    (phase.movements || []).forEach(m => {
      const key = `${phase.id}:${m.id}`;
      if (completedMovements.has(key)) {
        completedInPhase++;
        if (m.is_required !== false) {
          completedRequired++;
        }
      }
    });

    const isComplete = index < currentPhaseIndex ||
      (completedRequired === requiredMovements.length && completedInPhase === totalMovements);

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      isComplete,
      isCurrent: index === currentPhaseIndex,
      progress: {
        completed: completedInPhase,
        required: requiredMovements.length,
        total: totalMovements
      }
    };
  });

  const currentPhase = phases[currentPhaseIndex];

  const instance: FlowInstance = {
    id: data.id,
    claimId: data.claim_id,
    flowDefinitionId: data.flow_definition_id,
    status: data.status,
    currentPhaseId: data.current_phase_id,
    currentPhaseIndex,
    startedAt: data.started_at ? new Date(data.started_at) : null,
    completedAt: data.completed_at ? new Date(data.completed_at) : null,
    flowName: flowDef?.name,
    flowDescription: flowDef?.description,
    currentPhaseName: currentPhase?.name,
    currentPhaseDescription: currentPhase?.description,
    completedMovements: data.completed_movements || []
  };

  return { instance, phaseStatus };
}
