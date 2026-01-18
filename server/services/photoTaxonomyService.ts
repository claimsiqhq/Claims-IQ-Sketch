/**
 * Photo Taxonomy Service
 *
 * Manages photo categories and taxonomy-based organization for claim photos.
 * Provides auto-categorization suggestions and completeness checking.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { PhotoCategory, ClaimPhoto, Peril } from '@shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface PhotoCompletenessResult {
  isComplete: boolean;
  totalRequired: number;
  totalCaptured: number;
  missing: Array<{
    prefix: string;
    name: string;
    required: number;
    have: number;
    shortfall: number;
  }>;
  categories: Array<{
    prefix: string;
    name: string;
    required: number;
    captured: number;
    isComplete: boolean;
  }>;
}

export interface TaxonomySuggestion {
  prefix: string;
  name: string;
  confidence: number;
  reason: string;
}

// ============================================
// CATEGORY MANAGEMENT
// ============================================

/**
 * Get all active photo categories
 */
export async function getAllCategories(): Promise<PhotoCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('photo_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    console.error('[photoTaxonomy] Error fetching categories:', error);
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data || [];
}

/**
 * Get categories applicable to a specific peril type
 */
export async function getCategoriesForPeril(perilType: string): Promise<PhotoCategory[]> {
  const allCategories = await getAllCategories();

  // Filter categories that apply to this peril (empty perilTypes means all perils)
  return allCategories.filter((cat) => {
    const perilTypes = cat.perilTypes || [];
    return perilTypes.length === 0 || perilTypes.includes(perilType);
  });
}

/**
 * Get category by prefix
 */
export async function getCategoryByPrefix(prefix: string): Promise<PhotoCategory | null> {
  const { data, error } = await supabaseAdmin
    .from('photo_categories')
    .select('*')
    .eq('prefix', prefix.toUpperCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch category: ${error.message}`);
  }

  return data;
}

/**
 * Get child categories for a parent prefix
 */
export async function getChildCategories(parentPrefix: string): Promise<PhotoCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('photo_categories')
    .select('*')
    .eq('parent_prefix', parentPrefix.toUpperCase())
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    throw new Error(`Failed to fetch child categories: ${error.message}`);
  }

  return data || [];
}

/**
 * Get top-level categories (no parent)
 */
export async function getTopLevelCategories(): Promise<PhotoCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('photo_categories')
    .select('*')
    .is('parent_prefix', null)
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    throw new Error(`Failed to fetch top-level categories: ${error.message}`);
  }

  return data || [];
}

// ============================================
// PHOTO CATEGORIZATION
// ============================================

/**
 * Assign taxonomy prefix to a photo
 */
export async function assignTaxonomy(
  photoId: string,
  prefix: string,
  autoCategorized: boolean = false
): Promise<ClaimPhoto | null> {
  // Get the category
  const category = await getCategoryByPrefix(prefix);

  const { data, error } = await supabaseAdmin
    .from('claim_photos')
    .update({
      taxonomy_prefix: prefix.toUpperCase(),
      taxonomy_category_id: category?.id || null,
      auto_categorized: autoCategorized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', photoId)
    .select()
    .single();

  if (error) {
    console.error('[photoTaxonomy] Error assigning taxonomy:', error);
    throw new Error(`Failed to assign taxonomy: ${error.message}`);
  }

  return data;
}

/**
 * Suggest taxonomy prefix based on AI analysis
 */
export function suggestTaxonomyFromAnalysis(
  aiAnalysis: Record<string, any>,
  perilType?: string
): TaxonomySuggestion[] {
  const suggestions: TaxonomySuggestion[] = [];

  if (!aiAnalysis || !aiAnalysis.content) {
    return suggestions;
  }

  const { damageTypes = [], damageLocations = [], materials = [], description = '' } = aiAnalysis.content;
  const descLower = description.toLowerCase();

  // Water damage detection
  if (
    damageTypes.includes('water damage') ||
    damageTypes.includes('water stain') ||
    descLower.includes('water')
  ) {
    if (damageLocations.includes('ceiling')) {
      suggestions.push({ prefix: 'WTR-CLG', name: 'Ceiling Damage', confidence: 0.9, reason: 'Water damage on ceiling detected' });
    } else if (damageLocations.includes('wall')) {
      suggestions.push({ prefix: 'WTR-WLL', name: 'Wall Damage', confidence: 0.9, reason: 'Water damage on wall detected' });
    } else if (damageLocations.includes('floor')) {
      suggestions.push({ prefix: 'WTR-FLR', name: 'Floor Damage', confidence: 0.9, reason: 'Water damage on floor detected' });
    } else {
      suggestions.push({ prefix: 'WTR', name: 'Water Damage', confidence: 0.7, reason: 'General water damage detected' });
    }
  }

  // Roof damage detection
  if (
    damageTypes.includes('hail damage') ||
    materials.includes('shingles') ||
    damageLocations.includes('roof')
  ) {
    if (descLower.includes('test square') || descLower.includes('chalk')) {
      suggestions.push({ prefix: 'RF-TSQ', name: 'Test Square', confidence: 0.95, reason: 'Hail test square detected' });
    } else if (damageLocations.includes('vent') || materials.includes('vent')) {
      suggestions.push({ prefix: 'RF-VNT', name: 'Roof Vents', confidence: 0.85, reason: 'Roof vent/penetration detected' });
    } else {
      suggestions.push({ prefix: 'RF', name: 'Roof', confidence: 0.8, reason: 'Roof damage detected' });
    }
  }

  // Fire/smoke detection
  if (damageTypes.includes('fire damage') || damageTypes.includes('char')) {
    if (descLower.includes('origin') || descLower.includes('source')) {
      suggestions.push({ prefix: 'FIRE-ORG', name: 'Origin Area', confidence: 0.85, reason: 'Fire origin area detected' });
    } else {
      suggestions.push({ prefix: 'FIRE', name: 'Fire', confidence: 0.8, reason: 'Fire damage detected' });
    }
  }

  if (damageTypes.includes('smoke') || damageTypes.includes('soot')) {
    suggestions.push({ prefix: 'SMK', name: 'Smoke', confidence: 0.85, reason: 'Smoke damage detected' });
  }

  // Mold detection
  if (damageTypes.includes('mold') || descLower.includes('mold') || descLower.includes('mildew')) {
    suggestions.push({ prefix: 'MLD', name: 'Mold', confidence: 0.9, reason: 'Mold growth detected' });
  }

  // Exterior detection
  if (
    materials.includes('siding') ||
    materials.includes('vinyl siding') ||
    damageLocations.includes('exterior')
  ) {
    if (materials.includes('gutter') || damageLocations.includes('gutter')) {
      suggestions.push({ prefix: 'EXT-GTR', name: 'Gutters', confidence: 0.9, reason: 'Gutter damage detected' });
    } else if (damageLocations.includes('window') || materials.includes('window')) {
      suggestions.push({ prefix: 'EXT-WIN', name: 'Windows', confidence: 0.85, reason: 'Window damage detected' });
    } else {
      suggestions.push({ prefix: 'EXT-SID', name: 'Siding', confidence: 0.8, reason: 'Exterior siding detected' });
    }
  }

  // Overview/general
  if (descLower.includes('street view') || descLower.includes('front of property')) {
    suggestions.push({ prefix: 'OV-STR', name: 'Street View', confidence: 0.9, reason: 'Street view of property' });
  } else if (descLower.includes('address') || descLower.includes('house number')) {
    suggestions.push({ prefix: 'OV-ADD', name: 'Address', confidence: 0.9, reason: 'Address visible' });
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

// ============================================
// COMPLETENESS CHECKING
// ============================================

/**
 * Check photo completeness for a claim based on peril type
 */
export async function checkPhotoCompleteness(
  claimId: string,
  perilType: string
): Promise<PhotoCompletenessResult> {
  // Get categories for this peril
  const categories = await getCategoriesForPeril(perilType);

  // Get photos for this claim grouped by taxonomy prefix
  const { data: photos, error } = await supabaseAdmin
    .from('claim_photos')
    .select('id, taxonomy_prefix')
    .eq('claim_id', claimId);

  if (error) {
    throw new Error(`Failed to fetch claim photos: ${error.message}`);
  }

  // Count photos per prefix
  const photoCounts = new Map<string, number>();
  for (const photo of photos || []) {
    const prefix = photo.taxonomy_prefix || 'UNCATEGORIZED';
    photoCounts.set(prefix, (photoCounts.get(prefix) || 0) + 1);
  }

  // Check completeness for each category
  const missing: PhotoCompletenessResult['missing'] = [];
  const categoryResults: PhotoCompletenessResult['categories'] = [];
  let totalRequired = 0;
  let totalCaptured = 0;

  for (const category of categories) {
    const required = category.minRequired || 0;
    const captured = photoCounts.get(category.prefix) || 0;
    const isComplete = captured >= required;

    totalRequired += required;
    totalCaptured += Math.min(captured, required);

    categoryResults.push({
      prefix: category.prefix,
      name: category.name,
      required,
      captured,
      isComplete,
    });

    if (!isComplete && required > 0) {
      missing.push({
        prefix: category.prefix,
        name: category.name,
        required,
        have: captured,
        shortfall: required - captured,
      });
    }
  }

  return {
    isComplete: missing.length === 0,
    totalRequired,
    totalCaptured,
    missing,
    categories: categoryResults,
  };
}

/**
 * Get required photos for a movement based on flow definition
 */
export async function getRequiredPhotosForMovement(
  movementId: string,
  perilType: string
): Promise<PhotoCategory[]> {
  // This would be enhanced to read from flow definition
  // For now, return categories based on peril
  return getCategoriesForPeril(perilType);
}

// ============================================
// PHOTO QUERIES
// ============================================

/**
 * Get photos by taxonomy prefix for a claim
 */
export async function getPhotosByTaxonomy(
  claimId: string,
  prefix: string
): Promise<ClaimPhoto[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_photos')
    .select('*')
    .eq('claim_id', claimId)
    .eq('taxonomy_prefix', prefix.toUpperCase())
    .order('captured_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch photos: ${error.message}`);
  }

  return data || [];
}

/**
 * Get uncategorized photos for a claim
 */
export async function getUncategorizedPhotos(claimId: string): Promise<ClaimPhoto[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_photos')
    .select('*')
    .eq('claim_id', claimId)
    .is('taxonomy_prefix', null)
    .order('captured_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch uncategorized photos: ${error.message}`);
  }

  return data || [];
}

/**
 * Get photo counts by taxonomy for a claim
 */
export async function getPhotoCountsByTaxonomy(
  claimId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin
    .from('claim_photos')
    .select('taxonomy_prefix')
    .eq('claim_id', claimId);

  if (error) {
    throw new Error(`Failed to fetch photo counts: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const photo of data || []) {
    const prefix = photo.taxonomy_prefix || 'UNCATEGORIZED';
    counts[prefix] = (counts[prefix] || 0) + 1;
  }

  return counts;
}
