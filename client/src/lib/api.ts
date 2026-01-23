// API service for line items, estimates, and auth

const API_BASE = '/api';

// ============================================
// AUTH TYPES & API
// ============================================

export interface AuthUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  role?: string;
  currentOrganizationId?: string;
}

export interface AuthResponse {
  user: AuthUser | null;
  authenticated: boolean;
  message?: string;
}

export async function login(username: string, password: string, rememberMe: boolean = false): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, rememberMe }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Login failed');
  }
  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Logout failed');
  }
}

export async function checkAuth(): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/check`, {
    credentials: 'include',
  });
  if (!response.ok) {
    return { user: null, authenticated: false };
  }
  return response.json();
}

// ============================================
// USER PREFERENCES API
// ============================================

export interface UserPreferences {
  estimateDefaults?: {
    laborMultiplier: number;
    materialMultiplier: number;
    overheadPercent: number;
    profitPercent: number;
    defaultRegion: string;
    includeTax: boolean;
    taxRate: number;
    roundToNearest: string;
  };
  calendarSync?: {
    dateRangeDays?: number; // How many days ahead to sync (default: 28 / 4 weeks)
    autoSyncEnabled?: boolean;
    syncFrequency?: string;
  };
  notifications?: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    emailNewClaim: boolean;
    emailClaimApproved: boolean;
    emailClaimDenied: boolean;
    smsUrgentAlerts: boolean;
    digestFrequency: string;
  };
  carrier?: {
    defaultCarrier: string;
    approvalThreshold: number;
  };
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE}/users/preferences`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please refresh the page and log in again.');
    }
    throw new Error('Failed to fetch user preferences');
  }
  return response.json();
}

export async function saveUserPreferences(preferences: Partial<UserPreferences>): Promise<{ preferences: UserPreferences; message: string }> {
  const response = await fetch(`${API_BASE}/users/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please refresh the page and log in again.');
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to save preferences');
  }
  return response.json();
}

export interface UpdateProfileData {
  displayName: string;
  email: string;
}

export interface UpdateProfileResponse {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    displayName: string;
  };
  message: string;
}

export async function updateUserProfile(data: UpdateProfileData): Promise<UpdateProfileResponse> {
  const response = await fetch(`${API_BASE}/users/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please refresh the page and log in again.');
    }
    const error = await response.json().catch(() => ({}));
    // Handle validation errors with field-specific messages
    if (error.errors && Array.isArray(error.errors)) {
      const messages = error.errors.map((e: { path: string; message: string }) =>
        `${e.path}: ${e.message}`
      ).join(', ');
      throw new Error(messages || error.message || 'Validation failed');
    }
    throw new Error(error.message || error.error || 'Failed to update profile');
  }
  return response.json();
}

// ============================================
// TYPES
// ============================================

export interface ApiLineItem {
  id: string;
  code: string;
  categoryId: string;
  categoryName: string;
  description: string;
  unit: string;
  basePrice: number;
}

export interface LineItemSearchResult {
  items: ApiLineItem[];
  total: number;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  description: string;
  sort_order: number;
}

export interface Region {
  id: string;
  name: string;
  state?: string;
  indices?: Record<string, number>;
}

export interface CarrierProfile {
  id: string;
  name: string;
  code: string;
  overhead_pct: string;
  profit_pct: string;
  applies_tax: boolean;
  tax_rate?: string;
}

export interface EstimateLineItemInput {
  lineItemCode: string;
  quantity: number;
  notes?: string;
  roomName?: string;
}

export interface CalculatedLineItem {
  code: string;
  description: string;
  categoryId: string;
  unit: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  roomName?: string;
}

export interface EstimateCalculationResult {
  lineItems: CalculatedLineItem[];
  subtotal: number;
  overheadAmount: number;
  overheadPct: number;
  profitAmount: number;
  profitPct: number;
  taxAmount: number;
  taxPct: number;
  grandTotal: number;
  regionId: string;
  carrierProfileId?: string;
  lineItemCount: number;
  categoryBreakdown: Record<string, { count: number; subtotal: number }>;
}

export interface SavedEstimate extends EstimateCalculationResult {
  id: string;
  claimId?: string;
  claimNumber?: string;
  propertyAddress?: string;
  status: string;
  version: number;
  createdAt: string;
}

export interface EstimateTemplate {
  id: string;
  name: string;
  description: string;
  damage_type: string;
  template_items: Array<{ code: string; description: string; unit: string }>;
  usage_count: number;
}

// ============================================
// LINE ITEMS API
// ============================================

export async function searchLineItems(params: {
  q?: string;
  category?: string;
  damageType?: string;
  limit?: number;
  offset?: number;
}): Promise<LineItemSearchResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.category) searchParams.set('category', params.category);
  if (params.damageType) searchParams.set('damage_type', params.damageType);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/line-items?${searchParams}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch line items');
  }
  return response.json();
}

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_BASE}/line-items/categories`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  return response.json();
}

// ============================================
// REGIONS & CARRIERS API
// ============================================

export async function getRegions(): Promise<Region[]> {
  const response = await fetch(`${API_BASE}/regions`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch regions');
  }
  return response.json();
}

export async function getCarrierProfiles(): Promise<CarrierProfile[]> {
  const response = await fetch(`${API_BASE}/carrier-profiles`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch carrier profiles');
  }
  return response.json();
}

// ============================================
// ESTIMATES API
// ============================================

export async function calculateEstimate(params: {
  lineItems: EstimateLineItemInput[];
  regionId?: string;
  carrierProfileId?: string;
  overheadPct?: number;
  profitPct?: number;
}): Promise<EstimateCalculationResult> {
  const response = await fetch(`${API_BASE}/estimates/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to calculate estimate');
  }
  return response.json();
}

export async function createEstimate(params: {
  claimId?: string;
  claimNumber?: string;
  propertyAddress?: string;
  lineItems: EstimateLineItemInput[];
  regionId?: string;
  carrierProfileId?: string;
}): Promise<SavedEstimate> {
  const response = await fetch(`${API_BASE}/estimates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create estimate');
  }
  return response.json();
}

export async function getEstimate(id: string): Promise<SavedEstimate> {
  const response = await fetch(`${API_BASE}/estimates/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch estimate');
  }
  return response.json();
}

// ============================================
// ESTIMATE SUBMISSION & FINALIZATION API
// ============================================

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  details?: string;
  suggestion?: string;
  relatedItems?: string[];
  zoneId?: string;
  zoneName?: string;
}

export interface SubmissionResult {
  success: boolean;
  estimateId: string;
  status: string;
  submittedAt?: string;
  isLocked: boolean;
  validation: {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  message: string;
}

export interface EstimateLockStatus {
  isLocked: boolean;
  status: string;
  submittedAt?: string;
}

export async function submitEstimate(estimateId: string): Promise<SubmissionResult> {
  const response = await fetch(`${API_BASE}/estimates/${estimateId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok && response.status !== 400) {
    throw new Error(data.error || 'Failed to submit estimate');
  }

  return data;
}

export async function validateEstimate(estimateId: string): Promise<{
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}> {
  const response = await fetch(`${API_BASE}/estimates/${estimateId}/validate`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to validate estimate');
  }
  return response.json();
}

export async function getEstimateLockStatus(estimateId: string): Promise<EstimateLockStatus> {
  const response = await fetch(`${API_BASE}/estimates/${estimateId}/lock-status`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get lock status');
  }
  return response.json();
}

export function getEstimatePdfUrl(estimateId: string): string {
  return `${API_BASE}/estimates/${estimateId}/report/pdf`;
}

export function getEstimateHtmlUrl(estimateId: string): string {
  return `${API_BASE}/estimates/${estimateId}/report/html`;
}

export async function downloadEstimatePdf(estimateId: string): Promise<void> {
  const url = getEstimatePdfUrl(estimateId);
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    throw new Error('Failed to download PDF');
  }

  const contentType = response.headers.get('content-type');
  const blob = await response.blob();

  // Create download link
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;

  // Set filename based on content type
  if (contentType?.includes('application/pdf')) {
    link.download = `estimate-${estimateId}.pdf`;
  } else {
    // HTML fallback
    link.download = `estimate-${estimateId}.html`;
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

// ESX Export functions
export type EsxExportFormat = 'esx-zip' | 'esx-xml' | 'csv';

export async function downloadEstimateExport(
  estimateId: string,
  format: EsxExportFormat,
  options?: { includePhotos?: boolean }
): Promise<void> {
  let url: string;
  let filename: string;

  switch (format) {
    case 'esx-zip':
      const params = new URLSearchParams();
      params.set('includeSketch', 'true');
      if (options?.includePhotos) {
        params.set('includePhotos', 'true');
      }
      url = `${API_BASE}/estimates/${estimateId}/export/esx-zip?${params}`;
      filename = `estimate-${estimateId}.esx`;
      break;
    case 'esx-xml':
      url = `${API_BASE}/estimates/${estimateId}/export/esx-xml`;
      filename = `estimate-${estimateId}.esx`;
      break;
    case 'csv':
      url = `${API_BASE}/estimates/${estimateId}/export/csv`;
      filename = `estimate-${estimateId}.csv`;
      break;
    default:
      throw new Error(`Unknown export format: ${format}`);
  }

  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to export ${format}`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function listEstimates(params?: {
  status?: string;
  claimId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ estimates: SavedEstimate[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.claimId) searchParams.set('claim_id', params.claimId);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/estimates?${searchParams}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch estimates');
  }
  return response.json();
}

// ============================================
// ESTIMATE TEMPLATES API
// ============================================

export async function getEstimateTemplates(damageType?: string): Promise<EstimateTemplate[]> {
  const searchParams = new URLSearchParams();
  if (damageType) searchParams.set('damage_type', damageType);

  const response = await fetch(`${API_BASE}/estimate-templates?${searchParams}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }
  return response.json();
}

export async function createEstimateFromTemplate(
  templateId: string,
  quantities: Record<string, number>,
  params?: {
    claimId?: string;
    claimNumber?: string;
    propertyAddress?: string;
    regionId?: string;
    carrierProfileId?: string;
  }
): Promise<SavedEstimate> {
  const response = await fetch(`${API_BASE}/estimate-templates/${templateId}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ quantities, ...params }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create estimate from template');
  }
  return response.json();
}

// ============================================
// PRICING API (single item)
// ============================================

export async function calculateLineItemPrice(params: {
  lineItemCode: string;
  quantity: number;
  regionId: string;
  carrierId?: string;
}): Promise<{
  lineItemCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  breakdown: {
    material: number;
    labor: number;
    equipment: number;
  };
}> {
  const response = await fetch(`${API_BASE}/pricing/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      line_item_code: params.lineItemCode,
      quantity: params.quantity,
      region_id: params.regionId,
      carrier_id: params.carrierId,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to calculate price');
  }
  return response.json();
}

// ============================================
// ORGANIZATIONS API
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  email?: string;
  phone?: string;
  status: string;
  memberCount?: number;
  claimCount?: number;
}

export async function getMyOrganizations(): Promise<{
  organizations: Organization[];
  currentOrganizationId?: string;
}> {
  const response = await fetch(`${API_BASE}/organizations/mine`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired. Please refresh the page and log in again.');
    }
    throw new Error('Failed to fetch organizations');
  }
  return response.json();
}

export async function switchOrganization(organizationId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/organizations/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to switch organization');
  }
}

export async function createOrganization(data: {
  name: string;
  type?: string;
  email?: string;
  phone?: string;
}): Promise<Organization> {
  const response = await fetch(`${API_BASE}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create organization');
  }
  return response.json();
}

export async function getCurrentOrganization(): Promise<Organization> {
  const response = await fetch(`${API_BASE}/organizations/current`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch current organization');
  }
  return response.json();
}

// ============================================
// CLAIMS API
// ============================================

/**
 * Loss context structure (canonical FNOL storage) - snake_case from backend
 */
export interface LossContext {
  fnol?: {
    reported_by?: string;
    reported_date?: string;
    drone_eligible?: boolean;
    weather?: {
      status?: string;
      message?: string;
    };
  };
  property?: {
    year_built?: number;
    stories?: number;
    roof?: {
      material?: string;
      year_installed?: number;
      damage_scope?: string;
    };
  };
  damage_summary?: {
    coverage_a?: string;
    coverage_b?: string;
    coverage_c?: string;
    areas_affected?: string[];
  };
}

export interface Claim {
  id: string;
  organizationId: string;
  claimId: string; // Format: XX-XXX-XXXXXX
  claimNumber?: string; // Display claim number
  policyholder?: string;
  insuredName?: string; // Same as policyholder, from insured_name column
  insuredPhone?: string; // From insured_phone column
  insuredEmail?: string; // From insured_email column
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM
  riskLocation?: string; // Full address string
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc. - LEGACY field
  lossType?: string; // Alternative loss type field - LEGACY
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  dwellingLimit?: string; // Format: $XXX,XXX
  perilSpecificDeductibles?: Record<string, string>; // { "wind_hail": "$7,932 1%", etc. }
  // yearRoofInstall is now in lossContext.property.roof.year_installed
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
  documentCount?: number;
  estimateCount?: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;

  // Peril Parity Fields - canonical peril tracking for ALL perils
  primaryPeril?: string;  // Canonical peril enum value (wind_hail, fire, water, flood, smoke, mold, impact, other)
  secondaryPerils?: string[];  // Array of secondary perils
  perilConfidence?: number;  // 0.00-1.00 confidence in inference
  perilMetadata?: Record<string, any>;  // Peril-specific structured data

  // Canonical FNOL truth (snake_case JSON from backend)
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

    // Additional coverages from FNOL (fungi, O&L, fire dept, etc.)
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

export interface ClaimStats {
  total: number;
  byStatus: Record<string, number>;
  byLossType: Record<string, number>;
  totalRcv: number;
  totalAcv: number;
  totalDocuments: number;
  pendingDocuments: number;
  totalPhotos: number;
}

export async function createClaim(data: Partial<Claim>): Promise<Claim> {
  const response = await fetch(`${API_BASE}/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create claim');
  }
  return response.json();
}

export async function getClaims(params?: {
  status?: string;
  lossType?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeClosed?: boolean;
}): Promise<{ claims: Claim[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.lossType) searchParams.set('loss_type', params.lossType);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.includeClosed) searchParams.set('include_closed', 'true');

  const response = await fetch(`${API_BASE}/claims?${searchParams}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claims');
  }
  return response.json();
}

export async function getClaim(id: string): Promise<Claim> {
  const response = await fetch(`${API_BASE}/claims/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim');
  }
  return response.json();
}

export async function updateClaim(id: string, data: Partial<Claim>): Promise<Claim> {
  const response = await fetch(`${API_BASE}/claims/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update claim');
  }
  return response.json();
}

export async function getClaimStats(): Promise<ClaimStats> {
  const response = await fetch(`${API_BASE}/claims/stats`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim stats');
  }
  return response.json();
}

export async function deleteClaim(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/claims/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete claim');
  }
}

export interface ClaimRoom {
  id: string;
  name: string;
  roomType?: string;
  widthFt: string | number;
  lengthFt: string | number;
  ceilingHeightFt?: string | number;
  originXFt?: string | number;
  originYFt?: string | number;
  structureId?: string;
  shape?: string;
  openings?: unknown[];
  features?: unknown[];
  notes?: unknown[];
}

export interface ClaimDamageZone {
  id: string;
  roomId: string;
  damageType: string;
  severity?: string;
  affectedWalls?: string[];
  floorAffected?: boolean;
  ceilingAffected?: boolean;
  extentFt?: string | number;
  source?: string;
  notes?: string;
  isFreeform?: boolean;
}

export interface ClaimStructure {
  id: string;
  name: string;
  type: string;
  description?: string;
  address?: string;
  stories?: number;
  yearBuilt?: number;
  constructionType?: string;
  roofType?: string;
  photos?: unknown[];
  notes?: unknown[];
  rooms?: ClaimRoom[];
}

const safeParseFloat = (val: string | number | undefined, defaultVal: number = 0): number => {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? defaultVal : num;
};

export async function saveClaimRooms(
  claimId: string,
  rooms: ClaimRoom[],
  damageZones: ClaimDamageZone[],
  flowInstanceId?: string,
  movementId?: string
): Promise<{ success: boolean; roomsSaved: number; damageZonesSaved: number }> {
  // Transform to backend format: rooms with nested damageZones
  const roomsWithZones = rooms.map((room) => {
    const roomDamageZones = damageZones
      .filter((dz) => dz.roomId === room.id)
      .map((dz) => ({
        id: dz.id,
        type: dz.damageType.toLowerCase(),
        category: null,
        severity: dz.severity?.toLowerCase(),
        affected_walls: dz.affectedWalls || [],
        floor_affected: dz.floorAffected || false,
        ceiling_affected: dz.ceilingAffected || false,
        extent_ft: safeParseFloat(dz.extentFt, 0),
        source: dz.source || dz.notes,
        notes: dz.notes,
        polygon: [],
        is_freeform: dz.isFreeform || false,
      }));

    return {
      id: room.id,
      name: room.name,
      room_type: room.roomType,
      shape: room.shape || 'rectangular',
      width_ft: safeParseFloat(room.widthFt, 10),
      length_ft: safeParseFloat(room.lengthFt, 10),
      ceiling_height_ft: safeParseFloat(room.ceilingHeightFt, 8),
      origin_x_ft: safeParseFloat(room.originXFt, 0),
      origin_y_ft: safeParseFloat(room.originYFt, 0),
      polygon: [],
      openings: room.openings || [],
      features: room.features || [],
      damageZones: roomDamageZones,
      notes: room.notes || [],
    };
  });

  const response = await fetch(`${API_BASE}/claims/${claimId}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      rooms: roomsWithZones,
      flowInstanceId,
      movementId
    }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save rooms');
  }
  const result = await response.json();
  // Map new response format to expected format
  return {
    success: result.success,
    roomsSaved: result.roomsSaved || result.roomsAdded || 0,
    damageZonesSaved: result.damageZonesSaved || result.damageZonesAdded || 0,
  };
}

export async function saveClaimHierarchy(
  claimId: string,
  structures: ClaimStructure[],
  rooms: ClaimRoom[] = [],
  damageZones: ClaimDamageZone[] = []
): Promise<{ 
  success: boolean; 
  structuresSaved: number;
  roomsSaved: number; 
  damageZonesSaved: number 
}> {
  // Helper to transform damage zone to backend format
  const transformDamageZone = (dz: ClaimDamageZone) => ({
    id: dz.id,
    type: dz.damageType.toLowerCase(),
    category: null,
    severity: dz.severity?.toLowerCase(),
    affected_walls: dz.affectedWalls || [],
    floor_affected: dz.floorAffected || false,
    ceiling_affected: dz.ceilingAffected || false,
    extent_ft: safeParseFloat(dz.extentFt, 0),
    source: dz.source || dz.notes,
    notes: dz.notes,
    polygon: [],
    is_freeform: dz.isFreeform || false,
  });
  
  // Helper to transform room to backend format
  const transformRoom = (room: ClaimRoom, zones: ClaimDamageZone[]) => ({
    id: room.id,
    name: room.name,
    room_type: room.roomType,
    shape: room.shape || 'rectangular',
    width_ft: safeParseFloat(room.widthFt, 10),
    length_ft: safeParseFloat(room.lengthFt, 10),
    ceiling_height_ft: safeParseFloat(room.ceilingHeightFt, 8),
    origin_x_ft: safeParseFloat(room.originXFt, 0),
    origin_y_ft: safeParseFloat(room.originYFt, 0),
    polygon: [],
    openings: room.openings || [],
    features: room.features || [],
    damageZones: zones.filter((dz) => dz.roomId === room.id).map(transformDamageZone),
    notes: room.notes || [],
  });

  // Transform structures with nested rooms
  const structuresPayload = structures.map((structure) => {
    const structureRooms = rooms
      .filter((r) => r.structureId === structure.id)
      .map((room) => transformRoom(room, damageZones));

    return {
      id: structure.id,
      name: structure.name,
      type: structure.type,
      description: structure.description,
      address: structure.address,
      stories: structure.stories,
      year_built: structure.yearBuilt,
      construction_type: structure.constructionType,
      roof_type: structure.roofType,
      photos: structure.photos || [],
      notes: structure.notes || [],
      rooms: structureRooms,
    };
  });

  // Rooms not linked to structures
  const orphanRooms = rooms
    .filter((r) => !r.structureId)
    .map((room) => transformRoom(room, damageZones));

  const response = await fetch(`${API_BASE}/claims/${claimId}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structures: structuresPayload, rooms: orphanRooms }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save hierarchy');
  }
  const result = await response.json();
  return {
    success: result.success,
    structuresSaved: result.structuresSaved || 0,
    roomsSaved: result.roomsSaved || 0,
    damageZonesSaved: result.damageZonesSaved || 0,
  };
}

export async function getClaimRooms(
  claimId: string
): Promise<{ rooms: ClaimRoom[]; damageZones: ClaimDamageZone[] }> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/rooms`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim rooms');
  }
  return response.json();
}

export async function deleteClaimRooms(claimId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/rooms`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete rooms' }));
    throw new Error(error.error || 'Failed to delete rooms');
  }
  return response.json();
}

// ============================================
// SCOPE ITEMS API
// ============================================

export interface ScopeItem {
  id: string;
  lineItemCode: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  roomName?: string;
  notes?: string;
  createdAt: string;
}

export async function getScopeItems(claimId: string): Promise<ScopeItem[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/scope-items`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch scope items');
  }
  return response.json();
}

export async function addScopeItem(
  claimId: string,
  item: {
    lineItemCode: string;
    description: string;
    category?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    roomName?: string;
    notes?: string;
  }
): Promise<ScopeItem> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/scope-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add scope item');
  }
  return response.json();
}

export async function updateScopeItem(
  itemId: string,
  data: { quantity?: number; notes?: string }
): Promise<ScopeItem> {
  const response = await fetch(`${API_BASE}/scope-items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update scope item');
  }
  return response.json();
}

export async function deleteScopeItem(itemId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/scope-items/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete scope item');
  }
}

// ============================================
// DOCUMENTS API
// ============================================

export interface Document {
  id: string;
  organizationId: string;
  claimId?: string;
  name: string;
  type: string;
  category?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  extractedData?: Record<string, any>;
  processingStatus: string;
  createdAt: string;
}

export async function uploadDocument(
  file: File,
  metadata: {
    claimId?: string;
    name?: string;
    type: 'fnol' | 'policy' | 'endorsement' | 'photo' | 'estimate' | 'correspondence';
    category?: string;
    description?: string;
  }
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', metadata.type);
  if (metadata.claimId) formData.append('claimId', metadata.claimId);
  if (metadata.name) formData.append('name', metadata.name);
  if (metadata.category) formData.append('category', metadata.category);
  if (metadata.description) formData.append('description', metadata.description);

  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload document');
  }
  return response.json();
}

export async function uploadDocuments(
  files: File[],
  metadata: {
    claimId?: string;
    type: 'fnol' | 'policy' | 'endorsement' | 'photo' | 'estimate' | 'correspondence';
    category?: string;
  }
): Promise<{ documents: Document[] }> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('type', metadata.type);
  if (metadata.claimId) formData.append('claimId', metadata.claimId);
  if (metadata.category) formData.append('category', metadata.category);

  const response = await fetch(`${API_BASE}/documents/bulk`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload documents');
  }
  return response.json();
}

export async function getDocuments(params?: {
  claimId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ documents: Document[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.claimId) searchParams.set('claim_id', params.claimId);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/documents?${searchParams}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }
  return response.json();
}

export async function getClaimDocuments(claimId: string): Promise<Document[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/documents`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim documents');
  }
  return response.json();
}

export async function processDocument(documentId: string): Promise<{
  extractedData: Record<string, any>;
  processingStatus: string;
}> {
  const response = await fetch(`${API_BASE}/documents/${documentId}/process`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to process document');
  }
  return response.json();
}

export function getDocumentDownloadUrl(documentId: string): string {
  return `${API_BASE}/documents/${documentId}/download`;
}

/**
 * Get processing status for multiple documents at once
 * Used by the upload queue to efficiently poll for completion
 */
export async function getDocumentBatchStatus(
  documentIds: string[]
): Promise<Record<string, string>> {
  if (documentIds.length === 0) return {};

  const response = await fetch(
    `${API_BASE}/documents/batch-status?ids=${documentIds.join(',')}`,
    { credentials: 'include' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch batch status');
  }

  return response.json();
}

/**
 * Get document processing queue statistics
 */
export async function getDocumentQueueStats(): Promise<{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const response = await fetch(`${API_BASE}/documents/queue-stats`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch queue stats');
  }

  return response.json();
}

// ============================================
// POLICY EXTRACTION API (Comprehensive Format)
// ============================================

export interface PolicyDefinition {
  term: string;
  definition: string;
  subClauses?: string[];
  exceptions?: string[];
}

export interface PolicyCoverage {
  name?: string;
  covers?: string[];
  excludes?: string[];
  specialConditions?: string[];
  scope?: string;
  specialLimits?: { propertyType: string; limit: string; conditions?: string }[];
  notCovered?: string[];
  subCoverages?: string[];
  timeLimits?: string;
}

export interface PolicySectionI {
  propertyCoverage?: {
    coverageA?: PolicyCoverage;
    coverageB?: PolicyCoverage;
    coverageC?: PolicyCoverage;
    coverageD?: PolicyCoverage;
  };
  perils?: {
    coverageA_B?: string;
    coverageC?: string[];
  };
  exclusions?: {
    global?: string[];
    coverageA_B_specific?: string[];
  };
  additionalCoverages?: { name: string; description?: string; limit?: string; conditions?: string }[];
  conditions?: string[];
  lossSettlement?: {
    dwellingAndStructures?: {
      basis?: string;
      repairRequirements?: string;
      timeLimit?: string;
      matchingRules?: string;
    };
    roofingSystem?: {
      definition?: string;
      hailSettlement?: string;
      metalRestrictions?: string;
    };
    personalProperty?: {
      settlementBasis?: string[];
      specialHandling?: string;
    };
  };
}

export interface PolicySectionII {
  liabilityCoverages?: {
    coverageE?: { name?: string; insuringAgreement?: string; dutyToDefend?: boolean };
    coverageF?: { name?: string; insuringAgreement?: string; timeLimit?: string };
  };
  exclusions?: string[];
  additionalCoverages?: { name: string; description?: string; limit?: string }[];
  conditions?: string[];
}

export interface PolicyFormExtraction {
  id: string;
  organization_id: string;
  claim_id?: string;
  document_id?: string;
  document_type: string;
  policy_form_code?: string;
  policy_form_name?: string;
  edition_date?: string;
  page_count?: number;
  policy_structure?: {
    tableOfContents?: string[];
    policyStatement?: string;
    agreement?: string;
  };
  definitions?: PolicyDefinition[];
  section_i?: PolicySectionI;
  section_ii?: PolicySectionII;
  general_conditions?: string[];
  raw_page_text?: string;
  extraction_model?: string;
  extraction_version?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function getClaimPolicyExtractions(claimId: string): Promise<PolicyFormExtraction[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/policy-extractions`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch policy extractions');
  }
  return response.json();
}

export async function getPolicyExtraction(id: string): Promise<PolicyFormExtraction> {
  const response = await fetch(`${API_BASE}/policy-extractions/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch policy extraction');
  }
  return response.json();
}

// ============================================
// COMPREHENSIVE ENDORSEMENT EXTRACTION API (v2.0)
// ============================================

export interface EndorsementModifications {
  definitions?: {
    added?: { term: string; definition: string }[];
    deleted?: string[];
    replaced?: { term: string; newDefinition: string }[];
  };
  coverages?: {
    added?: string[];
    deleted?: string[];
    modified?: { coverage: string; changeType: string; details: string }[];
  };
  perils?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  exclusions?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  conditions?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  lossSettlement?: {
    replacedSections?: { policySection: string; newRule: string }[];
  };
}

export interface EndorsementTable {
  tableType: string;
  appliesWhen?: { coverage?: string[]; peril?: string[] };
  data?: Record<string, any>;
}

export interface EndorsementExtraction {
  id: string;
  organization_id: string;
  claim_id?: string;
  document_id?: string;
  form_code: string;
  title?: string;
  edition_date?: string;
  jurisdiction?: string;
  page_count?: number;
  applies_to_policy_forms?: string[];
  modifications?: EndorsementModifications;
  tables?: EndorsementTable[];
  raw_text?: string;
  extraction_model?: string;
  extraction_version?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function getClaimEndorsementExtractions(claimId: string): Promise<EndorsementExtraction[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/endorsement-extractions`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch endorsement extractions');
  }
  return response.json();
}

export async function getEndorsementExtraction(id: string): Promise<EndorsementExtraction> {
  const response = await fetch(`${API_BASE}/endorsement-extractions/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch endorsement extraction');
  }
  return response.json();
}

// ============================================
// EFFECTIVE POLICY API
// ============================================

/**
 * Response from the effective policy endpoint
 */
export interface EffectivePolicyResponse {
  effectivePolicy: {
    claimId: string;
    jurisdiction?: string;
    policyNumber?: string;
    effectiveDate?: string;
    coverages: Record<string, any>;
    lossSettlement: Record<string, any>;
    deductibles: Record<string, any>;
    exclusions: string[];
    conditions: string[];
    sourceMap: Record<string, string[]>;
    resolvedAt: string;
    resolvedFromDocuments: {
      basePolicyId?: string;
      endorsementIds: string[];
    };
  } | null;
  summary: {
    coverageLimits: {
      coverageA?: string;
      coverageB?: string;
      coverageC?: string;
      coverageD?: string;
    };
    deductibles: {
      standard?: string;
      windHail?: string;
    };
    roofSettlement: {
      basis: string;
      isScheduled: boolean;
      hasMetalRestrictions: boolean;
      sourceEndorsement?: string;
    };
    majorExclusions: string[];
    endorsementWatchouts: {
      formCode: string;
      summary: string;
    }[];
  } | null;
  message?: string;
}

/**
 * Get the dynamically computed effective policy for a claim
 *
 * This endpoint computes the effective policy by:
 * 1. Loading base policy form extractions
 * 2. Loading endorsement extractions (sorted by precedence)
 * 3. Merging according to "most specific rule wins"
 *
 * The effective policy is NEVER cached - always computed fresh.
 */
export async function getClaimEffectivePolicy(claimId: string): Promise<EffectivePolicyResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/effective-policy`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch effective policy');
  }
  return response.json();
}

// ============================================
// INSPECTION INTELLIGENCE API
// ============================================

export interface InspectionPriorityArea {
  area: string;
  description: string;
  criticalityLevel: 'high' | 'medium' | 'low';
}

export interface PhotoRequirement {
  category: string;
  items: string[];
  notes?: string;
}

export interface CommonMiss {
  issue: string;
  description: string;
  consequence: string;
}

export interface EscalationTrigger {
  condition: string;
  action: string;
  urgency: 'immediate' | 'same_day' | 'within_48h';
}

export interface SketchRequirement {
  type: string;
  description: string;
  required: boolean;
}

export interface DepreciationGuidance {
  item: string;
  guidance: string;
}

export interface PerilInspectionRuleSummary {
  peril: string;
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

export interface InspectionIntelligence {
  primaryPerilRules: PerilInspectionRuleSummary;
  mergedGuidance: MergedInspectionGuidance;
  quickTips: string[];
  escalationTriggers: EscalationTrigger[];
}

/**
 * Get inspection intelligence for a specific peril
 */
export async function getInspectionIntelligenceByPeril(peril: string): Promise<InspectionIntelligence> {
  const response = await fetch(`${API_BASE}/inspection-intelligence/${encodeURIComponent(peril)}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch inspection intelligence');
  }
  return response.json();
}

/**
 * Get quick inspection tips for a peril (for UI micro-hints)
 */
export async function getInspectionTips(peril: string, limit: number = 5): Promise<{ tips: string[] }> {
  const response = await fetch(`${API_BASE}/inspection-intelligence/${encodeURIComponent(peril)}/tips?limit=${limit}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch inspection tips');
  }
  return response.json();
}

/**
 * Get inspection intelligence for a specific claim
 */
export async function getClaimInspectionIntelligence(claimId: string): Promise<InspectionIntelligence> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/inspection-intelligence`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim inspection intelligence');
  }
  return response.json();
}

// ============================================
// CLAIM BRIEFING API
// ============================================

/**
 * ClaimBriefingContent - The structured JSON content of a briefing
 */
export interface ClaimBriefingContent {
  claim_summary: {
    primary_peril: string;
    secondary_perils: string[];
    overview: string[];
  };
  inspection_strategy: {
    where_to_start: string[];
    what_to_prioritize: string[];
    common_misses: string[];
  };
  peril_specific_risks: string[];
  endorsement_watchouts: {
    endorsement_id: string;
    impact: string;
    inspection_implications: string[];
  }[];
  photo_requirements: {
    category: string;
    items: string[];
  }[];
  sketch_requirements: string[];
  depreciation_considerations: string[];
  open_questions_for_adjuster: string[];
}

export interface StoredBriefing {
  id: string;
  claimId: string;
  peril: string;
  sourceHash: string;
  briefingJson: ClaimBriefingContent;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateBriefingResponse {
  briefing: ClaimBriefingContent;
  briefingId: string;
  sourceHash: string;
  cached: boolean;
  model?: string;
  updatedAt?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface BriefingStatusResponse {
  hasBriefing: boolean;
  isStale: boolean;
  lastUpdated: string | null;
  model: string | null;
}

/**
 * Get the latest AI-generated briefing for a claim
 */
export async function getClaimBriefing(claimId: string): Promise<StoredBriefing> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/briefing`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No briefing found');
    }
    throw new Error('Failed to fetch claim briefing');
  }
  return response.json();
}

/**
 * Generate a new AI briefing for a claim
 * @param force - Force regeneration even if cached
 */
export async function generateClaimBriefing(
  claimId: string,
  force: boolean = false
): Promise<GenerateBriefingResponse> {
  const url = force
    ? `${API_BASE}/claims/${claimId}/briefing/generate?force=true`
    : `${API_BASE}/claims/${claimId}/briefing/generate`;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate briefing');
  }
  return response.json();
}

/**
 * Check briefing status (stale, exists, etc.)
 */
export async function getClaimBriefingStatus(claimId: string): Promise<BriefingStatusResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/briefing/status`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch briefing status');
  }
  return response.json();
}

/**
 * Delete all briefings for a claim
 */
export async function deleteClaimBriefings(claimId: string): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/briefing`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to delete briefings');
  }
  return response.json();
}

// ============================================
// CARRIER GUIDANCE API
// ============================================

export interface CarrierPerilOverlay {
  require_test_squares?: boolean;
  test_square_count?: number;
  photo_density?: 'low' | 'standard' | 'high';
  require_duration_confirmation?: boolean;
  require_moisture_readings?: boolean;
  require_origin_documentation?: boolean;
  require_high_water_mark?: boolean;
  require_mold_testing?: boolean;
  emphasis?: string[];
  de_emphasis?: string[];
  notes?: string;
}

export interface CarrierInspectionOverlays {
  wind_hail?: CarrierPerilOverlay;
  fire?: CarrierPerilOverlay;
  water?: CarrierPerilOverlay;
  flood?: CarrierPerilOverlay;
  smoke?: CarrierPerilOverlay;
  mold?: CarrierPerilOverlay;
  impact?: CarrierPerilOverlay;
  other?: CarrierPerilOverlay;
}

export interface AdditionalRequirement {
  type: string;
  description: string;
  required: boolean;
}

export interface CarrierGuidance {
  carrierId: string;
  carrierName: string;
  perilOverlay: CarrierPerilOverlay | null;
  emphasis: string[];
  deEmphasis: string[];
  additionalRequirements: AdditionalRequirement[];
  notes: string | null;
}

export interface MergedInspectionWithCarrier {
  baseRules: {
    peril: string;
    displayName: string;
    priorityAreas: InspectionPriorityArea[];
    requiredPhotos: PhotoRequirement[];
    commonMisses: CommonMiss[];
    safetyConsiderations: string[];
  };
  carrierGuidance: CarrierGuidance | null;
  mergedPriorityAreas: InspectionPriorityArea[];
  mergedPhotoRequirements: PhotoRequirement[];
  carrierNotes: string[];
  additionalRequirements: AdditionalRequirement[];
}

/**
 * Get carrier inspection overlays
 */
export async function getCarrierOverlays(carrierId: string): Promise<{
  carrier: { id: string; name: string; code: string } | null;
  overlays: CarrierInspectionOverlays | null;
}> {
  const response = await fetch(`${API_BASE}/carriers/${carrierId}/overlays`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch carrier overlays');
  }
  return response.json();
}

/**
 * Get carrier guidance for a specific claim
 */
export async function getClaimCarrierGuidance(claimId: string): Promise<MergedInspectionWithCarrier> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/carrier-guidance`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch carrier guidance');
  }
  return response.json();
}

// ============================================
// PHOTO API (Voice Sketch)
// ============================================

export interface PhotoAnalysis {
  quality: {
    score: number;
    issues: string[];
    suggestions: string[];
  };
  content: {
    description: string;
    damageDetected: boolean;
    damageTypes: string[];
    damageLocations: string[];
    materials: string[];
    recommendedLabel: string;
  };
  metadata: {
    lighting: 'good' | 'fair' | 'poor';
    focus: 'sharp' | 'acceptable' | 'blurry';
    angle: 'optimal' | 'acceptable' | 'suboptimal';
    coverage: 'complete' | 'partial' | 'insufficient';
  };
}

export interface UploadedPhoto {
  id: string;
  url: string;
  storagePath: string;
  analysis: PhotoAnalysis | null;
  label: string;
  hierarchyPath: string;
  claimId?: string;
  structureId?: string;
  roomId?: string;
  subRoomId?: string;
  objectId?: string;
  capturedAt: string;
  analyzedAt?: string;
}

export interface PhotoUploadParams {
  file: File;
  claimId?: string;
  structureId?: string;
  roomId?: string;
  subRoomId?: string;
  objectId?: string;
  label?: string;
  hierarchyPath?: string;
  latitude?: number;
  longitude?: number;
}

export async function uploadPhoto(params: PhotoUploadParams): Promise<UploadedPhoto> {
  const formData = new FormData();
  formData.append('file', params.file);
  if (params.claimId) formData.append('claimId', params.claimId);
  if (params.structureId) formData.append('structureId', params.structureId);
  if (params.roomId) formData.append('roomId', params.roomId);
  if (params.subRoomId) formData.append('subRoomId', params.subRoomId);
  if (params.objectId) formData.append('objectId', params.objectId);
  if (params.label) formData.append('label', params.label);
  if (params.hierarchyPath) formData.append('hierarchyPath', params.hierarchyPath);
  if (params.latitude != null) formData.append('latitude', params.latitude.toString());
  if (params.longitude != null) formData.append('longitude', params.longitude.toString());

  const response = await fetch(`${API_BASE}/photos/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload photo');
  }

  return response.json();
}

// Audio upload parameters
export interface AudioUploadParams {
  file: Blob;
  claimId?: string;
  flowInstanceId?: string;
  movementId?: string;
  roomId?: string;
  structureId?: string;
}

// Audio observation response
export interface AudioObservation {
  id: string;
  audioUrl: string | null;
  transcription: string | null;
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  extractedEntities: Record<string, unknown> | null;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  durationSeconds: number | null;
  createdAt: string;
}

export async function uploadAudio(params: AudioUploadParams): Promise<{ id: string; audioUrl: string | null; success: boolean }> {
  const formData = new FormData();
  formData.append('audio', params.file, 'voice-note.webm');
  if (params.claimId) formData.append('claimId', params.claimId);
  if (params.flowInstanceId) formData.append('flowInstanceId', params.flowInstanceId);
  if (params.movementId) formData.append('movementId', params.movementId);
  if (params.roomId) formData.append('roomId', params.roomId);
  if (params.structureId) formData.append('structureId', params.structureId);

  const response = await fetch(`${API_BASE}/audio/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload audio');
  }

  return response.json();
}

export async function getAudioObservation(id: string): Promise<AudioObservation> {
  const response = await fetch(`${API_BASE}/audio/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get audio observation');
  }
  return response.json();
}

export async function getClaimAudioObservations(claimId: string): Promise<AudioObservation[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/audio`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get audio observations');
  }
  return response.json();
}

export async function getPhotoSignedUrl(storagePath: string): Promise<string> {
  const response = await fetch(`${API_BASE}/photos/${encodeURIComponent(storagePath)}/url`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get photo URL');
  }
  const data = await response.json();
  return data.url;
}

export async function deletePhotoByPath(storagePath: string): Promise<void> {
  const response = await fetch(`${API_BASE}/photos/by-path/${encodeURIComponent(storagePath)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to delete photo');
  }
}

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed' | 'concerns';

export interface ClaimPhoto {
  id: string;
  claimId: string;
  organizationId: string;
  structureId: string | null;
  roomId: string | null;
  damageZoneId: string | null;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  label: string | null;
  hierarchyPath: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  geoAddress: string | null;
  aiAnalysis: PhotoAnalysis | null;
  qualityScore: number | null;
  damageDetected: boolean | null;
  analysisStatus: AnalysisStatus | null;
  analysisError: string | null;
  capturedAt: string | null;
  analyzedAt: string | null;
  uploadedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  taxonomyPrefix: string | null;
}

export async function getClaimPhotos(
  claimId: string,
  filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }
): Promise<ClaimPhoto[]> {
  const params = new URLSearchParams();
  if (filters?.structureId) params.append('structureId', filters.structureId);
  if (filters?.roomId) params.append('roomId', filters.roomId);
  if (filters?.damageZoneId) params.append('damageZoneId', filters.damageZoneId);
  if (filters?.damageDetected !== undefined) params.append('damageDetected', String(filters.damageDetected));

  const url = `${API_BASE}/claims/${claimId}/photos${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  
  if (!response.ok) {
    throw new Error('Failed to fetch photos');
  }
  
  return response.json();
}

export async function getPhoto(id: string): Promise<ClaimPhoto> {
  const response = await fetch(`${API_BASE}/photos/${id}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to fetch photo');
  }
  return response.json();
}

export async function deletePhoto(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/photos/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to delete photo');
  }
}

export async function updatePhoto(
  id: string,
  updates: { label?: string; hierarchyPath?: string; claimId?: string | null; structureId?: string | null; roomId?: string | null; damageZoneId?: string | null }
): Promise<ClaimPhoto> {
  const response = await fetch(`${API_BASE}/photos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to update photo');
  }
  return response.json();
}

export async function getAllPhotos(): Promise<ClaimPhoto[]> {
  const response = await fetch(`${API_BASE}/photos`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to fetch photos');
  }
  return response.json();
}

export async function reanalyzePhoto(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${API_BASE}/photos/${id}/reanalyze`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Re-analysis failed' }));
    throw new Error(error.error || 'Failed to re-analyze photo');
  }
  return response.json();
}

// ============================================
// CLAIM CHECKLIST API
// ============================================

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked' | 'na';

export interface ClaimChecklist {
  id: string;
  claimId: string;
  organizationId: string;
  name: string;
  description: string | null;
  peril: string;
  severity: string;
  templateVersion: string | null;
  totalItems: number;
  completedItems: number;
  status: string;
  metadata: Record<string, any> | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface ClaimChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  category: string;
  requiredForPerils: string[] | null;
  requiredForSeverities: string[] | null;
  conditionalLogic: Record<string, any> | null;
  required: boolean | null;
  priority: number | null;
  sortOrder: number | null;
  status: ChecklistItemStatus;
  completedBy: string | null;
  completedAt: string | null;
  skippedReason: string | null;
  notes: string | null;
  linkedDocumentIds: string[] | null;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChecklistResponse {
  checklist: ClaimChecklist | null;
  items: ClaimChecklistItem[];
  regenerated?: boolean;
}

export async function getClaimChecklist(claimId: string): Promise<ChecklistResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/checklist`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch checklist' }));
    throw new Error(error.error || 'Failed to fetch checklist');
  }
  return response.json();
}

export async function generateClaimChecklist(
  claimId: string,
  options?: { peril?: string; severity?: string }
): Promise<ChecklistResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/checklist/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate checklist' }));
    throw new Error(error.error || 'Failed to generate checklist');
  }
  return response.json();
}

export async function updateChecklistItem(
  itemId: string,
  updates: { status: ChecklistItemStatus; notes?: string; skippedReason?: string }
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/checklists/items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update item' }));
    throw new Error(error.error || 'Failed to update item');
  }
  return response.json();
}

export async function addChecklistItem(
  checklistId: string,
  item: { title: string; category: string; description?: string; required?: boolean; priority?: 1 | 2 | 3 }
): Promise<{ success: boolean; item: ClaimChecklistItem }> {
  const response = await fetch(`${API_BASE}/checklists/${checklistId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to add item' }));
    throw new Error(error.error || 'Failed to add item');
  }
  return response.json();
}

// ============================================
// UNIFIED CLAIM CONTEXT & COVERAGE ANALYSIS
// ============================================

/**
 * Coverage alert from analysis
 */
export interface CoverageAlert {
  severity: 'info' | 'warning' | 'critical';
  category: 'deductible' | 'limit' | 'exclusion' | 'depreciation' | 'documentation';
  title: string;
  description: string;
  actionRequired?: string;
  relatedEndorsement?: string;
}

/**
 * Endorsement impact summary
 */
export interface EndorsementImpactSummary {
  formCode: string;
  title: string;
  category: string;
  impacts: string[];
  inspectionRequirements: string[];
  estimateConsiderations: string[];
  hasRoofSchedule: boolean;
  hasMetalFunctionalLanguage: boolean;
}

/**
 * Roof depreciation result
 */
export interface RoofDepreciationResult {
  roofAge: number;
  roofMaterial: string;
  scheduleFormCode?: string;
  paymentPercentage: number;
  depreciationPercentage: number;
  isScheduledBasis: boolean;
  notes: string[];
}

/**
 * Coverage limit structure
 */
export interface CoverageLimit {
  limit: number;
  formatted: string;
  basis?: string;
  sourceEndorsement?: string;
}

/**
 * Property details for unified context
 */
export interface PropertyDetails {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  constructionType?: string;
  yearBuilt?: number;
  squareFootage?: number;
  stories?: number;
  roof: {
    material?: string;
    yearInstalled?: number;
    age?: number;
    condition?: string;
  };
  occupancy?: string;
}

/**
 * Unified Claim Context - single source of truth
 */
export interface UnifiedClaimContext {
  claimId: string;
  claimNumber: string;
  policyNumber?: string;
  dateOfLoss?: string;
  dateOfLossFormatted?: string;
  reportedDate?: string;
  reportedBy?: string;

  insured: {
    name: string;
    name2?: string;
    email?: string;
    phone?: string;
    mailingAddress?: string;
  };

  property: PropertyDetails;

  producer?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };

  peril: {
    primary: string;
    primaryDisplay: string;
    secondary: string[];
    secondaryDisplay: string[];
    applicableDeductible: { amount: number; formatted: string };
    applicableExclusions: string[];
    inspectionFocus: string[];
    commonMisses: string[];
  };

  coverages: {
    dwelling?: CoverageLimit;
    otherStructures?: CoverageLimit;
    personalProperty?: CoverageLimit;
    lossOfUse?: CoverageLimit;
    personalLiability?: CoverageLimit;
    medicalPayments?: CoverageLimit;
    additionalCoverages: Record<string, CoverageLimit>;
  };

  specialLimits: Record<string, number>;

  deductibles: {
    aop?: { amount: number; formatted: string };
    windHail?: { amount: number; formatted: string; isPercentage: boolean };
    hurricane?: { amount: number; formatted: string };
    flood?: { amount: number; formatted: string };
    earthquake?: { amount: number; formatted: string };
    namedStorm?: { amount: number; formatted: string };
    applicableForPeril: { amount: number; formatted: string };
  };

  lossSettlement: {
    dwelling: { basis: string; sourceEndorsement?: string };
    roofing: {
      isScheduled: boolean;
      scheduleFormCode?: string;
      metalFunctionalRequirement: boolean;
    };
    personalProperty: { basis: string; sourceEndorsement?: string };
  };

  exclusions: {
    general: string[];
    endorsementAdded: string[];
    endorsementRemoved: string[];
    applicableToPeril: string[];
  };

  endorsements: {
    listedOnFnol: Array<{ code: string; description: string }>;
    extracted: EndorsementImpactSummary[];
    byCategory: {
      lossSettlement: EndorsementImpactSummary[];
      coverageModification: EndorsementImpactSummary[];
      stateAmendatory: EndorsementImpactSummary[];
      other: EndorsementImpactSummary[];
    };
  };

  definitions: Record<string, string>;
  alerts: CoverageAlert[];

  insights: {
    roofDepreciationPct?: number;
    estimatedRoofPaymentPct?: number;
    hasOandLCoverage: boolean;
    oandLLimit?: number;
    hasPersonalPropertyRCV: boolean;
    hasFungiCoverage: boolean;
    fungiLimit?: number;
    specialLimitsToWatch: string[];
    coverageGaps: string[];
    stateSpecificRules: string[];
    endorsementsWithInspectionImpact: string[];
    totalEndorsementCount: number;
    criticalEndorsementCount: number;
  };

  meta: {
    builtAt: string;
    fnolDocumentId?: string;
    policyDocumentId?: string;
    endorsementDocumentIds: string[];
    dataCompleteness: {
      hasFnol: boolean;
      hasPolicy: boolean;
      hasEndorsements: boolean;
      completenessScore: number;
    };
  };
}

/**
 * Coverage analysis result
 */
export interface CoverageAnalysisResult {
  claimId: string;
  analyzedAt: string;
  alerts: CoverageAlert[];
  endorsementImpacts: EndorsementImpactSummary[];
  depreciation?: RoofDepreciationResult;
  estimatedMaxPayments: {
    dwelling?: number;
    otherStructures?: number;
    personalProperty?: number;
    total?: number;
  };
  recommendations: string[];
}

/**
 * Coverage analysis summary for quick UI display
 */
export interface CoverageAnalysisSummary {
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  roofPaymentPct?: number;
  applicableDeductible: string;
  topRecommendations: string[];
}

/**
 * Fetch the unified claim context (merged FNOL + Policy + Endorsements)
 */
export async function getClaimContext(claimId: string): Promise<UnifiedClaimContext | null> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/context`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({ error: 'Failed to fetch claim context' }));
    throw new Error(error.error || 'Failed to fetch claim context');
  }
  return response.json();
}

/**
 * Fetch full coverage analysis for a claim
 */
export async function getCoverageAnalysis(claimId: string): Promise<CoverageAnalysisResult | null> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/coverage-analysis`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({ error: 'Failed to fetch coverage analysis' }));
    throw new Error(error.error || 'Failed to fetch coverage analysis');
  }
  return response.json();
}

/**
 * Fetch coverage analysis summary for quick UI display
 */
export async function getCoverageAnalysisSummary(claimId: string): Promise<CoverageAnalysisSummary | null> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/coverage-analysis/summary`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({ error: 'Failed to fetch coverage summary' }));
    throw new Error(error.error || 'Failed to fetch coverage summary');
  }
  return response.json();
}

// ============================================
// CALENDAR SYNC API
// ============================================

export interface Ms365ConnectionStatus {
  connected: boolean;
  configured: boolean;
  expiresAt: string | null;
}

export interface CalendarSyncStatus {
  connected: boolean;
  lastSyncTime: string | null;
  lastSyncDirection: 'pull' | 'push' | 'full' | null;
  pendingSyncs: number;
  errorCount: number;
}

export interface CalendarSyncResult {
  success: boolean;
  pulled: number;
  pushed: number;
  updated: number;
  conflicts: number;
  errors: string[];
}

/**
 * Get MS365 connection status
 */
export async function getMs365ConnectionStatus(): Promise<Ms365ConnectionStatus> {
  const response = await fetch(`${API_BASE}/calendar/ms365/connection-status`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get connection status');
  }
  return response.json();
}

/**
 * Connect to MS365 (initiate OAuth flow)
 */
export async function connectMs365(): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/ms365/authorize`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to start authorization' }));
    throw new Error(error.error || 'Failed to start MS365 authorization');
  }
  const data = await response.json();
  // Redirect to authorization URL
  window.location.href = data.authorizationUrl;
  return data.authorizationUrl;
}

/**
 * Disconnect from MS365
 */
export async function disconnectMs365(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/ms365/disconnect`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to disconnect' }));
    throw new Error(error.error || 'Failed to disconnect from MS365');
  }
}

/**
 * Sync calendar from MS365 (pull)
 */
export async function syncCalendarFromMs365(
  startDate?: string,
  endDate?: string
): Promise<CalendarSyncResult> {
  const response = await fetch(`${API_BASE}/calendar/sync/from-ms365`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ startDate, endDate }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(error.error || 'Failed to sync from MS365');
  }
  return response.json();
}

/**
 * Sync calendar to MS365 (push)
 */
export async function syncCalendarToMs365(
  appointmentIds?: string[],
  startDate?: string,
  endDate?: string
): Promise<CalendarSyncResult> {
  const response = await fetch(`${API_BASE}/calendar/sync/to-ms365`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ appointmentIds, startDate, endDate }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(error.error || 'Failed to sync to MS365');
  }
  return response.json();
}

/**
 * Full bidirectional calendar sync
 */
export async function syncCalendarFull(
  startDate?: string,
  endDate?: string
): Promise<CalendarSyncResult> {
  const response = await fetch(`${API_BASE}/calendar/sync/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ startDate, endDate }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(error.error || 'Failed to perform full sync');
  }
  return response.json();
}

/**
 * Get calendar sync status
 */
export async function getCalendarSyncStatus(): Promise<CalendarSyncStatus> {
  const response = await fetch(`${API_BASE}/calendar/sync/status`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get sync status');
  }
  return response.json();
}

// ============================================
// CALENDAR CACHE API (Offline Access & History)
// ============================================

/**
 * Cached calendar event from local storage
 */
export interface CachedCalendarEvent {
  id: string;
  userId: string;
  organizationId: string;
  ms365EventId: string;
  ms365CalendarId: string | null;
  subject: string;
  bodyPreview: string | null;
  location: string | null;
  startDatetime: string;
  endDatetime: string;
  isAllDay: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  attendees: any[];
  sensitivity: string;
  showAs: string;
  importance: string;
  isCancelled: boolean;
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  categories: string[];
  localAppointmentId: string | null;
  lastSyncedAt: string;
  ms365LastModified: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calendar cache statistics
 */
export interface CalendarCacheStats {
  totalEvents: number;
  linkedToAppointments: number;
  lastCacheUpdate: string | null;
  oldestEvent: string | null;
  newestEvent: string | null;
}

/**
 * Get cached calendar events for a date range (works offline)
 */
export async function getCachedCalendarEvents(
  startDate?: string,
  endDate?: string
): Promise<{ events: CachedCalendarEvent[]; fromCache: boolean }> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const response = await fetch(`${API_BASE}/calendar/cache/events?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get cached calendar events');
  }
  const result = await response.json();
  return result.data || result;
}

/**
 * Get calendar history (all cached events, paginated)
 */
export async function getCalendarHistory(
  limit: number = 100,
  offset: number = 0
): Promise<{ events: CachedCalendarEvent[]; total: number; limit: number; offset: number; fromCache: boolean }> {
  const params = new URLSearchParams();
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  const response = await fetch(`${API_BASE}/calendar/cache/history?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get calendar history');
  }
  const result = await response.json();
  return result.data || result;
}

/**
 * Get cache statistics
 */
export async function getCalendarCacheStats(): Promise<CalendarCacheStats> {
  const response = await fetch(`${API_BASE}/calendar/cache/stats`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to get cache statistics');
  }
  const result = await response.json();
  return result.data || result;
}

/**
 * Cleanup old cached events
 */
export async function cleanupOldCachedEvents(
  olderThanDays: number = 180
): Promise<{ deleted: number; message: string }> {
  const response = await fetch(`${API_BASE}/calendar/cache/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ olderThanDays }),
  });
  if (!response.ok) {
    throw new Error('Failed to cleanup old cached events');
  }
  const result = await response.json();
  return result.data || result;
}

// ============================================
// FLOW DEFINITIONS API
// ============================================

/**
 * Flow JSON Evidence Requirement type
 */
export interface FlowJsonEvidenceRequirement {
  type: "photo" | "voice_note" | "measurement";
  description: string;
  is_required: boolean;
  quantity_min: number;
  quantity_max: number;
  validation_rules?: {
    photo?: {
      min_resolution?: string;
      required_content?: string[];
      lighting?: string;
    };
    measurement?: {
      unit?: string;
      min_value?: number;
      max_value?: number;
    };
  };
}

/**
 * Flow JSON Movement type
 */
export interface FlowJsonMovement {
  id: string;
  name: string;
  description: string;
  sequence_order: number;
  is_required: boolean;
  criticality: "high" | "medium" | "low";
  guidance: {
    instruction: string;
    tts_text: string;
    tips: string[];
  };
  evidence_requirements: FlowJsonEvidenceRequirement[];
  estimated_minutes: number;
}

/**
 * Flow JSON Phase type
 */
export interface FlowJsonPhase {
  id: string;
  name: string;
  description: string;
  sequence_order: number;
  movements: FlowJsonMovement[];
}

/**
 * Flow JSON Gate type
 */
export interface FlowJsonGate {
  id: string;
  name: string;
  from_phase: string;
  to_phase: string;
  gate_type: "blocking" | "advisory";
  evaluation_criteria: {
    type: "ai" | "simple";
    ai_prompt_key?: string;
    simple_rules?: {
      condition: string;
      required_movements?: string[];
      required_evidence?: string[];
    };
  };
}

/**
 * Complete Flow JSON structure
 */
export interface FlowJson {
  schema_version: string;
  metadata: {
    name: string;
    description: string;
    estimated_duration_minutes: number;
    primary_peril: string;
    secondary_perils: string[];
  };
  phases: FlowJsonPhase[];
  gates: FlowJsonGate[];
}

/**
 * Flow Definition Summary (for list view)
 */
export interface FlowDefinitionSummary {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  perilType: string;
  propertyType: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  phaseCount: number;
  movementCount: number;
}

/**
 * Full Flow Definition
 */
export interface FlowDefinition {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  perilType: string;
  propertyType: string;
  flowJson: FlowJson;
  version: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Flow Definition Input for create/update
 */
export interface FlowDefinitionInput {
  organizationId?: string | null;
  name: string;
  description?: string;
  perilType: string;
  propertyType: string;
  flowJson: FlowJson;
  isActive?: boolean;
}

/**
 * Validation error type
 */
export interface FlowValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result type
 */
export interface FlowValidationResult {
  isValid: boolean;
  errors: FlowValidationError[];
  warnings: FlowValidationError[];
}

/**
 * Get all flow definitions
 */
export async function getFlowDefinitions(organizationId?: string): Promise<FlowDefinitionSummary[]> {
  const url = new URL(`${API_BASE}/flow-definitions`, window.location.origin);
  if (organizationId) {
    url.searchParams.set('organizationId', organizationId);
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow definitions');
  }
  return response.json();
}

/**
 * Get empty flow template
 */
export async function getFlowTemplate(): Promise<FlowJson> {
  const response = await fetch(`${API_BASE}/flow-definitions/template`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow template');
  }
  return response.json();
}

/**
 * Get a single flow definition
 */
export async function getFlowDefinition(id: string): Promise<FlowDefinition> {
  const response = await fetch(`${API_BASE}/flow-definitions/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow definition');
  }
  return response.json();
}

/**
 * Create a new flow definition
 */
export async function createFlowDefinition(input: FlowDefinitionInput): Promise<FlowDefinition> {
  const response = await fetch(`${API_BASE}/flow-definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create flow definition');
  }
  return response.json();
}

/**
 * Update a flow definition
 */
export async function updateFlowDefinition(
  id: string,
  input: Partial<FlowDefinitionInput>
): Promise<FlowDefinition> {
  const response = await fetch(`${API_BASE}/flow-definitions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update flow definition');
  }
  return response.json();
}

/**
 * Delete a flow definition
 */
export async function deleteFlowDefinition(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/flow-definitions/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete flow definition');
  }
}

/**
 * Duplicate a flow definition
 */
export async function duplicateFlowDefinition(
  id: string,
  newName: string
): Promise<FlowDefinition> {
  const response = await fetch(`${API_BASE}/flow-definitions/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ newName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to duplicate flow definition');
  }
  return response.json();
}

/**
 * Toggle flow definition active status
 */
export async function toggleFlowDefinitionActive(
  id: string
): Promise<{ id: string; isActive: boolean }> {
  const response = await fetch(`${API_BASE}/flow-definitions/${id}/activate`, {
    method: 'PATCH',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to toggle active status');
  }
  return response.json();
}

/**
 * Validate flow JSON
 */
export async function validateFlowJson(flowJson: FlowJson): Promise<FlowValidationResult> {
  const response = await fetch(`${API_BASE}/flow-definitions/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ flowJson }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to validate flow JSON');
  }
  return response.json();
}

// ============================================
// FLOW ENGINE API (Runtime Flow Execution)
// ============================================

/**
 * Flow Instance - A running instance of a flow for a specific claim
 */
export interface FlowInstance {
  id: string;
  claimId: string;
  flowDefinitionId: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  currentPhaseId: string | null;
  currentPhaseIndex: number;
  startedAt: string | null;
  completedAt: string | null;
  flowName?: string;
  flowDescription?: string;
  currentPhaseName?: string;
  currentPhaseDescription?: string;
  completedMovements: string[];
  flow_definitions?: FlowDefinition;
  phases?: FlowPhaseStatus[];
  progress?: FlowProgress;
}

/**
 * Flow Progress summary
 */
export interface FlowProgress {
  total: number;
  completed: number;
  percentComplete: number;
}

/**
 * Flow Phase with completion status
 */
export interface FlowPhaseStatus {
  id: string;
  name: string;
  description: string;
  sequenceOrder: number;
  isCompleted: boolean;
  movementCount: number;
  completedMovementCount: number;
}

/**
 * Flow Movement - A single action within a phase
 */
export interface FlowMovement {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  sequenceOrder: number;
  isRequired: boolean;
  roomSpecific: boolean;
  roomName: string | null;
  validationRequirements: any;
  completionStatus?: 'pending' | 'completed' | 'skipped';
  completedAt?: string | null;
  notes?: string | null;
}

/**
 * Movement Completion record
 */
export interface MovementCompletion {
  id: string;
  flowInstanceId: string;
  movementId: string;
  claimId: string;
  status: 'completed' | 'skipped';
  completedAt: string;
  completedBy: string;
  notes: string | null;
  evidenceData: any;
}

/**
 * Movement Evidence record
 */
export interface MovementEvidence {
  id: string;
  movementId: string;
  flowInstanceId: string;
  type: 'photo' | 'audio' | 'measurement' | 'note';
  referenceId?: string;
  data?: any;
  createdAt: string;
  createdBy: string;
}

/**
 * Next Movement response
 */
export interface NextMovementResponse {
  type: 'movement' | 'gate' | 'complete';
  movement?: FlowMovement;
  gate?: {
    id: string;
    name: string;
    description: string;
    evaluationCriteria: any;
  };
}

/**
 * Gate evaluation result
 */
export interface GateEvaluationResult {
  passed: boolean;
  reason?: string;
  nextPhaseId?: string;
  message: string;
}

/**
 * Flow Timeline event
 */
export interface FlowTimelineEvent {
  id: string;
  type: 'movement_completed' | 'movement_skipped' | 'phase_started' | 'phase_completed' | 'gate_passed' | 'gate_failed';
  timestamp: string;
  movementId?: string;
  movementName?: string;
  phaseId?: string;
  phaseName?: string;
  notes?: string;
}

/**
 * Flow auto-selection preview result
 */
export interface FlowAutoSelectionPreview {
  selectedFlow: {
    id: string;
    name: string;
    description: string | null;
    perilType: string;
  } | null;
  availableFlows: Array<{
    id: string;
    name: string;
    description: string | null;
    perilType: string;
  }>;
  claimPerilType: string | null;
  requiresSelection: boolean;
  message: string;
}

/**
 * Preview which flow would be auto-selected for a claim without starting it
 */
export async function previewFlowSelectionForClaim(
  claimId: string
): Promise<FlowAutoSelectionPreview> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/flows/preview`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to preview flow selection');
  }
  return response.json();
}

/**
 * Start a new flow for a claim
 * If perilType is not provided, auto-selects based on claim's primaryPeril
 */
export async function startFlowForClaim(
  claimId: string,
  perilType?: string
): Promise<{ flowInstanceId: string; message: string; autoSelected?: boolean }> {
  const body: Record<string, string> = {};
  if (perilType) {
    body.perilType = perilType;
  }

  const response = await fetch(`${API_BASE}/claims/${claimId}/flows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to start flow');
  }
  return response.json();
}

/**
 * Get active flow for a claim
 */
export async function getActiveFlowForClaim(claimId: string): Promise<FlowInstance | null> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/flows`, {
    credentials: 'include',
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch active flow');
  }
  return response.json();
}

/**
 * Cancel active flow for a claim
 */
export async function cancelFlowForClaim(claimId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/flows`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to cancel flow');
  }
  return response.json();
}

/**
 * Get flow instance with full details
 */
export async function getFlowInstance(flowInstanceId: string): Promise<FlowInstance> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow instance');
  }
  return response.json();
}

/**
 * Get flow progress summary
 */
export async function getFlowProgress(flowInstanceId: string): Promise<FlowProgress> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/progress`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow progress');
  }
  return response.json();
}

/**
 * Get flow timeline
 */
export async function getFlowTimeline(flowInstanceId: string): Promise<FlowTimelineEvent[]> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/timeline`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow timeline');
  }
  return response.json();
}

/**
 * Get all phases for a flow instance
 */
export async function getFlowPhases(flowInstanceId: string): Promise<FlowPhaseStatus[]> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/phases`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch flow phases');
  }
  return response.json();
}

/**
 * Get movements for a specific phase
 */
export async function getPhaseMovements(
  flowInstanceId: string,
  phaseId: string
): Promise<FlowMovement[]> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/phases/${phaseId}/movements`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch phase movements');
  }
  return response.json();
}

/**
 * Get next movement to complete
 */
export async function getNextMovement(flowInstanceId: string): Promise<NextMovementResponse> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/next`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch next movement');
  }
  return response.json();
}

/**
 * Complete a movement
 */
export async function completeFlowMovement(
  flowInstanceId: string,
  movementId: string,
  data: {
    userId: string;
    notes?: string;
    evidence?: {
      photos?: string[];
      audioObservationId?: string;
      measurements?: Record<string, any>;
    };
  }
): Promise<MovementCompletion> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to complete movement');
  }
  return response.json();
}

/**
 * Skip a movement
 */
export async function skipFlowMovement(
  flowInstanceId: string,
  movementId: string,
  data: {
    userId: string;
    reason: string;
  }
): Promise<MovementCompletion> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to skip movement');
  }
  return response.json();
}

/**
 * Get system status
 */
export async function getSystemStatus(): Promise<{
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  openaiConfigured: boolean;
}> {
  const response = await fetch(`${API_BASE}/system/status`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch system status');
  }
  return response.json();
}

/**
 * Run Home Depot scraper
 */
export async function runHomeDepotScraper(): Promise<{
  jobId: string;
  status: string;
  itemsProcessed: number;
  itemsUpdated: number;
}> {
  const response = await fetch(`${API_BASE}/scrape/home-depot`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to run scraper');
  }
  return response.json();
}

/**
 * Get scraper configuration
 */
export async function getScraperConfig(): Promise<{
  productMappings: Record<string, {
    search: string;
    filters: Record<string, string[]>;
    unit: string;
  }>;
  storeRegions: Record<string, string>;
}> {
  const response = await fetch(`${API_BASE}/scrape/config`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to load scraper configuration');
  }
  return response.json();
}

/**
 * Get scraped prices
 */
export async function getScrapedPrices(): Promise<Array<{
  sku: string;
  material_name: string;
  unit: string;
  region_id: string;
  price: number;
  source: string;
  effective_date: string;
}>> {
  const response = await fetch(`${API_BASE}/scrape/prices`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to load scraped prices');
  }
  return response.json();
}

/**
 * Get scrape job history
 */
export async function getScrapeJobs(): Promise<Array<{
  id: string;
  source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number;
  items_updated: number;
  errors: string | null;
}>> {
  const response = await fetch(`${API_BASE}/scrape/jobs`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to load scrape jobs');
  }
  return response.json();
}

/**
 * Get evidence for a movement
 */
export async function getMovementEvidence(
  flowInstanceId: string,
  movementId: string
): Promise<MovementEvidence[]> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/evidence`, {
    credentials: 'include',
  });
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch movement evidence');
  }
  return response.json();
}

/**
 * Attach evidence to a movement
 */
export async function attachMovementEvidence(
  flowInstanceId: string,
  movementId: string,
  data: {
    type: 'photo' | 'audio' | 'measurement' | 'note';
    referenceId?: string;
    data?: any;
    userId: string;
  }
): Promise<{ evidenceId: string; message: string }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to attach evidence');
  }
  return response.json();
}

/**
 * Get sketch evidence (rooms/zones and damage markers) for a movement
 */
export async function getMovementSketchEvidence(
  flowInstanceId: string,
  movementId: string
): Promise<{ zones: ClaimRoom[]; damageMarkers: ClaimDamageZone[] }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/sketch-evidence`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch sketch evidence');
  }
  return response.json();
}

/**
 * Validate evidence for a movement
 */
export async function validateMovementEvidence(
  flowInstanceId: string,
  movementId: string
): Promise<{ isValid: boolean; missingItems: string[]; qualityIssues: string[] }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements/${movementId}/validate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to validate evidence');
  }
  return response.json();
}

/**
 * Evaluate a gate
 */
export async function evaluateFlowGate(
  flowInstanceId: string,
  gateId: string
): Promise<GateEvaluationResult> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/gates/${gateId}/evaluate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to evaluate gate');
  }
  return response.json();
}

/**
 * Add room-specific movements to a flow
 */
export async function addFlowRoomMovements(
  flowInstanceId: string,
  data: {
    roomName: string;
    roomType?: string;
    movementTemplates?: string[];
  }
): Promise<{ message: string; roomName: string; movementCount: number }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to add room movements');
  }
  return response.json();
}

/**
 * Get AI-suggested movements
 */
export async function getSuggestedMovements(
  flowInstanceId: string,
  context?: Record<string, any>
): Promise<{ suggestions: FlowMovement[] }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ context }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to get suggestions');
  }
  return response.json();
}

/**
 * Insert a custom movement
 */
export async function insertCustomMovement(
  flowInstanceId: string,
  data: {
    phaseId: string;
    name: string;
    description?: string;
    afterMovementId?: string;
  }
): Promise<{ id: string; message: string }> {
  const response = await fetch(`${API_BASE}/flows/${flowInstanceId}/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to insert custom movement');
  }
  return response.json();
}

// ============================================
// VOICE INSPECTION API
// ============================================

export interface VoiceSessionResponse {
  sessionId: string;
  systemContext: string;
  currentMovement: string;
  wsEndpoint: string;
}

export interface VoiceCommandResponse {
  action: string;
  response: string;
  data?: Record<string, any>;
}

/**
 * Start a voice-guided inspection session
 */
export async function startVoiceSession(flowInstanceId: string): Promise<VoiceSessionResponse> {
  const response = await fetch(`${API_BASE}/voice-inspection/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ flowInstanceId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to start voice session');
  }
  return response.json();
}

/**
 * Process a voice command
 */
export async function processVoiceCommand(
  sessionId: string,
  command: string
): Promise<VoiceCommandResponse> {
  const response = await fetch(`${API_BASE}/voice-inspection/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId, command }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to process voice command');
  }
  return response.json();
}

/**
 * End a voice session
 */
export async function endVoiceSession(sessionId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/voice-inspection/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to end voice session');
  }
  return response.json();
}

// ============================================
// PHOTO TAXONOMY API
// ============================================

export interface PhotoCategory {
  id: string;
  prefix: string;
  parentPrefix?: string;
  name: string;
  description?: string;
  minRequired?: number;
  maxAllowed?: number;
  perilTypes?: string[];
  propertyTypes?: string[];
  sortOrder?: number;
  isActive?: boolean;
  children?: PhotoCategory[];
}

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

/**
 * Get all photo categories
 */
export async function getPhotoCategories(options?: {
  peril?: string;
  topLevelOnly?: boolean;
}): Promise<PhotoCategory[]> {
  const params = new URLSearchParams();
  if (options?.peril) params.set('peril', options.peril);
  if (options?.topLevelOnly) params.set('topLevelOnly', 'true');

  const url = `${API_BASE}/photo-categories${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch photo categories');
  }
  return response.json();
}

/**
 * Get a specific category by prefix
 */
export async function getPhotoCategoryByPrefix(prefix: string): Promise<PhotoCategory> {
  const response = await fetch(`${API_BASE}/photo-categories/${prefix}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Category not found');
  }
  return response.json();
}

/**
 * Get child categories for a parent prefix
 */
export async function getChildCategories(parentPrefix: string): Promise<PhotoCategory[]> {
  const response = await fetch(`${API_BASE}/photo-categories/${parentPrefix}/children`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch child categories');
  }
  return response.json();
}

/**
 * Assign taxonomy to a photo
 */
export async function assignPhotoTaxonomy(
  photoId: string,
  prefix: string,
  autoCategorized: boolean = false
): Promise<any> {
  const response = await fetch(`${API_BASE}/photos/${photoId}/taxonomy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prefix, autoCategorized }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to assign taxonomy');
  }
  return response.json();
}

/**
 * Get taxonomy suggestions for a photo
 */
export async function getPhotoTaxonomySuggestions(
  photoId: string,
  perilType?: string
): Promise<{ suggestions: TaxonomySuggestion[] }> {
  const response = await fetch(`${API_BASE}/photos/${photoId}/suggest-taxonomy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ perilType }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to get taxonomy suggestions');
  }
  return response.json();
}

/**
 * Check photo completeness for a claim
 */
export async function checkPhotoCompleteness(
  claimId: string,
  perilType?: string
): Promise<PhotoCompletenessResult> {
  const params = perilType ? `?perilType=${encodeURIComponent(perilType)}` : '';
  const response = await fetch(`${API_BASE}/claims/${claimId}/photo-completeness${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to check photo completeness');
  }
  return response.json();
}

/**
 * Get photos grouped by taxonomy
 */
export async function getPhotosByTaxonomy(
  claimId: string,
  prefix?: string
): Promise<Record<string, number> | any[]> {
  const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
  const response = await fetch(`${API_BASE}/claims/${claimId}/photos/by-taxonomy${params}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch photos by taxonomy');
  }
  return response.json();
}

/**
 * Get uncategorized photos for a claim
 */
export async function getUncategorizedPhotos(claimId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/photos/uncategorized`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch uncategorized photos');
  }
  return response.json();
}
