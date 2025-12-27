import { supabaseAdmin } from '../lib/supabaseAdmin';

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
  dateOfLoss?: string;
  causeOfLoss?: string;
  lossType?: string;
  lossDescription?: string;
  policyNumber?: string;
  claimType?: string;
  state?: string;
  yearRoofInstall?: string;
  windHailDeductible?: string;
  dwellingLimit?: string;
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

  // Extracted policy data from policy_form_extractions
  extractedPolicy?: {
    policyNumber?: string;
    policyFormCode?: string;
    effectiveDate?: string;
    expirationDate?: string;
    dwellingLimit?: string;
    otherStructuresLimit?: string;
    personalPropertyLimit?: string;
    lossOfUseLimit?: string;
    personalLiabilityLimit?: string;
    medicalPaymentsLimit?: string;
    deductible?: string;
    windHailDeductible?: string;
    namedInsured?: string;
    mailingAddress?: string;
    propertyAddress?: string;
    constructionType?: string;
    yearBuilt?: string;
    protectionClass?: string;
    distanceToFireStation?: string;
    distanceToFireHydrant?: string;
  };

  // Extracted endorsements from endorsement_extractions
  extractedEndorsements?: Array<{
    id: string;
    formCode: string;
    title?: string;
    editionDate?: string;
    endorsementType?: string;
    summary?: string;
    modifications?: Record<string, any>;
    extractionStatus?: string;
  }>;
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
    dateOfLoss: row.date_of_loss,
    causeOfLoss: row.loss_type,
    lossType: row.loss_type,
    lossDescription: row.loss_description,
    policyNumber: row.policy_number,
    claimType: row.claim_type,
    state: row.property_state,
    yearRoofInstall: row.year_roof_install,
    windHailDeductible: row.wind_hail_deductible,
    dwellingLimit: row.dwelling_limit,
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
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
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
      year_roof_install: data.yearRoofInstall || null,
      wind_hail_deductible: data.windHailDeductible || null,
      dwelling_limit: data.dwellingLimit || null,
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

  // Map policy extraction to extractedPolicy format
  let extractedPolicy: ClaimWithDocuments['extractedPolicy'] = undefined;
  if (policyExtraction) {
    const declarations = policyExtraction.declarations as Record<string, any> | null;
    const coverageLimits = declarations?.coverageLimits || {};
    const propertyInfo = declarations?.propertyInfo || {};
    const insuredInfo = declarations?.insuredInfo || {};

    extractedPolicy = {
      policyNumber: policyExtraction.policy_number,
      policyFormCode: policyExtraction.policy_form_code,
      effectiveDate: declarations?.effectiveDate,
      expirationDate: declarations?.expirationDate,
      dwellingLimit: coverageLimits.dwellingCoverageA || coverageLimits.coverageA,
      otherStructuresLimit: coverageLimits.otherStructuresCoverageB || coverageLimits.coverageB,
      personalPropertyLimit: coverageLimits.personalPropertyCoverageC || coverageLimits.coverageC,
      lossOfUseLimit: coverageLimits.lossOfUseCoverageD || coverageLimits.coverageD,
      personalLiabilityLimit: coverageLimits.personalLiabilityCoverageE || coverageLimits.coverageE,
      medicalPaymentsLimit: coverageLimits.medicalPaymentsCoverageF || coverageLimits.coverageF,
      deductible: coverageLimits.deductible || declarations?.deductible,
      windHailDeductible: coverageLimits.windHailDeductible || declarations?.windHailDeductible,
      namedInsured: insuredInfo.namedInsured || declarations?.namedInsured,
      mailingAddress: insuredInfo.mailingAddress,
      propertyAddress: propertyInfo.address || declarations?.propertyAddress,
      constructionType: propertyInfo.constructionType,
      yearBuilt: propertyInfo.yearBuilt,
      protectionClass: propertyInfo.protectionClass,
      distanceToFireStation: propertyInfo.distanceToFireStation,
      distanceToFireHydrant: propertyInfo.distanceToFireHydrant,
    };
  }

  // Map endorsement extractions
  const extractedEndorsements = endorsementExtractions.map((e: any) => ({
    id: e.id,
    formCode: e.form_code,
    title: e.title,
    editionDate: e.edition_date,
    endorsementType: e.endorsement_type,
    summary: e.summary,
    modifications: e.modifications,
    extractionStatus: e.extraction_status,
  }));

  const baseClaim = mapRowToClaim({
    ...claim,
    document_count: documentCount,
    estimate_count: estimateCount
  });

  return {
    ...baseClaim,
    extractedPolicy,
    extractedEndorsements: extractedEndorsements.length > 0 ? extractedEndorsements : undefined,
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
    yearRoofInstall: string;
    windHailDeductible: string;
    dwellingLimit: string;
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
    yearRoofInstall: 'year_roof_install',
    windHailDeductible: 'wind_hail_deductible',
    dwellingLimit: 'dwelling_limit',
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
  // Get claims data
  const { data: claims, count } = await supabaseAdmin
    .from('claims')
    .select('status, loss_type, total_rcv, total_acv', { count: 'exact' })
    .eq('organization_id', organizationId)
    .neq('status', 'deleted');

  // Get document counts
  const { count: totalDocs } = await supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  const { count: pendingDocs } = await supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('processing_status', ['pending', 'processing']);

  const byStatus: Record<string, number> = {};
  const byLossType: Record<string, number> = {};
  let totalRcv = 0;
  let totalAcv = 0;

  if (claims) {
    claims.forEach(claim => {
      byStatus[claim.status] = (byStatus[claim.status] || 0) + 1;
      if (claim.loss_type) {
        byLossType[claim.loss_type] = (byLossType[claim.loss_type] || 0) + 1;
      }
      totalRcv += parseFloat(claim.total_rcv || '0');
      totalAcv += parseFloat(claim.total_acv || '0');
    });
  }

  return {
    total: count || 0,
    byStatus,
    byLossType,
    totalRcv,
    totalAcv,
    totalDocuments: totalDocs || 0,
    pendingDocuments: pendingDocs || 0
  };
}

export async function purgeAllClaims(organizationId: string): Promise<{
  claimsDeleted: number;
  relatedRecordsDeleted: number;
}> {
  const { data: claims } = await supabaseAdmin
    .from('claims')
    .select('id')
    .eq('organization_id', organizationId);

  if (!claims || claims.length === 0) {
    return { claimsDeleted: 0, relatedRecordsDeleted: 0 };
  }

  const claimIds = claims.map(c => c.id);
  let relatedRecordsDeleted = 0;

  // 1. Get all estimates for these claims (claim_id can be uuid or string)
  const { data: estimates } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .or(claimIds.map(id => `claim_id.eq.${id}`).join(','));
  
  const estimateIds = estimates?.map(e => e.id) || [];

  // 2. Get all structures for these estimates
  if (estimateIds.length > 0) {
    const { data: structures } = await supabaseAdmin
      .from('estimate_structures')
      .select('id')
      .in('estimate_id', estimateIds);
    
    const structureIds = structures?.map(s => s.id) || [];

    // 3. Get all areas for these structures
    if (structureIds.length > 0) {
      const { data: areas } = await supabaseAdmin
        .from('estimate_areas')
        .select('id')
        .in('structure_id', structureIds);
      
      const areaIds = areas?.map(a => a.id) || [];

      // 4. Get all zones for these areas
      if (areaIds.length > 0) {
        const { data: zones } = await supabaseAdmin
          .from('estimate_zones')
          .select('id')
          .in('area_id', areaIds);
        
        const zoneIds = zones?.map(z => z.id) || [];

        // 5. Delete estimate_line_items by zone_id
        if (zoneIds.length > 0) {
          await supabaseAdmin
            .from('estimate_line_items')
            .delete()
            .in('zone_id', zoneIds);
          relatedRecordsDeleted += zoneIds.length;
        }

        // 6. Delete estimate_zones by area_id
        await supabaseAdmin
          .from('estimate_zones')
          .delete()
          .in('area_id', areaIds);
        relatedRecordsDeleted += areaIds.length;
      }

      // 7. Delete estimate_areas by structure_id
      await supabaseAdmin
        .from('estimate_areas')
        .delete()
        .in('structure_id', structureIds);
      relatedRecordsDeleted += structureIds.length;
    }

    // 8. Delete estimate_structures by estimate_id
    await supabaseAdmin
      .from('estimate_structures')
      .delete()
      .in('estimate_id', estimateIds);
    relatedRecordsDeleted += estimateIds.length;
  }

  // 9. Delete from tables with claim_id foreign key
  const directClaimTables = [
    'inspection_workflows',
    'claim_briefings', 
    'claim_photos',
    'claim_checklists',
    'documents',
    'policy_form_extractions',
    'endorsement_extractions',
  ];

  for (const table of directClaimTables) {
    try {
      await supabaseAdmin
        .from(table)
        .delete()
        .in('claim_id', claimIds);
      relatedRecordsDeleted += claimIds.length;
    } catch (e) {
      // Table may not exist or have different FK, continue
      console.log(`[purge] Could not delete from ${table}:`, e);
    }
  }

  // 10. Delete estimates
  if (estimateIds.length > 0) {
    await supabaseAdmin
      .from('estimates')
      .delete()
      .in('id', estimateIds);
    relatedRecordsDeleted += estimateIds.length;
  }

  // 11. Finally delete claims
  await supabaseAdmin
    .from('claims')
    .delete()
    .eq('organization_id', organizationId);

  return { 
    claimsDeleted: claimIds.length, 
    relatedRecordsDeleted 
  };
}
