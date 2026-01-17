import { supabaseAdmin } from '../lib/supabaseAdmin';
import { PREVIEWS_BUCKET } from '../lib/supabase';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'claims' });

/**
 * Claim interface with all canonical fields
 *
 * Canonical data sources:
 * - primaryPeril, secondaryPerils: Normalized peril data
 * - lossContext: FNOL truth from claims.loss_context
 * - Endorsement data: Use endorsement_extractions table (NOT claims.endorsements_listed)
 * - Policy data: Use policy_form_extractions table
 * - Effective Policy: Use EffectivePolicy service for merged policy+endorsement rules
 */
export interface ClaimWithDocuments {
  id: string;
  organizationId: string;
  claimId: string;
  claimNumber?: string;
  carrierId?: string;
  regionId?: string;
  policyholder?: string;
  insuredName?: string;
  insuredEmail?: string;
  insuredPhone?: string;
  riskLocation?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  propertyLatitude?: string;
  propertyLongitude?: string;
  geocodeStatus?: string;
  dateOfLoss?: string;
  causeOfLoss?: string;
  lossType?: string;
  lossDescription?: string;
  policyNumber?: string;
  claimType?: string;
  state?: string;
  dwellingLimit?: string;
  perilSpecificDeductibles?: Record<string, string>; // { "wind_hail": "$7,932 1%", etc. }
  coverageA?: string;
  coverageB?: string;
  coverageC?: string;
  coverageD?: string;
  deductible?: string;
  status: string;
  assignedAdjusterId?: string;
  totalRcv?: string;
  totalAcv?: string;
  totalPaid?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  documentCount?: number;
  estimateCount?: number;

  // Canonical peril fields
  primaryPeril?: string;
  secondaryPerils?: string[];
  perilConfidence?: number;
  perilMetadata?: Record<string, any>;

  // Canonical FNOL truth
  lossContext?: LossContext;

  // Extracted policy data - comprehensive coverage info from FNOL + policy form
  extractedPolicy?: {
    // Basic policy info
    policyNumber?: string;
    policyFormCode?: string;
    policyFormName?: string;
    effectiveDate?: string;
    expirationDate?: string;
    policyType?: string;
    policyStatus?: string;
    operatingCompany?: string;

    // Primary coverages
    dwellingLimit?: string;
    otherStructuresLimit?: string;
    otherStructuresScheduledLimit?: string;
    otherStructuresUnscheduledLimit?: string;
    personalPropertyLimit?: string;
    lossOfUseLimit?: string;
    personalLiabilityLimit?: string;
    medicalPaymentsLimit?: string;

    // Deductibles
    deductible?: string;
    perilSpecificDeductibles?: Record<string, string>;

    // Additional coverages from FNOL
    additionalCoverages?: Record<string, { limit?: string; percentage?: string }>;

    // Insured information
    namedInsured?: string;
    insuredName2?: string;
    insuredEmail?: string;
    insuredPhone?: string;
    mailingAddress?: string;
    propertyAddress?: string;

    // Producer/Agent info
    producer?: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
    };

    // Third party interest (mortgagee)
    thirdPartyInterest?: string;
    legalDescription?: string;

    // Property info
    constructionType?: string;
    yearBuilt?: string;
    numberOfStories?: number;
    protectionClass?: string;
    distanceToFireStation?: string;
    distanceToFireHydrant?: string;

    // Damage info from FNOL
    damageDescription?: string;
    exteriorDamages?: string;
    interiorDamages?: string;
    roofDamage?: string;
    yearRoofInstalled?: string;
    woodRoof?: string;
    droneEligible?: string;

    // Report metadata
    reportedBy?: string;
    reportedDate?: string;
    reportMethod?: string;
  };

  // Extracted endorsements from endorsement_extractions - with full extraction data
  extractedEndorsements?: Array<{
    id: string;
    formCode: string;
    title?: string;
    editionDate?: string;
    endorsementType?: string;
    summary?: string;
    modifications?: Record<string, any>;
    extractionStatus?: string;
    // Full extraction data for detailed display
    extractionData?: Record<string, any>;
  }>;

  // Policy form extraction data (definitions, exclusions, loss settlement rules)
  extractedPolicyForm?: {
    formCode?: string;
    formName?: string;
    editionDate?: string;
    definitions?: Record<string, any>;
    sectionI?: Record<string, any>;
    sectionII?: Record<string, any>;
    generalConditions?: any[];
    extractionData?: Record<string, any>;
  };
}

/**
 * Loss context structure (canonical FNOL storage)
 */
export interface LossContext {
  fnol?: {
    reportDate?: string;
    reportedBy?: string;
    reportMethod?: string;
    lossDescription?: string;
    dateOfLoss?: string;
    timeOfLoss?: string;
    occupiedAtTimeOfLoss?: boolean;
    temporaryRepairsMade?: boolean;
    mitigationSteps?: string[];
  };
  property?: {
    yearBuilt?: string;
    constructionType?: string;
    roofType?: string;
    stories?: number;
    squareFootage?: number;
    occupancyType?: string;
    hasBasement?: boolean;
    basementFinished?: boolean;
  };
  damage_summary?: {
    areasAffected?: string[];
    waterSource?: string;
    waterCategory?: number;
    moldVisible?: boolean;
    structuralConcerns?: boolean;
    habitability?: string;
    contentsDamage?: boolean;
    additionalLivingExpenses?: boolean;
  };
}

function mapRowToClaim(row: any): ClaimWithDocuments {
  const riskLocation = row.property_address
    ? [row.property_address, row.property_city, row.property_state, row.property_zip].filter(Boolean).join(', ')
    : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    claimId: row.id,
    claimNumber: row.claim_number,
    carrierId: row.carrier_id,
    regionId: row.region_id,
    policyholder: row.insured_name,
    insuredName: row.insured_name,
    insuredEmail: row.insured_email,
    insuredPhone: row.insured_phone,
    riskLocation: riskLocation,
    propertyAddress: row.property_address,
    propertyCity: row.property_city,
    propertyState: row.property_state,
    propertyZip: row.property_zip,
    propertyLatitude: row.property_latitude,
    propertyLongitude: row.property_longitude,
    geocodeStatus: row.geocode_status,
    dateOfLoss: row.date_of_loss,
    causeOfLoss: row.loss_type,
    lossType: row.loss_type,
    lossDescription: row.loss_description,
    policyNumber: row.policy_number,
    claimType: row.claim_type,
    state: row.property_state,
    dwellingLimit: row.dwelling_limit,
    perilSpecificDeductibles: row.peril_specific_deductibles || {},
    // yearRoofInstall is now in lossContext.property.roof.year_installed
    // windHailDeductible is now in perilSpecificDeductibles.wind_hail
    coverageA: row.coverage_a,
    coverageB: row.coverage_b,
    coverageC: row.coverage_c,
    coverageD: row.coverage_d,
    deductible: row.deductible,
    status: row.status,
    assignedAdjusterId: row.assigned_adjuster_id,
    totalRcv: row.total_rcv,
    totalAcv: row.total_acv,
    totalPaid: row.total_paid,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    documentCount: row.document_count ? parseInt(row.document_count) : undefined,
    estimateCount: row.estimate_count ? parseInt(row.estimate_count) : undefined,

    // Canonical peril fields
    primaryPeril: row.primary_peril,
    secondaryPerils: Array.isArray(row.secondary_perils) ? row.secondary_perils : [],
    perilConfidence: row.peril_confidence ? parseFloat(row.peril_confidence) : undefined,
    perilMetadata: row.peril_metadata,

    // Canonical FNOL truth
    lossContext: row.loss_context,
  };
}

async function generateClaimNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', `${year}-01-01`);
  
  const seq = String((count || 0) + 1).padStart(6, '0');
  return `01-${String(year).slice(-3)}-${seq}`;
}

export async function createClaim(
  organizationId: string,
  data: {
    claimNumber?: string;
    policyNumber?: string;
    dateOfLoss?: string;
    claimType?: string;
    status?: string;
    insuredName?: string;
    lossType?: string;
    lossDescription?: string;
    propertyAddress?: string;
    propertyCity?: string;
    propertyState?: string;
    propertyZip?: string;
    dwellingLimit?: string;
    perilSpecificDeductibles?: Record<string, string>;
    coverageA?: number;
    coverageB?: number;
    coverageC?: number;
    coverageD?: number;
    deductible?: number;
    assignedAdjusterId?: string;
    metadata?: Record<string, any>;
  }
): Promise<ClaimWithDocuments> {
  const claimNumber = data.claimNumber || await generateClaimNumber(organizationId);

  const { data: claim, error } = await supabaseAdmin
    .from('claims')
    .insert({
      organization_id: organizationId,
      claim_number: claimNumber,
      policy_number: data.policyNumber || null,
      date_of_loss: data.dateOfLoss || null,
      claim_type: data.claimType || null,
      status: data.status || 'fnol',
      insured_name: data.insuredName || null,
      loss_type: data.lossType || null,
      loss_description: data.lossDescription || null,
      property_address: data.propertyAddress || null,
      property_city: data.propertyCity || null,
      property_state: data.propertyState || null,
      property_zip: data.propertyZip || null,
      dwelling_limit: data.dwellingLimit || null,
      peril_specific_deductibles: data.perilSpecificDeductibles || {},
      coverage_a: data.coverageA || null,
      coverage_b: data.coverageB || null,
      coverage_c: data.coverageC || null,
      coverage_d: data.coverageD || null,
      deductible: data.deductible || null,
      assigned_adjuster_id: data.assignedAdjusterId || null,
      metadata: data.metadata || {}
    })
    .select('*')
    .single();

  if (error || !claim) {
    throw new Error(`Failed to create claim: ${error?.message}`);
  }

  return mapRowToClaim(claim);
}

export async function getClaim(
  id: string,
  organizationId: string
): Promise<ClaimWithDocuments | null> {
  const { data: claim, error } = await supabaseAdmin
    .from('claims')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single();

  if (error || !claim) return null;

  // Fetch counts, policy extraction, and endorsements in parallel
  const [
    documentCountResult,
    estimateCountResult,
    policyExtractionResult,
    endorsementExtractionsResult
  ] = await Promise.all([
    supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('claim_id', id),
    supabaseAdmin
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .eq('claim_id', id),
    supabaseAdmin
      .from('policy_form_extractions')
      .select('*')
      .eq('claim_id', id)
      .eq('extraction_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('endorsement_extractions')
      .select('*')
      .eq('claim_id', id)
      .order('created_at', { ascending: false })
  ]);

  const documentCount = documentCountResult.count || 0;
  const estimateCount = estimateCountResult.count || 0;
  const policyExtraction = policyExtractionResult.data;
  const endorsementExtractions = endorsementExtractionsResult.data || [];

  // Get loss_context from the claim (contains FNOL extraction with all coverage info)
  const lossContext = claim.loss_context as Record<string, any> | null;
  const claimInfo = lossContext?.claim_information_report || {};
  const policyCoverage = lossContext?.policy_coverage?.coverages || {};
  const policyInfo = lossContext?.policy_information || {};
  const insuredInfo = lossContext?.insured_information || {};
  const propertyDamageInfo = lossContext?.property_damage_information || {};
  const reportMetadata = lossContext?.report_metadata || {};

  // Build additional coverages map (everything beyond A-F)
  const additionalCoverages: Record<string, { limit?: string; percentage?: string }> = {};
  if (policyCoverage) {
    const standardCoverages = [
      'coverage_a_dwelling', 'coverage_b_scheduled_structures', 'coverage_b_unscheduled_structures',
      'coverage_c_personal_property', 'coverage_d_loss_of_use',
      'coverage_e_personal_liability', 'coverage_f_medical_expense'
    ];
    for (const [key, value] of Object.entries(policyCoverage)) {
      if (!standardCoverages.includes(key) && value && typeof value === 'object') {
        const coverageData = value as { limit?: string; percentage?: string };
        if (coverageData.limit || coverageData.percentage) {
          additionalCoverages[key] = coverageData;
        }
      }
    }
  }

  // Map policy extraction to extractedPolicy format
  // Coverage limits come from FNOL's loss_context (declarations data)
  // Policy form details (form code, edition date) come from policy_form_extractions
  let extractedPolicy: ClaimWithDocuments['extractedPolicy'] = undefined;

  // Build extractedPolicy from FNOL loss_context + policy form extraction metadata
  if (lossContext || policyExtraction) {
    extractedPolicy = {
      // Basic policy info
      policyNumber: policyExtraction?.policy_number || claim.policy_number,
      policyFormCode: policyExtraction?.policy_form_code,
      policyFormName: policyExtraction?.policy_form_name,
      effectiveDate: policyInfo?.inception_date,
      expirationDate: policyInfo?.expiration_date,
      policyType: policyInfo?.policy_type,
      policyStatus: policyInfo?.status,
      operatingCompany: claimInfo?.operating_company,

      // Primary coverage limits from FNOL's loss_context.policy_coverage
      dwellingLimit: policyCoverage.coverage_a_dwelling?.limit,
      otherStructuresLimit: policyCoverage.coverage_b_scheduled_structures?.limit || policyCoverage.coverage_b_unscheduled_structures?.limit,
      otherStructuresScheduledLimit: policyCoverage.coverage_b_scheduled_structures?.limit,
      otherStructuresUnscheduledLimit: policyCoverage.coverage_b_unscheduled_structures?.limit,
      personalPropertyLimit: policyCoverage.coverage_c_personal_property?.limit,
      lossOfUseLimit: policyCoverage.coverage_d_loss_of_use?.limit,
      personalLiabilityLimit: policyCoverage.coverage_e_personal_liability?.limit,
      medicalPaymentsLimit: policyCoverage.coverage_f_medical_expense?.limit,

      // Deductibles from FNOL's loss_context.policy_information
      deductible: policyInfo?.deductibles?.policy_deductible,
      perilSpecificDeductibles: {
        wind_hail: policyInfo?.deductibles?.wind_hail_deductible,
        hurricane: policyInfo?.deductibles?.hurricane_deductible,
        flood: policyInfo?.deductibles?.flood_deductible,
        earthquake: policyInfo?.deductibles?.earthquake_deductible,
      },

      // Additional coverages (fungi, O&L, fire dept, etc.)
      additionalCoverages: Object.keys(additionalCoverages).length > 0 ? additionalCoverages : undefined,

      // Insured info from FNOL's loss_context.insured_information
      namedInsured: insuredInfo?.name_1,
      insuredName2: insuredInfo?.name_2,
      insuredEmail: insuredInfo?.email,
      insuredPhone: insuredInfo?.phone,
      mailingAddress: insuredInfo?.name_1_address,
      propertyAddress: lossContext?.policy_coverage?.location || policyInfo?.risk_address,

      // Producer/Agent info
      producer: policyInfo?.producer ? {
        name: policyInfo.producer.name,
        address: policyInfo.producer.address,
        phone: policyInfo.producer.phone,
        email: policyInfo.producer.email,
      } : undefined,

      // Third party interest and legal
      thirdPartyInterest: policyInfo?.third_party_interest,
      legalDescription: policyInfo?.legal_description,

      // Property info from FNOL
      yearBuilt: propertyDamageInfo?.year_built,
      numberOfStories: propertyDamageInfo?.number_of_stories,

      // Damage info from FNOL
      damageDescription: claimInfo?.loss_details?.description || propertyDamageInfo?.dwelling_incident_damages,
      exteriorDamages: propertyDamageInfo?.exterior_damages,
      interiorDamages: propertyDamageInfo?.interior_damages,
      roofDamage: propertyDamageInfo?.roof_damage,
      yearRoofInstalled: propertyDamageInfo?.year_roof_installed,
      woodRoof: propertyDamageInfo?.wood_roof,
      droneEligible: claimInfo?.loss_details?.drone_eligible_at_fnol,

      // Report metadata
      reportedBy: reportMetadata?.reported_by,
      reportedDate: reportMetadata?.reported_date,
      reportMethod: reportMetadata?.report_method,
    };
  }

  // Map endorsement extractions from endorsement_extractions table - include full extraction data
  const extractedEndorsements = endorsementExtractions.map((e: any) => ({
    id: e.id,
    formCode: e.form_code,
    title: e.title,
    editionDate: e.edition_date,
    endorsementType: e.endorsement_type,
    summary: e.summary,
    modifications: e.modifications || e.extraction_data?.modifications,
    extractionStatus: e.extraction_status,
    // Include full extraction data for detailed UI display
    extractionData: e.extraction_data,
  }));

  // Also include endorsements listed in FNOL if no detailed extractions exist
  const fnolEndorsements = lossContext?.policy_level_endorsements || [];
  const fnolEndorsementsMapped = fnolEndorsements.map((e: any, idx: number) => ({
    id: `fnol-${idx}`,
    formCode: e.code,
    title: e.description,
    editionDate: undefined,
    endorsementType: 'fnol_listed',
    summary: e.description,
    modifications: undefined,
    extractionStatus: 'fnol_source',
    extractionData: undefined,
  }));

  // Merge: use detailed extractions when available, fall back to FNOL list
  const mergedEndorsements = extractedEndorsements.length > 0
    ? extractedEndorsements
    : fnolEndorsementsMapped;

  // Build policy form extraction data (definitions, exclusions, loss settlement rules)
  let extractedPolicyForm: ClaimWithDocuments['extractedPolicyForm'] = undefined;
  if (policyExtraction) {
    extractedPolicyForm = {
      formCode: policyExtraction.policy_form_code,
      formName: policyExtraction.policy_form_name,
      editionDate: policyExtraction.edition_date,
      definitions: policyExtraction.definitions,
      sectionI: policyExtraction.section_i,
      sectionII: policyExtraction.section_ii,
      generalConditions: policyExtraction.general_conditions,
      extractionData: policyExtraction.extraction_data,
    };
  }

  const baseClaim = mapRowToClaim({
    ...claim,
    document_count: documentCount,
    estimate_count: estimateCount
  });

  return {
    ...baseClaim,
    extractedPolicy,
    extractedEndorsements: mergedEndorsements.length > 0 ? mergedEndorsements : undefined,
    extractedPolicyForm,
  };
}

export async function listClaims(
  organizationId: string,
  options?: {
    status?: string;
    lossType?: string;
    assignedAdjusterId?: string;
    search?: string;
    limit?: number;
    offset?: number;
    includeClosed?: boolean;
  }
): Promise<{ claims: ClaimWithDocuments[]; total: number }> {
  let query = supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .neq('status', 'deleted'); // Always exclude deleted claims

  if (!options?.includeClosed && !options?.status) {
    query = query.neq('status', 'closed');
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.lossType) {
    query = query.eq('loss_type', options.lossType);
  }
  if (options?.assignedAdjusterId) {
    query = query.eq('assigned_adjuster_id', options.assignedAdjusterId);
  }
  if (options?.search) {
    query = query.or(`claim_number.ilike.%${options.search}%,policy_number.ilike.%${options.search}%,insured_name.ilike.%${options.search}%,property_address.ilike.%${options.search}%`);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data: rows, count, error } = await query;

  if (error || !rows) {
    return { claims: [], total: 0 };
  }

  const claims = rows.map(mapRowToClaim);
  return { claims, total: count || 0 };
}

export async function updateClaim(
  id: string,
  organizationId: string,
  updates: Partial<{
    claimId: string;
    policyNumber: string;
    dateOfLoss: string;
    claimType: string;
    status: string;
    policyholder: string;
    riskLocation: string;
    causeOfLoss: string;
    lossDescription: string;
    state: string;
    dwellingLimit: string;
    perilSpecificDeductibles: Record<string, string>;
    assignedAdjusterId: string;
    totalRcv: string;
    totalAcv: string;
    totalPaid: string;
    metadata: Record<string, any>;
  }>
): Promise<ClaimWithDocuments | null> {
  const { data: existing } = await supabaseAdmin
    .from('claims')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single();

  if (!existing) return null;

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  const fieldMap: Record<string, string> = {
    claimNumber: 'claim_number',
    policyNumber: 'policy_number',
    dateOfLoss: 'date_of_loss',
    claimType: 'claim_type',
    status: 'status',
    policyholder: 'insured_name',
    insuredName: 'insured_name',
    causeOfLoss: 'loss_type',
    lossType: 'loss_type',
    lossDescription: 'loss_description',
    propertyAddress: 'property_address',
    propertyCity: 'property_city',
    propertyState: 'property_state',
    propertyZip: 'property_zip',
    dwellingLimit: 'dwelling_limit',
    perilSpecificDeductibles: 'peril_specific_deductibles',
    coverageA: 'coverage_a',
    coverageB: 'coverage_b',
    coverageC: 'coverage_c',
    coverageD: 'coverage_d',
    deductible: 'deductible',
    assignedAdjusterId: 'assigned_adjuster_id',
    totalRcv: 'total_rcv',
    totalAcv: 'total_acv',
    totalPaid: 'total_paid',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if ((updates as any)[key] !== undefined) {
      updateData[column] = (updates as any)[key];
    }
  }

  if (updates.metadata !== undefined) {
    updateData.metadata = updates.metadata;
  }

  if (updates.status === 'closed') {
    updateData.closed_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from('claims')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId);

  return getClaim(id, organizationId);
}

export async function deleteClaim(
  id: string,
  organizationId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('claims')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId);

  return !error;
}

export async function getClaimStats(organizationId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byLossType: Record<string, number>;
  totalRcv: number;
  totalAcv: number;
  totalDocuments: number;
  pendingDocuments: number;
}> {
  try {
    // Get claims data
    const { data: claims, count, error: claimsError } = await supabaseAdmin
      .from('claims')
      .select('status, loss_type, total_rcv, total_acv', { count: 'exact' })
      .eq('organization_id', organizationId)
      .neq('status', 'deleted');

    if (claimsError) {
      log.error({ error: claimsError }, '[getClaimStats] Error fetching claims');
      throw claimsError;
    }

    // Get document counts (with error handling)
    let totalDocs = 0;
    let pendingDocs = 0;

    try {
      const { count: totalDocsResult, error: totalDocsError } = await supabaseAdmin
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (!totalDocsError) {
        totalDocs = totalDocsResult || 0;
      } else {
        log.warn({ error: totalDocsError }, '[getClaimStats] Error fetching total documents');
      }
    } catch (e) {
      log.warn({ error: e }, '[getClaimStats] Exception fetching total documents');
    }

    try {
      const { count: pendingDocsResult, error: pendingDocsError } = await supabaseAdmin
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('processing_status', ['pending', 'processing']);

      if (!pendingDocsError) {
        pendingDocs = pendingDocsResult || 0;
      } else {
        log.warn({ error: pendingDocsError }, '[getClaimStats] Error fetching pending documents');
      }
    } catch (e) {
      log.warn({ error: e }, '[getClaimStats] Exception fetching pending documents');
    }

    const byStatus: Record<string, number> = {};
    const byLossType: Record<string, number> = {};
    let totalRcv = 0;
    let totalAcv = 0;

    if (claims && Array.isArray(claims)) {
      claims.forEach(claim => {
        const status = claim.status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
        if (claim.loss_type) {
          byLossType[claim.loss_type] = (byLossType[claim.loss_type] || 0) + 1;
        }
        totalRcv += parseFloat(String(claim.total_rcv || '0')) || 0;
        totalAcv += parseFloat(String(claim.total_acv || '0')) || 0;
      });
    }

    return {
      total: count || 0,
      byStatus,
      byLossType,
      totalRcv,
      totalAcv,
      totalDocuments: totalDocs,
      pendingDocuments: pendingDocs
    };
  } catch (error) {
    log.error({ error }, '[getClaimStats] Fatal error');
    // Return default stats instead of throwing to prevent page crashes
    return {
      total: 0,
      byStatus: {},
      byLossType: {},
      totalRcv: 0,
      totalAcv: 0,
      totalDocuments: 0,
      pendingDocuments: 0
    };
  }
}

export async function purgeAllClaims(organizationId: string): Promise<{
  claimsDeleted: number;
  relatedRecordsDeleted: number;
  storageFilesDeleted: number;
}> {
  const { data: claims } = await supabaseAdmin
    .from('claims')
    .select('id')
    .eq('organization_id', organizationId);

  if (!claims || claims.length === 0) {
    return { claimsDeleted: 0, relatedRecordsDeleted: 0, storageFilesDeleted: 0 };
  }

  const claimIds = claims.map(c => c.id);
  let relatedRecordsDeleted = 0;
  let storageFilesDeleted = 0;

  // ====== DELETE STORAGE FILES FIRST (before database records) ======

  // 1. Get all claim photos and delete from storage
  const { data: photos } = await supabaseAdmin
    .from('claim_photos')
    .select('storage_path')
    .in('claim_id', claimIds);

  if (photos && photos.length > 0) {
    const photoPaths = photos.map(p => p.storage_path).filter(Boolean);
    if (photoPaths.length > 0) {
      try {
        const { error: photoStorageError } = await supabaseAdmin.storage
          .from('claim-photos')
          .remove(photoPaths);
        if (photoStorageError) {
          log.error({ error: photoStorageError }, '[purge] Error deleting photos from storage');
        } else {
          storageFilesDeleted += photoPaths.length;
          log.info({ count: photoPaths.length }, '[purge] Deleted photos from storage');
        }
      } catch (e) {
        log.error({ error: e }, '[purge] Error deleting photos from storage');
      }
    }
  }

  // 2. Get all documents and delete from storage (both documents and previews)
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('id, storage_path, page_count, preview_status')
    .in('claim_id', claimIds);

  if (documents && documents.length > 0) {
    const docPaths = documents.map(d => d.storage_path).filter(Boolean);
    if (docPaths.length > 0) {
      try {
        const { error: docStorageError } = await supabaseAdmin.storage
          .from('documents')
          .remove(docPaths);
        if (docStorageError) {
          log.error({ error: docStorageError }, '[purge] Error deleting documents from storage');
        } else {
          storageFilesDeleted += docPaths.length;
          log.info({ count: docPaths.length }, '[purge] Deleted documents from storage');
        }
      } catch (e) {
        log.error({ error: e }, '[purge] Error deleting documents from storage');
      }
    }

    // 2b. Delete document preview files from document-previews bucket
    // Preview paths are stored as: ${organizationId}/${documentId}/page-${pageNum}.png
    const previewPaths: string[] = [];
    for (const doc of documents) {
      if (doc.preview_status === 'completed' && doc.page_count && doc.page_count > 0) {
        const previewBasePath = `${organizationId}/${doc.id}`;
        for (let pageNum = 1; pageNum <= doc.page_count; pageNum++) {
          previewPaths.push(`${previewBasePath}/page-${pageNum}.png`);
        }
      }
    }

    if (previewPaths.length > 0) {
      try {
        const { error: previewStorageError } = await supabaseAdmin.storage
          .from('document-previews')
          .remove(previewPaths);
        if (previewStorageError) {
          log.error({ error: previewStorageError }, '[purge] Error deleting document previews from storage');
        } else {
          storageFilesDeleted += previewPaths.length;
          log.info({ count: previewPaths.length }, '[purge] Deleted document preview files from storage');
        }
      } catch (e) {
        log.error({ error: e }, '[purge] Error deleting document previews from storage');
      }
    }
  }

  // ====== NOW DELETE DATABASE RECORDS ======

  // 3. Get all estimates for these claims
  const { data: estimates } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .or(claimIds.map(id => `claim_id.eq.${id}`).join(','));
  
  const estimateIds = estimates?.map(e => e.id) || [];

  // 4. Get all inspection workflows for these claims (old system - may not exist)
  let workflowIds: string[] = [];
  try {
    const { data: workflows } = await supabaseAdmin
      .from('inspection_workflows')
      .select('id')
      .in('claim_id', claimIds);
    workflowIds = workflows?.map(w => w.id) || [];
  } catch (e) {
    log.debug({ error: e }, '[purge] inspection_workflows table may not exist (migrated to flow engine)');
  }

  // 5. Delete workflow child tables first (old system)
  if (workflowIds.length > 0) {
    const workflowChildTables = [
      'workflow_step_evidence',
      'inspection_workflow_steps',
      'inspection_workflow_rooms',
      'inspection_workflow_assets',
      'workflow_mutations',
    ];

    for (const table of workflowChildTables) {
      try {
        await supabaseAdmin
          .from(table)
          .delete()
          .in('workflow_id', workflowIds);
        relatedRecordsDeleted += workflowIds.length;
      } catch (e) {
        log.debug({ error: e, table }, '[purge] Could not delete from table');
      }
    }
  }

  // 5b. Delete flow engine data (new system)
  // First get flow instances for these claims
  let flowInstanceIds: string[] = [];
  try {
    const { data: flowInstances } = await supabaseAdmin
      .from('claim_flow_instances')
      .select('id')
      .in('claim_id', claimIds);
    flowInstanceIds = flowInstances?.map(f => f.id) || [];
  } catch (e) {
    log.debug({ error: e }, '[purge] claim_flow_instances table may not exist');
  }

  // Delete flow-related records
  if (flowInstanceIds.length > 0) {
    const flowChildTables = [
      'movement_completions',
      'gate_evaluations',
      'audio_observations',
    ];

    for (const table of flowChildTables) {
      try {
        await supabaseAdmin
          .from(table)
          .delete()
          .in('flow_instance_id', flowInstanceIds);
        relatedRecordsDeleted += flowInstanceIds.length;
      } catch (e) {
        log.debug({ error: e, table }, '[purge] Could not delete from table');
      }
    }

    // Delete the flow instances themselves
    try {
      await supabaseAdmin
        .from('claim_flow_instances')
        .delete()
        .in('id', flowInstanceIds);
      relatedRecordsDeleted += flowInstanceIds.length;
    } catch (e) {
      log.debug({ error: e }, '[purge] Could not delete from claim_flow_instances');
    }
  }

  // 6. Get all structures for these estimates
  if (estimateIds.length > 0) {
    const { data: structures } = await supabaseAdmin
      .from('estimate_structures')
      .select('id')
      .in('estimate_id', estimateIds);
    
    const structureIds = structures?.map(s => s.id) || [];

    // 7. Get all areas for these structures
    if (structureIds.length > 0) {
      const { data: areas } = await supabaseAdmin
        .from('estimate_areas')
        .select('id')
        .in('structure_id', structureIds);
      
      const areaIds = areas?.map(a => a.id) || [];

      // 8. Get all zones for these areas
      if (areaIds.length > 0) {
        const { data: zones } = await supabaseAdmin
          .from('estimate_zones')
          .select('id')
          .in('area_id', areaIds);
        
        const zoneIds = zones?.map(z => z.id) || [];

        // 9. Delete zone child tables
        if (zoneIds.length > 0) {
          const zoneChildTables = [
            'estimate_line_items',
            'zone_openings',
            'zone_connections',
            'damage_zones',
          ];
          for (const table of zoneChildTables) {
            try {
              await supabaseAdmin
                .from(table)
                .delete()
                .in('zone_id', zoneIds);
              relatedRecordsDeleted += zoneIds.length;
            } catch (e) {
              log.debug({ error: e, table }, '[purge] Could not delete from table');
            }
          }
        }

        // 10. Delete estimate_zones by area_id
        await supabaseAdmin
          .from('estimate_zones')
          .delete()
          .in('area_id', areaIds);
        relatedRecordsDeleted += areaIds.length;
      }

      // 11. Delete estimate_areas by structure_id
      await supabaseAdmin
        .from('estimate_areas')
        .delete()
        .in('structure_id', structureIds);
      relatedRecordsDeleted += structureIds.length;
    }

    // 12. Delete estimate child tables
    const estimateChildTables = [
      'estimate_subrooms',
      'estimate_missing_walls',
      'estimate_totals',
      'estimate_coverages',
      'estimate_coverage_summary',
      'scope_items',
      'scope_summary',
    ];

    for (const table of estimateChildTables) {
      try {
        await supabaseAdmin
          .from(table)
          .delete()
          .in('estimate_id', estimateIds);
        relatedRecordsDeleted += estimateIds.length;
      } catch (e) {
        log.debug({ error: e, table }, '[purge] Could not delete from table');
      }
    }

    // 13. Delete estimate_structures by estimate_id
    await supabaseAdmin
      .from('estimate_structures')
      .delete()
      .in('estimate_id', estimateIds);
    relatedRecordsDeleted += estimateIds.length;
  }

  // 14. Delete from tables with claim_id foreign key
  const directClaimTables = [
    'claim_damage_zones',
    'claim_rooms',
    'claim_structures',
    'inspection_workflows',
    'claim_briefings', 
    'claim_photos',
    'claim_checklists',
    'claim_checklist_items',
    'documents',
    'policy_form_extractions',
    'endorsement_extractions',
    'inspection_appointments',
  ];

  for (const table of directClaimTables) {
    try {
      await supabaseAdmin
        .from(table)
        .delete()
        .in('claim_id', claimIds);
      relatedRecordsDeleted += claimIds.length;
    } catch (e) {
      log.debug({ error: e, table }, '[purge] Could not delete from table');
    }
  }

  // 15. Delete estimates
  if (estimateIds.length > 0) {
    await supabaseAdmin
      .from('estimates')
      .delete()
      .in('id', estimateIds);
    relatedRecordsDeleted += estimateIds.length;
  }

  // 16. Finally delete claims
  await supabaseAdmin
    .from('claims')
    .delete()
    .eq('organization_id', organizationId);

  return {
    claimsDeleted: claimIds.length,
    relatedRecordsDeleted,
    storageFilesDeleted
  };
}
