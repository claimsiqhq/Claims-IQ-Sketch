import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, boolean, timestamp, jsonb, uuid, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// ORGANIZATIONS (TENANTS) TABLE
// ============================================

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull().default("carrier"), // carrier, tpa, contractor, adjuster_firm

  // Contact info
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),

  // Settings
  settings: jsonb("settings").default(sql`'{}'::jsonb`),

  // Subscription/status
  status: varchar("status", { length: 30 }).notNull().default("active"), // active, suspended, trial

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// ============================================
// USERS TABLE
// ============================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: varchar("email", { length: 255 }),
  password: text("password").notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 30 }).notNull().default("user"), // super_admin, org_admin, adjuster, viewer

  // Current active organization (for users with multiple org memberships)
  currentOrganizationId: uuid("current_organization_id"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================
// ORGANIZATION MEMBERSHIPS TABLE
// ============================================

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  role: varchar("role", { length: 30 }).notNull().default("member"), // owner, admin, adjuster, viewer

  // Status
  status: varchar("status", { length: 30 }).notNull().default("active"), // active, invited, suspended

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  userOrgIdx: index("org_membership_user_org_idx").on(table.userId, table.organizationId),
}));

export type OrganizationMembership = typeof organizationMemberships.$inferSelect;

// ============================================
// CLAIMS TABLE
// ============================================

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),

  // Claim identifiers
  claimNumber: varchar("claim_number", { length: 50 }).notNull(),
  policyNumber: varchar("policy_number", { length: 50 }),

  // Insured info
  insuredName: varchar("insured_name", { length: 255 }),
  insuredEmail: varchar("insured_email", { length: 255 }),
  insuredPhone: varchar("insured_phone", { length: 50 }),

  // Property address
  propertyAddress: text("property_address"),
  propertyCity: varchar("property_city", { length: 100 }),
  propertyState: varchar("property_state", { length: 50 }),
  propertyZip: varchar("property_zip", { length: 20 }),

  // Loss details
  dateOfLoss: date("date_of_loss"),
  lossType: varchar("loss_type", { length: 50 }), // Water, Fire, Wind/Hail, Impact, Other
  lossDescription: text("loss_description"),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("fnol"), // fnol, open, in_progress, review, approved, closed

  // Assignment
  assignedAdjusterId: varchar("assigned_adjuster_id"),

  // Coverage
  coverageA: decimal("coverage_a", { precision: 12, scale: 2 }),
  coverageB: decimal("coverage_b", { precision: 12, scale: 2 }),
  coverageC: decimal("coverage_c", { precision: 12, scale: 2 }),
  coverageD: decimal("coverage_d", { precision: 12, scale: 2 }),
  deductible: decimal("deductible", { precision: 12, scale: 2 }),

  // Totals (calculated from estimates)
  totalRcv: decimal("total_rcv", { precision: 12, scale: 2 }).default("0"),
  totalAcv: decimal("total_acv", { precision: 12, scale: 2 }).default("0"),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0"),

  // Metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  orgIdx: index("claims_org_idx").on(table.organizationId),
  claimNumberIdx: index("claims_claim_number_idx").on(table.claimNumber),
  statusIdx: index("claims_status_idx").on(table.status),
}));

export const insertClaimSchema = createInsertSchema(claims).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
});

export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// ============================================
// DOCUMENTS TABLE
// ============================================

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id"),

  // Document info
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // fnol, policy, endorsement, photo, estimate, correspondence
  category: varchar("category", { length: 50 }), // declarations, endorsements, schedule, photos, reports

  // File info
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  storagePath: varchar("storage_path", { length: 500 }).notNull(),

  // Extracted data (from AI processing)
  extractedData: jsonb("extracted_data").default(sql`'{}'::jsonb`),
  processingStatus: varchar("processing_status", { length: 30 }).default("pending"), // pending, processing, completed, failed

  // Metadata
  description: text("description"),
  tags: jsonb("tags").default(sql`'[]'::jsonb`),

  // Upload tracking
  uploadedBy: varchar("uploaded_by"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("documents_org_idx").on(table.organizationId),
  claimIdx: index("documents_claim_idx").on(table.claimId),
  typeIdx: index("documents_type_idx").on(table.type),
}));

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ============================================
// ESTIMATES TABLE
// ============================================

export const estimates = pgTable("estimates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id"), // Tenant isolation
  claimId: varchar("claim_id", { length: 100 }),
  claimNumber: varchar("claim_number", { length: 50 }),
  propertyAddress: text("property_address"),

  // Status tracking
  status: varchar("status", { length: 30 }).default("draft"),
  version: integer("version").default(1),

  // Totals
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  overheadAmount: decimal("overhead_amount", { precision: 12, scale: 2 }).default("0"),
  overheadPct: decimal("overhead_pct", { precision: 5, scale: 2 }).default("10.00"),
  profitAmount: decimal("profit_amount", { precision: 12, scale: 2 }).default("0"),
  profitPct: decimal("profit_pct", { precision: 5, scale: 2 }).default("10.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  taxPct: decimal("tax_pct", { precision: 6, scale: 4 }).default("0"),
  grandTotal: decimal("grand_total", { precision: 12, scale: 2 }).default("0"),

  // Regional and carrier info
  regionId: varchar("region_id", { length: 30 }).default("US-NATIONAL"),
  carrierProfileId: uuid("carrier_profile_id"),

  // Metadata
  createdBy: varchar("created_by", { length: 100 }),
  approvedBy: varchar("approved_by", { length: 100 }),
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
  submittedAt: timestamp("submitted_at"),
}, (table) => ({
  orgIdx: index("estimates_org_idx").on(table.organizationId),
}));

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimates.$inferSelect;

// ============================================
// ESTIMATE LINE ITEMS TABLE
// ============================================

export const estimateLineItems = pgTable("estimate_line_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),

  // Line item reference
  lineItemId: uuid("line_item_id"),
  lineItemCode: varchar("line_item_code", { length: 50 }).notNull(),
  lineItemDescription: text("line_item_description").notNull(),
  categoryId: varchar("category_id", { length: 20 }),

  // Quantities
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 10 }).notNull(),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }).notNull(),
  materialCost: decimal("material_cost", { precision: 12, scale: 2 }).default("0"),
  laborCost: decimal("labor_cost", { precision: 12, scale: 2 }).default("0"),
  equipmentCost: decimal("equipment_cost", { precision: 12, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),

  // Source info
  source: varchar("source", { length: 30 }).default("manual"),

  // Damage zone reference
  damageZoneId: uuid("damage_zone_id"),
  roomName: varchar("room_name", { length: 100 }),

  // Notes and metadata
  notes: text("notes"),
  isApproved: boolean("is_approved").default(true),
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertEstimateLineItemSchema = createInsertSchema(estimateLineItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimateLineItem = z.infer<typeof insertEstimateLineItemSchema>;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;

// ============================================
// DAMAGE ZONES TABLE
// ============================================

export const damageZones = pgTable("damage_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  roomType: varchar("room_type", { length: 50 }),
  floorLevel: varchar("floor_level", { length: 20 }),

  // Dimensions
  lengthFt: decimal("length_ft", { precision: 8, scale: 2 }),
  widthFt: decimal("width_ft", { precision: 8, scale: 2 }),
  heightFt: decimal("height_ft", { precision: 8, scale: 2 }).default("8.0"),
  squareFootage: decimal("square_footage", { precision: 10, scale: 2 }),

  // Damage info
  damageType: varchar("damage_type", { length: 50 }),
  damageSeverity: varchar("damage_severity", { length: 20 }),
  waterCategory: integer("water_category"),
  waterClass: integer("water_class"),

  // Affected surfaces
  affectedSurfaces: jsonb("affected_surfaces").default(sql`'[]'::jsonb`),

  // Notes
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertDamageZoneSchema = createInsertSchema(damageZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDamageZone = z.infer<typeof insertDamageZoneSchema>;
export type DamageZone = typeof damageZones.$inferSelect;

// ============================================
// ESTIMATE TEMPLATES TABLE
// ============================================

export const estimateTemplates = pgTable("estimate_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  damageType: varchar("damage_type", { length: 50 }).notNull(),

  // Template line items stored as JSON
  templateItems: jsonb("template_items").default(sql`'[]'::jsonb`),

  // Usage tracking
  usageCount: integer("usage_count").default(0),

  // Ownership
  isPublic: boolean("is_public").default(false),
  createdBy: varchar("created_by", { length: 100 }),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertEstimateTemplateSchema = createInsertSchema(estimateTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimateTemplate = z.infer<typeof insertEstimateTemplateSchema>;
export type EstimateTemplate = typeof estimateTemplates.$inferSelect;

// ============================================
// PRICE LISTS TABLE
// ============================================

export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  regionCode: varchar("region_code", { length: 20 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  source: varchar("source", { length: 50 }).default("internal"),
  baseMultiplier: decimal("base_multiplier", { precision: 5, scale: 4 }).default("1.0000"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export type PriceList = typeof priceLists.$inferSelect;

// ============================================
// COVERAGE TYPES TABLE
// ============================================

export const coverageTypes = pgTable("coverage_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  defaultDeductible: decimal("default_deductible", { precision: 10, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

export type CoverageType = typeof coverageTypes.$inferSelect;

// ============================================
// TAX RATES TABLE
// ============================================

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  regionCode: varchar("region_code", { length: 20 }).notNull(),
  taxType: varchar("tax_type", { length: 50 }).notNull(),
  taxName: varchar("tax_name", { length: 100 }).notNull(),
  rate: decimal("rate", { precision: 6, scale: 4 }).notNull(),
  appliesTo: varchar("applies_to", { length: 50 }).default("materials"),
  isActive: boolean("is_active").default(true),
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
});

export type TaxRate = typeof taxRates.$inferSelect;

// ============================================
// DEPRECIATION SCHEDULES TABLE
// ============================================

export const depreciationSchedules = pgTable("depreciation_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryCode: varchar("category_code", { length: 20 }).notNull(),
  itemType: varchar("item_type", { length: 100 }).notNull(),
  usefulLifeYears: integer("useful_life_years").notNull(),
  maxDepreciationPct: decimal("max_depreciation_pct", { precision: 5, scale: 2 }).default("80.00"),
  depreciationMethod: varchar("depreciation_method", { length: 30 }).default("straight_line"),
  conditionAdjustmentGood: decimal("condition_adjustment_good", { precision: 5, scale: 2 }).default("0.85"),
  conditionAdjustmentPoor: decimal("condition_adjustment_poor", { precision: 5, scale: 2 }).default("1.15"),
  isDepreciable: boolean("is_depreciable").default(true),
  notes: text("notes"),
});

export type DepreciationSchedule = typeof depreciationSchedules.$inferSelect;

// ============================================
// REGIONAL MULTIPLIERS TABLE
// ============================================

export const regionalMultipliers = pgTable("regional_multipliers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  regionCode: varchar("region_code", { length: 20 }).notNull().unique(),
  regionName: varchar("region_name", { length: 100 }).notNull(),
  materialMultiplier: decimal("material_multiplier", { precision: 5, scale: 4 }).default("1.0000"),
  laborMultiplier: decimal("labor_multiplier", { precision: 5, scale: 4 }).default("1.0000"),
  equipmentMultiplier: decimal("equipment_multiplier", { precision: 5, scale: 4 }).default("1.0000"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export type RegionalMultiplier = typeof regionalMultipliers.$inferSelect;

// ============================================
// LABOR RATES ENHANCED TABLE
// ============================================

export const laborRatesEnhanced = pgTable("labor_rates_enhanced", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeCode: varchar("trade_code", { length: 20 }).notNull(),
  tradeName: varchar("trade_name", { length: 100 }).notNull(),
  baseHourlyRate: decimal("base_hourly_rate", { precision: 10, scale: 2 }).notNull(),
  overtimeMultiplier: decimal("overtime_multiplier", { precision: 4, scale: 2 }).default("1.50"),
  regionCode: varchar("region_code", { length: 20 }).default("NATIONAL"),
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
  isActive: boolean("is_active").default(true),
});

export type LaborRateEnhanced = typeof laborRatesEnhanced.$inferSelect;

// ============================================
// DAMAGE AREAS TABLE (Spatial Hierarchy)
// ============================================

export const damageAreas = pgTable("damage_areas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  parentAreaId: uuid("parent_area_id"),
  sketchZoneId: uuid("sketch_zone_id"),
  name: varchar("name", { length: 100 }).notNull(),
  areaType: varchar("area_type", { length: 50 }).notNull(),
  measurements: jsonb("measurements").default(sql`'{}'::jsonb`),
  photoIds: jsonb("photo_ids").default(sql`'[]'::jsonb`),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
});

export type DamageArea = typeof damageAreas.$inferSelect;

// ============================================
// ESTIMATE COVERAGE SUMMARY TABLE
// ============================================

export const estimateCoverageSummary = pgTable("estimate_coverage_summary", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  coverageCode: varchar("coverage_code", { length: 10 }).notNull(),

  subtotalRcv: decimal("subtotal_rcv", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  overheadAmount: decimal("overhead_amount", { precision: 12, scale: 2 }).default("0"),
  profitAmount: decimal("profit_amount", { precision: 12, scale: 2 }).default("0"),
  totalRcv: decimal("total_rcv", { precision: 12, scale: 2 }).default("0"),

  recoverableDepreciation: decimal("recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  nonRecoverableDepreciation: decimal("non_recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  totalDepreciation: decimal("total_depreciation", { precision: 12, scale: 2 }).default("0"),

  totalAcv: decimal("total_acv", { precision: 12, scale: 2 }).default("0"),
  deductible: decimal("deductible", { precision: 12, scale: 2 }).default("0"),
  netClaim: decimal("net_claim", { precision: 12, scale: 2 }).default("0"),
});

export type EstimateCoverageSummary = typeof estimateCoverageSummary.$inferSelect;
