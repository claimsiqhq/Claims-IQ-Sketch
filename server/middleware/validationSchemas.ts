/**
 * Validation Schemas for API Endpoints
 * 
 * Centralized Zod schemas for request validation
 */

import { z } from 'zod';

// ============================================
// ESTIMATE SCHEMAS
// ============================================

export const estimateLineItemInputSchema = z.object({
  lineItemCode: z.string().min(1, 'Line item code is required'),
  quantity: z.number().positive('Quantity must be positive'),
  notes: z.string().optional(),
  roomName: z.string().optional(),
  damageZoneId: z.string().uuid().optional(),
  coverageCode: z.enum(['A', 'B', 'C', 'D']).optional(),
  ageYears: z.number().int().min(0).max(200).optional(),
  condition: z.enum(['Good', 'Average', 'Poor']).optional(),
});

export const estimateCalculationInputSchema = z.object({
  claimId: z.string().uuid().optional(),
  claimNumber: z.string().optional(),
  propertyAddress: z.string().optional(),
  lineItems: z.array(estimateLineItemInputSchema).min(1, 'At least one line item is required'),
  regionId: z.string().optional(),
  carrierProfileId: z.string().uuid().optional(),
  overheadPct: z.number().min(0).max(100).optional(),
  profitPct: z.number().min(0).max(100).optional(),
  deductibles: z.object({
    covA: z.number().min(0).optional(),
    covB: z.number().min(0).optional(),
    covC: z.number().min(0).optional(),
  }).optional(),
  defaultAgeYears: z.number().int().min(0).max(200).optional(),
  defaultCondition: z.enum(['Good', 'Average', 'Poor']).optional(),
});

export const estimateUpdateSchema = z.object({
  claimId: z.string().uuid().optional(),
  propertyAddress: z.string().optional(),
  status: z.enum(['draft', 'in_progress', 'submitted', 'approved', 'rejected']).optional(),
  regionId: z.string().optional(),
  carrierProfileId: z.string().uuid().optional(),
  overheadPct: z.number().min(0).max(100).optional(),
  profitPct: z.number().min(0).max(100).optional(),
}).passthrough(); // Allow additional fields

export const addLineItemToEstimateSchema = z.object({
  lineItemCode: z.string().min(1, 'Line item code is required'),
  quantity: z.number().positive('Quantity must be positive'),
  notes: z.string().optional(),
  roomName: z.string().optional(),
  damageZoneId: z.string().uuid().optional(),
  coverageCode: z.enum(['A', 'B', 'C', 'D']).optional(),
  ageYears: z.number().int().min(0).max(200).optional(),
  condition: z.enum(['Good', 'Average', 'Poor']).optional(),
});

// ============================================
// CLAIM SCHEMAS
// ============================================

export const claimCreateSchema = z.object({
  claimNumber: z.string().min(1, 'Claim number is required'),
  propertyAddress: z.string().min(1, 'Property address is required'),
  city: z.string().optional(),
  state: z.string().length(2, 'State must be 2 characters').optional(),
  zipCode: z.string().optional(),
  primaryPeril: z.string().optional(),
  secondaryPerils: z.array(z.string()).optional(),
  lossDate: z.string().datetime().optional(),
  reportedDate: z.string().datetime().optional(),
  policyNumber: z.string().optional(),
  carrierName: z.string().optional(),
  adjusterName: z.string().optional(),
  adjusterEmail: z.string().email().optional(),
  adjusterPhone: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const claimUpdateSchema = z.object({
  claimNumber: z.string().optional(),
  propertyAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().optional(),
  primaryPeril: z.string().optional(),
  secondaryPerils: z.array(z.string()).optional(),
  lossDate: z.string().datetime().optional(),
  reportedDate: z.string().datetime().optional(),
  policyNumber: z.string().optional(),
  carrierName: z.string().optional(),
  adjusterName: z.string().optional(),
  adjusterEmail: z.string().email().optional(),
  adjusterPhone: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

// ============================================
// AI SCHEMAS
// ============================================

export const aiSuggestEstimateSchema = z.object({
  damageZones: z.array(z.object({
    roomName: z.string().min(1),
    damageType: z.string().min(1),
    description: z.string().optional(),
  })).min(1, 'At least one damage zone is required'),
  regionId: z.string().optional(),
});

export const aiQuickSuggestSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  roomName: z.string().min(1, 'Room name is required'),
  damageType: z.string().min(1, 'Damage type is required'),
  quantity: z.number().positive().optional(),
});

// ============================================
// WORKFLOW SCHEMAS
// ============================================

export const workflowRegenerateSchema = z.object({
  reason: z.string().min(1, 'Reason is required for regeneration'),
});

export const workflowExpandRoomsSchema = z.object({
  roomNames: z.array(z.string().min(1)).min(1, 'At least one room name is required'),
});

export const workflowAddStepSchema = z.object({
  name: z.string().min(1, 'Step name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  required: z.boolean().optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

export const workflowAddRoomSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
  roomType: z.string().optional(),
});

// ============================================
// BRIEFING SCHEMAS
// ============================================

export const briefingGenerateSchema = z.object({
  forceRegenerate: z.boolean().optional(),
});

// ============================================
// AUTH SCHEMAS
// ============================================

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

// ============================================
// DOCUMENT SCHEMAS
// ============================================

export const documentUpdateSchema = z.object({
  claimId: z.string().uuid().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// ============================================
// SKETCH SCHEMAS
// ============================================

export const sketchUpdateSchema = z.object({
  geometry: z.any().optional(),
  rooms: z.array(z.any()).optional(),
  zones: z.array(z.any()).optional(),
}).passthrough();

// ============================================
// ZONE/ROOM SCHEMAS
// ============================================

export const addLineItemToZoneSchema = z.object({
  lineItemCode: z.string().min(1, 'Line item code is required'),
  quantity: z.number().positive('Quantity must be positive'),
  calcRef: z.string().optional(),
  notes: z.string().optional(),
  isHomeowner: z.boolean().optional(),
  isCredit: z.boolean().optional(),
  isNonOp: z.boolean().optional(),
});

export const updateLineItemSchema = z.object({
  quantity: z.number().positive().optional(),
  notes: z.string().optional(),
  isHomeowner: z.boolean().optional(),
  isCredit: z.boolean().optional(),
  isNonOp: z.boolean().optional(),
  depreciationPct: z.number().min(0).max(100).optional(),
  depreciationAmount: z.number().min(0).optional(),
  ageYears: z.number().int().min(0).max(200).optional(),
  lifeExpectancyYears: z.number().int().min(0).optional(),
  isRecoverable: z.boolean().optional(),
  calcRef: z.string().optional(),
}).passthrough();

// ============================================
// CHECKLIST SCHEMAS
// ============================================

export const checklistItemUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'blocked', 'na']).optional(),
  notes: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

export const checklistItemCreateSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const checklistGenerateSchema = z.object({
  peril: z.string().optional(),
  severity: z.string().optional(),
});

// ============================================
// ORGANIZATION SCHEMAS
// ============================================

export const organizationCreateSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  slug: z.string().min(1, 'Slug is required'),
  type: z.enum(['carrier', 'tpa', 'contractor', 'adjuster_firm']).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
}).passthrough();

export const organizationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
}).passthrough();

export const organizationSwitchSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
});

export const organizationAddMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.enum(['owner', 'admin', 'adjuster', 'viewer', 'member']).optional(),
});

// ============================================
// DOCUMENT SCHEMAS
// ============================================

export const documentProcessSchema = z.object({
  forceReprocess: z.boolean().optional(),
});

export const documentClaimAssociationSchema = z.object({
  claimId: z.string().uuid('Invalid claim ID'),
});

export const createClaimFromDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid('Invalid document ID')).min(1, 'At least one document ID is required'),
  overrides: z.record(z.unknown()).optional(),
});

// ============================================
// PROMPT SCHEMAS
// ============================================

export const promptUpdateSchema = z.object({
  template: z.string().optional(),
  config: z.record(z.unknown()).optional(),
}).passthrough();

// ============================================
// SKETCH SCHEMAS
// ============================================

export const sketchFloorplanDataSchema = z.object({
  rooms: z.array(z.object({
    name: z.string().min(1),
    shape: z.string().optional(),
    dimensions: z.record(z.unknown()).optional(),
  })).min(1, 'At least one room is required'),
  connections: z.array(z.any()).optional(),
}).passthrough();

export const sketchRoomSchema = z.object({
  estimateId: z.string().uuid('Invalid estimate ID'),
  name: z.string().min(1, 'Room name is required'),
  shape: z.string().optional(),
  dimensions: z.record(z.unknown()).optional(),
}).passthrough();

export const sketchOpeningSchema = z.object({
  type: z.string().min(1, 'Opening type is required'),
  wall: z.string().min(1, 'Wall is required'),
  position: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
}).passthrough();

export const sketchMissingWallSchema = z.object({
  wallIndex: z.number().int().min(0),
  length: z.number().positive().optional(),
}).passthrough();

// ============================================
// HIERARCHY SCHEMAS
// ============================================

export const structureCreateSchema = z.object({
  estimateId: z.string().uuid('Invalid estimate ID'),
  name: z.string().min(1, 'Structure name is required'),
  structureType: z.string().optional(),
  description: z.string().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  constructionType: z.string().optional(),
  stories: z.number().int().min(1).max(10).optional(),
}).passthrough();

export const structureUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  structureType: z.string().optional(),
  description: z.string().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  constructionType: z.string().optional(),
  stories: z.number().int().min(1).max(10).optional(),
}).passthrough();

export const areaCreateSchema = z.object({
  structureId: z.string().uuid('Invalid structure ID'),
  name: z.string().min(1, 'Area name is required'),
  areaType: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

export const areaUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  areaType: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

export const zoneCreateSchema = z.object({
  areaId: z.string().uuid('Invalid area ID'),
  name: z.string().min(1, 'Zone name is required'),
  zoneType: z.string().optional(),
  description: z.string().optional(),
  dimensions: z.record(z.unknown()).optional(),
}).passthrough();

export const zoneUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  zoneType: z.string().optional(),
  description: z.string().optional(),
  dimensions: z.record(z.unknown()).optional(),
}).passthrough();

export const subroomCreateSchema = z.object({
  zoneId: z.string().uuid('Invalid zone ID'),
  name: z.string().min(1, 'Subroom name is required'),
  dimensions: z.record(z.unknown()).optional(),
}).passthrough();

export const subroomUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  dimensions: z.record(z.unknown()).optional(),
}).passthrough();

export const coverageCreateSchema = z.object({
  estimateId: z.string().uuid('Invalid estimate ID'),
  coverageType: z.string().min(1, 'Coverage type is required'),
  coverageName: z.string().optional(),
  policyLimit: z.number().min(0).optional(),
  deductible: z.number().min(0).optional(),
}).passthrough();

export const lineItemCoverageUpdateSchema = z.object({
  coverageId: z.string().uuid('Invalid coverage ID').nullable(),
});
