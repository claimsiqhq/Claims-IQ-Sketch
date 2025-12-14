// API service for line items, estimates, and auth

const API_BASE = '/api';

// ============================================
// AUTH TYPES & API
// ============================================

export interface AuthUser {
  id: string;
  username: string;
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
    const error = await response.json();
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
    const error = await response.json();
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

  const response = await fetch(`${API_BASE}/line-items?${searchParams}`);
  if (!response.ok) {
    throw new Error('Failed to fetch line items');
  }
  return response.json();
}

export async function getCategories(): Promise<Category[]> {
  const response = await fetch(`${API_BASE}/line-items/categories`);
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  return response.json();
}

// ============================================
// REGIONS & CARRIERS API
// ============================================

export async function getRegions(): Promise<Region[]> {
  const response = await fetch(`${API_BASE}/regions`);
  if (!response.ok) {
    throw new Error('Failed to fetch regions');
  }
  return response.json();
}

export async function getCarrierProfiles(): Promise<CarrierProfile[]> {
  const response = await fetch(`${API_BASE}/carrier-profiles`);
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
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create estimate');
  }
  return response.json();
}

export async function getEstimate(id: string): Promise<SavedEstimate> {
  const response = await fetch(`${API_BASE}/estimates/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch estimate');
  }
  return response.json();
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

  const response = await fetch(`${API_BASE}/estimates?${searchParams}`);
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

  const response = await fetch(`${API_BASE}/estimate-templates?${searchParams}`);
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
  policyholder?: string;
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM
  riskLocation?: string; // Full address string
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc.
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  yearRoofInstall?: string; // Format: MM-DD-YYYY
  windHailDeductible?: string; // Format: $X,XXX X%
  dwellingLimit?: string; // Format: $XXX,XXX
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
}): Promise<{ claims: Claim[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.lossType) searchParams.set('loss_type', params.lossType);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

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

export interface Endorsement {
  id: string;
  organization_id: string;
  claim_id?: string;
  form_type: string;
  form_number: string;
  document_title?: string;
  description?: string;
  key_changes?: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Also support camelCase for compatibility
  organizationId?: string;
  claimId?: string;
  formType?: string;
  formNumber?: string;
  documentTitle?: string;
  keyChanges?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export async function getClaimEndorsements(claimId: string): Promise<Endorsement[]> {
  const response = await fetch(`${API_BASE}/claims/${claimId}/endorsements`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch claim endorsements');
  }
  return response.json();
}

export async function createEndorsement(data: {
  claimId?: string;
  formNumber: string;
  documentTitle?: string;
  description?: string;
  keyChanges?: Record<string, any>;
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
