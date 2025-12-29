/**
 * Unified Claim Context Service
 *
 * Builds a comprehensive UnifiedClaimContext by merging:
 * - FNOL extraction data (100% of claim intake)
 * - Policy extraction data (full policy provisions)
 * - Endorsement extraction data (all modifications)
 *
 * The resulting context powers:
 * - AI Claim Briefing generation
 * - Inspection Workflow generation
 * - Coverage analysis and alerts
 * - UI display of claim details
 *
 * Design Principles:
 * - Single source of truth for claim data
 * - No data loss during transformation
 * - Computed fields for common calculations
 * - Graceful degradation when data is missing
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  UnifiedClaimContext,
  FNOLExtractionRaw,
  PolicyExtractionRaw,
  EndorsementExtractionRaw,
  EndorsementImpact,
  RoofPaymentScheduleEntry,
  CoverageLimit,
  DeductibleStructure,
  PropertyDetails,
  LossSettlementRules,
  CoverageAlert,
  ClaimInsights,
  PerilAnalysis,
  SpecialLimitsOfLiability,
  Peril,
  PERIL_LABELS,
  RoofDepreciationResult,
  // New types for enhanced extraction
  LossDetails,
  PolicyValidation,
  CoverageScope,
  PerilsCovered,
  ThirdPartyInterest,
  DwellingSettlementRules,
} from '../../shared/schema';
import { inferPeril } from './perilInference';
import { PERIL_INSPECTION_RULES } from '../config/perilInspectionRules';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse currency string to number
 * Handles formats like "$469,600", "$4,696 (1%)", "1%", etc.
 */
function parseCurrency(value: string | undefined | null): number | undefined {
  if (!value) return undefined;

  // Remove $ and commas, extract number
  const cleaned = value.replace(/[$,]/g, '');
  const match = cleaned.match(/[\d.]+/);
  if (!match) return undefined;

  return parseFloat(match[0]);
}

/**
 * Parse deductible string to structured format
 * Handles: "$4,696 (1%)", "$2,348", "1%", etc.
 */
function parseDeductible(value: string | undefined | null): { amount: number; formatted: string; isPercentage: boolean } | undefined {
  if (!value) return undefined;

  const amount = parseCurrency(value);
  if (amount === undefined) return undefined;

  const isPercentage = value.includes('%');

  return {
    amount,
    formatted: value,
    isPercentage,
  };
}

/**
 * Parse year from various formats
 * Handles: "01-01-2006", "2006", "01/01/2006", etc.
 */
function parseYear(value: string | undefined | null): number | undefined {
  if (!value) return undefined;

  // Try to find a 4-digit year
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (match) {
    return parseInt(match[0], 10);
  }

  return undefined;
}

/**
 * Calculate roof age at date of loss
 */
function calculateRoofAge(roofYear: number | undefined, dateOfLoss: string | undefined): number | undefined {
  if (!roofYear) return undefined;

  const lossYear = dateOfLoss ? parseYear(dateOfLoss) : new Date().getFullYear();
  if (!lossYear) return undefined;

  return lossYear - roofYear;
}

/**
 * Parse address components
 */
function parseAddressComponents(address: string | undefined): { city?: string; state?: string; zip?: string } {
  if (!address) return {};

  // Try to match city, state ZIP pattern
  const match = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
  if (match) {
    return {
      city: match[1].trim(),
      state: match[2].toUpperCase(),
      zip: match[3],
    };
  }

  // Try simpler state ZIP pattern
  const simpleMatch = address.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);
  if (simpleMatch) {
    return {
      state: simpleMatch[1].toUpperCase(),
      zip: simpleMatch[2],
    };
  }

  return {};
}

/**
 * Normalize peril string to Peril enum
 */
function normalizePeril(cause: string | undefined): Peril {
  if (!cause) return Peril.OTHER;

  const lower = cause.toLowerCase();

  if (lower.includes('hail') || lower.includes('wind')) return Peril.WIND_HAIL;
  if (lower.includes('fire')) return Peril.FIRE;
  if (lower.includes('flood')) return Peril.FLOOD;
  if (lower.includes('water') || lower.includes('pipe') || lower.includes('plumbing')) return Peril.WATER;
  if (lower.includes('smoke')) return Peril.SMOKE;
  if (lower.includes('mold') || lower.includes('fungi')) return Peril.MOLD;
  if (lower.includes('impact') || lower.includes('tree') || lower.includes('vehicle')) return Peril.IMPACT;

  return Peril.OTHER;
}

/**
 * Infer endorsement category from form code and content
 */
function inferEndorsementCategory(
  formCode: string,
  content: any
): 'loss_settlement' | 'coverage_modification' | 'exclusion' | 'definition' | 'state_amendatory' | 'general' {
  const code = formCode.toUpperCase();

  // Loss settlement endorsements
  if (code.includes('88') || content?.complete_schedule || content?.roof_surface_payment_schedule_examples) {
    return 'loss_settlement';
  }

  // State amendatory
  if (code.includes('53') || code.includes('AMENDATORY') || content?.purpose?.toLowerCase().includes('state')) {
    return 'state_amendatory';
  }

  // Coverage modification (HO 04 XX series)
  if (code.includes('04') || code.includes('84') || code.includes('06')) {
    return 'coverage_modification';
  }

  // Exclusion endorsements
  if (content?.property_coverage_changes?.excluded_property_additions) {
    return 'exclusion';
  }

  // Definition modifications
  if (content?.definitions_modified && Object.keys(content.definitions_modified).length > 0) {
    return 'definition';
  }

  return 'general';
}

/**
 * Get precedence priority for endorsement category
 */
function getEndorsementPriority(category: string): number {
  switch (category) {
    case 'loss_settlement': return 5;
    case 'coverage_modification': return 20;
    case 'state_amendatory': return 40;
    case 'exclusion': return 50;
    case 'definition': return 60;
    default: return 75;
  }
}

/**
 * Extract roof payment schedule from endorsement
 */
function extractRoofSchedule(endorsementContent: any): RoofPaymentScheduleEntry[] | undefined {
  const schedule = endorsementContent?.complete_schedule;
  if (!Array.isArray(schedule) || schedule.length === 0) return undefined;

  return schedule.map((entry: any) => ({
    roofAgeYears: entry.roof_age_years ?? 0,
    architecturalShinglePct: entry.architectural_shingle_pct ?? 100,
    otherCompositionPct: entry.other_composition_pct ?? 100,
    metalPct: entry.metal_pct ?? 100,
    tilePct: entry.tile_pct ?? 100,
    slatePct: entry.slate_pct ?? 100,
    woodPct: entry.wood_pct ?? 100,
    rubberPct: entry.rubber_pct ?? 100,
  }));
}

/**
 * Calculate roof payment percentage based on age and material
 */
function calculateRoofPaymentPercentage(
  schedule: RoofPaymentScheduleEntry[] | undefined,
  roofAge: number | undefined,
  material: string = 'architectural'
): number | undefined {
  if (!schedule || schedule.length === 0 || roofAge === undefined) return undefined;

  // Sort by age ascending
  const sorted = [...schedule].sort((a, b) => a.roofAgeYears - b.roofAgeYears);

  // Find the appropriate entry (largest age <= roofAge)
  let entry: RoofPaymentScheduleEntry | undefined;
  for (const e of sorted) {
    if (e.roofAgeYears <= roofAge) {
      entry = e;
    } else {
      break;
    }
  }

  if (!entry) {
    // Roof is newer than any schedule entry, use 100%
    return 100;
  }

  // Get percentage based on material
  const materialLower = material.toLowerCase();
  if (materialLower.includes('architectural')) return entry.architecturalShinglePct;
  if (materialLower.includes('metal')) return entry.metalPct;
  if (materialLower.includes('tile') || materialLower.includes('clay') || materialLower.includes('concrete')) return entry.tilePct;
  if (materialLower.includes('slate')) return entry.slatePct;
  if (materialLower.includes('wood') || materialLower.includes('shake')) return entry.woodPct;
  if (materialLower.includes('rubber') || materialLower.includes('membrane') || materialLower.includes('tpo') || materialLower.includes('epdm')) return entry.rubberPct;
  if (materialLower.includes('composition') || materialLower.includes('3-tab') || materialLower.includes('asphalt')) return entry.otherCompositionPct;

  // Default to architectural shingle
  return entry.architecturalShinglePct;
}

/**
 * Analyze endorsement for inspection requirements
 *
 * Handles both flat content structure and nested extraction structure:
 * - Flat: content.complete_schedule
 * - Nested: content.roof_surface_payment_schedule.complete_schedule
 */
function analyzeEndorsementInspectionRequirements(formCode: string, content: any): string[] {
  const requirements: string[] = [];

  // Helper to check nested paths
  const hasRoofSchedule = content?.complete_schedule ||
    content?.roof_surface_payment_schedule?.complete_schedule ||
    content?.extractionData?.roof_surface_payment_schedule?.complete_schedule;

  const hasMetalFunctional = content?.hail_functional_requirement ||
    content?.roof_surface_payment_schedule?.hail_functional_requirement ||
    content?.roof_surface_payment_schedule_examples ||
    content?.extractionData?.roof_surface_payment_schedule?.hail_functional_requirement;

  const hasOandL = formCode.includes('84 16') || formCode.includes('8416') ||
    content?.coverage_a_increased_cost ||
    content?.ordinance_or_law_coverage?.coverage_a_increased_cost;

  const hasFungiLimit = content?.liability_modifications?.fungi_bacteria_limit ||
    content?.wisconsin_amendatory_endorsement?.liability_modifications?.fungi_bacteria_limit;

  const hasPersonalPropertyRCV = formCode.includes('04 90') || formCode.includes('0490') ||
    content?.settlement_basis === 'Replacement Cost Value' ||
    content?.personal_property_replacement_cost?.settlement_basis === 'Replacement Cost Value';

  // Roof schedule endorsement
  if (hasRoofSchedule) {
    requirements.push('Document roof material type for schedule lookup');
    requirements.push('Photograph manufacturer date stamps for age verification');
    requirements.push('Measure each roof plane separately');
    requirements.push('Identify and document any mixed materials');
  }

  // Metal functional requirement
  if (hasMetalFunctional) {
    requirements.push('For metal damage: Document if water intrusion is occurring');
    requirements.push('Photo any actual holes/openings vs cosmetic dents');
  }

  // O&L coverage
  if (hasOandL) {
    requirements.push('Note any visible code violations');
    requirements.push('Check for non-conforming materials that may require upgrade');
    requirements.push('Document if partial vs total loss (triggers O&L)');
  }

  // State amendatory - fungi limit
  if (hasFungiLimit) {
    requirements.push('Document any mold/fungi presence for liability cap awareness');
  }

  // Personal property RCV
  if (hasPersonalPropertyRCV) {
    requirements.push('Document intent to replace personal property items');
  }

  return requirements;
}

/**
 * Analyze endorsement for estimate considerations
 *
 * Handles both flat content structure and nested extraction structure
 */
function analyzeEndorsementEstimateConsiderations(formCode: string, content: any): string[] {
  const considerations: string[] = [];

  // Helper to check nested paths
  const hasRoofSchedule = content?.complete_schedule ||
    content?.roof_surface_payment_schedule?.complete_schedule ||
    content?.extractionData?.roof_surface_payment_schedule?.complete_schedule;

  const hasMetalFunctional = content?.hail_functional_requirement ||
    content?.roof_surface_payment_schedule?.hail_functional_requirement ||
    content?.extractionData?.roof_surface_payment_schedule?.hail_functional_requirement;

  const settlementMethod = content?.settlement_method ||
    content?.roof_surface_payment_schedule?.settlement_calculation ||
    content?.extractionData?.roof_surface_payment_schedule?.settlement_calculation;

  const hasTotalLossProvision = content?.settlement_and_conditions?.total_loss_provision ||
    content?.wisconsin_amendatory_endorsement?.settlement_and_conditions?.total_loss_provision;

  const fungiLimit = content?.liability_modifications?.fungi_bacteria_limit ||
    content?.wisconsin_amendatory_endorsement?.liability_modifications?.fungi_bacteria_limit;

  // Roof schedule
  if (hasRoofSchedule) {
    considerations.push('Apply scheduled depreciation based on roof age and material');
    considerations.push('Different materials may have different payment percentages');
  }

  // Metal functional requirement
  if (hasMetalFunctional) {
    considerations.push('Metal components only payable if functional damage (water intrusion) is documented');
  }

  // ACV roofing
  if (settlementMethod?.toLowerCase().includes('actual cash value')) {
    considerations.push('Roofing paid on ACV basis - calculate depreciation');
  }

  // State-specific rules
  if (hasTotalLossProvision) {
    considerations.push('Total loss provision may affect settlement calculation');
  }

  // Fungi limits
  if (fungiLimit) {
    considerations.push(`Fungi/bacteria coverage capped at ${fungiLimit}`);
  }

  return considerations;
}

// ============================================
// MAIN BUILD FUNCTIONS
// ============================================

/**
 * Build EndorsementImpact from raw endorsement extraction
 */
function buildEndorsementImpact(formCode: string, content: any): EndorsementImpact {
  const category = inferEndorsementCategory(formCode, content);
  const roofSchedule = extractRoofSchedule(content);

  // Build impact summary
  const impacts: string[] = [];

  if (content?.purpose) {
    impacts.push(content.purpose);
  }

  if (roofSchedule) {
    impacts.push('Applies scheduled depreciation to roofing based on age and material');
  }

  if (content?.definitions_modified) {
    const modifiedTerms = Object.keys(content.definitions_modified);
    if (modifiedTerms.length > 0) {
      impacts.push(`Modifies definitions: ${modifiedTerms.join(', ')}`);
    }
  }

  if (content?.property_coverage_changes?.excluded_property_additions) {
    impacts.push(`Adds exclusions: ${content.property_coverage_changes.excluded_property_additions.join(', ')}`);
  }

  if (content?.liability_modifications?.fungi_bacteria_limit) {
    impacts.push(`Caps fungi/bacteria liability at ${content.liability_modifications.fungi_bacteria_limit}`);
  }

  if (content?.settlement_and_conditions?.total_loss_provision) {
    impacts.push('Establishes total loss provision for state');
  }

  return {
    formCode,
    title: content?.purpose || content?.form_name || formCode,
    category,
    precedencePriority: getEndorsementPriority(category),
    impacts,
    inspectionRequirements: analyzeEndorsementInspectionRequirements(formCode, content),
    estimateConsiderations: analyzeEndorsementEstimateConsiderations(formCode, content),
    hasRoofSchedule: !!roofSchedule,
    roofSchedule,
  };
}

/**
 * Build coverage limits from FNOL data
 */
function buildCoverageLimits(
  fnol: FNOLExtractionRaw | null
): UnifiedClaimContext['coverages'] {
  const coverages = fnol?.policy_coverage?.coverages;

  const buildLimit = (
    coverageData: any,
    source: 'fnol' | 'policy' | 'endorsement' = 'fnol'
  ): CoverageLimit | undefined => {
    if (!coverageData?.limit) return undefined;

    const limit = parseCurrency(coverageData.limit);
    if (limit === undefined) return undefined;

    const result: CoverageLimit = {
      limit,
      limitFormatted: coverageData.limit,
      source,
    };

    if (coverageData.percentage) {
      const pct = parseCurrency(coverageData.percentage);
      if (pct) result.percentage = pct;
    }

    if (coverageData.valuation_method) {
      result.valuationMethod = coverageData.valuation_method.includes('Replacement') ? 'RCV' : 'ACV';
    }

    // Handle scheduled structures
    if (coverageData.item) {
      result.specialItems = [{
        item: coverageData.item,
        limit: limit,
        articleNumber: coverageData.article_number,
      }];
    }

    return result;
  };

  // Build other structures by combining scheduled and unscheduled
  let otherStructures: CoverageLimit | undefined;
  const scheduled = buildLimit(coverages?.coverage_b_scheduled_structures);
  const unscheduled = buildLimit(coverages?.coverage_b_unscheduled_structures);

  if (scheduled || unscheduled) {
    const totalLimit = (scheduled?.limit || 0) + (unscheduled?.limit || 0);
    otherStructures = {
      limit: totalLimit,
      limitFormatted: `$${totalLimit.toLocaleString()}`,
      source: 'fnol',
      specialItems: scheduled?.specialItems,
    };
  }

  // Build additional coverages
  const additionalCoverages: Record<string, CoverageLimit> = {};

  if (coverages) {
    const additionalKeys = [
      'dangerous_dog_exotic_animal_liability',
      'fire_department_service_charge',
      'fungi_or_bacteria',
      'increased_dwelling_limit',
      'jewelry_gemstones_watches_furs',
      'loss_assessments',
      'ordinance_or_law',
      'pollutant_cleanup_and_removal',
      'water_coverage_outside_source',
    ];

    for (const key of additionalKeys) {
      const data = coverages[key];
      if (data?.limit) {
        const limit = parseCurrency(data.limit);
        if (limit !== undefined) {
          additionalCoverages[key] = {
            limit,
            limitFormatted: data.limit,
            percentage: data.percentage ? parseCurrency(data.percentage) : undefined,
            source: 'fnol',
          };
        }
      }
    }
  }

  return {
    dwelling: buildLimit(coverages?.coverage_a_dwelling),
    otherStructures,
    personalProperty: buildLimit(coverages?.coverage_c_personal_property),
    lossOfUse: buildLimit(coverages?.coverage_d_loss_of_use),
    personalLiability: buildLimit(coverages?.coverage_e_personal_liability),
    medicalPayments: buildLimit(coverages?.coverage_f_medical_expense),
    additionalCoverages,
  };
}

/**
 * Build deductible structure from FNOL data
 */
function buildDeductibles(
  fnol: FNOLExtractionRaw | null,
  primaryPeril: Peril
): DeductibleStructure {
  const deductibles = fnol?.policy_information?.deductibles;

  const standard = parseDeductible(deductibles?.policy_deductible);
  const windHail = parseDeductible(deductibles?.wind_hail_deductible);
  const hurricane = parseDeductible(deductibles?.hurricane_deductible);
  const flood = parseDeductible(deductibles?.flood_deductible);
  const earthquake = parseDeductible(deductibles?.earthquake_deductible);

  // Determine applicable deductible based on peril
  let applicableForPeril = standard || { amount: 0, formatted: 'N/A', isPercentage: false };
  let perilType = 'standard';

  if (primaryPeril === Peril.WIND_HAIL && windHail) {
    applicableForPeril = windHail;
    perilType = 'wind_hail';
  } else if (primaryPeril === Peril.FLOOD && flood) {
    applicableForPeril = flood;
    perilType = 'flood';
  }

  return {
    standard,
    windHail,
    hurricane,
    flood,
    earthquake,
    applicableForPeril: {
      amount: applicableForPeril.amount,
      formatted: applicableForPeril.formatted,
      perilType,
    },
  };
}

/**
 * Build property details from FNOL data
 */
function buildPropertyDetails(
  fnol: FNOLExtractionRaw | null,
  dateOfLoss: string | undefined
): PropertyDetails {
  const propInfo = fnol?.property_damage_information;
  const policyInfo = fnol?.policy_information;
  const lossDetails = fnol?.claim_information_report?.loss_details;

  const address = policyInfo?.risk_address || lossDetails?.location || '';
  const addressComponents = parseAddressComponents(address);

  const yearBuilt = parseYear(propInfo?.year_built);
  const yearRoofInstalled = parseYear(propInfo?.year_roof_installed);
  const roofAge = calculateRoofAge(yearRoofInstalled, dateOfLoss);

  return {
    address,
    city: addressComponents.city,
    state: addressComponents.state,
    zip: addressComponents.zip,
    yearBuilt,
    stories: propInfo?.number_of_stories,
    roof: {
      yearInstalled: yearRoofInstalled,
      ageAtLoss: roofAge,
      isWoodRoof: propInfo?.wood_roof?.toLowerCase() === 'yes',
      damageScope: propInfo?.roof_damage,
    },
    exteriorDamaged: propInfo?.exterior_damages?.toLowerCase() === 'yes',
    interiorDamaged: propInfo?.interior_damages?.toLowerCase() === 'yes',
  };
}

/**
 * Build loss settlement rules from policy and endorsements
 */
function buildLossSettlementRules(
  policy: PolicyExtractionRaw | null,
  endorsements: EndorsementImpact[],
  roofAge: number | undefined
): LossSettlementRules {
  // Find roof schedule endorsement if any
  const roofScheduleEndorsement = endorsements.find(e => e.hasRoofSchedule);
  const hasSchedule = !!roofScheduleEndorsement;

  // Calculate payment percentage if schedule exists
  let calculatedPaymentPct: number | undefined;
  if (hasSchedule && roofScheduleEndorsement?.roofSchedule && roofAge !== undefined) {
    calculatedPaymentPct = calculateRoofPaymentPercentage(
      roofScheduleEndorsement.roofSchedule,
      roofAge,
      'architectural' // Default to architectural, will be refined with actual material
    );
  }

  // Check for metal functional requirement
  const policyRoofing = policy?.section_I_how_we_settle_losses?.roofing_system;
  const hasMetalFunctional = !!policyRoofing?.cosmetic_exclusion ||
    endorsements.some(e => e.inspectionRequirements.some(r => r.toLowerCase().includes('metal')));

  // Determine roofing basis
  let roofingBasis: 'RCV' | 'ACV' | 'SCHEDULED' = 'RCV';
  if (hasSchedule) {
    roofingBasis = 'SCHEDULED';
  } else if (policyRoofing?.settlement_method?.toLowerCase().includes('actual cash value')) {
    roofingBasis = 'ACV';
  }

  // Check for personal property RCV endorsement
  const hasPersonalPropertyRCV = endorsements.some(e =>
    e.formCode.includes('04 90') ||
    e.impacts.some(i => i.toLowerCase().includes('replacement cost') && i.toLowerCase().includes('personal property'))
  );

  return {
    dwelling: {
      basis: 'RCV',
      repairTimeLimitMonths: 12,
    },
    roofing: {
      basis: roofingBasis,
      isScheduled: hasSchedule,
      schedule: roofScheduleEndorsement?.roofSchedule,
      calculatedPaymentPct,
      metalFunctionalRequirement: hasMetalFunctional,
      metalFunctionalRuleText: policyRoofing?.cosmetic_exclusion,
      sourceEndorsement: roofScheduleEndorsement?.formCode,
    },
    personalProperty: {
      basis: hasPersonalPropertyRCV ? 'RCV' : 'ACV',
      sourceEndorsement: hasPersonalPropertyRCV ? 'HO 04 90' : undefined,
    },
  };
}

/**
 * Build peril analysis
 */
function buildPerilAnalysis(
  fnol: FNOLExtractionRaw | null,
  deductibles: DeductibleStructure,
  exclusions: string[]
): PerilAnalysis {
  const cause = fnol?.claim_information_report?.loss_details?.cause;
  const primary = normalizePeril(cause);
  const primaryDisplay = PERIL_LABELS[primary] || cause || 'Unknown';

  // Get peril-specific rules
  const rules = PERIL_INSPECTION_RULES[primary];

  // Determine applicable exclusions for this peril
  const applicableExclusions = exclusions.filter(ex => {
    const lower = ex.toLowerCase();
    if (primary === Peril.WATER && lower.includes('flood')) return true;
    if (primary === Peril.FLOOD && lower.includes('flood')) return true;
    if (primary === Peril.MOLD && (lower.includes('mold') || lower.includes('fungi'))) return true;
    return false;
  });

  return {
    primary,
    primaryDisplay,
    secondary: [],
    secondaryDisplay: [],
    applicableDeductible: deductibles.applicableForPeril,
    applicableExclusions,
    inspectionFocus: rules?.priorityAreas?.map(a => a.area) || [],
    commonMisses: rules?.commonMisses?.map(m => m.issue) || [],
  };
}

/**
 * Build loss details from FNOL (previously unused fields)
 */
function buildLossDetails(fnol: FNOLExtractionRaw | null): LossDetails {
  const lossInfo = fnol?.claim_information_report?.loss_details;
  const propDamage = fnol?.property_damage_information;

  return {
    description: lossInfo?.description,
    dwellingIncidentDamages: propDamage?.dwelling_incident_damages,
    cause: lossInfo?.cause,
    location: lossInfo?.location,
    weatherDataStatus: lossInfo?.weather_data_status,
    droneEligibleAtFnol: lossInfo?.drone_eligible_at_fnol?.toLowerCase() === 'yes' ||
                         lossInfo?.drone_eligible_at_fnol?.toLowerCase() === 'true',
  };
}

/**
 * Build policy validation from FNOL (check if policy was active at loss)
 */
function buildPolicyValidation(
  fnol: FNOLExtractionRaw | null,
  dateOfLoss: string | undefined
): PolicyValidation {
  const policyInfo = fnol?.policy_information;

  const inceptionDate = policyInfo?.inception_date;
  const expirationDate = policyInfo?.expiration_date;

  // Validate policy was active at date of loss
  let wasActiveAtLoss = true; // Default to true if we can't determine
  let validationMessage: string | undefined;

  if (dateOfLoss && (inceptionDate || expirationDate)) {
    const lossDate = new Date(dateOfLoss);

    if (inceptionDate) {
      const inception = new Date(inceptionDate);
      if (lossDate < inception) {
        wasActiveAtLoss = false;
        validationMessage = `Loss date (${dateOfLoss}) is before policy inception (${inceptionDate})`;
      }
    }

    if (expirationDate && wasActiveAtLoss) {
      const expiration = new Date(expirationDate);
      if (lossDate > expiration) {
        wasActiveAtLoss = false;
        validationMessage = `Loss date (${dateOfLoss}) is after policy expiration (${expirationDate})`;
      }
    }
  }

  return {
    policyType: policyInfo?.policy_type,
    status: policyInfo?.status,
    inceptionDate,
    expirationDate,
    wasActiveAtLoss,
    validationMessage,
  };
}

/**
 * Build coverage scope from policy extraction
 */
function buildCoverageScope(policy: PolicyExtractionRaw | null): CoverageScope | undefined {
  if (!policy?.section_I_property_coverages) return undefined;

  const sec1 = policy.section_I_property_coverages;

  return {
    dwelling: sec1.coverage_a_dwelling ? {
      included: sec1.coverage_a_dwelling.included,
      excluded: sec1.coverage_a_dwelling.excluded,
    } : undefined,
    otherStructures: sec1.coverage_b_other_structures ? {
      definition: sec1.coverage_b_other_structures.definition,
      excludedTypes: sec1.coverage_b_other_structures.excluded_types,
    } : undefined,
    personalProperty: sec1.coverage_c_personal_property ? {
      scope: sec1.coverage_c_personal_property.scope,
      limitAwayFromPremises: sec1.coverage_c_personal_property.limit_away_from_premises,
    } : undefined,
    lossOfUse: policy.section_I_property_coverages.coverage_d_loss_of_use ? {
      additionalLivingExpense: policy.section_I_property_coverages.coverage_d_loss_of_use.additional_living_expense,
      civilAuthorityProhibitsUse: policy.section_I_property_coverages.coverage_d_loss_of_use.civil_authority_prohibits_use,
    } : undefined,
  };
}

/**
 * Build perils covered from policy extraction
 */
function buildPerilsCovered(policy: PolicyExtractionRaw | null): PerilsCovered | undefined {
  if (!policy?.section_I_perils_insured_against) return undefined;

  const perils = policy.section_I_perils_insured_against;

  // Determine if open or named peril based on content
  const dwellingPerilsList = perils.dwelling_perils || [];
  const isOpenPeril = dwellingPerilsList.some(p =>
    p.toLowerCase().includes('all risks') ||
    p.toLowerCase().includes('open peril') ||
    p.toLowerCase().includes('direct physical loss')
  );

  return {
    dwellingPerils: perils.dwelling_perils,
    personalPropertyPerils: perils.personal_property_perils,
    isOpenPeril,
    isNamedPeril: !isOpenPeril && dwellingPerilsList.length > 0,
  };
}

/**
 * Build dwelling settlement rules from policy
 */
function buildDwellingSettlementRules(policy: PolicyExtractionRaw | null): DwellingSettlementRules | undefined {
  if (!policy?.section_I_how_we_settle_losses?.dwelling_and_other_structures) return undefined;

  const rules = policy.section_I_how_we_settle_losses.dwelling_and_other_structures;

  return {
    initialPayment: rules.initial_payment,
    replacementCost: rules.replacement_cost,
    hailDamageMetalSiding: rules.hail_damage_metal_siding,
  };
}

/**
 * Build third party interests from FNOL
 */
function buildThirdPartyInterests(fnol: FNOLExtractionRaw | null): ThirdPartyInterest[] | undefined {
  const thirdParty = fnol?.policy_information?.third_party_interest;
  if (!thirdParty) return undefined;

  // Parse third party interest - could be string or structured
  if (typeof thirdParty === 'string' && thirdParty.trim()) {
    return [{
      type: 'mortgagee',
      details: thirdParty,
    }];
  }

  return undefined;
}

/**
 * Build liability exclusions from policy
 */
function buildLiabilityExclusions(policy: PolicyExtractionRaw | null): string[] {
  return policy?.section_II_liability_coverages?.liability_exclusions || [];
}

/**
 * Build coverage alerts
 */
function buildCoverageAlerts(
  context: Partial<UnifiedClaimContext>,
  fnol: FNOLExtractionRaw | null,
  endorsements: EndorsementImpact[]
): CoverageAlert[] {
  const alerts: CoverageAlert[] = [];

  // Check for roof depreciation warning
  if (context.lossSettlement?.roofing?.isScheduled && context.property?.roof?.ageAtLoss) {
    const paymentPct = context.lossSettlement.roofing.calculatedPaymentPct;
    if (paymentPct && paymentPct < 70) {
      alerts.push({
        severity: 'warning',
        category: 'depreciation',
        title: 'Significant Roof Depreciation',
        description: `Roof is ${context.property.roof.ageAtLoss} years old. Payment will be approximately ${paymentPct}% of replacement cost.`,
        actionRequired: 'Verify roof age and material for accurate schedule lookup',
        relatedEndorsement: context.lossSettlement.roofing.sourceEndorsement,
      });
    }
  }

  // Check for missing flood deductible on potential flood claim
  if (context.peril?.primary === Peril.FLOOD && !context.deductibles?.flood) {
    alerts.push({
      severity: 'critical',
      category: 'deductible',
      title: 'Flood Deductible Not Specified',
      description: 'This appears to be a flood claim but no flood deductible is listed. Verify flood coverage exists.',
      actionRequired: 'Confirm flood policy and applicable deductible',
    });
  }

  // Check for special limits that may be exceeded
  const specialLimits = context.specialLimits;
  if (specialLimits?.jewelry && specialLimits.jewelry < 5000) {
    alerts.push({
      severity: 'info',
      category: 'limit',
      title: 'Jewelry Special Limit',
      description: `Personal property jewelry is limited to $${specialLimits.jewelry.toLocaleString()}`,
      actionRequired: 'Ask about high-value jewelry items that may exceed limit',
    });
  }

  // Check for metal functional requirement on wind/hail claims
  if (context.peril?.primary === Peril.WIND_HAIL && context.lossSettlement?.roofing?.metalFunctionalRequirement) {
    alerts.push({
      severity: 'warning',
      category: 'documentation',
      title: 'Metal Component Cosmetic Exclusion',
      description: 'Metal roofing and siding only covered if water intrusion is occurring or actual holes/openings exist.',
      actionRequired: 'Document functional damage to metal components, not just cosmetic dents',
      relatedEndorsement: context.lossSettlement.roofing.sourceEndorsement,
    });
  }

  // Check for fungi/bacteria limits
  const fungiLimit = context.coverages?.additionalCoverages['fungi_or_bacteria'];
  if (fungiLimit && (context.peril?.primary === Peril.WATER || context.peril?.primary === Peril.FLOOD)) {
    alerts.push({
      severity: 'info',
      category: 'limit',
      title: 'Fungi/Bacteria Coverage Limit',
      description: `Fungi/bacteria coverage limited to ${fungiLimit.limitFormatted}`,
      actionRequired: 'Document any mold/fungi presence for coverage awareness',
    });
  }

  // NEW ALERTS: Policy validation
  if (context.policyValidation && !context.policyValidation.wasActiveAtLoss) {
    alerts.push({
      severity: 'critical',
      category: 'policy_validation',
      title: 'Policy May Not Be Active at Loss Date',
      description: context.policyValidation.validationMessage || 'Policy dates do not cover the date of loss',
      actionRequired: 'Verify policy was in force on date of loss before proceeding',
    });
  }

  // NEW ALERTS: Metal siding hail damage rules
  if (context.dwellingSettlementRules?.hailDamageMetalSiding && context.peril?.primary === Peril.WIND_HAIL) {
    alerts.push({
      severity: 'warning',
      category: 'coverage',
      title: 'Metal Siding Hail Damage Rules Apply',
      description: context.dwellingSettlementRules.hailDamageMetalSiding,
      actionRequired: 'Document metal siding damage per policy requirements',
    });
  }

  // NEW ALERTS: Personal property away from premises
  if (context.coverageScope?.personalProperty?.limitAwayFromPremises) {
    alerts.push({
      severity: 'info',
      category: 'limit',
      title: 'Personal Property Away from Premises Limit',
      description: `Coverage for personal property away from premises: ${context.coverageScope.personalProperty.limitAwayFromPremises}`,
      actionRequired: 'Verify if any claimed items were away from the residence at time of loss',
    });
  }

  // NEW ALERTS: Named peril policy with peril verification
  if (context.perilsCovered?.isNamedPeril && context.peril?.primary) {
    const claimPeril = context.peril.primaryDisplay.toLowerCase();
    const coveredPerils = context.perilsCovered.dwellingPerils || [];
    const isPerilCovered = coveredPerils.some(p =>
      p.toLowerCase().includes(claimPeril) ||
      claimPeril.includes(p.toLowerCase())
    );

    if (!isPerilCovered && coveredPerils.length > 0) {
      alerts.push({
        severity: 'critical',
        category: 'coverage',
        title: 'Peril Coverage Verification Required',
        description: `This is a named peril policy. Verify "${context.peril.primaryDisplay}" is a covered peril.`,
        actionRequired: 'Review policy perils insured against section',
      });
    }
  }

  // NEW ALERTS: Third party interest notification
  if (context.thirdPartyInterests && context.thirdPartyInterests.length > 0) {
    alerts.push({
      severity: 'info',
      category: 'documentation',
      title: 'Third Party Interest on Policy',
      description: `Mortgagee/additional interest: ${context.thirdPartyInterests.map(t => t.details || t.name).join(', ')}`,
      actionRequired: 'Ensure loss payee is notified and included on settlement checks if required',
    });
  }

  // NEW ALERTS: Drone eligible for inspection
  if (context.lossDetails?.droneEligibleAtFnol) {
    alerts.push({
      severity: 'info',
      category: 'documentation',
      title: 'Drone Inspection Eligible',
      description: 'Property is flagged as eligible for drone inspection at FNOL',
      actionRequired: 'Consider drone inspection for roof assessment if applicable',
    });
  }

  return alerts;
}

/**
 * Build claim insights
 */
function buildClaimInsights(
  context: Partial<UnifiedClaimContext>,
  endorsements: EndorsementImpact[]
): ClaimInsights {
  const roofPaymentPct = context.lossSettlement?.roofing?.calculatedPaymentPct;

  // O&L coverage check
  const oandL = context.coverages?.additionalCoverages['ordinance_or_law'];
  const hasOandLCoverage = !!oandL;

  // Personal property RCV check
  const hasPersonalPropertyRCV = context.lossSettlement?.personalProperty?.basis === 'RCV';

  // Fungi coverage check
  const fungi = context.coverages?.additionalCoverages['fungi_or_bacteria'];
  const hasFungiCoverage = !!fungi;

  // Special limits to watch
  const specialLimitsToWatch: string[] = [];
  if (context.specialLimits?.jewelry) {
    specialLimitsToWatch.push(`Jewelry: $${context.specialLimits.jewelry.toLocaleString()}`);
  }
  if (context.specialLimits?.firearms) {
    specialLimitsToWatch.push(`Firearms: $${context.specialLimits.firearms.toLocaleString()}`);
  }

  // Coverage gaps
  const coverageGaps: string[] = [];
  if (!context.deductibles?.flood) {
    coverageGaps.push('Flood deductible not specified - verify flood coverage');
  }

  // State-specific rules from amendatory endorsements
  const stateSpecificRules: string[] = [];
  const stateEndorsements = endorsements.filter(e => e.category === 'state_amendatory');
  for (const e of stateEndorsements) {
    stateSpecificRules.push(...e.impacts);
  }

  // Endorsements with inspection impact
  const endorsementsWithInspectionImpact = endorsements
    .filter(e => e.inspectionRequirements.length > 0)
    .map(e => e.formCode);

  // Critical endorsement count (loss settlement)
  const criticalEndorsementCount = endorsements.filter(e => e.category === 'loss_settlement').length;

  return {
    roofDepreciationPct: roofPaymentPct ? 100 - roofPaymentPct : undefined,
    estimatedRoofPaymentPct: roofPaymentPct,
    hasOandLCoverage,
    oandLLimit: oandL?.limit,
    hasPersonalPropertyRCV,
    hasFungiCoverage,
    fungiLimit: fungi?.limit,
    specialLimitsToWatch,
    coverageGaps,
    stateSpecificRules,
    endorsementsWithInspectionImpact,
    totalEndorsementCount: endorsements.length,
    criticalEndorsementCount,
  };
}

// ============================================
// MAIN EXPORT FUNCTIONS
// ============================================

/**
 * Build UnifiedClaimContext for a claim
 *
 * This is the main entry point that:
 * 1. Loads FNOL, Policy, and Endorsement data
 * 2. Normalizes and merges all data
 * 3. Computes derived fields
 * 4. Returns a complete UnifiedClaimContext
 */
export async function buildUnifiedClaimContext(
  claimId: string,
  organizationId: string
): Promise<UnifiedClaimContext | null> {
  try {
    // Load claim record
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .eq('organization_id', organizationId)
      .single();

    if (claimError || !claim) {
      console.error(`[UnifiedClaimContext] Claim not found: ${claimId}`);
      return null;
    }

    // Load FNOL document
    const { data: fnolDocs } = await supabaseAdmin
      .from('documents')
      .select('id, extracted_data')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('type', 'fnol')
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    const fnolDoc = fnolDocs?.[0];
    const fnolData = (fnolDoc?.extracted_data || claim.loss_context) as FNOLExtractionRaw | null;

    // Load Policy document
    const { data: policyDocs } = await supabaseAdmin
      .from('documents')
      .select('id, extracted_data')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('type', 'policy')
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    const policyDoc = policyDocs?.[0];
    const policyData = policyDoc?.extracted_data as PolicyExtractionRaw | null;

    // Load Endorsement documents
    const { data: endorsementDocs } = await supabaseAdmin
      .from('documents')
      .select('id, extracted_data')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('type', 'endorsement')
      .eq('processing_status', 'completed');

    // Also load from endorsement_extractions table
    const { data: endorsementExtractions } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('extraction_status', 'completed');

    // Build endorsement impacts from all sources
    const endorsementImpacts: EndorsementImpact[] = [];

    // From endorsement documents
    if (endorsementDocs) {
      for (const doc of endorsementDocs) {
        const rawEndorsements = doc.extracted_data as EndorsementExtractionRaw | null;
        if (rawEndorsements) {
          // AI returns named objects, iterate through keys
          for (const [key, content] of Object.entries(rawEndorsements)) {
            if (key.startsWith('_')) continue; // Skip metadata keys
            const formCode = content?.form_number || key;
            endorsementImpacts.push(buildEndorsementImpact(formCode, content));
          }
        }
      }
    }

    // From endorsement_extractions table
    if (endorsementExtractions) {
      for (const extraction of endorsementExtractions) {
        // Check if already processed from document
        if (endorsementImpacts.some(e => e.formCode === extraction.form_code)) continue;

        const content = extraction.extraction_data || extraction.modifications || {};
        endorsementImpacts.push(buildEndorsementImpact(extraction.form_code, content));
      }
    }

    // Sort by precedence priority
    endorsementImpacts.sort((a, b) => a.precedencePriority - b.precedencePriority);

    // Categorize endorsements
    const endorsementsByCategory = {
      lossSettlement: endorsementImpacts.filter(e => e.category === 'loss_settlement'),
      coverageModification: endorsementImpacts.filter(e => e.category === 'coverage_modification'),
      stateAmendatory: endorsementImpacts.filter(e => e.category === 'state_amendatory'),
      other: endorsementImpacts.filter(e => !['loss_settlement', 'coverage_modification', 'state_amendatory'].includes(e.category)),
    };

    // Extract data from FNOL
    const dateOfLoss = fnolData?.claim_information_report?.date_of_loss;
    const claimNumber = fnolData?.claim_information_report?.claim_number || claim.claim_number || '';
    const policyNumber = fnolData?.claim_information_report?.policy_number || claim.policy_number;

    // Build property details
    const property = buildPropertyDetails(fnolData, dateOfLoss);

    // Build coverage limits
    const coverages = buildCoverageLimits(fnolData);

    // Build deductibles
    const primaryPeril = normalizePeril(fnolData?.claim_information_report?.loss_details?.cause);
    const deductibles = buildDeductibles(fnolData, primaryPeril);

    // Build loss settlement rules
    const lossSettlement = buildLossSettlementRules(policyData, endorsementImpacts, property.roof.ageAtLoss);

    // Build special limits from policy
    const specialLimits: SpecialLimitsOfLiability = {};
    const policySpecialLimits = policyData?.section_I_property_coverages?.coverage_c_personal_property?.special_limits_of_liability;
    if (policySpecialLimits) {
      for (const [key, value] of Object.entries(policySpecialLimits)) {
        const normalizedKey = key.replace(/_/g, '');
        if (key.includes('jewelry')) specialLimits.jewelry = value;
        else if (key.includes('firearm')) specialLimits.firearms = value;
        else if (key.includes('silver')) specialLimits.silverware = value;
        else if (key.includes('money')) specialLimits.moneyBankNotes = value;
        else if (key.includes('securit')) specialLimits.securities = value;
        else if (key.includes('watercraft')) specialLimits.watercraft = value;
        else if (key.includes('trailer')) specialLimits.trailers = value;
        else if (key.includes('business')) specialLimits.businessProperty = value;
        else if (key.includes('trading') || key.includes('comic')) specialLimits.tradingCards = value;
        else if (key.includes('rug') || key.includes('tapestry')) specialLimits.rugs = value;
        else if (key.includes('tool')) specialLimits.tools = value;
      }
    }

    // Build exclusions
    const generalExclusions = policyData?.section_I_exclusions?.general_exclusions || [];
    const liabilityExclusions = buildLiabilityExclusions(policyData);
    const endorsementAddedExclusions: string[] = [];
    const endorsementRemovedExclusions: string[] = [];

    for (const e of endorsementImpacts) {
      // Check for added exclusions in impacts
      for (const impact of e.impacts) {
        if (impact.toLowerCase().includes('adds exclusion')) {
          endorsementAddedExclusions.push(impact);
        }
      }
    }

    // Build peril analysis
    const perilAnalysis = buildPerilAnalysis(fnolData, deductibles, generalExclusions);

    // Build definitions from policy
    const definitions = policyData?.agreement_and_definitions?.key_definitions || {};

    // Build NEW context fields from FNOL and Policy extractions
    const lossDetails = buildLossDetails(fnolData);
    const policyValidation = buildPolicyValidation(fnolData, dateOfLoss);
    const coverageScope = buildCoverageScope(policyData);
    const perilsCovered = buildPerilsCovered(policyData);
    const dwellingSettlementRules = buildDwellingSettlementRules(policyData);
    const thirdPartyInterests = buildThirdPartyInterests(fnolData);

    // Build partial context for alerts (include new fields for alert generation)
    const partialContext: Partial<UnifiedClaimContext> = {
      property,
      coverages,
      deductibles,
      lossSettlement,
      specialLimits,
      peril: perilAnalysis,
      // New fields for enhanced alerts
      lossDetails,
      policyValidation,
      coverageScope,
      perilsCovered,
      dwellingSettlementRules,
      thirdPartyInterests,
    };

    // Build alerts
    const alerts = buildCoverageAlerts(partialContext, fnolData, endorsementImpacts);

    // Build insights
    const insights = buildClaimInsights(partialContext, endorsementImpacts);

    // Calculate completeness score
    const hasPolicy = !!policyDoc;
    const hasEndorsements = endorsementImpacts.length > 0;
    const hasFnol = !!fnolData;
    let completenessScore = 0;
    if (hasFnol) completenessScore += 50;
    if (hasPolicy) completenessScore += 30;
    if (hasEndorsements) completenessScore += 20;

    // Build final context
    const context: UnifiedClaimContext = {
      claimId,
      claimNumber: claimNumber.replace(/\s*\(CAT.*\)/, '').trim(),
      policyNumber,
      dateOfLoss,
      dateOfLossFormatted: dateOfLoss,
      reportedDate: fnolData?.report_metadata?.reported_date,
      reportedBy: fnolData?.report_metadata?.reported_by,

      insured: {
        name: fnolData?.insured_information?.name_1 || claim.insured_name || '',
        name2: fnolData?.insured_information?.name_2,
        policyholders: fnolData?.claim_information_report?.policyholders,
        email: fnolData?.insured_information?.email,
        phone: fnolData?.insured_information?.phone,
        mailingAddress: fnolData?.insured_information?.name_1_address,
        secondaryAddress: fnolData?.insured_information?.name_2_address,
      },

      property,

      // NEW: Loss details from FNOL (description, drone eligibility, etc.)
      lossDetails,

      // NEW: Policy validation (inception/expiration dates, active at loss)
      policyValidation,

      // NEW: Third party interests (mortgagees, additional insureds)
      thirdPartyInterests,

      producer: fnolData?.policy_information?.producer,

      peril: perilAnalysis,

      // NEW: Perils covered from policy (open vs named peril)
      perilsCovered,

      coverages,

      // NEW: Coverage scope from policy (included/excluded, limits away from premises)
      coverageScope,

      // NEW: Dwelling settlement rules from policy (initial payment, metal siding rules)
      dwellingSettlementRules,

      specialLimits,

      deductibles,

      lossSettlement,

      exclusions: {
        general: generalExclusions,
        liability: liabilityExclusions,
        endorsementAdded: endorsementAddedExclusions,
        endorsementRemoved: endorsementRemovedExclusions,
        applicableToPeril: perilAnalysis.applicableExclusions,
      },

      endorsements: {
        listedOnFnol: (fnolData?.policy_level_endorsements || []).map(e => ({
          code: e.code || '',
          description: e.description || '',
        })),
        extracted: endorsementImpacts,
        byCategory: endorsementsByCategory,
      },

      definitions,

      alerts,

      insights,

      meta: {
        builtAt: new Date().toISOString(),
        fnolDocumentId: fnolDoc?.id,
        policyDocumentId: policyDoc?.id,
        endorsementDocumentIds: endorsementDocs?.map(d => d.id) || [],
        dataCompleteness: {
          hasFnol,
          hasPolicy,
          hasEndorsements,
          completenessScore,
        },
      },
    };

    console.log(`[UnifiedClaimContext] Built context for claim ${claimId}: completeness=${completenessScore}%, endorsements=${endorsementImpacts.length}, alerts=${alerts.length}`);

    return context;
  } catch (error) {
    console.error(`[UnifiedClaimContext] Error building context for claim ${claimId}:`, error);
    return null;
  }
}

/**
 * Calculate roof depreciation for a claim
 */
export function calculateRoofDepreciation(
  context: UnifiedClaimContext,
  material: string = 'architectural'
): RoofDepreciationResult {
  const roofAge = context.property.roof.ageAtLoss ?? 0;
  const schedule = context.lossSettlement.roofing.schedule;
  const isScheduled = context.lossSettlement.roofing.isScheduled;

  const paymentPercentage = isScheduled && schedule
    ? calculateRoofPaymentPercentage(schedule, roofAge, material) ?? 100
    : 100;

  const notes: string[] = [];

  if (isScheduled) {
    notes.push(`Roof payment schedule applies (${context.lossSettlement.roofing.sourceEndorsement})`);
    if (roofAge >= 15) {
      notes.push('Roof age exceeds 15 years - significant depreciation applies');
    }
  } else if (context.lossSettlement.roofing.basis === 'ACV') {
    notes.push('Roofing settled on ACV basis - depreciation will be calculated');
  } else {
    notes.push('Roofing settled on RCV basis');
  }

  if (context.lossSettlement.roofing.metalFunctionalRequirement) {
    notes.push('Metal components require functional damage documentation');
  }

  return {
    roofAge,
    roofMaterial: material,
    scheduleFormCode: context.lossSettlement.roofing.sourceEndorsement,
    paymentPercentage,
    depreciationPercentage: 100 - paymentPercentage,
    isScheduledBasis: isScheduled,
    scheduleEntry: schedule?.find(e => e.roofAgeYears <= roofAge),
    notes,
  };
}

/**
 * Get endorsement inspection requirements for a claim
 */
export function getEndorsementInspectionRequirements(
  context: UnifiedClaimContext
): { formCode: string; requirements: string[] }[] {
  return context.endorsements.extracted
    .filter(e => e.inspectionRequirements.length > 0)
    .map(e => ({
      formCode: e.formCode,
      requirements: e.inspectionRequirements,
    }));
}

/**
 * Get estimate considerations from endorsements
 */
export function getEndorsementEstimateConsiderations(
  context: UnifiedClaimContext
): { formCode: string; considerations: string[] }[] {
  return context.endorsements.extracted
    .filter(e => e.estimateConsiderations.length > 0)
    .map(e => ({
      formCode: e.formCode,
      considerations: e.estimateConsiderations,
    }));
}
