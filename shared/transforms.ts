/**
 * Transform Utilities
 * 
 * Functions to convert between database (snake_case) and API (camelCase) formats.
 * Provides consistent data transformation across the application.
 */

// =================================================
// Case Conversion Utilities
// =================================================

/**
 * Convert snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase string to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Convert all keys in an object from snake_case to camelCase
 */
export function snakeToCamelObject<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => 
      typeof item === 'object' && item !== null 
        ? snakeToCamelObject(item as Record<string, unknown>) 
        : item
    ) as unknown as Record<string, unknown>;
  }

  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);
    
    if (value !== null && typeof value === 'object') {
      result[camelKey] = snakeToCamelObject(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }

  return result;
}

/**
 * Convert all keys in an object from camelCase to snake_case
 */
export function camelToSnakeObject<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => 
      typeof item === 'object' && item !== null 
        ? camelToSnakeObject(item as Record<string, unknown>) 
        : item
    ) as unknown as Record<string, unknown>;
  }

  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    
    if (value !== null && typeof value === 'object') {
      result[snakeKey] = camelToSnakeObject(value as Record<string, unknown>);
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}

// =================================================
// Entity Transformers (DB -> API)
// =================================================

/**
 * Transform database user row to API user
 */
export function transformUser(dbUser: Record<string, unknown>) {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    role: dbUser.role,
    currentOrganizationId: dbUser.current_organization_id,
    preferences: dbUser.preferences || {},
    createdAt: dbUser.created_at,
    updatedAt: dbUser.updated_at,
  };
}

/**
 * Transform database organization row to API organization
 */
export function transformOrganization(dbOrg: Record<string, unknown>) {
  return {
    id: dbOrg.id,
    name: dbOrg.name,
    slug: dbOrg.slug,
    settings: dbOrg.settings || {},
    createdAt: dbOrg.created_at,
    updatedAt: dbOrg.updated_at,
  };
}

/**
 * Transform database claim row to API claim
 */
export function transformClaim(dbClaim: Record<string, unknown>) {
  return {
    id: dbClaim.id,
    organizationId: dbClaim.organization_id,
    claimId: dbClaim.claim_id,
    status: dbClaim.status,
    insuredName: dbClaim.insured_name,
    insuredPhone: dbClaim.insured_phone,
    insuredEmail: dbClaim.insured_email,
    propertyAddress: dbClaim.property_address,
    propertyCity: dbClaim.property_city,
    propertyState: dbClaim.property_state,
    propertyZip: dbClaim.property_zip,
    latitude: dbClaim.latitude,
    longitude: dbClaim.longitude,
    lossDate: dbClaim.loss_date,
    reportedDate: dbClaim.reported_date,
    primaryPeril: dbClaim.primary_peril,
    secondaryPerils: dbClaim.secondary_perils,
    perilConfidence: dbClaim.peril_confidence,
    assignedAdjusterId: dbClaim.assigned_adjuster_id,
    totalRcv: dbClaim.total_rcv,
    totalAcv: dbClaim.total_acv,
    deductible: dbClaim.deductible,
    createdAt: dbClaim.created_at,
    updatedAt: dbClaim.updated_at,
  };
}

/**
 * Transform database document row to API document
 */
export function transformDocument(dbDoc: Record<string, unknown>) {
  return {
    id: dbDoc.id,
    claimId: dbDoc.claim_id,
    organizationId: dbDoc.organization_id,
    filename: dbDoc.filename,
    originalFilename: dbDoc.original_filename,
    mimeType: dbDoc.mime_type,
    sizeBytes: dbDoc.size_bytes,
    storagePath: dbDoc.storage_path,
    documentType: dbDoc.document_type,
    status: dbDoc.status,
    processedAt: dbDoc.processed_at,
    extractedData: dbDoc.extracted_data,
    createdAt: dbDoc.created_at,
    updatedAt: dbDoc.updated_at,
  };
}

/**
 * Transform database estimate row to API estimate
 */
export function transformEstimate(dbEstimate: Record<string, unknown>) {
  return {
    id: dbEstimate.id,
    claimId: dbEstimate.claim_id,
    organizationId: dbEstimate.organization_id,
    status: dbEstimate.status,
    version: dbEstimate.version,
    name: dbEstimate.name,
    description: dbEstimate.description,
    regionCode: dbEstimate.region_code,
    carrierProfileId: dbEstimate.carrier_profile_id,
    totalRcv: dbEstimate.total_rcv,
    totalAcv: dbEstimate.total_acv,
    totalDepreciation: dbEstimate.total_depreciation,
    totalTax: dbEstimate.total_tax,
    totalOAndP: dbEstimate.total_o_and_p,
    grandTotal: dbEstimate.grand_total,
    lineItemCount: dbEstimate.line_item_count,
    isLocked: dbEstimate.is_locked,
    submittedAt: dbEstimate.submitted_at,
    submittedBy: dbEstimate.submitted_by,
    createdAt: dbEstimate.created_at,
    updatedAt: dbEstimate.updated_at,
  };
}

/**
 * Transform database line item row to API line item
 */
export function transformLineItem(dbItem: Record<string, unknown>) {
  return {
    id: dbItem.id,
    estimateId: dbItem.estimate_id,
    zoneId: dbItem.zone_id,
    code: dbItem.code,
    description: dbItem.description,
    category: dbItem.category,
    unit: dbItem.unit,
    quantity: dbItem.quantity,
    unitPrice: dbItem.unit_price,
    totalPrice: dbItem.total_price,
    laborCost: dbItem.labor_cost,
    materialCost: dbItem.material_cost,
    equipmentCost: dbItem.equipment_cost,
    depreciationRate: dbItem.depreciation_rate,
    depreciationAmount: dbItem.depreciation_amount,
    rcvAmount: dbItem.rcv_amount,
    acvAmount: dbItem.acv_amount,
    coverageCode: dbItem.coverage_code,
    notes: dbItem.notes,
    sortOrder: dbItem.sort_order,
    createdAt: dbItem.created_at,
    updatedAt: dbItem.updated_at,
  };
}

// =================================================
// Input Transformers (API -> DB)
// =================================================

/**
 * Transform API claim input to database format
 */
export function transformClaimInput(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  
  const mappings: Record<string, string> = {
    organizationId: 'organization_id',
    insuredName: 'insured_name',
    insuredPhone: 'insured_phone',
    insuredEmail: 'insured_email',
    propertyAddress: 'property_address',
    propertyCity: 'property_city',
    propertyState: 'property_state',
    propertyZip: 'property_zip',
    lossDate: 'loss_date',
    reportedDate: 'reported_date',
    primaryPeril: 'primary_peril',
    secondaryPerils: 'secondary_perils',
    assignedAdjusterId: 'assigned_adjuster_id',
  };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[mappings[key] || key] = value;
    }
  }

  return result;
}

/**
 * Transform API estimate input to database format
 */
export function transformEstimateInput(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  
  const mappings: Record<string, string> = {
    claimId: 'claim_id',
    organizationId: 'organization_id',
    regionCode: 'region_code',
    carrierProfileId: 'carrier_profile_id',
  };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[mappings[key] || key] = value;
    }
  }

  return result;
}

// =================================================
// Batch Transformers
// =================================================

/**
 * Transform an array of database rows to API format
 */
export function transformArray<T extends Record<string, unknown>>(
  rows: T[],
  transformer: (row: T) => unknown
): unknown[] {
  return rows.map(transformer);
}

/**
 * Generic batch transform with type safety
 */
export function batchTransform<TInput, TOutput>(
  items: TInput[],
  transformer: (item: TInput) => TOutput
): TOutput[] {
  return items.map(transformer);
}
