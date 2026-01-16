/**
 * Voice Inspection Routes
 * 
 * HTTP endpoints for voice-guided inspection sessions.
 * Supports starting sessions, processing commands, and ending sessions.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth';
import { voiceInspectionService } from '../services/voiceInspectionService';

const router = express.Router();

/**
 * POST /api/voice-inspection/start
 * Start a voice-guided session for a flow instance
 */
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { flowInstanceId } = req.body;
    const userId = req.user!.id;
    
    if (!flowInstanceId) {
      return res.status(400).json({ error: 'flowInstanceId is required' });
    }
    
    const session = await voiceInspectionService.startSession(flowInstanceId, userId);
    const context = await voiceInspectionService.buildSessionContext(session.sessionId);
    
    res.json({
      sessionId: session.sessionId,
      systemContext: context,
      currentMovement: session.currentMovementId,
      wsEndpoint: `/api/voice-inspection/ws/${session.sessionId}`
    });
  } catch (error) {
    console.error('[VoiceInspectionRoutes] POST /start error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

/**
 * POST /api/voice-inspection/command
 * Process a voice command (for non-WebSocket clients)
 */
router.post('/command', requireAuth, async (req, res) => {
  try {
    const { sessionId, command } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    
    const result = await voiceInspectionService.processCommand(sessionId, command);
    res.json(result);
  } catch (error) {
    console.error('[VoiceInspectionRoutes] POST /command error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

/**
 * POST /api/voice-inspection/end
 * End a voice session
 */
router.post('/end', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    await voiceInspectionService.endSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('[VoiceInspectionRoutes] POST /end error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

export default router;
