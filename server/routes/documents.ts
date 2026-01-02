/**
 * Documents Routes
 * 
 * Document upload, processing, and AI extraction.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireOrganization } from '../middleware/tenant';
import { storage } from '../storage';
import {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  processDocument
} from '../services/documents';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'documents-routes' });

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// =================================================
// Document Upload & Management
// =================================================

/**
 * POST /api/claims/:claimId/documents
 * Upload a document to a claim
 */
router.post('/claims/:claimId/documents', requireAuth, requireOrganization, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { claimId } = req.params;
    const organizationId = (req as any).organizationId;
    const userId = (req.user as any).id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const document = await uploadDocument({
      claimId,
      organizationId,
      uploadedBy: userId,
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      metadata: req.body,
    });

    log.info({ documentId: document.id, claimId }, 'Document uploaded');
    res.status(201).json({ document });
  } catch (error) {
    log.error({ err: error }, 'Upload document error');
    res.status(500).json({ message: 'Failed to upload document' });
  }
});

/**
 * GET /api/claims/:claimId/documents
 * Get all documents for a claim
 */
router.get('/claims/:claimId/documents', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { claimId } = req.params;
    const organizationId = (req as any).organizationId;

    const documents = await getDocuments(claimId, organizationId);
    res.json({ documents });
  } catch (error) {
    log.error({ err: error }, 'Get documents error');
    res.status(500).json({ message: 'Failed to get documents' });
  }
});

/**
 * GET /api/documents/:id
 * Get a specific document
 */
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;

    const document = await getDocument(id, organizationId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ document });
  } catch (error) {
    log.error({ err: error }, 'Get document error');
    res.status(500).json({ message: 'Failed to get document' });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;

    await deleteDocument(id, organizationId);
    log.info({ documentId: id }, 'Document deleted');
    res.json({ message: 'Document deleted' });
  } catch (error) {
    log.error({ err: error }, 'Delete document error');
    res.status(500).json({ message: 'Failed to delete document' });
  }
});

/**
 * POST /api/documents/:id/process
 * Trigger AI processing for a document
 */
router.post('/:id/process', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;
    const { forceReprocess } = req.body;

    const result = await processDocument(id, organizationId, { forceReprocess });
    log.info({ documentId: id, status: result.status }, 'Document processed');
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Process document error');
    res.status(500).json({ message: 'Failed to process document' });
  }
});

// =================================================
// Bulk Upload
// =================================================

/**
 * POST /api/claims/:claimId/documents/bulk
 * Upload multiple documents to a claim
 */
router.post('/claims/:claimId/documents/bulk', requireAuth, requireOrganization, upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const { claimId } = req.params;
    const organizationId = (req as any).organizationId;
    const userId = (req.user as any).id;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const results = await Promise.allSettled(
      files.map(file => uploadDocument({
        claimId,
        organizationId,
        uploadedBy: userId,
        file: {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        },
      }))
    );

    const uploaded = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);
    
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message || 'Upload failed');

    log.info({ 
      claimId, 
      uploadedCount: uploaded.length, 
      failedCount: failed.length 
    }, 'Bulk upload completed');

    res.status(201).json({
      documents: uploaded,
      failed,
      summary: {
        total: files.length,
        uploaded: uploaded.length,
        failed: failed.length,
      }
    });
  } catch (error) {
    log.error({ err: error }, 'Bulk upload error');
    res.status(500).json({ message: 'Failed to upload documents' });
  }
});

export default router;
