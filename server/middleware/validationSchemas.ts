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
