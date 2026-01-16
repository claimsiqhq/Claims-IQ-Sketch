/**
 * Flow Definition Routes
 *
 * RESTful API routes for managing flow definitions.
 * Flow definitions define the inspection movements an adjuster performs for specific peril types.
 */

import express from 'express';
import {
  getAllFlowDefinitions,
  getFlowDefinition,
  createFlowDefinition,
  updateFlowDefinition,
  deleteFlowDefinition,
  duplicateFlowDefinition,
  toggleActiveStatus,
  validateFlowJson,
  getEmptyFlowTemplate,
} from '../services/flowDefinitionService';

const router = express.Router();

// ============================================================================
// LIST & RETRIEVE
// ============================================================================

/**
 * GET /api/flow-definitions
 * List all flow definitions
 */
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.query;

    const definitions = await getAllFlowDefinitions(
      organizationId as string | undefined
    );

    res.status(200).json(definitions);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] GET / error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/flow-definitions/template
 * Get empty flow template
 */
router.get('/template', async (req, res) => {
  try {
    const template = getEmptyFlowTemplate();
    res.status(200).json(template);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] GET /template error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/flow-definitions/:id
 * Get a single flow definition
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const definition = await getFlowDefinition(id);

    if (!definition) {
      return res.status(404).json({ error: 'Flow definition not found' });
    }

    res.status(200).json(definition);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] GET /:id error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ============================================================================
// CREATE & UPDATE
// ============================================================================

/**
 * POST /api/flow-definitions
 * Create a new flow definition
 */
router.post('/', async (req, res) => {
  try {
    const {
      organizationId,
      name,
      description,
      perilType,
      propertyType,
      flowJson,
      isActive,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!perilType) {
      return res.status(400).json({ error: 'perilType is required' });
    }
    if (!propertyType) {
      return res.status(400).json({ error: 'propertyType is required' });
    }
    if (!flowJson) {
      return res.status(400).json({ error: 'flowJson is required' });
    }

    // Get user ID from session if available
    const userId = (req.user as any)?.id;

    const definition = await createFlowDefinition({
      organizationId: organizationId || null,
      name,
      description: description || '',
      perilType,
      propertyType,
      flowJson,
      isActive: isActive ?? true,
      createdBy: userId,
    });

    res.status(201).json(definition);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] POST / error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PUT /api/flow-definitions/:id
 * Update an existing flow definition
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      organizationId,
      name,
      description,
      perilType,
      propertyType,
      flowJson,
      isActive,
    } = req.body;

    const definition = await updateFlowDefinition(id, {
      organizationId,
      name,
      description,
      perilType,
      propertyType,
      flowJson,
      isActive,
    });

    res.status(200).json(definition);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] PUT /:id error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ============================================================================
// DELETE & ACTIONS
// ============================================================================

/**
 * DELETE /api/flow-definitions/:id
 * Delete a flow definition
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await deleteFlowDefinition(id);

    res.status(200).json({ message: 'Flow definition deleted successfully' });
  } catch (error) {
    console.error('[FlowDefinitionRoutes] DELETE /:id error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /api/flow-definitions/:id/duplicate
 * Duplicate a flow definition
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({ error: 'newName is required' });
    }

    const definition = await duplicateFlowDefinition(id, newName);

    res.status(201).json(definition);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] POST /:id/duplicate error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PATCH /api/flow-definitions/:id/activate
 * Toggle active status
 */
router.patch('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await toggleActiveStatus(id);

    res.status(200).json(result);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] PATCH /:id/activate error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * POST /api/flow-definitions/validate
 * Validate flow JSON structure
 */
router.post('/validate', async (req, res) => {
  try {
    const { flowJson } = req.body;

    if (!flowJson) {
      return res.status(400).json({ error: 'flowJson is required' });
    }

    const result = validateFlowJson(flowJson);

    res.status(200).json(result);
  } catch (error) {
    console.error('[FlowDefinitionRoutes] POST /validate error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
