/**
 * Peril-Aware AI Context Builder
 *
 * This utility builds a normalized, peril-aware context for AI features.
 * It does NOT make any AI calls - it prepares the structured data that
 * future AI features (claim briefings, inspection strategies, etc.) will consume.
 *
 * The context ensures:
 * - Every claim has explicit peril information
 * - All perils are treated equally (no wind/hail bias)
 * - Peril-specific metadata is properly structured
 * - Policy and endorsement context is included
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  Peril,
  PerilMetadata,
  SECONDARY_PERIL_MAP,
} from '../../shared/schema';
import {
  getInspectionRulesForPeril,
  getMergedInspectionGuidance,
  getQuickInspectionTips,
  getEscalationTriggers,
  PerilInspectionRule,
  InspectionPriorityArea,
  PhotoRequirement,
  CommonMiss,
  EscalationTrigger,
  SketchRequirement,
  DepreciationGuidance,
} from '../config/perilInspectionRules';

// ============================================
// AI CONTEXT INTERFACES
// ============================================

export interface PerilAwareClaimContext {
  // Claim identification
  claimId: string;
  claimNumber: string;

  // Peril information (core of peril parity)
  primaryPeril: Peril | string;
  secondaryPerils: (Peril | string)[];
  perilConfidence: number;
  perilMetadata: PerilMetadata;

  // Loss details
  dateOfLoss: string | null;
  lossDescription: string | null;
  causeOfLoss: string | null; // Legacy field for backward compatibility

  // Property information
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;

  // Policy context
  policyContext: PolicyContext;

  // Endorsements (coverage modifications)
  endorsements: EndorsementContext[];

  // Damage zones with peril associations
  damageZones: DamageZoneContext[];

  // Coverage warnings/advisories
  coverageAdvisories: CoverageAdvisory[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface PolicyContext {
  policyNumber: string | null;
  state: string | null;
  dwellingLimit: string | null;
  windHailDeductible: string | null;
  coverageA: string | null;
  coverageB: string | null;
  coverageC: string | null;
  coverageD: string | null;
  deductible: string | null;
  yearRoofInstall: string | null;
  endorsementsListed: string[];
}

export interface EndorsementContext {
  id: string;
  formNumber: string;
  documentTitle: string | null;
  description: string | null;
  keyChanges: Record<string, unknown>;
  // Peril relevance scoring
  relevantToPerils: (Peril | string)[];
}

export interface DamageZoneContext {
  id: string;
  name: string;
  zoneType: string | null;
  damageType: string | null;
  damageSeverity: string | null;
  associatedPeril: Peril | string | null;
  perilConfidence: number | null;
  affectedSurfaces: string[];
  waterCategory: number | null;
  waterClass: number | null;
}

export interface CoverageAdvisory {
  type: 'warning' | 'info' | 'suggestion';
  peril: Peril | string;
  message: string;
  source: 'system' | 'peril_metadata' | 'endorsement';
}

// ============================================
// INSPECTION INTELLIGENCE INTERFACES
// ============================================

/**
 * Enhanced context that includes inspection intelligence
 */
export interface PerilAwareClaimContextWithInspection extends PerilAwareClaimContext {
  inspectionIntelligence: InspectionIntelligence;
}

/**
 * Inspection intelligence derived from peril rules
 */
export interface InspectionIntelligence {
  // Primary peril inspection rules
  primaryPerilRules: PerilInspectionRuleSummary;

  // Merged guidance from primary + secondary perils
  mergedGuidance: MergedInspectionGuidance;

  // Quick tips for UI display
  quickTips: string[];

  // Escalation triggers to watch for
  escalationTriggers: EscalationTrigger[];
}

export interface PerilInspectionRuleSummary {
  peril: Peril | string;
  displayName: string;
  priorityAreas: InspectionPriorityArea[];
  requiredPhotos: PhotoRequirement[];
  commonMisses: CommonMiss[];
  sketchRequirements: SketchRequirement[];
  depreciationGuidance: DepreciationGuidance[];
  safetyConsiderations: string[];
}

export interface MergedInspectionGuidance {
  priorityAreas: InspectionPriorityArea[];
  requiredPhotos: PhotoRequirement[];
  commonMisses: CommonMiss[];
  inspectionTips: string[];
  safetyConsiderations: string[];
}

// ============================================
// CONTEXT BUILDER
// ============================================

/**
 * Build a peril-aware claim context for AI consumption
 *
 * This is the contract that all future AI features will rely on.
 * It normalizes claim data into a consistent, peril-balanced structure.
 *
 * @param claimId - The UUID of the claim
 * @returns PerilAwareClaimContext - Normalized context for AI features
 */
export async function buildPerilAwareClaimContext(
  claimId: string
): Promise<PerilAwareClaimContext | null> {
  // Fetch claim data
  const { data: claimData, error: claimError } = await supabaseAdmin
    .from('claims')
    .select('*')
    .eq('id', claimId)
    .single();

  if (claimError || !claimData) {
    return null;
  }

  // Map snake_case to camelCase
  const claim = {
    id: claimData.id,
    claimNumber: claimData.claim_id,
    primaryPeril: claimData.primary_peril,
    secondaryPerils: claimData.secondary_perils,
    perilConfidence: claimData.peril_confidence,
    perilMetadata: claimData.peril_metadata,
    dateOfLoss: claimData.date_of_loss,
    lossDescription: claimData.loss_description,
    causeOfLoss: claimData.loss_type,
    propertyAddress: claimData.property_address,
    propertyCity: claimData.property_city,
    propertyState: claimData.property_state,
    propertyZip: claimData.property_zip,
    policyNumber: claimData.policy_number,
    dwellingLimit: claimData.dwelling_limit,
    windHailDeductible: claimData.wind_hail_deductible,
    coverageA: claimData.coverage_a,
    coverageB: claimData.coverage_b,
    coverageC: claimData.coverage_c,
    coverageD: claimData.coverage_d,
    deductible: claimData.deductible,
    yearRoofInstall: claimData.year_roof_install,
    endorsementsListed: claimData.endorsements_listed,
    createdAt: claimData.created_at,
    updatedAt: claimData.updated_at,
  };

  // Fetch endorsements from new comprehensive table
  const { data: endorsementsData, error: endorsementsError } = await supabaseAdmin
    .from('endorsement_extractions')
    .select('*')
    .eq('claim_id', claimId);

  const endorsementRows = endorsementsData || [];
  const endorsementResult = {
    rows: endorsementRows.map(e => ({
      id: e.id,
      formNumber: e.form_code || '',
      documentTitle: e.title || null,
      description: e.raw_text?.substring(0, 500) || null, // Use first 500 chars of raw text as description
      keyChanges: e.modifications || {},
    }))
  };

  // Fetch damage zones (from estimate_zones table)
  // We need to join across multiple tables, so we'll fetch in steps
  const { data: estimates } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .eq('claim_id', claimId);

  let damageZoneRows: any[] = [];

  if (estimates && estimates.length > 0) {
    const estimateIds = estimates.map(e => e.id);

    // Get estimate_structures for these estimates
    const { data: structures } = await supabaseAdmin
      .from('estimate_structures')
      .select('id')
      .in('estimate_id', estimateIds);

    if (structures && structures.length > 0) {
      const structureIds = structures.map(s => s.id);

      // Get estimate_areas for these structures
      const { data: areas } = await supabaseAdmin
        .from('estimate_areas')
        .select('id')
        .in('structure_id', structureIds);

      if (areas && areas.length > 0) {
        const areaIds = areas.map(a => a.id);

        // Get estimate_zones for these areas
        const { data: zones } = await supabaseAdmin
          .from('estimate_zones')
          .select('*')
          .in('area_id', areaIds);

        if (zones) {
          damageZoneRows = zones.map(ez => ({
            id: ez.id,
            name: ez.name,
            zoneType: ez.zone_type,
            damageType: ez.damage_type,
            damageSeverity: ez.damage_severity,
            associatedPeril: ez.associated_peril,
            perilConfidence: ez.peril_confidence,
            affectedSurfaces: ez.affected_surfaces,
            waterCategory: ez.water_category,
            waterClass: ez.water_class,
          }));
        }
      }
    }
  }

  const damageZoneResult = { rows: damageZoneRows };

  // Also fetch claim_damage_zones as fallback
  const { data: claimDamageZones } = await supabaseAdmin
    .from('claim_damage_zones')
    .select('*')
    .eq('claim_id', claimId);

  let claimDamageZoneRows: any[] = [];

  if (claimDamageZones && claimDamageZones.length > 0) {
    // Get all unique room IDs
    const roomIds = claimDamageZones
      .map(cdz => cdz.room_id)
      .filter((id): id is string => id !== null);

    // Fetch claim_rooms if we have room IDs
    let roomsMap: Record<string, any> = {};
    if (roomIds.length > 0) {
      const { data: rooms } = await supabaseAdmin
        .from('claim_rooms')
        .select('*')
        .in('id', roomIds);

      if (rooms) {
        roomsMap = rooms.reduce((acc, room) => {
          acc[room.id] = room;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Map to result format
    claimDamageZoneRows = claimDamageZones.map(cdz => {
      const room = roomsMap[cdz.room_id];

      // Map category to waterCategory number
      let waterCategory = null;
      if (cdz.category === 'category_1') waterCategory = 1;
      else if (cdz.category === 'category_2') waterCategory = 2;
      else if (cdz.category === 'category_3') waterCategory = 3;

      return {
        id: cdz.id,
        name: room?.name || null,
        zoneType: 'room',
        damageType: cdz.damage_type,
        damageSeverity: cdz.severity,
        associatedPeril: cdz.associated_peril,
        perilConfidence: cdz.peril_confidence,
        affectedSurfaces: cdz.affected_walls,
        waterCategory,
        waterClass: null,
      };
    });
  }

  const claimDamageZoneResult = { rows: claimDamageZoneRows };

  // Combine damage zones
  const allDamageZones = [
    ...damageZoneResult.rows,
    ...claimDamageZoneResult.rows
  ];

  // Normalize peril data
  const primaryPeril = claim.primaryPeril || inferPerilFromLegacy(claim.causeOfLoss);
  const secondaryPerils = claim.secondaryPerils || SECONDARY_PERIL_MAP[primaryPeril as Peril] || [];
  const perilMetadata = claim.perilMetadata || {};

  // Build endorsement contexts with peril relevance
  const endorsements = endorsementResult.rows.map(e =>
    buildEndorsementContext(e, primaryPeril)
  );

  // Build damage zone contexts
  const damageZones = allDamageZones.map(dz => ({
    id: dz.id,
    name: dz.name || 'Unknown Zone',
    zoneType: dz.zoneType,
    damageType: dz.damageType,
    damageSeverity: dz.damageSeverity,
    associatedPeril: dz.associatedPeril || primaryPeril,
    perilConfidence: dz.perilConfidence ? parseFloat(dz.perilConfidence) : null,
    affectedSurfaces: Array.isArray(dz.affectedSurfaces) ? dz.affectedSurfaces : [],
    waterCategory: dz.waterCategory,
    waterClass: dz.waterClass,
  }));

  // Build coverage advisories
  const coverageAdvisories = buildCoverageAdvisories(
    primaryPeril,
    perilMetadata,
    endorsements
  );

  // Build policy context
  const policyContext: PolicyContext = {
    policyNumber: claim.policyNumber,
    state: claim.propertyState,
    dwellingLimit: claim.dwellingLimit,
    windHailDeductible: claim.windHailDeductible,
    coverageA: claim.coverageA,
    coverageB: claim.coverageB,
    coverageC: claim.coverageC,
    coverageD: claim.coverageD,
    deductible: claim.deductible,
    yearRoofInstall: claim.yearRoofInstall,
    endorsementsListed: Array.isArray(claim.endorsementsListed)
      ? claim.endorsementsListed
      : [],
  };

  // Build full context
  const context: PerilAwareClaimContext = {
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    primaryPeril,
    secondaryPerils,
    perilConfidence: claim.perilConfidence ? parseFloat(claim.perilConfidence) : 0.5,
    perilMetadata,
    dateOfLoss: claim.dateOfLoss,
    lossDescription: claim.lossDescription,
    causeOfLoss: claim.causeOfLoss,
    propertyAddress: claim.propertyAddress,
    propertyCity: claim.propertyCity,
    propertyState: claim.propertyState,
    propertyZip: claim.propertyZip,
    policyContext,
    endorsements,
    damageZones,
    coverageAdvisories,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };

  return context;
}

/**
 * Infer peril from legacy causeOfLoss field
 */
function inferPerilFromLegacy(causeOfLoss: string | null): Peril {
  if (!causeOfLoss) return Peril.OTHER;

  const lower = causeOfLoss.toLowerCase();

  if (lower.includes('hail') || lower.includes('wind')) {
    return Peril.WIND_HAIL;
  } else if (lower.includes('fire')) {
    return Peril.FIRE;
  } else if (lower.includes('flood')) {
    return Peril.FLOOD;
  } else if (lower.includes('water')) {
    return Peril.WATER;
  } else if (lower.includes('smoke')) {
    return Peril.SMOKE;
  } else if (lower.includes('mold')) {
    return Peril.MOLD;
  } else if (lower.includes('impact') || lower.includes('tree') || lower.includes('vehicle')) {
    return Peril.IMPACT;
  }

  return Peril.OTHER;
}

/**
 * Build endorsement context with peril relevance scoring
 */
function buildEndorsementContext(
  endorsement: {
    id: string;
    formNumber: string;
    documentTitle: string | null;
    description: string | null;
    keyChanges: Record<string, unknown>;
  },
  primaryPeril: Peril | string
): EndorsementContext {
  const keyChanges = endorsement.keyChanges || {};
  const relevantToPerils: (Peril | string)[] = [];

  // Check key changes for peril relevance
  const keyChangesStr = JSON.stringify(keyChanges).toLowerCase();

  if (keyChangesStr.includes('wind') || keyChangesStr.includes('hail') || keyChangesStr.includes('roof')) {
    relevantToPerils.push(Peril.WIND_HAIL);
  }
  if (keyChangesStr.includes('fire') || keyChangesStr.includes('smoke')) {
    relevantToPerils.push(Peril.FIRE);
  }
  if (keyChangesStr.includes('water') || keyChangesStr.includes('plumbing')) {
    relevantToPerils.push(Peril.WATER);
  }
  if (keyChangesStr.includes('flood')) {
    relevantToPerils.push(Peril.FLOOD);
  }
  if (keyChangesStr.includes('mold') || keyChangesStr.includes('fungi')) {
    relevantToPerils.push(Peril.MOLD);
  }

  // Always include if matches primary peril
  if (!relevantToPerils.includes(primaryPeril)) {
    // Check form number patterns (many endorsements have peril indicators)
    const formNumber = endorsement.formNumber.toUpperCase();
    if (formNumber.includes('84') || formNumber.includes('WATER')) {
      relevantToPerils.push(Peril.WATER);
    }
  }

  return {
    id: endorsement.id,
    formNumber: endorsement.formNumber,
    documentTitle: endorsement.documentTitle,
    description: endorsement.description,
    keyChanges,
    relevantToPerils,
  };
}

/**
 * Build coverage advisories based on peril and metadata
 */
function buildCoverageAdvisories(
  primaryPeril: Peril | string,
  perilMetadata: PerilMetadata,
  endorsements: EndorsementContext[]
): CoverageAdvisory[] {
  const advisories: CoverageAdvisory[] = [];

  // Flood coverage warning
  if (primaryPeril === Peril.FLOOD) {
    advisories.push({
      type: 'warning',
      peril: Peril.FLOOD,
      message: 'Flood damage typically excluded under HO policies unless separate flood coverage exists.',
      source: 'system',
    });

    // Add metadata coverage warning if present
    if (perilMetadata.flood?.coverage_warning) {
      advisories.push({
        type: 'warning',
        peril: Peril.FLOOD,
        message: perilMetadata.flood.coverage_warning,
        source: 'peril_metadata',
      });
    }
  }

  // Mold advisory
  if (primaryPeril === Peril.MOLD || perilMetadata.water?.mold_risk) {
    advisories.push({
      type: 'info',
      peril: Peril.MOLD,
      message: 'Mold coverage may be limited or excluded. Check policy and endorsements.',
      source: 'system',
    });
  }

  // Water damage duration considerations
  if (primaryPeril === Peril.WATER && perilMetadata.water?.duration === 'gradual') {
    advisories.push({
      type: 'warning',
      peril: Peril.WATER,
      message: 'Gradual water damage may be subject to coverage limitations.',
      source: 'peril_metadata',
    });
  }

  // Fire habitability considerations
  if (primaryPeril === Peril.FIRE && perilMetadata.fire?.habitability === 'uninhabitable') {
    advisories.push({
      type: 'info',
      peril: Peril.FIRE,
      message: 'Property uninhabitable - consider Coverage D (Loss of Use) in estimate.',
      source: 'peril_metadata',
    });
  }

  // Check endorsements for coverage modifications
  for (const endorsement of endorsements) {
    const keyChanges = endorsement.keyChanges || {};
    const keyChangesStr = JSON.stringify(keyChanges).toLowerCase();

    // Water damage endorsement advisories
    if (keyChangesStr.includes('hidden water') && primaryPeril === Peril.WATER) {
      advisories.push({
        type: 'info',
        peril: Peril.WATER,
        message: `Hidden water coverage via ${endorsement.formNumber} may apply.`,
        source: 'endorsement',
      });
    }

    // Wind/hail limitation advisories
    if (keyChangesStr.includes('loss settlement') && keyChangesStr.includes('wind')) {
      advisories.push({
        type: 'info',
        peril: Peril.WIND_HAIL,
        message: `Wind/hail loss settlement modified by ${endorsement.formNumber}.`,
        source: 'endorsement',
      });
    }
  }

  return advisories;
}

/**
 * Get a summary of the peril context for logging/debugging
 */
export function summarizePerilContext(context: PerilAwareClaimContext): string {
  const parts = [
    `Claim: ${context.claimNumber}`,
    `Primary Peril: ${context.primaryPeril}`,
    `Secondary Perils: ${context.secondaryPerils.join(', ') || 'none'}`,
    `Confidence: ${(context.perilConfidence * 100).toFixed(0)}%`,
    `Damage Zones: ${context.damageZones.length}`,
    `Endorsements: ${context.endorsements.length}`,
    `Advisories: ${context.coverageAdvisories.length}`,
  ];

  return parts.join(' | ');
}

// ============================================
// INSPECTION INTELLIGENCE BUILDER
// ============================================

/**
 * Build a complete peril-aware claim context WITH inspection intelligence
 *
 * This combines the base claim context with deterministic inspection rules
 * to provide field-ready guidance for adjusters.
 *
 * @param claimId - The UUID of the claim
 * @returns Enhanced context including inspection intelligence
 */
export async function buildPerilAwareClaimContextWithInspection(
  claimId: string
): Promise<PerilAwareClaimContextWithInspection | null> {
  // Get the base context
  const baseContext = await buildPerilAwareClaimContext(claimId);
  if (!baseContext) {
    return null;
  }

  // Build inspection intelligence from rules
  const inspectionIntelligence = buildInspectionIntelligence(
    baseContext.primaryPeril,
    baseContext.secondaryPerils
  );

  return {
    ...baseContext,
    inspectionIntelligence,
  };
}

/**
 * Build inspection intelligence for a peril combination
 */
export function buildInspectionIntelligence(
  primaryPeril: Peril | string,
  secondaryPerils: (Peril | string)[] = []
): InspectionIntelligence {
  // Get primary peril rules
  const primaryRules = getInspectionRulesForPeril(primaryPeril);

  // Build primary peril rule summary
  const primaryPerilRules: PerilInspectionRuleSummary = primaryRules
    ? {
        peril: primaryRules.peril,
        displayName: primaryRules.displayName,
        priorityAreas: primaryRules.priorityAreas,
        requiredPhotos: primaryRules.requiredPhotos,
        commonMisses: primaryRules.commonMisses,
        sketchRequirements: primaryRules.sketchRequirements,
        depreciationGuidance: primaryRules.depreciationGuidance,
        safetyConsiderations: primaryRules.safetyConsiderations,
      }
    : {
        peril: primaryPeril,
        displayName: String(primaryPeril),
        priorityAreas: [],
        requiredPhotos: [],
        commonMisses: [],
        sketchRequirements: [],
        depreciationGuidance: [],
        safetyConsiderations: [],
      };

  // Get merged guidance from primary + secondary perils
  const mergedGuidance = getMergedInspectionGuidance(primaryPeril, secondaryPerils);

  // Get quick tips for UI
  const quickTips = getQuickInspectionTips(primaryPeril, 5);

  // Get escalation triggers
  const escalationTriggers = getEscalationTriggers(primaryPeril);

  return {
    primaryPerilRules,
    mergedGuidance,
    quickTips,
    escalationTriggers,
  };
}

/**
 * Get inspection intelligence without a claim context
 * Useful for standalone inspection guidance
 */
export function getInspectionIntelligenceForPeril(
  peril: Peril | string
): InspectionIntelligence {
  const secondaryPerils = SECONDARY_PERIL_MAP[peril as Peril] || [];
  return buildInspectionIntelligence(peril, secondaryPerils);
}

export default buildPerilAwareClaimContext;
