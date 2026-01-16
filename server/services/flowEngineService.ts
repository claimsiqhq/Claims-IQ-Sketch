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
 * Start a flow for a claim based on peril type
 */
export async function startFlowForClaim(
  claimId: string,
  perilType: string
): Promise<string> {
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

  // Find the movement
  const movement = currentPhase.movements?.find(m => m.id === movementId);
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

  return {
    id: completion?.id || movementKey,
    flowInstanceId,
    movementId: movementKey,
    claimId: flowInstance.claim_id,
    status: 'completed',
    completedAt: new Date(),
    completedBy: evidence.userId,
    notes: evidence.notes || null,
    evidenceData: evidence
  };
}

/**
 * Skip a movement
 */
export async function skipMovement(
  flowInstanceId: string,
  movementId: string,
  reason: string,
  userId: string
): Promise<void> {
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

  // Find the movement
  const movement = currentPhase.movements?.find(m => m.id === movementId);
  if (!movement) {
    throw new Error(`Movement ${movementId} not found in current phase`);
  }

  // Check if movement can be skipped
  if (movement.is_required) {
    throw new Error('Required movements cannot be skipped');
  }

  // Create movement key and add to completed list
  const movementKey = `${currentPhase.id}:${movementId}`;
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

  // Record the skip
  await supabaseAdmin
    .from('movement_completions')
    .insert({
      flow_instance_id: flowInstanceId,
      movement_id: movementKey,
      movement_phase: currentPhase.id,
      claim_id: flowInstance.claim_id,
      status: 'skipped',
      completed_at: new Date().toISOString(),
      completed_by: userId,
      notes: reason,
      evidence_data: null
    });
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

  // Get photos linked to this movement
  const { data: photos, error: photosError } = await supabaseAdmin
    .from('claim_photos')
    .select('id, public_url, file_name, label, description, ai_analysis, created_at')
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
            fileName: photo.file_name,
            label: photo.label,
            description: photo.description,
            aiAnalysis: photo.ai_analysis
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
 * Add room-specific movements dynamically
 */
export async function addRoomMovements(
  flowInstanceId: string,
  roomName: string,
  movementTemplateIds: string[]
): Promise<void> {
  // This would create room-specific movement instances
  // For now, we store them as metadata since movements are in JSON
  const { data: flowInstance, error: instanceError } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('dynamic_movements')
    .eq('id', flowInstanceId)
    .single();

  if (instanceError || !flowInstance) {
    throw new Error(`Flow instance not found: ${flowInstanceId}`);
  }

  const dynamicMovements = flowInstance.dynamic_movements || [];
  const newMovements = movementTemplateIds.map(id => ({
    id: `${roomName}:${id}:${Date.now()}`,
    templateId: id,
    roomName,
    createdAt: new Date().toISOString()
  }));

  await supabaseAdmin
    .from('claim_flow_instances')
    .update({
      dynamic_movements: [...dynamicMovements, ...newMovements]
    })
    .eq('id', flowInstanceId);
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
 * Get flow instance details
 */
export async function getFlowInstance(flowInstanceId: string): Promise<FlowInstance | null> {
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
