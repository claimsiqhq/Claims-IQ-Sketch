/**
 * AI Routes
 * 
 * AI-powered features including estimate suggestions, voice sessions,
 * and claim briefings.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrganization } from '../middleware/tenant';
import {
  generateEstimateSuggestions,
  quickSuggestLineItems,
  searchLineItemsByDescription
} from '../services/ai-estimate-suggest';
import { createVoiceSession, VOICE_CONFIG } from '../services/voice-session';
import { generateClaimBriefing, getClaimBriefing } from '../services/claimBriefingService';
import {
  getAllPrompts,
  getPrompt,
  updatePrompt,
  refreshCache,
} from '../services/promptService';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'ai-routes' });

// =================================================
// Estimate Suggestions
// =================================================

/**
 * POST /api/ai/suggest-estimate
 * Generate full estimate suggestions from damage description
 */
router.post('/suggest-estimate', async (req: Request, res: Response) => {
  try {
    const { description, damageType, rooms, peril } = req.body;

    if (!description) {
      return res.status(400).json({ message: 'Description required' });
    }

    const suggestions = await generateEstimateSuggestions({
      description,
      damageType,
      rooms,
      peril,
    });

    res.json({ suggestions });
  } catch (error) {
    log.error({ err: error }, 'Generate suggestions error');
    res.status(500).json({ message: 'Failed to generate suggestions' });
  }
});

/**
 * POST /api/ai/quick-suggest
 * Quick line item suggestions from short description
 */
router.post('/quick-suggest', async (req: Request, res: Response) => {
  try {
    const { description, context } = req.body;

    if (!description) {
      return res.status(400).json({ message: 'Description required' });
    }

    const suggestions = await quickSuggestLineItems(description, context);
    res.json({ suggestions });
  } catch (error) {
    log.error({ err: error }, 'Quick suggest error');
    res.status(500).json({ message: 'Failed to generate quick suggestions' });
  }
});

/**
 * GET /api/ai/search-line-items
 * AI-powered line item search by natural language
 */
router.get('/search-line-items', async (req: Request, res: Response) => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({ message: 'Search query required' });
    }

    const results = await searchLineItemsByDescription(
      q as string,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({ results });
  } catch (error) {
    log.error({ err: error }, 'Search line items error');
    res.status(500).json({ message: 'Failed to search line items' });
  }
});

// =================================================
// Voice Sessions
// =================================================

/**
 * POST /api/voice/session
 * Create a new voice session for Voice Sketch or Voice Scope
 */
router.post('/voice/session', async (req: Request, res: Response) => {
  try {
    const { mode, claimId, context } = req.body;

    const session = await createVoiceSession({
      mode: mode || 'sketch',
      claimId,
      context,
    });

    res.json({ session });
  } catch (error) {
    log.error({ err: error }, 'Create voice session error');
    res.status(500).json({ message: 'Failed to create voice session' });
  }
});

/**
 * GET /api/voice/config
 * Get voice session configuration
 */
router.get('/voice/config', (req: Request, res: Response) => {
  res.json({ config: VOICE_CONFIG });
});

// =================================================
// Claim Briefings
// =================================================

/**
 * POST /api/claims/:id/briefing
 * Generate AI briefing for a claim
 */
router.post('/claims/:id/briefing', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;
    const { forceRegenerate } = req.body;

    const briefing = await generateClaimBriefing(claimId, organizationId, { forceRegenerate });
    log.info({ claimId }, 'Claim briefing generated');
    res.json({ briefing });
  } catch (error) {
    log.error({ err: error }, 'Generate briefing error');
    res.status(500).json({ message: 'Failed to generate briefing' });
  }
});

/**
 * GET /api/claims/:id/briefing
 * Get existing briefing for a claim
 */
router.get('/claims/:id/briefing', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;

    const briefing = await getClaimBriefing(claimId, organizationId);
    if (!briefing) {
      return res.status(404).json({ message: 'Briefing not found' });
    }

    res.json({ briefing });
  } catch (error) {
    log.error({ err: error }, 'Get briefing error');
    res.status(500).json({ message: 'Failed to get briefing' });
  }
});

// =================================================
// AI Prompts (Admin)
// =================================================

/**
 * GET /api/ai/prompts
 * List all AI prompts (admin only)
 */
router.get('/prompts', requireAuth, async (req: Request, res: Response) => {
  try {
    const prompts = await getAllPrompts();
    res.json({ prompts });
  } catch (error) {
    log.error({ err: error }, 'Get prompts error');
    res.status(500).json({ message: 'Failed to get prompts' });
  }
});

/**
 * GET /api/ai/prompts/:key
 * Get a specific AI prompt
 */
router.get('/prompts/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const prompt = await getPrompt(key);
    
    if (!prompt) {
      return res.status(404).json({ message: 'Prompt not found' });
    }

    res.json({ prompt });
  } catch (error) {
    log.error({ err: error }, 'Get prompt error');
    res.status(500).json({ message: 'Failed to get prompt' });
  }
});

/**
 * PUT /api/ai/prompts/:key
 * Update an AI prompt (admin only)
 */
router.put('/prompts/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { content, metadata } = req.body;

    const prompt = await updatePrompt(key, { content, metadata });
    if (!prompt) {
      return res.status(404).json({ message: 'Prompt not found' });
    }

    log.info({ promptKey: key }, 'AI prompt updated');
    res.json({ prompt });
  } catch (error) {
    log.error({ err: error }, 'Update prompt error');
    res.status(500).json({ message: 'Failed to update prompt' });
  }
});

/**
 * POST /api/ai/prompts/refresh
 * Refresh the prompt cache
 */
router.post('/prompts/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    await refreshCache();
    log.info('AI prompt cache refreshed');
    res.json({ message: 'Cache refreshed' });
  } catch (error) {
    log.error({ err: error }, 'Refresh cache error');
    res.status(500).json({ message: 'Failed to refresh cache' });
  }
});

export default router;
