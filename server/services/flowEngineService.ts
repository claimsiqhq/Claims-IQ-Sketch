/**
 * Flow Engine Service
 * 
 * Replaces the old static workflow system with dynamic, phase-based inspection flows.
 * Each claim gets a claim_flow_instances record that progresses through phases → movements → evidence collection.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPromptConfig, substituteVariables } from './promptService';
import OpenAI from 'openai';

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
  startedAt: Date | null;
  completedAt: Date | null;
  flowName?: string;
  flowDescription?: string;
  currentPhaseName?: string;
  currentPhaseDescription?: string;
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
}

export interface EvidenceValidation {
  isValid: boolean;
  missingItems: string[];
  qualityIssues: string[];
  confidence: number;
}

// ============================================================================
// 1. FLOW INSTANCE MANAGEMENT
// ============================================================================

/**
 * Start a flow for a claim based on peril type
 */
export async function startFlowForClaim(
  claimId: string,
  perilType: string
): Promise<string> {
  // Step 1: Find matching flow_definitions
  const { data: flowDef, error: flowDefError } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .filter('perils', 'cs', JSON.stringify([perilType.toLowerCase()]))
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (flowDefError) {
    console.error('[FlowEngineService] Error finding flow definition:', flowDefError);
    throw new Error(`Database error finding flow definition: ${flowDefError.message}`);
  }

  // Step 2: If none found, throw error
  if (!flowDef) {
    throw new Error(`No flow definition for peril type: ${perilType}`);
  }

  // Step 3: Create claim_flow_instances record
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .insert({
      claim_id: claimId,
      flow_definition_id: flowDef.id,
      status: 'active',
      current_phase_id: null,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (instanceError) {
    console.error('[FlowEngineService] Error creating flow instance:', instanceError);
    throw new Error(`Failed to create flow instance: ${instanceError.message}`);
  }

  // Step 4: Get first phase from phases table
  const { data: firstPhase, error: phaseError } = await supabaseAdmin
    .from('phases')
    .select('*')
    .eq('flow_definition_id', flowDef.id)
    .order('sequence_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (phaseError) {
    console.error('[FlowEngineService] Error finding first phase:', phaseError);
    throw new Error(`Failed to find first phase: ${phaseError.message}`);
  }

  // Step 5: Update instance with first phase
  if (firstPhase) {
    const { error: updateError } = await supabaseAdmin
      .from('claim_flow_instances')
      .update({ current_phase_id: firstPhase.id })
      .eq('id', flowInstance.id);

    if (updateError) {
      console.error('[FlowEngineService] Error updating flow instance with phase:', updateError);
      throw new Error(`Failed to set initial phase: ${updateError.message}`);
    }
  }

  // Step 6: Return flow instance ID
  return flowInstance.id;
}

/**
 * Get current flow for a claim
 */
export async function getCurrentFlow(claimId: string): Promise<FlowInstance | null> {
  const { data, error } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      flow_definitions!inner (
        name,
        description
      ),
      phases (
        name,
        description
      )
    `)
    .eq('claim_id', claimId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('[FlowEngineService] Error getting current flow:', error);
    throw new Error(`Failed to get current flow: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    claimId: data.claim_id,
    flowDefinitionId: data.flow_definition_id,
    status: data.status,
    currentPhaseId: data.current_phase_id,
    startedAt: data.started_at ? new Date(data.started_at) : null,
    completedAt: data.completed_at ? new Date(data.completed_at) : null,
    flowName: (data.flow_definitions as any)?.name,
    flowDescription: (data.flow_definitions as any)?.description,
    currentPhaseName: (data.phases as any)?.name,
    currentPhaseDescription: (data.phases as any)?.description
  };
}

/**
 * Get flow progress
 */
export async function getFlowProgress(flowInstanceId: string): Promise<FlowProgress> {
  // Get total movements for this flow
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('flow_definition_id')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  // Get phases for this flow definition
  const { data: phases, error: phasesError } = await supabaseAdmin
    .from('phases')
    .select('id')
    .eq('flow_definition_id', flowInstance.flow_definition_id);

  if (phasesError) {
    throw new Error(`Failed to get phases: ${phasesError.message}`);
  }

  const phaseIds = phases?.map(p => p.id) || [];
  
  const { count: total, error: movementError } = await supabaseAdmin
    .from('movements')
    .select('id', { count: 'exact', head: true })
    .in('phase_id', phaseIds);

  if (movementError) {
    throw new Error(`Failed to count movements: ${movementError.message}`);
  }

  // Get completed movements
  const { count: completed, error: completedError } = await supabaseAdmin
    .from('movement_completions')
    .select('id', { count: 'exact', head: true })
    .eq('flow_instance_id', flowInstanceId)
    .eq('status', 'completed');

  if (completedError) {
    throw new Error(`Failed to count completed movements: ${completedError.message}`);
  }

  const totalMovements = total || 0;
  const completedMovements = completed || 0;
  const percentComplete = totalMovements > 0 
    ? Math.round((completedMovements / totalMovements) * 10000) / 100 
    : 0;

  return {
    total: totalMovements,
    completed: completedMovements,
    percentComplete
  };
}

// ============================================================================
// 2. MOVEMENT EXECUTION
// ============================================================================

/**
 * Get next movement for a flow instance
 */
export async function getNextMovement(
  flowInstanceId: string
): Promise<Movement | GateResult | null> {
  // Step 1: Get current phase from flow instance
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('current_phase_id, flow_definition_id, status')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  if (flowInstance.status === 'completed') {
    return null;
  }

  if (!flowInstance.current_phase_id) {
    throw new Error('Flow instance has no current phase');
  }

  // Step 2: Get all movements for current phase ordered by sequence
  const { data: movements, error: movementsError } = await supabaseAdmin
    .from('movements')
    .select('*')
    .eq('phase_id', flowInstance.current_phase_id)
    .order('sequence_order', { ascending: true });

  if (movementsError) {
    throw new Error(`Failed to get movements: ${movementsError.message}`);
  }

  // Step 3: Get completed movements for this flow instance
  const { data: completions, error: completionsError } = await supabaseAdmin
    .from('movement_completions')
    .select('movement_id')
    .eq('flow_instance_id', flowInstanceId);

  if (completionsError) {
    throw new Error(`Failed to get completions: ${completionsError.message}`);
  }

  const completedMovementIds = new Set(completions?.map(c => c.movement_id) || []);

  // Step 4: Find first incomplete movement
  const nextMovement = movements?.find(m => !completedMovementIds.has(m.id));

  if (nextMovement) {
    return {
      id: nextMovement.id,
      phaseId: nextMovement.phase_id,
      name: nextMovement.name,
      description: nextMovement.description,
      sequenceOrder: nextMovement.sequence_order,
      isRequired: nextMovement.is_required,
      roomSpecific: nextMovement.room_specific || false,
      roomName: nextMovement.room_name,
      validationRequirements: nextMovement.validation_requirements,
      completionStatus: 'pending'
    };
  }

  // Step 5: All movements complete - check for gate
  const { data: gate, error: gateError } = await supabaseAdmin
    .from('gates')
    .select('*')
    .eq('from_phase_id', flowInstance.current_phase_id)
    .maybeSingle();

  if (gateError) {
    console.error('[FlowEngineService] Error checking gate:', gateError);
  }

  if (gate) {
    return {
      type: 'gate',
      gate: {
        id: gate.id,
        name: gate.name,
        description: gate.description,
        evaluationCriteria: gate.evaluation_criteria,
        aiPromptKey: gate.ai_prompt_key
      }
    };
  }

  // No gate - advance to next phase
  const advanced = await advanceToNextPhase(flowInstanceId);
  if (advanced) {
    // Recursively get next movement from new phase
    return getNextMovement(flowInstanceId);
  }

  // No more phases - flow complete
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
  // Step 1: Verify movement belongs to current phase
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('current_phase_id, claim_id')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: movement, error: movementError } = await supabaseAdmin
    .from('movements')
    .select('phase_id')
    .eq('id', movementId)
    .single();

  if (movementError || !movement) {
    throw new Error(`Movement not found: ${movementId}`);
  }

  if (movement.phase_id !== flowInstance.current_phase_id) {
    throw new Error('Movement does not belong to current phase');
  }

  // Step 2: Create movement_completions record
  const evidenceData: any = {};
  if (evidence.photos?.length) {
    evidenceData.photos = evidence.photos;
  }
  if (evidence.measurements) {
    evidenceData.measurements = evidence.measurements;
  }

  const { data: completion, error: completionError } = await supabaseAdmin
    .from('movement_completions')
    .insert({
      flow_instance_id: flowInstanceId,
      movement_id: movementId,
      claim_id: flowInstance.claim_id,
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: evidence.userId,
      notes: evidence.notes || null,
      evidence_data: Object.keys(evidenceData).length > 0 ? evidenceData : null
    })
    .select()
    .single();

  if (completionError) {
    throw new Error(`Failed to create completion: ${completionError.message}`);
  }

  // Step 3: Link audio observation if provided
  if (evidence.audioId) {
    const { error: audioError } = await supabaseAdmin
      .from('audio_observations')
      .update({ movement_completion_id: completion.id })
      .eq('id', evidence.audioId);

    if (audioError) {
      console.error('[FlowEngineService] Error linking audio:', audioError);
    }
  }

  // Step 4: Check if all movements in phase complete
  const { data: phaseMovements, error: phaseMovementsError } = await supabaseAdmin
    .from('movements')
    .select('id')
    .eq('phase_id', flowInstance.current_phase_id);

  const { data: phaseCompletions, error: phaseCompletionsError } = await supabaseAdmin
    .from('movement_completions')
    .select('movement_id')
    .eq('flow_instance_id', flowInstanceId)
    .in('movement_id', phaseMovements?.map(m => m.id) || []);

  const allComplete = phaseMovements?.length === phaseCompletions?.length;

  if (allComplete) {
    // Check for gate and evaluate if exists
    const { data: gate } = await supabaseAdmin
      .from('gates')
      .select('id')
      .eq('from_phase_id', flowInstance.current_phase_id)
      .maybeSingle();

    if (gate) {
      console.log('[FlowEngineService] Phase complete, gate evaluation pending:', gate.id);
    }
  }

  // Step 5: Return completion record
  return {
    id: completion.id,
    flowInstanceId: completion.flow_instance_id,
    movementId: completion.movement_id,
    claimId: completion.claim_id,
    status: completion.status,
    completedAt: new Date(completion.completed_at),
    completedBy: completion.completed_by,
    notes: completion.notes,
    evidenceData: completion.evidence_data
  };
}

/**
 * Skip a movement with reason
 */
export async function skipMovement(
  flowInstanceId: string,
  movementId: string,
  reason: string,
  userId: string
): Promise<MovementCompletion> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('claim_id')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: completion, error: completionError } = await supabaseAdmin
    .from('movement_completions')
    .insert({
      flow_instance_id: flowInstanceId,
      movement_id: movementId,
      claim_id: flowInstance.claim_id,
      status: 'skipped',
      notes: reason,
      completed_by: userId,
      completed_at: new Date().toISOString()
    })
    .select()
    .single();

  if (completionError) {
    throw new Error(`Failed to skip movement: ${completionError.message}`);
  }

  return {
    id: completion.id,
    flowInstanceId: completion.flow_instance_id,
    movementId: completion.movement_id,
    claimId: completion.claim_id,
    status: completion.status,
    completedAt: new Date(completion.completed_at),
    completedBy: completion.completed_by,
    notes: completion.notes,
    evidenceData: completion.evidence_data
  };
}

// ============================================================================
// 3. GATE EVALUATION
// ============================================================================

/**
 * Evaluate a gate to determine if flow can proceed
 */
export async function evaluateGate(
  flowInstanceId: string,
  gateId: string
): Promise<{ result: 'passed' | 'failed'; reason?: string }> {
  // Step 1: Get gate record
  const { data: gate, error: gateError } = await supabaseAdmin
    .from('gates')
    .select('*')
    .eq('id', gateId)
    .single();

  if (gateError || !gate) {
    throw new Error(`Gate not found: ${gateId}`);
  }

  // Step 2: Get flow instance context
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      *,
      claims (*)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  // Get completed movements for context
  const { data: completions } = await supabaseAdmin
    .from('movement_completions')
    .select('*')
    .eq('flow_instance_id', flowInstanceId);

  let result: 'passed' | 'failed' = 'passed';
  let reason: string | undefined;

  // Step 3: AI evaluation if prompt key exists
  if (gate.ai_prompt_key) {
    try {
      const promptConfig = await getPromptConfig(gate.ai_prompt_key);
      
      if (promptConfig) {
        const context = {
          claim: flowInstance.claims,
          completedMovements: completions,
          gate: {
            name: gate.name,
            description: gate.description,
            criteria: gate.evaluation_criteria
          }
        };

        const userPrompt = (promptConfig.userPromptTemplate || '')
          .replace('{{claim}}', JSON.stringify(context.claim))
          .replace('{{completedMovements}}', JSON.stringify(context.completedMovements))
          .replace('{{gate}}', JSON.stringify(context.gate));

        const response = await openai.chat.completions.create({
          model: promptConfig.model || 'gpt-4o',
          messages: [
            { role: 'system', content: promptConfig.systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: promptConfig.temperature || 0.3
        });

        const aiResponse = response.choices[0]?.message?.content || '';
        
        // Parse AI response for pass/fail
        if (aiResponse.toLowerCase().includes('fail') || aiResponse.toLowerCase().includes('not ready')) {
          result = 'failed';
          reason = aiResponse;
        }
      }
    } catch (error) {
      console.error('[FlowEngineService] AI gate evaluation error:', error);
      // Default to passed if AI fails
    }
  } else {
    // Step 4: Simple criteria evaluation
    const criteria = gate.evaluation_criteria || {};
    
    if (criteria.minCompletedMovements) {
      const completedCount = completions?.filter(c => c.status === 'completed').length || 0;
      if (completedCount < criteria.minCompletedMovements) {
        result = 'failed';
        reason = `Minimum ${criteria.minCompletedMovements} completed movements required, only ${completedCount} completed`;
      }
    }

    if (criteria.requiredEvidence) {
      // Check if required evidence types are present
      const evidenceTypes = new Set(
        completions?.flatMap(c => Object.keys(c.evidence_data || {})) || []
      );
      
      for (const required of criteria.requiredEvidence) {
        if (!evidenceTypes.has(required)) {
          result = 'failed';
          reason = `Missing required evidence: ${required}`;
          break;
        }
      }
    }
  }

  // Step 5: Record evaluation result
  const { error: evalError } = await supabaseAdmin
    .from('gate_evaluations')
    .insert({
      gate_id: gateId,
      flow_instance_id: flowInstanceId,
      result,
      reason,
      evaluated_at: new Date().toISOString()
    });

  if (evalError) {
    console.error('[FlowEngineService] Error recording gate evaluation:', evalError);
  }

  // Step 6: If passed, advance to next phase
  if (result === 'passed') {
    await advanceToNextPhase(flowInstanceId);
  }

  return { result, reason };
}

/**
 * Advance to the next phase
 */
export async function advanceToNextPhase(flowInstanceId: string): Promise<Phase | null> {
  // Step 1: Get current phase
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('current_phase_id, flow_definition_id')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  // Get current phase sequence order
  const { data: currentPhase, error: currentPhaseError } = await supabaseAdmin
    .from('phases')
    .select('sequence_order')
    .eq('id', flowInstance.current_phase_id)
    .single();

  if (currentPhaseError || !currentPhase) {
    throw new Error('Current phase not found');
  }

  // Step 2: Get next phase
  const { data: nextPhase, error: nextPhaseError } = await supabaseAdmin
    .from('phases')
    .select('*')
    .eq('flow_definition_id', flowInstance.flow_definition_id)
    .gt('sequence_order', currentPhase.sequence_order)
    .order('sequence_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextPhaseError) {
    throw new Error(`Failed to get next phase: ${nextPhaseError.message}`);
  }

  // Step 3: If no next phase, complete flow
  if (!nextPhase) {
    const { error: completeError } = await supabaseAdmin
      .from('claim_flow_instances')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', flowInstanceId);

    if (completeError) {
      throw new Error(`Failed to complete flow: ${completeError.message}`);
    }

    return null;
  }

  // Step 4: Update to next phase
  const { error: updateError } = await supabaseAdmin
    .from('claim_flow_instances')
    .update({ current_phase_id: nextPhase.id })
    .eq('id', flowInstanceId);

  if (updateError) {
    throw new Error(`Failed to advance phase: ${updateError.message}`);
  }

  return {
    id: nextPhase.id,
    flowDefinitionId: nextPhase.flow_definition_id,
    name: nextPhase.name,
    description: nextPhase.description,
    sequenceOrder: nextPhase.sequence_order,
    isCompleted: false,
    movementCount: 0,
    completedMovementCount: 0
  };
}

// ============================================================================
// 4. DYNAMIC EXPANSION
// ============================================================================

/**
 * Add a room to the flow with AI-generated movements
 */
export async function addRoom(
  flowInstanceId: string,
  roomName: string,
  roomType: string
): Promise<Movement[]> {
  // Step 1: Get current flow context
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select(`
      current_phase_id,
      flow_definition_id,
      flow_definitions (*)
    `)
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  // Step 2: Get AI prompt for room expansion
  const promptConfig = await getPromptConfig('flow.room_expansion');
  
  if (!promptConfig) {
    throw new Error('Room expansion prompt not found');
  }

  const context = {
    roomName,
    roomType,
    currentFlowDefinition: flowInstance.flow_definitions
  };

  // Step 3: Call AI to generate movements
  const userPrompt = (promptConfig.userPromptTemplate || '')
    .replace('{{roomName}}', roomName)
    .replace('{{roomType}}', roomType)
    .replace('{{currentFlowDefinition}}', JSON.stringify(context.currentFlowDefinition));

  const response = await openai.chat.completions.create({
    model: promptConfig.model || 'gpt-4o',
    messages: [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: promptConfig.temperature || 0.3,
    response_format: { type: 'json_object' }
  });

  const aiResponse = response.choices[0]?.message?.content || '{}';
  let generatedMovements: any[] = [];

  try {
    const parsed = JSON.parse(aiResponse);
    generatedMovements = parsed.movements || [];
  } catch (e) {
    console.error('[FlowEngineService] Failed to parse AI response:', e);
    throw new Error('Failed to generate room movements');
  }

  // Step 4: Get max sequence order for current phase
  const { data: maxSeq } = await supabaseAdmin
    .from('movements')
    .select('sequence_order')
    .eq('phase_id', flowInstance.current_phase_id)
    .order('sequence_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  let sequenceOrder = (maxSeq?.sequence_order || 0) + 1;

  // Step 5: Insert new movements
  const movementsToInsert = generatedMovements.map((m: any) => ({
    phase_id: flowInstance.current_phase_id,
    name: m.name,
    description: m.description,
    sequence_order: sequenceOrder++,
    is_required: true,
    room_specific: true,
    room_name: roomName
  }));

  const { data: insertedMovements, error: insertError } = await supabaseAdmin
    .from('movements')
    .insert(movementsToInsert)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert movements: ${insertError.message}`);
  }

  // Step 6: Return inserted movements
  return (insertedMovements || []).map(m => ({
    id: m.id,
    phaseId: m.phase_id,
    name: m.name,
    description: m.description,
    sequenceOrder: m.sequence_order,
    isRequired: m.is_required,
    roomSpecific: m.room_specific,
    roomName: m.room_name,
    validationRequirements: m.validation_requirements
  }));
}

/**
 * Suggest additional movements based on current context
 */
export async function suggestAdditionalMovements(
  flowInstanceId: string,
  context: any
): Promise<any[]> {
  // Step 1: Get completed movements + evidence
  const { data: completions } = await supabaseAdmin
    .from('movement_completions')
    .select(`
      *,
      movements (*)
    `)
    .eq('flow_instance_id', flowInstanceId);

  // Step 2: Get AI prompt
  const promptConfig = await getPromptConfig('flow.dynamic_movement_injection');

  if (!promptConfig) {
    console.warn('[FlowEngineService] Dynamic movement injection prompt not found');
    return [];
  }

  const aiContext = {
    ...context,
    completedMovements: completions,
    observedDamage: context.observedDamage || []
  };

  // Step 3: Call AI
  const userPrompt = (promptConfig.userPromptTemplate || '')
    .replace('{{completedMovements}}', JSON.stringify(aiContext.completedMovements))
    .replace('{{observedDamage}}', JSON.stringify(aiContext.observedDamage));

  const response = await openai.chat.completions.create({
    model: promptConfig.model || 'gpt-4o',
    messages: [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: promptConfig.temperature || 0.5,
    response_format: { type: 'json_object' }
  });

  const aiResponse = response.choices[0]?.message?.content || '{}';
  
  try {
    const parsed = JSON.parse(aiResponse);
    // Step 4: Return suggestions (don't auto-insert)
    return parsed.suggestions || [];
  } catch (e) {
    console.error('[FlowEngineService] Failed to parse suggestions:', e);
    return [];
  }
}

// ============================================================================
// 5. EVIDENCE MANAGEMENT
// ============================================================================

/**
 * Attach evidence to a movement completion
 */
export async function attachEvidence(
  movementCompletionId: string,
  evidenceType: 'photo' | 'audio' | 'measurement' | 'note',
  evidenceData: any
): Promise<void> {
  // Get current evidence data
  const { data: completion, error: fetchError } = await supabaseAdmin
    .from('movement_completions')
    .select('evidence_data')
    .eq('id', movementCompletionId)
    .single();

  if (fetchError || !completion) {
    throw new Error(`Movement completion not found: ${movementCompletionId}`);
  }

  const currentEvidence = completion.evidence_data || {};

  // Merge new evidence
  if (evidenceType === 'photo') {
    currentEvidence.photos = currentEvidence.photos || [];
    currentEvidence.photos.push(evidenceData);
  } else if (evidenceType === 'audio') {
    currentEvidence.audioIds = currentEvidence.audioIds || [];
    currentEvidence.audioIds.push(evidenceData.id);
    
    // Also link in audio_observations table
    await supabaseAdmin
      .from('audio_observations')
      .update({ movement_completion_id: movementCompletionId })
      .eq('id', evidenceData.id);
  } else if (evidenceType === 'measurement') {
    currentEvidence.measurements = currentEvidence.measurements || [];
    currentEvidence.measurements.push(evidenceData);
  } else if (evidenceType === 'note') {
    currentEvidence.notes = currentEvidence.notes || [];
    currentEvidence.notes.push(evidenceData);
  }

  // Update evidence data
  const { error: updateError } = await supabaseAdmin
    .from('movement_completions')
    .update({ evidence_data: currentEvidence })
    .eq('id', movementCompletionId);

  if (updateError) {
    throw new Error(`Failed to attach evidence: ${updateError.message}`);
  }
}

/**
 * Validate evidence for a movement completion
 */
export async function validateEvidence(
  movementCompletionId: string
): Promise<EvidenceValidation> {
  // Step 1: Get movement requirements
  const { data: completion, error: completionError } = await supabaseAdmin
    .from('movement_completions')
    .select(`
      evidence_data,
      movements (
        validation_requirements
      )
    `)
    .eq('id', movementCompletionId)
    .single();

  if (completionError || !completion) {
    throw new Error(`Movement completion not found: ${movementCompletionId}`);
  }

  const requirements = (completion.movements as any)?.validation_requirements || {};
  const evidence = completion.evidence_data || {};

  // Step 2: Get AI prompt
  const promptConfig = await getPromptConfig('flow.evidence_validation');

  if (!promptConfig) {
    // Fallback to basic validation
    const missingItems: string[] = [];
    
    if (requirements.minPhotos && (!evidence.photos || evidence.photos.length < requirements.minPhotos)) {
      missingItems.push(`At least ${requirements.minPhotos} photos required`);
    }
    
    if (requirements.requiresNotes && !evidence.notes?.length) {
      missingItems.push('Notes required');
    }

    return {
      isValid: missingItems.length === 0,
      missingItems,
      qualityIssues: [],
      confidence: 0.8
    };
  }

  // Step 3: AI validation
  const userPrompt = (promptConfig.userPromptTemplate || '')
    .replace('{{requirements}}', JSON.stringify(requirements))
    .replace('{{evidence}}', JSON.stringify(evidence));

  const response = await openai.chat.completions.create({
    model: promptConfig.model || 'gpt-4o',
    messages: [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });

  const aiResponse = response.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(aiResponse);
    return {
      isValid: parsed.isValid ?? true,
      missingItems: parsed.missingItems || [],
      qualityIssues: parsed.qualityIssues || [],
      confidence: parsed.confidence ?? 0.9
    };
  } catch (e) {
    console.error('[FlowEngineService] Failed to parse validation response:', e);
    return {
      isValid: true,
      missingItems: [],
      qualityIssues: [],
      confidence: 0.5
    };
  }
}

/**
 * Get all evidence for a movement
 */
export async function getMovementEvidence(
  movementId: string,
  flowInstanceId: string
): Promise<any> {
  const { data: completion, error } = await supabaseAdmin
    .from('movement_completions')
    .select('evidence_data')
    .eq('movement_id', movementId)
    .eq('flow_instance_id', flowInstanceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get evidence: ${error.message}`);
  }

  if (!completion) {
    return null;
  }

  const evidence = completion.evidence_data || {};

  // Get linked audio observations
  const { data: audioObs } = await supabaseAdmin
    .from('audio_observations')
    .select('*')
    .eq('movement_completion_id', completion.evidence_data?.completionId);

  return {
    photos: evidence.photos || [],
    audioObservations: audioObs || [],
    measurements: evidence.measurements || [],
    notes: evidence.notes || []
  };
}

// ============================================================================
// 6. QUERY FUNCTIONS
// ============================================================================

/**
 * Get all phases for a flow instance
 */
export async function getFlowPhases(flowInstanceId: string): Promise<Phase[]> {
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('flow_definition_id, current_phase_id')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const { data: phases, error: phasesError } = await supabaseAdmin
    .from('phases')
    .select('*')
    .eq('flow_definition_id', flowInstance.flow_definition_id)
    .order('sequence_order', { ascending: true });

  if (phasesError) {
    throw new Error(`Failed to get phases: ${phasesError.message}`);
  }

  // Get completion counts for each phase
  const result: Phase[] = [];

  for (const phase of phases || []) {
    const { count: movementCount } = await supabaseAdmin
      .from('movements')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', phase.id);

    const { count: completedCount } = await supabaseAdmin
      .from('movement_completions')
      .select('id', { count: 'exact', head: true })
      .eq('flow_instance_id', flowInstanceId)
      .in('movement_id', 
        (await supabaseAdmin
          .from('movements')
          .select('id')
          .eq('phase_id', phase.id)
        ).data?.map(m => m.id) || []
      );

    // Determine if phase is completed
    const isCompleted = (movementCount || 0) > 0 && movementCount === completedCount;

    result.push({
      id: phase.id,
      flowDefinitionId: phase.flow_definition_id,
      name: phase.name,
      description: phase.description,
      sequenceOrder: phase.sequence_order,
      isCompleted,
      movementCount: movementCount || 0,
      completedMovementCount: completedCount || 0
    });
  }

  return result;
}

/**
 * Get all movements for a phase with completion status
 */
export async function getPhaseMovements(
  phaseId: string,
  flowInstanceId: string
): Promise<Movement[]> {
  const { data: movements, error: movementsError } = await supabaseAdmin
    .from('movements')
    .select('*')
    .eq('phase_id', phaseId)
    .order('sequence_order', { ascending: true });

  if (movementsError) {
    throw new Error(`Failed to get movements: ${movementsError.message}`);
  }

  const { data: completions } = await supabaseAdmin
    .from('movement_completions')
    .select('movement_id, status, completed_at, notes')
    .eq('flow_instance_id', flowInstanceId);

  const completionMap = new Map(
    (completions || []).map(c => [c.movement_id, c])
  );

  return (movements || []).map(m => {
    const completion = completionMap.get(m.id);
    return {
      id: m.id,
      phaseId: m.phase_id,
      name: m.name,
      description: m.description,
      sequenceOrder: m.sequence_order,
      isRequired: m.is_required,
      roomSpecific: m.room_specific || false,
      roomName: m.room_name,
      validationRequirements: m.validation_requirements,
      completionStatus: completion?.status || 'pending',
      completedAt: completion?.completed_at ? new Date(completion.completed_at) : null,
      notes: completion?.notes || null
    };
  });
}

/**
 * Get chronological timeline of all completed movements
 */
export async function getFlowTimeline(flowInstanceId: string): Promise<any[]> {
  const { data: completions, error } = await supabaseAdmin
    .from('movement_completions')
    .select(`
      *,
      movements (
        name,
        description
      )
    `)
    .eq('flow_instance_id', flowInstanceId)
    .order('completed_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get timeline: ${error.message}`);
  }

  return (completions || []).map(c => ({
    id: c.id,
    movementId: c.movement_id,
    movementName: (c.movements as any)?.name,
    movementDescription: (c.movements as any)?.description,
    status: c.status,
    completedAt: c.completed_at,
    completedBy: c.completed_by,
    notes: c.notes,
    evidenceCount: Object.keys(c.evidence_data || {}).reduce((acc, key) => {
      const val = c.evidence_data[key];
      return acc + (Array.isArray(val) ? val.length : 1);
    }, 0)
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Flow instance management
  startFlowForClaim,
  getCurrentFlow,
  getFlowProgress,
  
  // Movement execution
  getNextMovement,
  completeMovement,
  skipMovement,
  
  // Gate evaluation
  evaluateGate,
  advanceToNextPhase,
  
  // Dynamic expansion
  addRoom,
  suggestAdditionalMovements,
  
  // Evidence management
  attachEvidence,
  validateEvidence,
  getMovementEvidence,
  
  // Query functions
  getFlowPhases,
  getPhaseMovements,
  getFlowTimeline
};
