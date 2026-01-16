/**
 * Audio Observations Routes
 *
 * Endpoints for voice note capture during field inspections.
 * Supports audio upload, processing status tracking, and retry functionality.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireOrganization } from '../middleware/tenant';
import {
  createAudioObservation,
  getAudioObservation,
  getClaimAudioObservations,
  retryAudioProcessing,
  initializeAudioBucket,
} from '../services/audioObservationService';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'audio-observations-routes' });

// Configure multer for audio uploads
// Memory storage for direct buffer access
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Initialize storage bucket on startup
initializeAudioBucket().catch((err) => {
  log.error({ err }, 'Failed to initialize audio bucket on startup');
});

// =================================================
// Routes
// =================================================

/**
 * POST /api/audio-observations
 * Upload a new audio observation
 *
 * Body (multipart/form-data):
 *   - audioFile: file (required)
 *   - organizationId: UUID (required)
 *   - claimId: UUID (optional)
 *   - flowInstanceId: UUID (optional)
 *   - movementCompletionId: UUID (optional)
 *   - roomId: UUID (optional)
 *   - structureId: UUID (optional)
 *   - recordedBy: UUID (required)
 */
router.post(
  '/',
  requireAuth,
  requireOrganization,
  upload.single('audioFile'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'Audio file is required' });
      }

      // Get organization from middleware or body
      const organizationId =
        (req as any).organizationId || req.body.organizationId;

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required' });
      }

      const recordedBy = req.body.recordedBy || (req.user as any)?.id;

      if (!recordedBy) {
        return res.status(400).json({ message: 'Recorded by (user ID) is required' });
      }

      const id = await createAudioObservation({
        audioBuffer: file.buffer,
        mimeType: file.mimetype,
        originalFilename: file.originalname,
        organizationId,
        claimId: req.body.claimId || undefined,
        flowInstanceId: req.body.flowInstanceId || undefined,
        movementCompletionId: req.body.movementCompletionId || undefined,
        roomId: req.body.roomId || undefined,
        structureId: req.body.structureId || undefined,
        recordedBy,
      });

      log.info({ id, organizationId }, 'Audio observation created via API');

      res.status(201).json({
        id,
        message: 'Audio observation created. Processing started.',
      });
    } catch (error) {
      log.error({ err: error }, 'Failed to create audio observation');
      res.status(500).json({
        message: 'Failed to create audio observation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/audio-observations/:id
 * Get a single audio observation with full details
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const observation = await getAudioObservation(id);

    if (!observation) {
      return res.status(404).json({ message: 'Audio observation not found' });
    }

    res.json(observation);
  } catch (error) {
    log.error({ err: error, id: req.params.id }, 'Failed to get audio observation');
    res.status(500).json({ message: 'Failed to get audio observation' });
  }
});

/**
 * POST /api/audio-observations/:id/retry
 * Retry processing for a failed audio observation
 */
router.post('/:id/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify observation exists
    const observation = await getAudioObservation(id);
    if (!observation) {
      return res.status(404).json({ message: 'Audio observation not found' });
    }

    // Trigger retry
    await retryAudioProcessing(id);

    log.info({ id }, 'Audio observation retry triggered');

    res.json({ message: 'Processing retry initiated' });
  } catch (error) {
    log.error({ err: error, id: req.params.id }, 'Failed to retry audio processing');
    res.status(500).json({
      message: 'Failed to retry processing',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =================================================
// Claim-specific routes (mounted separately)
// =================================================

/**
 * GET /api/claims/:claimId/audio-observations
 * Get all audio observations for a specific claim
 */
export const claimAudioObservationsRouter = Router();

claimAudioObservationsRouter.get(
  '/:claimId/audio-observations',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { claimId } = req.params;

      const observations = await getClaimAudioObservations(claimId);

      res.json(observations);
    } catch (error) {
      log.error({ err: error, claimId: req.params.claimId }, 'Failed to get claim audio observations');
      res.status(500).json({ message: 'Failed to get audio observations' });
    }
  }
);

export default router;
