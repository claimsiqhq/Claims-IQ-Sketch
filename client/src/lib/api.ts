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
    throw new Error(error.error || 'Login failed');
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
  const response = await fetch(`${API_BASE}/auth/me`, {
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
    throw new Error(error.error || 'Failed to update profile');
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

export interface Claim {
  id: string;
  organizationId: string;
  claimId: string; // Format: XX-XXX-XXXXXX
  claimNumber?: string; // Display claim number
  policyholder?: string;
  insuredName?: string; // Alternative name field
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
  yearRoofInstall?: string; // Format: MM-DD-YYYY
  windHailDeductible?: string; // Format: $X,XXX X%
  dwellingLimit?: string; // Format: $XXX,XXX
  coverageA?: string;
  coverageB?: string;
  coverageC?: string;
  coverageD?: string;
  deductible?: string;
  endorsementsListed?: string[];
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
}

export interface ClaimStats {
  total: number;
  byStatus: Record<string, number>;
  byLossType: Record<string, number>;
  totalRcv: number;
  totalAcv: number;
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
  damageZones: ClaimDamageZone[]
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
    body: JSON.stringify({ rooms: roomsWithZones }),
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

// ============================================
// ENDORSEMENTS API
// ============================================

export interface KeyAmendment {
  provisionAmended: string;
  summaryOfChange: string;
  newLimitOrValue: string | null;
}

export interface EndorsementKeyChanges {
  keyAmendments?: KeyAmendment[];
  [key: string]: any;
}

export interface Endorsement {
  id: string;
  organization_id: string;
  claim_id?: string;
  form_type: string;
  form_number: string;
  document_title?: string;
  description?: string;
  applies_to_state?: string;
  key_changes?: EndorsementKeyChanges;
  created_at: string;
  updated_at: string;
  // Also support camelCase for compatibility
  organizationId?: string;
  claimId?: string;
  formType?: string;
  formNumber?: string;
  documentTitle?: string;
  appliesToState?: string;
  keyChanges?: EndorsementKeyChanges;
  createdAt?: string;
  updatedAt?: string;
}

export async function createEndorsement(data: {
  claimId?: string;
  formNumber: string;
  documentTitle?: string;
  description?: string;
  appliesToState?: string;
  keyChanges?: EndorsementKeyChanges;
}): Promise<Endorsement> {
  const response = await fetch(`${API_BASE}/endorsements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create endorsement');
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
// INSPECTION WORKFLOW API
// ============================================

export type InspectionPhase = 'pre_inspection' | 'initial_walkthrough' | 'exterior' | 'interior' | 'documentation' | 'wrap_up';
export type InspectionStepType = 'photo' | 'measurement' | 'checklist' | 'observation' | 'documentation' | 'safety_check' | 'equipment' | 'interview';
export type InspectionStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
export type InspectionWorkflowStatus = 'draft' | 'active' | 'completed' | 'archived';
export type WorkflowAssetType = 'photo' | 'video' | 'measurement' | 'document' | 'signature' | 'audio_note';
export type WorkflowAssetStatus = 'pending' | 'captured' | 'approved' | 'rejected';

export interface InspectionWorkflowAsset {
  id: string;
  stepId: string;
  assetType: WorkflowAssetType;
  label: string;
  description?: string;
  required: boolean;
  metadata: Record<string, unknown>;
  fileId?: string;
  filePath?: string;
  fileUrl?: string;
  status: WorkflowAssetStatus;
  capturedBy?: string;
  capturedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionWorkflowStep {
  id: string;
  workflowId: string;
  stepIndex: number;
  phase: InspectionPhase;
  stepType: InspectionStepType;
  title: string;
  instructions?: string;
  required: boolean;
  tags: string[];
  dependencies: string[];
  estimatedMinutes: number;
  actualMinutes?: number;
  status: InspectionStepStatus;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  roomId?: string;
  roomName?: string;
  perilSpecific?: string;
  createdAt: string;
  updatedAt: string;
  assets?: InspectionWorkflowAsset[];
}

export interface InspectionWorkflowRoom {
  id: string;
  workflowId: string;
  name: string;
  level?: string;
  roomType?: string;
  lengthFt?: string;
  widthFt?: string;
  heightFt?: string;
  notes?: string;
  claimRoomId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionWorkflowJson {
  metadata: {
    claim_number: string;
    primary_peril: string;
    secondary_perils: string[];
    property_type?: string;
    estimated_total_time_minutes: number;
    generated_at: string;
  };
  phases: {
    phase: InspectionPhase;
    title: string;
    description: string;
    estimated_minutes: number;
    step_count: number;
  }[];
  room_template?: {
    standard_steps: {
      step_type: InspectionStepType;
      title: string;
      instructions: string;
      required: boolean;
      estimated_minutes: number;
    }[];
    peril_specific_steps?: Record<string, {
      step_type: InspectionStepType;
      title: string;
      instructions: string;
      required: boolean;
      estimated_minutes: number;
    }[]>;
  };
  tools_and_equipment: {
    category: string;
    items: {
      name: string;
      required: boolean;
      purpose: string;
    }[];
  }[];
  open_questions?: {
    question: string;
    context: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}

export interface InspectionWorkflow {
  id: string;
  organizationId: string;
  claimId: string;
  version: number;
  status: InspectionWorkflowStatus;
  primaryPeril?: string;
  secondaryPerils: string[];
  sourceBriefingId?: string;
  workflowJson: InspectionWorkflowJson;
  generatedFrom: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface FullWorkflow {
  workflow: InspectionWorkflow;
  steps: (InspectionWorkflowStep & { assets: InspectionWorkflowAsset[] })[];
  rooms: InspectionWorkflowRoom[];
  stats: {
    totalSteps: number;
    completedSteps: number;
    pendingSteps: number;
    requiredAssets: number;
    capturedAssets: number;
    estimatedMinutes: number;
    actualMinutes: number;
  };
}

export interface GenerateWorkflowResponse {
  workflow: InspectionWorkflow;
  workflowId: string;
  version: number;
  model?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Wizard context for interactive workflow generation
export interface WizardContext {
  propertyInfo?: {
    propertyType: string;
    stories: number;
    hasBasement: boolean;
    hasAttic: boolean;
    hasGarage: boolean;
    hasPool: boolean;
    hasOutbuildings: boolean;
    roofType: string;
    sidingType: string;
  };
  affectedAreas?: {
    roof: boolean;
    roofDetails?: string;
    exteriorNorth: boolean;
    exteriorSouth: boolean;
    exteriorEast: boolean;
    exteriorWest: boolean;
    exteriorDetails?: string;
    interior: boolean;
    basement: boolean;
    attic: boolean;
    garage: boolean;
    otherStructures: boolean;
    otherStructuresDetails?: string;
    landscaping: boolean;
  };
  rooms?: Array<{
    name: string;
    level: string;
    hasDamage: boolean;
    damageType?: string;
  }>;
  safetyInfo?: {
    activeLeaks: boolean;
    standingWater: boolean;
    electricalHazard: boolean;
    structuralConcern: boolean;
    moldVisible: boolean;
    gasSmell: boolean;
    animalsConcern: boolean;
    accessIssues: boolean;
    safetyNotes?: string;
    powerStatus: string;
    waterStatus: string;
  };
  homeownerInput?: {
    primaryConcern?: string;
    previousDamage: boolean;
    previousDamageDetails?: string;
    temporaryRepairs: boolean;
    temporaryRepairsDetails?: string;
    contentsDamage: boolean;
    additionalNotes?: string;
  };
}

export async function generateInspectionWorkflow(
  claimId: string,
  forceRegenerate: boolean = false,
  wizardContext?: WizardContext
): Promise<GenerateWorkflowResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/workflow/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ forceRegenerate, wizardContext }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate workflow' }));
    throw new Error(error.error || 'Failed to generate workflow');
  }
  return response.json();
}

export async function getClaimWorkflow(claimId: string): Promise<FullWorkflow | null> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/workflow`, { credentials: 'include' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error('Failed to fetch workflow');
  }
  return response.json();
}

export async function getWorkflowStatus(claimId: string): Promise<{ shouldRegenerate: boolean; reason?: string }> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/workflow/status`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to fetch workflow status');
  }
  return response.json();
}

export async function regenerateWorkflow(
  claimId: string,
  reason: string
): Promise<GenerateWorkflowResponse> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/workflow/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to regenerate workflow' }));
    throw new Error(error.error || 'Failed to regenerate workflow');
  }
  return response.json();
}

export async function getWorkflow(workflowId: string): Promise<FullWorkflow> {
  const response = await fetch(`${API_BASE}/workflow/${workflowId}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to fetch workflow');
  }
  return response.json();
}

export async function updateWorkflowStep(
  workflowId: string,
  stepId: string,
  updates: { status?: InspectionStepStatus; notes?: string; actualMinutes?: number }
): Promise<{ step: InspectionWorkflowStep }> {
  const response = await fetch(`${API_BASE}/workflow/${workflowId}/steps/${stepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update step' }));
    throw new Error(error.error || 'Failed to update step');
  }
  return response.json();
}

export async function addWorkflowStep(
  workflowId: string,
  step: {
    phase: InspectionPhase;
    stepType: InspectionStepType;
    title: string;
    instructions?: string;
    required?: boolean;
    estimatedMinutes?: number;
    roomId?: string;
    roomName?: string;
  }
): Promise<{ step: InspectionWorkflowStep }> {
  const response = await fetch(`${API_BASE}/workflow/${workflowId}/steps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(step),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to add step' }));
    throw new Error(error.error || 'Failed to add step');
  }
  return response.json();
}

export async function addWorkflowRoom(
  workflowId: string,
  room: { name: string; level?: string; roomType?: string; notes?: string }
): Promise<{ room: InspectionWorkflowRoom }> {
  const response = await fetch(`${API_BASE}/workflow/${workflowId}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to add room' }));
    throw new Error(error.error || 'Failed to add room');
  }
  return response.json();
}

export async function expandWorkflowRooms(
  workflowId: string,
  roomNames: string[]
): Promise<{ success: boolean; addedSteps: number }> {
  const response = await fetch(`${API_BASE}/workflow/${workflowId}/expand-rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNames }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to expand rooms' }));
    throw new Error(error.error || 'Failed to expand rooms');
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
