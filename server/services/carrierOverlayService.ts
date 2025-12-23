/**
 * Carrier Overlay Service
 *
 * Applies carrier-specific inspection overlays to peril rules.
 *
 * Rules:
 * - Overlays can EMPHASIZE (highlight importance)
 * - Overlays can DE-EMPHASIZE (reduce priority)
 * - Overlays CANNOT contradict core peril logic
 * - Overlays are OPTIONAL and transparent to adjusters
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { Peril, CarrierInspectionOverlays, CarrierPerilOverlay } from '../../shared/schema';
import {
  getInspectionRulesForPeril,
  getMergedInspectionGuidance,
  PerilInspectionRule,
  InspectionPriorityArea,
  PhotoRequirement,
} from '../config/perilInspectionRules';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface CarrierGuidance {
  carrierId: string;
  carrierName: string;
  perilOverlay: CarrierPerilOverlay | null;
  emphasis: string[];
  deEmphasis: string[];
  additionalRequirements: AdditionalRequirement[];
  notes: string | null;
}

export interface AdditionalRequirement {
  type: string;
  description: string;
  required: boolean;
}

export interface MergedInspectionWithCarrier {
  baseRules: PerilInspectionRule;
  carrierGuidance: CarrierGuidance | null;
  mergedPriorityAreas: InspectionPriorityArea[];
  mergedPhotoRequirements: PhotoRequirement[];
  carrierNotes: string[];
  additionalRequirements: AdditionalRequirement[];
}

// ============================================
// CARRIER DATA ACCESS
// ============================================

/**
 * Get carrier inspection overlays by carrier ID
 */
export async function getCarrierOverlays(carrierId: string): Promise<{
  carrier: { id: string; name: string; code: string } | null;
  overlays: CarrierInspectionOverlays | null;
}> {
  const { data: carrierData, error } = await supabaseAdmin
    .from('carrier_profiles')
    .select('id, name, code, carrier_inspection_overlays')
    .eq('id', carrierId)
    .eq('is_active', true)
    .single();

  if (error || !carrierData) {
    return { carrier: null, overlays: null };
  }

  return {
    carrier: {
      id: carrierData.id,
      name: carrierData.name,
      code: carrierData.code,
    },
    overlays: carrierData.carrier_inspection_overlays as CarrierInspectionOverlays || {},
  };
}

/**
 * Get carrier overlays for a claim (by looking up the carrier from the claim)
 */
export async function getCarrierOverlaysForClaim(claimId: string): Promise<{
  carrier: { id: string; name: string; code: string } | null;
  overlays: CarrierInspectionOverlays | null;
}> {
  // First get the carrier ID from the claim
  const { data: claimData, error } = await supabaseAdmin
    .from('claims')
    .select('carrier_id')
    .eq('id', claimId)
    .single();

  if (error || !claimData || !claimData.carrier_id) {
    return { carrier: null, overlays: null };
  }

  // Then get the carrier overlays
  return await getCarrierOverlays(claimData.carrier_id);
}

// ============================================
// OVERLAY APPLICATION LOGIC
// ============================================

/**
 * Get carrier guidance for a specific peril
 */
export function getCarrierGuidanceForPeril(
  carrier: { id: string; name: string; code: string } | null,
  overlays: CarrierInspectionOverlays | null,
  peril: Peril | string
): CarrierGuidance | null {
  if (!carrier || !overlays) {
    return null;
  }

  // Get the peril-specific overlay
  const perilKey = peril.toString().toLowerCase().replace('/', '_') as keyof CarrierInspectionOverlays;
  const perilOverlay = overlays[perilKey] || null;

  if (!perilOverlay) {
    return null;
  }

  // Build additional requirements from overlay settings
  const additionalRequirements: AdditionalRequirement[] = [];

  if (perilOverlay.require_test_squares) {
    additionalRequirements.push({
      type: 'test_squares',
      description: `Carrier requires test squares${perilOverlay.test_square_count ? ` (${perilOverlay.test_square_count} minimum)` : ''}`,
      required: true,
    });
  }

  if (perilOverlay.require_duration_confirmation) {
    additionalRequirements.push({
      type: 'duration_confirmation',
      description: 'Carrier requires documented confirmation of damage duration',
      required: true,
    });
  }

  if (perilOverlay.require_moisture_readings) {
    additionalRequirements.push({
      type: 'moisture_readings',
      description: 'Carrier requires moisture readings with meter display photos',
      required: true,
    });
  }

  if (perilOverlay.require_origin_documentation) {
    additionalRequirements.push({
      type: 'origin_documentation',
      description: 'Carrier requires detailed fire origin documentation',
      required: true,
    });
  }

  if (perilOverlay.require_high_water_mark) {
    additionalRequirements.push({
      type: 'high_water_mark',
      description: 'Carrier requires measured high water mark documentation',
      required: true,
    });
  }

  if (perilOverlay.require_mold_testing) {
    additionalRequirements.push({
      type: 'mold_testing',
      description: 'Carrier requires mold testing for affected claims',
      required: true,
    });
  }

  if (perilOverlay.photo_density === 'high') {
    additionalRequirements.push({
      type: 'photo_density',
      description: 'Carrier requires high-density photo documentation',
      required: false,
    });
  }

  return {
    carrierId: carrier.id,
    carrierName: carrier.name,
    perilOverlay,
    emphasis: perilOverlay.emphasis || [],
    deEmphasis: perilOverlay.de_emphasis || [],
    additionalRequirements,
    notes: perilOverlay.notes || null,
  };
}

/**
 * Merge carrier overlays with peril inspection rules
 *
 * Order of precedence:
 * 1. Core peril rules (base)
 * 2. Carrier overlays (modifiers)
 *
 * Overlays can:
 * - Add emphasis to priority areas
 * - Add additional photo requirements
 * - Add carrier-specific requirements
 *
 * Overlays CANNOT:
 * - Remove required safety considerations
 * - Remove critical priority areas
 * - Contradict core peril logic
 */
export function mergeInspectionWithCarrier(
  peril: Peril | string,
  carrier: { id: string; name: string; code: string } | null,
  overlays: CarrierInspectionOverlays | null
): MergedInspectionWithCarrier {
  const baseRules = getInspectionRulesForPeril(peril);

  if (!baseRules) {
    return {
      baseRules: {
        peril: peril as Peril,
        displayName: String(peril),
        priorityAreas: [],
        requiredPhotos: [],
        commonMisses: [],
        escalationTriggers: [],
        sketchRequirements: [],
        depreciationGuidance: [],
        inspectionTips: [],
        safetyConsiderations: [],
      },
      carrierGuidance: null,
      mergedPriorityAreas: [],
      mergedPhotoRequirements: [],
      carrierNotes: [],
      additionalRequirements: [],
    };
  }

  const carrierGuidance = getCarrierGuidanceForPeril(carrier, overlays, peril);

  // Start with base rules
  let mergedPriorityAreas = [...baseRules.priorityAreas];
  let mergedPhotoRequirements = [...baseRules.requiredPhotos];
  const carrierNotes: string[] = [];
  let additionalRequirements: AdditionalRequirement[] = [];

  if (carrierGuidance) {
    // Boost priority for emphasized areas
    if (carrierGuidance.emphasis.length > 0) {
      mergedPriorityAreas = mergedPriorityAreas.map((area) => {
        const isEmphasized = carrierGuidance.emphasis.some(
          (e) => area.area.toLowerCase().includes(e.toLowerCase()) ||
                 area.description.toLowerCase().includes(e.toLowerCase())
        );
        if (isEmphasized && area.criticalityLevel !== 'high') {
          return { ...area, criticalityLevel: 'high' as const };
        }
        return area;
      });
    }

    // Add carrier-specific photo requirements
    if (carrierGuidance.perilOverlay?.photo_density === 'high') {
      carrierNotes.push('High-density photo documentation required');
    }

    // Add additional requirements
    additionalRequirements = carrierGuidance.additionalRequirements;

    // Add carrier notes
    if (carrierGuidance.notes) {
      carrierNotes.push(carrierGuidance.notes);
    }

    // Note: We don't apply de-emphasis to remove areas, just to track them
    // Core safety and priority areas are preserved
  }

  return {
    baseRules,
    carrierGuidance,
    mergedPriorityAreas,
    mergedPhotoRequirements,
    carrierNotes,
    additionalRequirements,
  };
}

/**
 * Get complete merged inspection intelligence with carrier overlay for a claim
 */
export async function getMergedInspectionForClaim(
  claimId: string,
  peril: Peril | string
): Promise<MergedInspectionWithCarrier> {
  const { carrier, overlays } = await getCarrierOverlaysForClaim(claimId);
  return mergeInspectionWithCarrier(peril, carrier, overlays);
}

/**
 * Update carrier inspection overlays
 */
export async function updateCarrierOverlays(
  carrierId: string,
  overlays: CarrierInspectionOverlays
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('carrier_profiles')
    .update({
      carrier_inspection_overlays: overlays,
      updated_at: new Date().toISOString()
    })
    .eq('id', carrierId);

  return !error;
}
