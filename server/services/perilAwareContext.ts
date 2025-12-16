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

import { pool } from '../db';
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
  const client = await pool.connect();

  try {
    // Fetch claim data
    const claimResult = await client.query(
      `SELECT
        id, claim_number as "claimNumber",
        primary_peril as "primaryPeril",
        secondary_perils as "secondaryPerils",
        peril_confidence as "perilConfidence",
        peril_metadata as "perilMetadata",
        date_of_loss as "dateOfLoss",
        loss_description as "lossDescription",
        loss_type as "causeOfLoss",
        property_address as "propertyAddress",
        property_city as "propertyCity",
        property_state as "propertyState",
        property_zip as "propertyZip",
        policy_number as "policyNumber",
        dwelling_limit as "dwellingLimit",
        wind_hail_deductible as "windHailDeductible",
        coverage_a as "coverageA",
        coverage_b as "coverageB",
        coverage_c as "coverageC",
        coverage_d as "coverageD",
        deductible,
        year_roof_install as "yearRoofInstall",
        endorsements_listed as "endorsementsListed",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM claims
      WHERE id = $1`,
      [claimId]
    );

    if (claimResult.rows.length === 0) {
      return null;
    }

    const claim = claimResult.rows[0];

    // Fetch endorsements
    const endorsementResult = await client.query(
      `SELECT
        id, form_number as "formNumber",
        document_title as "documentTitle",
        description,
        key_changes as "keyChanges"
      FROM endorsements
      WHERE claim_id = $1`,
      [claimId]
    );

    // Fetch damage zones (from estimate_zones table)
    const damageZoneResult = await client.query(
      `SELECT
        ez.id,
        ez.name,
        ez.zone_type as "zoneType",
        ez.damage_type as "damageType",
        ez.damage_severity as "damageSeverity",
        ez.associated_peril as "associatedPeril",
        ez.peril_confidence as "perilConfidence",
        ez.affected_surfaces as "affectedSurfaces",
        ez.water_category as "waterCategory",
        ez.water_class as "waterClass"
      FROM estimate_zones ez
      INNER JOIN estimate_areas ea ON ez.area_id = ea.id
      INNER JOIN estimate_structures es ON ea.structure_id = es.id
      INNER JOIN estimates e ON es.estimate_id = e.id
      WHERE e.claim_id = $1`,
      [claimId]
    );

    // Also fetch claim_damage_zones as fallback
    const claimDamageZoneResult = await client.query(
      `SELECT
        cdz.id,
        cr.name,
        'room' as "zoneType",
        cdz.damage_type as "damageType",
        cdz.severity as "damageSeverity",
        cdz.associated_peril as "associatedPeril",
        cdz.peril_confidence as "perilConfidence",
        cdz.affected_walls as "affectedSurfaces",
        CASE
          WHEN cdz.category = 'category_1' THEN 1
          WHEN cdz.category = 'category_2' THEN 2
          WHEN cdz.category = 'category_3' THEN 3
          ELSE NULL
        END as "waterCategory",
        NULL as "waterClass"
      FROM claim_damage_zones cdz
      LEFT JOIN claim_rooms cr ON cdz.room_id = cr.id
      WHERE cdz.claim_id = $1`,
      [claimId]
    );

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

  } finally {
    client.release();
  }
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
