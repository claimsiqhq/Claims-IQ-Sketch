/**
 * Flow Engine Routes
 * 
 * RESTful API routes for the flow engine.
 * Replaces the old 9 workflow endpoints.
 */

import express from 'express';
import {
  startFlowForClaim,
  getCurrentFlow,
  getFlowProgress,
  getNextMovement,
  completeMovement,
  skipMovement,
  evaluateGate,
  addRoomMovements,
  getSuggestedMovements,
  insertCustomMovement,
  attachEvidence,
  validateEvidence,
  getMovementEvidence,
  getFlowPhases,
  getPhaseMovements,
  getFlowTimeline,
  cancelFlow,
  getFlowInstance
} from '../services/flowEngineService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const router = express.Router();

// ============================================================================
// 1. FLOW INSTANCE MANAGEMENT
// ============================================================================

/**
 * POST /api/claims/:claimId/flows
 * Start new flow for claim
 */
router.post('/claims/:claimId/flows', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { perilType } = req.body;

    if (!perilType) {
      return res.status(400).json({ error: 'perilType is required' });
    }

    // Check if flow already active for claim
    const existingFlow = await getCurrentFlow(claimId);
    if (existingFlow) {
      return res.status(409).json({ 
        error: 'Active flow already exists for this claim',
        flowInstanceId: existingFlow.id
      });
    }

    const flowInstanceId = await startFlowForClaim(claimId, perilType);

    res.status(201).json({
      flowInstanceId,
      message: 'Flow started successfully'
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /claims/:claimId/flows error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/claims/:claimId/flows
 * Get active flow for claim
 */
router.get('/claims/:claimId/flows', async (req, res) => {
  try {
    const { claimId } = req.params;

    const flow = await getCurrentFlow(claimId);

    if (!flow) {
      return res.status(404).json({ error: 'No active flow found for this claim' });
    }

    res.status(200).json(flow);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /claims/:claimId/flows error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/claims/:claimId/flows
 * Cancel active flow
 */
router.delete('/claims/:claimId/flows', async (req, res) => {
  try {
    const { claimId } = req.params;

    const flow = await getCurrentFlow(claimId);

    if (!flow) {
      return res.status(404).json({ error: 'No active flow found for this claim' });
    }

    // Update status to cancelled
    const { error: updateError } = await supabaseAdmin
      .from('claim_flow_instances')
      .update({ status: 'cancelled' })
      .eq('id', flow.id);

    if (updateError) {
      throw new Error(`Failed to cancel flow: ${updateError.message}`);
    }

    res.status(200).json({ message: 'Flow cancelled successfully' });

  } catch (error) {
    console.error('[FlowEngineRoutes] DELETE /claims/:claimId/flows error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// 2. FLOW PROGRESS
// ============================================================================

/**
 * GET /api/flows/:flowInstanceId
 * Get complete flow state
 */
router.get('/flows/:flowInstanceId', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;

    // Get flow instance with full details
    const { data: flowInstance, error } = await supabaseAdmin
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (*),
        phases:current_phase_id (*)
      `)
      .eq('id', flowInstanceId)
      .single();

    if (error || !flowInstance) {
      return res.status(404).json({ error: 'Flow instance not found' });
    }

    // Get all phases with completion status
    const phases = await getFlowPhases(flowInstanceId);

    // Get progress
    const progress = await getFlowProgress(flowInstanceId);

    res.status(200).json({
      ...flowInstance,
      phases,
      progress
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/flows/:flowInstanceId/progress
 * Get progress summary
 */
router.get('/flows/:flowInstanceId/progress', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;

    const progress = await getFlowProgress(flowInstanceId);

    res.status(200).json(progress);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/progress error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/flows/:flowInstanceId/timeline
 * Get chronological completion history
 */
router.get('/flows/:flowInstanceId/timeline', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;

    const timeline = await getFlowTimeline(flowInstanceId);

    res.status(200).json(timeline);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/timeline error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/flows/:flowInstanceId/phases
 * Get all phases with completion status
 */
router.get('/flows/:flowInstanceId/phases', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;

    const phases = await getFlowPhases(flowInstanceId);

    res.status(200).json(phases);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/phases error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/flows/:flowInstanceId/phases/:phaseId/movements
 * Get movements for specific phase
 */
router.get('/flows/:flowInstanceId/phases/:phaseId/movements', async (req, res) => {
  try {
    const { flowInstanceId, phaseId } = req.params;

    const movements = await getPhaseMovements(phaseId, flowInstanceId);

    res.status(200).json(movements);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/phases/:phaseId/movements error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// 3. MOVEMENT EXECUTION
// ============================================================================

/**
 * GET /api/flows/:flowInstanceId/next
 * Get next movement to complete
 */
router.get('/flows/:flowInstanceId/next', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;

    const next = await getNextMovement(flowInstanceId);

    if (!next) {
      return res.status(200).json({ type: 'complete' });
    }

    if ('type' in next && next.type === 'gate') {
      return res.status(200).json(next);
    }

    res.status(200).json({ type: 'movement', movement: next });

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/next error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flows/:flowInstanceId/movements/:movementId/complete
 * Mark movement as complete
 */
router.post('/flows/:flowInstanceId/movements/:movementId/complete', async (req, res) => {
  try {
    const { flowInstanceId, movementId } = req.params;
    const { userId, notes, evidence } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const completion = await completeMovement(flowInstanceId, movementId, {
      userId,
      notes,
      photos: evidence?.photos,
      audioId: evidence?.audioObservationId,
      measurements: evidence?.measurements
    });

    res.status(201).json(completion);

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/movements/:movementId/complete error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flows/:flowInstanceId/movements/:movementId/skip
 * Skip movement with reason
 */
router.post('/flows/:flowInstanceId/movements/:movementId/skip', async (req, res) => {
  try {
    const { flowInstanceId, movementId } = req.params;
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const completion = await skipMovement(flowInstanceId, movementId, reason, userId);

    res.status(201).json(completion);

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/movements/:movementId/skip error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/flows/:flowInstanceId/movements/:movementId/evidence
 * Get all evidence for movement
 */
router.get('/flows/:flowInstanceId/movements/:movementId/evidence', async (req, res) => {
  try {
    const { flowInstanceId, movementId } = req.params;

    const evidence = await getMovementEvidence(movementId, flowInstanceId);

    if (!evidence) {
      return res.status(404).json({ error: 'No evidence found for this movement' });
    }

    res.status(200).json(evidence);

  } catch (error) {
    console.error('[FlowEngineRoutes] GET /flows/:flowInstanceId/movements/:movementId/evidence error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// 4. GATE EVALUATION
// ============================================================================

/**
 * POST /api/flows/:flowInstanceId/gates/:gateId/evaluate
 * Evaluate gate to proceed to next phase
 */
router.post('/flows/:flowInstanceId/gates/:gateId/evaluate', async (req, res) => {
  try {
    const { flowInstanceId, gateId } = req.params;

    const result = await evaluateGate(flowInstanceId, gateId);

    // If passed, advance to next phase
    if (result.passed && result.nextPhaseId) {
      // Get flow instance to find next phase index from flow_json
      const { data: flowInstance } = await supabaseAdmin
        .from('claim_flow_instances')
        .select(`
          *,
          flow_definitions (flow_json)
        `)
        .eq('id', flowInstanceId)
        .single();

      if (flowInstance) {
        const flowJson = (flowInstance.flow_definitions as any)?.flow_json;
        const phases = flowJson?.phases || [];
        const nextPhaseIndex = phases.findIndex((p: any) => p.id === result.nextPhaseId);
        
        if (nextPhaseIndex >= 0) {
          await supabaseAdmin
            .from('claim_flow_instances')
            .update({
              current_phase_id: result.nextPhaseId,
              current_phase_index: nextPhaseIndex
            })
            .eq('id', flowInstanceId);
        }
      }
    }

    res.status(200).json({
      passed: result.passed,
      reason: result.reason,
      nextPhaseId: result.nextPhaseId,
      message: result.passed ? 'Gate passed, advancing to next phase' : 'Gate failed'
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/gates/:gateId/evaluate error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// 5. DYNAMIC EXPANSION
// ============================================================================

/**
 * POST /api/flows/:flowInstanceId/rooms
 * Add room-specific movements
 */
router.post('/flows/:flowInstanceId/rooms', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;
    const { roomName, roomType } = req.body;

    if (!roomName) {
      return res.status(400).json({ error: 'roomName is required' });
    }

    // roomType can be used to determine movement templates
    const movementTemplates = req.body.movementTemplates || [];

    await addRoomMovements(flowInstanceId, roomName, movementTemplates);

    res.status(201).json({ 
      message: `Room "${roomName}" added with ${movementTemplates.length} movements`,
      roomName,
      movementCount: movementTemplates.length
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/rooms error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flows/:flowInstanceId/suggest
 * Get AI-suggested additional movements
 */
router.post('/flows/:flowInstanceId/suggest', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;
    const { context } = req.body;

    const suggestions = await getSuggestedMovements(flowInstanceId, context || {});

    res.status(200).json(suggestions);

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/suggest error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flows/:flowInstanceId/movements
 * Manually insert custom movement
 */
router.post('/flows/:flowInstanceId/movements', async (req, res) => {
  try {
    const { flowInstanceId } = req.params;
    const { phaseId, name, description, afterMovementId } = req.body;

    if (!phaseId) {
      return res.status(400).json({ error: 'phaseId is required' });
    }
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const movementId = await insertCustomMovement(flowInstanceId, {
      phaseId,
      name,
      description: description || '',
      afterMovementId
    });

    res.status(201).json({ 
      id: movementId,
      message: 'Custom movement added successfully'
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/movements error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// 6. EVIDENCE MANAGEMENT
// ============================================================================

/**
 * POST /api/flows/:flowInstanceId/movements/:movementId/evidence
 * Attach evidence to movement completion
 *
 * Request body:
 * - type: 'photo' | 'audio' | 'voice_note' | 'measurement' | 'note'
 * - referenceId: string (UUID of photo or audio record)
 * - data: any (optional additional data)
 * - userId: string (required)
 * - notes: string (optional notes about the evidence)
 *
 * Also accepts frontend format:
 * - evidenceType: alias for type
 * - evidenceId: alias for referenceId
 */
router.post('/flows/:flowInstanceId/movements/:movementId/evidence', async (req, res) => {
  try {
    const { flowInstanceId, movementId } = req.params;
    // Support both naming conventions (backend: type/referenceId, frontend: evidenceType/evidenceId)
    const type = req.body.type || req.body.evidenceType;
    const referenceId = req.body.referenceId || req.body.evidenceId;
    const { data, userId, notes } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type is required (photo, audio, voice_note, measurement, note)' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const evidenceId = await attachEvidence(flowInstanceId, movementId, {
      type,
      referenceId,
      data,
      userId,
      notes
    });

    res.status(201).json({
      message: 'Evidence attached successfully',
      evidenceId
    });

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/movements/:movementId/evidence error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/flows/:flowInstanceId/movements/:movementId/validate
 * Validate evidence completeness
 */
router.post('/flows/:flowInstanceId/movements/:movementId/validate', async (req, res) => {
  try {
    const { flowInstanceId, movementId } = req.params;

    const validation = await validateEvidence(flowInstanceId, movementId);

    res.status(200).json(validation);

  } catch (error) {
    console.error('[FlowEngineRoutes] POST /flows/:flowInstanceId/movements/:movementId/validate error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
