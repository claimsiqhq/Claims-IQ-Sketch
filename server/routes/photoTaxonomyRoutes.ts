/**
 * Photo Taxonomy Routes
 *
 * API endpoints for managing photo categories and taxonomy-based organization.
 */

import { Router } from 'express';
import * as taxonomyService from '../services/photoTaxonomyService';

const router = Router();

// ============================================
// CATEGORY ENDPOINTS
// ============================================

/**
 * GET /api/photo-categories
 * Get all active photo categories
 */
router.get('/photo-categories', async (req, res) => {
  try {
    const { peril, topLevelOnly } = req.query;

    let categories;
    if (topLevelOnly === 'true') {
      categories = await taxonomyService.getTopLevelCategories();
    } else if (peril && typeof peril === 'string') {
      categories = await taxonomyService.getCategoriesForPeril(peril);
    } else {
      categories = await taxonomyService.getAllCategories();
    }

    res.json(categories);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error fetching categories:', error);
    res.status(500).json({
      error: 'Failed to fetch photo categories',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/photo-categories/:prefix
 * Get a specific category by prefix
 */
router.get('/photo-categories/:prefix', async (req, res) => {
  try {
    const { prefix } = req.params;
    const category = await taxonomyService.getCategoryByPrefix(prefix);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Also get children if any
    const children = await taxonomyService.getChildCategories(prefix);

    res.json({
      ...category,
      children,
    });
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error fetching category:', error);
    res.status(500).json({
      error: 'Failed to fetch category',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/photo-categories/:prefix/children
 * Get child categories for a parent prefix
 */
router.get('/photo-categories/:prefix/children', async (req, res) => {
  try {
    const { prefix } = req.params;
    const children = await taxonomyService.getChildCategories(prefix);
    res.json(children);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error fetching children:', error);
    res.status(500).json({
      error: 'Failed to fetch child categories',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// PHOTO TAXONOMY ASSIGNMENT
// ============================================

/**
 * POST /api/photos/:id/taxonomy
 * Assign taxonomy prefix to a photo
 */
router.post('/photos/:id/taxonomy', async (req, res) => {
  try {
    const { id } = req.params;
    const { prefix, autoCategorized = false } = req.body;

    if (!prefix) {
      return res.status(400).json({ error: 'Prefix is required' });
    }

    const photo = await taxonomyService.assignTaxonomy(id, prefix, autoCategorized);
    res.json(photo);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error assigning taxonomy:', error);
    res.status(500).json({
      error: 'Failed to assign taxonomy',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/photos/:id/suggest-taxonomy
 * Get taxonomy suggestions based on AI analysis
 */
router.post('/photos/:id/suggest-taxonomy', async (req, res) => {
  try {
    const { id } = req.params;
    const { perilType } = req.body;

    // Get the photo's AI analysis
    const { data: photo, error } = await (await import('../lib/supabaseAdmin')).supabaseAdmin
      .from('claim_photos')
      .select('ai_analysis')
      .eq('id', id)
      .single();

    if (error || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const suggestions = taxonomyService.suggestTaxonomyFromAnalysis(
      photo.ai_analysis || {},
      perilType
    );

    res.json({ suggestions });
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error suggesting taxonomy:', error);
    res.status(500).json({
      error: 'Failed to suggest taxonomy',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// COMPLETENESS CHECKING
// ============================================

/**
 * GET /api/claims/:claimId/photo-completeness
 * Check photo completeness for a claim
 */
router.get('/claims/:claimId/photo-completeness', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { perilType = 'other' } = req.query;

    const result = await taxonomyService.checkPhotoCompleteness(
      claimId,
      perilType as string
    );

    res.json(result);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error checking completeness:', error);
    res.status(500).json({
      error: 'Failed to check photo completeness',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/claims/:claimId/photos/by-taxonomy
 * Get photos grouped by taxonomy prefix
 */
router.get('/claims/:claimId/photos/by-taxonomy', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { prefix } = req.query;

    if (prefix && typeof prefix === 'string') {
      const photos = await taxonomyService.getPhotosByTaxonomy(claimId, prefix);
      return res.json(photos);
    }

    // Return counts by taxonomy
    const counts = await taxonomyService.getPhotoCountsByTaxonomy(claimId);
    res.json(counts);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error fetching photos by taxonomy:', error);
    res.status(500).json({
      error: 'Failed to fetch photos',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/claims/:claimId/photos/uncategorized
 * Get uncategorized photos for a claim
 */
router.get('/claims/:claimId/photos/uncategorized', async (req, res) => {
  try {
    const { claimId } = req.params;
    const photos = await taxonomyService.getUncategorizedPhotos(claimId);
    res.json(photos);
  } catch (error) {
    console.error('[photoTaxonomyRoutes] Error fetching uncategorized photos:', error);
    res.status(500).json({
      error: 'Failed to fetch uncategorized photos',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
