/**
 * Estimates Routes
 * 
 * CRUD operations for estimates, including hierarchy management,
 * line items, exports, and submissions.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  calculateEstimate,
  saveEstimate,
  getEstimate,
  updateEstimate,
  addLineItemToEstimate,
  removeLineItemFromEstimate,
  listEstimates,
  getEstimateTemplates,
  createEstimateFromTemplate
} from '../services/estimateCalculator';
import {
  submitEstimate,
  validateEstimateForSubmission,
  getEstimateLockStatus,
} from '../services/estimateSubmission';
import {
  generatePdfReport,
  generateEsxExport,
  generateEsxXml,
  generateCsvExport
} from '../services/reportGenerator';
import { generateEstimatePdf, isPdfGenerationAvailable } from '../services/pdfGenerator';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'estimates-routes' });

// =================================================
// Estimates CRUD
// =================================================

/**
 * POST /api/estimates/calculate
 * Calculate estimate without saving
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const estimateData = req.body;
    const result = await calculateEstimate(estimateData);
    res.json({ estimate: result });
  } catch (error) {
    log.error({ err: error }, 'Calculate estimate error');
    res.status(500).json({ message: 'Failed to calculate estimate' });
  }
});

/**
 * POST /api/estimates
 * Create and save a new estimate
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const estimateData = req.body;

    const estimate = await saveEstimate({
      ...estimateData,
      createdBy: userId,
    });

    log.info({ estimateId: estimate.id }, 'Estimate created');
    res.status(201).json({ estimate });
  } catch (error) {
    log.error({ err: error }, 'Create estimate error');
    res.status(500).json({ message: 'Failed to create estimate' });
  }
});

/**
 * GET /api/estimates
 * List estimates (optionally filtered by claimId)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { claimId, status } = req.query;
    const estimates = await listEstimates({
      claimId: claimId as string,
      status: status as string,
    });
    res.json({ estimates });
  } catch (error) {
    log.error({ err: error }, 'List estimates error');
    res.status(500).json({ message: 'Failed to list estimates' });
  }
});

/**
 * GET /api/estimates/:id
 * Get a specific estimate
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const estimate = await getEstimate(id);
    
    if (!estimate) {
      return res.status(404).json({ message: 'Estimate not found' });
    }

    res.json({ estimate });
  } catch (error) {
    log.error({ err: error }, 'Get estimate error');
    res.status(500).json({ message: 'Failed to get estimate' });
  }
});

/**
 * PUT /api/estimates/:id
 * Update an estimate
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const estimate = await updateEstimate(id, updates);
    if (!estimate) {
      return res.status(404).json({ message: 'Estimate not found' });
    }

    log.info({ estimateId: id }, 'Estimate updated');
    res.json({ estimate });
  } catch (error) {
    log.error({ err: error }, 'Update estimate error');
    res.status(500).json({ message: 'Failed to update estimate' });
  }
});

// =================================================
// Estimate Line Items
// =================================================

/**
 * POST /api/estimates/:id/line-items
 * Add a line item to an estimate
 */
router.post('/:id/line-items', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lineItemData = req.body;

    const lineItem = await addLineItemToEstimate(id, lineItemData);
    log.info({ estimateId: id, lineItemId: lineItem.id }, 'Line item added');
    res.status(201).json({ lineItem });
  } catch (error) {
    log.error({ err: error }, 'Add line item error');
    res.status(500).json({ message: 'Failed to add line item' });
  }
});

/**
 * DELETE /api/estimates/:id/line-items/:code
 * Remove a line item from an estimate
 */
router.delete('/:id/line-items/:code', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, code } = req.params;

    await removeLineItemFromEstimate(id, code);
    log.info({ estimateId: id, lineItemCode: code }, 'Line item removed');
    res.json({ message: 'Line item removed' });
  } catch (error) {
    log.error({ err: error }, 'Remove line item error');
    res.status(500).json({ message: 'Failed to remove line item' });
  }
});

// =================================================
// Estimate Submission
// =================================================

/**
 * POST /api/estimates/:id/submit
 * Submit an estimate for approval
 */
router.post('/:id/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any).id;

    const result = await submitEstimate(id, userId);
    log.info({ estimateId: id }, 'Estimate submitted');
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Submit estimate error');
    res.status(500).json({ message: 'Failed to submit estimate' });
  }
});

/**
 * GET /api/estimates/:id/validate
 * Validate an estimate for submission readiness
 */
router.get('/:id/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = await validateEstimateForSubmission(id);
    res.json(validation);
  } catch (error) {
    log.error({ err: error }, 'Validate estimate error');
    res.status(500).json({ message: 'Failed to validate estimate' });
  }
});

/**
 * GET /api/estimates/:id/lock-status
 * Check if estimate is locked
 */
router.get('/:id/lock-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = await getEstimateLockStatus(id);
    res.json(status);
  } catch (error) {
    log.error({ err: error }, 'Get lock status error');
    res.status(500).json({ message: 'Failed to get lock status' });
  }
});

// =================================================
// Estimate Exports
// =================================================

/**
 * GET /api/estimates/:id/report/pdf
 * Generate PDF report for estimate
 */
router.get('/:id/report/pdf', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!isPdfGenerationAvailable()) {
      return res.status(503).json({ message: 'PDF generation is not available' });
    }

    const pdfBuffer = await generateEstimatePdf(id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    log.error({ err: error }, 'Generate PDF error');
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

/**
 * GET /api/estimates/:id/export/esx
 * Export estimate in ESX format
 */
router.get('/:id/export/esx', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const esxData = await generateEsxExport(id);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${id}.esx"`);
    res.send(esxData);
  } catch (error) {
    log.error({ err: error }, 'Generate ESX error');
    res.status(500).json({ message: 'Failed to generate ESX export' });
  }
});

/**
 * GET /api/estimates/:id/export/esx-xml
 * Export estimate in ESX XML format
 */
router.get('/:id/export/esx-xml', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const xmlData = await generateEsxXml(id);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${id}.xml"`);
    res.send(xmlData);
  } catch (error) {
    log.error({ err: error }, 'Generate ESX XML error');
    res.status(500).json({ message: 'Failed to generate ESX XML export' });
  }
});

/**
 * GET /api/estimates/:id/export/csv
 * Export estimate in CSV format
 */
router.get('/:id/export/csv', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const csvData = await generateCsvExport(id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${id}.csv"`);
    res.send(csvData);
  } catch (error) {
    log.error({ err: error }, 'Generate CSV error');
    res.status(500).json({ message: 'Failed to generate CSV export' });
  }
});

// =================================================
// Estimate Templates
// =================================================

/**
 * GET /api/estimate-templates
 * List available estimate templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await getEstimateTemplates();
    res.json({ templates });
  } catch (error) {
    log.error({ err: error }, 'Get templates error');
    res.status(500).json({ message: 'Failed to get templates' });
  }
});

/**
 * POST /api/estimate-templates/:id/create
 * Create estimate from template
 */
router.post('/templates/:id/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claimId } = req.body;
    const userId = (req.user as any).id;

    const estimate = await createEstimateFromTemplate(id, claimId, userId);
    log.info({ templateId: id, estimateId: estimate.id }, 'Estimate created from template');
    res.status(201).json({ estimate });
  } catch (error) {
    log.error({ err: error }, 'Create from template error');
    res.status(500).json({ message: 'Failed to create estimate from template' });
  }
});

export default router;
