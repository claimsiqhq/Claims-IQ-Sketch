/**
 * Shared Types Module
 * 
 * Type definitions shared between client and server.
 * These types are derived from the database schema but formatted for API use.
 * 
 * NAMING CONVENTIONS:
 * - API types use camelCase (e.g., claimId, firstName)
 * - Database columns use snake_case (e.g., claim_id, first_name)
 * - Use the transform utilities to convert between formats
 */

// Re-export schema types
export * from './schema';

// =================================================
// Core Entity Types (API format - camelCase)
// =================================================

/**
 * User profile for API responses
 */
export interface ApiUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  currentOrganizationId: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Organization for API responses
 */
export interface ApiOrganization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Claim for API responses
 */
export interface ApiClaim {
  id: string;
  organizationId: string;
  claimId: string;
  status: string;
  insuredName: string | null;
  insuredPhone: string | null;
  insuredEmail: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
  latitude: number | null;
  longitude: number | null;
  lossDate: string | null;
  reportedDate: string | null;
  primaryPeril: string | null;
  secondaryPerils: string[] | null;
  perilConfidence: number | null;
  assignedAdjusterId: string | null;
  totalRcv: string | null;
  totalAcv: string | null;
  deductible: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Document for API responses
 */
export interface ApiDocument {
  id: string;
  claimId: string;
  organizationId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  documentType: string | null;
  status: string;
  processedAt: string | null;
  extractedData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Estimate for API responses
 */
export interface ApiEstimate {
  id: string;
  claimId: string;
  organizationId: string;
  status: string;
  version: number;
  name: string | null;
  description: string | null;
  regionCode: string | null;
  carrierProfileId: string | null;
  totalRcv: string;
  totalAcv: string;
  totalDepreciation: string;
  totalTax: string;
  totalOAndP: string;
  grandTotal: string;
  lineItemCount: number;
  isLocked: boolean;
  submittedAt: string | null;
  submittedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Line item for API responses
 */
export interface ApiLineItem {
  id: string;
  estimateId: string;
  zoneId: string | null;
  code: string;
  description: string;
  category: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  laborCost: string;
  materialCost: string;
  equipmentCost: string;
  depreciationRate: string;
  depreciationAmount: string;
  rcvAmount: string;
  acvAmount: string;
  coverageCode: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// =================================================
// API Response Types
// =================================================

/**
 * Standard success response wrapper
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

/**
 * Standard error response wrapper
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// =================================================
// Auth Types
// =================================================

export interface LoginRequest {
  username?: string;
  email?: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: ApiUser;
  session?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  user: ApiUser | null;
  organization?: ApiOrganization | null;
}

// =================================================
// Claim Request/Response Types
// =================================================

export interface CreateClaimRequest {
  insuredName?: string;
  insuredPhone?: string;
  insuredEmail?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  lossDate?: string;
  primaryPeril?: string;
}

export interface UpdateClaimRequest {
  status?: string;
  insuredName?: string;
  insuredPhone?: string;
  insuredEmail?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  lossDate?: string;
  primaryPeril?: string;
  assignedAdjusterId?: string;
}

export interface ClaimListFilters {
  status?: string;
  search?: string;
  assignedTo?: string;
  peril?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// =================================================
// Estimate Request/Response Types
// =================================================

export interface CreateEstimateRequest {
  claimId: string;
  name?: string;
  description?: string;
  regionCode?: string;
  carrierProfileId?: string;
}

export interface AddLineItemRequest {
  code: string;
  quantity: number;
  zoneId?: string;
  notes?: string;
}

export interface EstimateCalculationResult {
  totalRcv: number;
  totalAcv: number;
  totalDepreciation: number;
  totalTax: number;
  totalOAndP: number;
  grandTotal: number;
  lineItems: Array<{
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    rcv: number;
    acv: number;
    depreciation: number;
  }>;
}

// =================================================
// Peril Types
// =================================================

/**
 * Canonical peril values used across the system
 */
export type PerilType =
  | 'water'
  | 'fire'
  | 'wind'
  | 'hail'
  | 'lightning'
  | 'theft'
  | 'vandalism'
  | 'collapse'
  | 'smoke'
  | 'vehicle_impact'
  | 'falling_objects'
  | 'ice_snow'
  | 'volcanic'
  | 'sinkhole'
  | 'earth_movement'
  | 'flood'
  | 'mold'
  | 'other';

/**
 * Claim severity levels
 */
export type ClaimSeverity = 'minor' | 'moderate' | 'severe' | 'catastrophic';

/**
 * Claim status values
 */
export type ClaimStatus =
  | 'new'
  | 'in_progress'
  | 'pending_documents'
  | 'pending_inspection'
  | 'estimate_in_progress'
  | 'estimate_complete'
  | 'submitted'
  | 'approved'
  | 'closed'
  | 'cancelled';

// =================================================
// Utility Types
// =================================================

/**
 * Make all properties optional except specified ones
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Make specific properties required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Omit null from type
 */
export type NonNullable<T> = T extends null | undefined ? never : T;
