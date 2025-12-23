import { supabaseAdmin } from '../lib/supabaseAdmin';

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
  endorsementsListed?: string[];
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
}

function mapRowToClaim(row: any): ClaimWithDocuments {
  const riskLocation = row.property_address 
    ? [row.property_address, row.property_city, row.property_state, row.property_zip].filter(Boolean).join(', ')
    : undefined;
    
  return {
    id: row.id,
    organizationId: row.organization_id,
    claimId: row.claim_number,
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
    endorsementsListed: row.endorsements_listed,
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
    estimateCount: row.estimate_count ? parseInt(row.estimate_count) : undefined
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
    endorsementsListed?: string[];
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
      endorsements_listed: data.endorsementsListed || [],
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

  const { count: documentCount } = await supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('claim_id', id);

  const { count: estimateCount } = await supabaseAdmin
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('claim_id', id);

  return mapRowToClaim({
    ...claim,
    document_count: documentCount || 0,
    estimate_count: estimateCount || 0
  });
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
    .eq('organization_id', organizationId);

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
    endorsementsListed: string[];
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
    claimId: 'claim_number',
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

  if (updates.endorsementsListed !== undefined) {
    updateData.endorsements_listed = updates.endorsementsListed;
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
}> {
  const { data: claims, count } = await supabaseAdmin
    .from('claims')
    .select('status, loss_type, total_rcv, total_acv', { count: 'exact' })
    .eq('organization_id', organizationId)
    .neq('status', 'deleted');

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
    totalAcv
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

  const tables = [
    'inspection_workflows',
    'claim_briefings', 
    'claim_photos',
    'claim_damage_zones',
    'claim_rooms',
    'claim_structures',
    'documents',
    'estimates',
    'policy_forms',
    'endorsements'
  ];

  for (const table of tables) {
    try {
      await supabaseAdmin
        .from(table)
        .delete()
        .in('claim_id', claimIds);
    } catch (e) {
      // Table may not exist, continue
    }
  }

  await supabaseAdmin
    .from('claims')
    .delete()
    .eq('organization_id', organizationId);

  return { claimsDeleted: claimIds.length, relatedRecordsDeleted: 0 };
}
