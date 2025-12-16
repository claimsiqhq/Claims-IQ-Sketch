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

  // User preferences (estimate defaults, notifications, carrier settings)
  preferences: jsonb("preferences").default(sql`'{}'::jsonb`),

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
// CLAIMS TABLE (FNOL Data)
// ============================================

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  assignedUserId: uuid("assigned_user_id"),

  // Claim identifier (format: XX-XXX-XXXXXX)
  claimNumber: varchar("claim_number", { length: 50 }).notNull(),

  // Carrier/Region
  carrierId: uuid("carrier_id"),
  regionId: varchar("region_id", { length: 50 }),

  // Policyholder info (from FNOL)
  insuredName: varchar("insured_name", { length: 255 }), // "BRAD GILTAS KHRIS GILTAS"
  insuredEmail: varchar("insured_email", { length: 255 }),
  insuredPhone: varchar("insured_phone", { length: 50 }),

  // Property/Risk Location (from FNOL)
  propertyAddress: text("property_address"), // "2215 Bright Spot Loop"
  propertyCity: varchar("property_city", { length: 100 }), // "Castle Rock"
  propertyState: varchar("property_state", { length: 10 }), // "CO"
  propertyZip: varchar("property_zip", { length: 20 }), // "80109-3747"
  propertyLatitude: decimal("property_latitude", { precision: 10, scale: 7 }),
  propertyLongitude: decimal("property_longitude", { precision: 10, scale: 7 }),
  geocodeStatus: varchar("geocode_status", { length: 30 }),
  geocodedAt: timestamp("geocoded_at"),

  // Loss details (from FNOL)
  dateOfLoss: date("date_of_loss"), // Date portion
  lossType: varchar("loss_type", { length: 100 }), // "Hail", "Fire", "Water", "Wind"
  lossDescription: text("loss_description"), // "Hail storm, roofing company says damage..."

  // Policy details (from FNOL)
  policyNumber: varchar("policy_number", { length: 50 }), // "070269410955"
  claimType: varchar("claim_type", { length: 50 }),

  // FNOL Policy fields (new - to be added)
  yearRoofInstall: varchar("year_roof_install", { length: 20 }), // "01-01-2016"
  windHailDeductible: varchar("wind_hail_deductible", { length: 50 }), // "$7,932 1%"
  dwellingLimit: varchar("dwelling_limit", { length: 50 }), // "$793,200"
  endorsementsListed: jsonb("endorsements_listed").default(sql`'[]'::jsonb`), // ["HO 84 28-Hidden Water Coverage", ...]

  // Coverage amounts (numeric for calculations)
  coverageA: decimal("coverage_a", { precision: 12, scale: 2 }),
  coverageB: decimal("coverage_b", { precision: 12, scale: 2 }),
  coverageC: decimal("coverage_c", { precision: 12, scale: 2 }),
  coverageD: decimal("coverage_d", { precision: 12, scale: 2 }),
  deductible: decimal("deductible", { precision: 12, scale: 2 }),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("fnol"), // fnol, open, in_progress, review, approved, closed

  // Assignment
  assignedAdjusterId: varchar("assigned_adjuster_id"),

  // Totals (calculated from estimates)
  totalRcv: decimal("total_rcv", { precision: 12, scale: 2 }).default("0"),
  totalAcv: decimal("total_acv", { precision: 12, scale: 2 }).default("0"),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0"),

  // Pricing snapshot for estimate calculations
  pricingSnapshot: jsonb("pricing_snapshot").default(sql`'{}'::jsonb`),

  // Metadata for additional fields
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
// POLICY FORMS TABLE
// ============================================

export const policyForms = pgTable("policy_forms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id"), // Link to claim

  // Form identification
  formType: varchar("form_type", { length: 50 }).notNull().default("Policy Form"),
  formNumber: varchar("form_number", { length: 50 }).notNull(), // e.g., "HO 80 03 01 14"
  documentTitle: varchar("document_title", { length: 255 }), // e.g., "HOMEOWNERS FORM"
  description: text("description"),

  // Key provisions stored as JSONB for flexibility
  keyProvisions: jsonb("key_provisions").default(sql`'{}'::jsonb`),
  // Structure: {
  //   sections: string[],
  //   loss_settlement_roofing_system_wind_hail: string,
  //   dwelling_unoccupied_exclusion_period: string,
  //   ...other provisions
  // }

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("policy_forms_org_idx").on(table.organizationId),
  claimIdx: index("policy_forms_claim_idx").on(table.claimId),
  formNumberIdx: index("policy_forms_form_number_idx").on(table.formNumber),
}));

export const insertPolicyFormSchema = createInsertSchema(policyForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPolicyForm = z.infer<typeof insertPolicyFormSchema>;
export type PolicyForm = typeof policyForms.$inferSelect;

// ============================================
// ENDORSEMENTS TABLE
// ============================================

export const endorsements = pgTable("endorsements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id"), // Link to claim

  // Endorsement identification
  formType: varchar("form_type", { length: 50 }).notNull().default("Endorsement"),
  formNumber: varchar("form_number", { length: 50 }).notNull(), // e.g., "HO 81 53 12 22"
  documentTitle: varchar("document_title", { length: 255 }), // e.g., "WISCONSIN AMENDATORY ENDORSEMENT"
  description: text("description"),

  // Key changes stored as JSONB for flexibility
  keyChanges: jsonb("key_changes").default(sql`'{}'::jsonb`),
  // Structure: {
  //   actual_cash_value_definition: string,
  //   dwelling_unoccupied_exclusion_period: string,
  //   metal_siding_and_trim_loss_settlement_wind_hail: string,
  //   loss_settlement_wind_hail: string,
  //   roofing_schedule_application: string,
  //   metal_roofing_loss_settlement: string,
  //   ...other changes
  // }

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("endorsements_org_idx").on(table.organizationId),
  claimIdx: index("endorsements_claim_idx").on(table.claimId),
  formNumberIdx: index("endorsements_form_number_idx").on(table.formNumber),
}));

export const insertEndorsementSchema = createInsertSchema(endorsements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEndorsement = z.infer<typeof insertEndorsementSchema>;
export type Endorsement = typeof endorsements.$inferSelect;

// ============================================
// CLAIM ROOMS TABLE (Voice Sketch)
// ============================================

export const claimRooms = pgTable("claim_rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  organizationId: uuid("organization_id").notNull(),

  // Room identification
  name: varchar("name", { length: 100 }).notNull(), // "Living Room", "Kitchen", etc.
  roomType: varchar("room_type", { length: 50 }), // living_room, kitchen, bedroom, bathroom, etc.
  floorLevel: varchar("floor_level", { length: 20 }).default("1"), // 1, 2, basement, attic

  // Shape and dimensions
  shape: varchar("shape", { length: 30 }).notNull().default("rectangular"), // rectangular, l_shaped, t_shaped, custom
  widthFt: decimal("width_ft", { precision: 8, scale: 2 }).notNull(),
  lengthFt: decimal("length_ft", { precision: 8, scale: 2 }).notNull(),
  ceilingHeightFt: decimal("ceiling_height_ft", { precision: 6, scale: 2 }).default("8.0"),

  // Floor plan positioning
  originXFt: decimal("origin_x_ft", { precision: 8, scale: 2 }).default("0"),
  originYFt: decimal("origin_y_ft", { precision: 8, scale: 2 }).default("0"),

  // Polygon coordinates (for complex shapes)
  polygon: jsonb("polygon").default(sql`'[]'::jsonb`), // Array of {x, y} points

  // Shape-specific configurations
  lShapeConfig: jsonb("l_shape_config"), // {main_width, main_length, extension_width, extension_length, extension_position}
  tShapeConfig: jsonb("t_shape_config"), // Similar structure for T-shaped rooms

  // Room contents and features
  openings: jsonb("openings").default(sql`'[]'::jsonb`), // doors, windows with positions
  features: jsonb("features").default(sql`'[]'::jsonb`), // built-ins, fixtures, etc.

  // Notes
  notes: jsonb("notes").default(sql`'[]'::jsonb`), // Array of {text, timestamp}

  // Sort order for display
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_rooms_claim_idx").on(table.claimId),
  orgIdx: index("claim_rooms_org_idx").on(table.organizationId),
}));

export const insertClaimRoomSchema = createInsertSchema(claimRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimRoom = z.infer<typeof insertClaimRoomSchema>;
export type ClaimRoom = typeof claimRooms.$inferSelect;

// ============================================
// CLAIM DAMAGE ZONES TABLE (Voice Sketch)
// ============================================

export const claimDamageZones = pgTable("claim_damage_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  roomId: uuid("room_id"), // Optional link to specific room
  organizationId: uuid("organization_id").notNull(),

  // Damage identification
  damageType: varchar("damage_type", { length: 50 }).notNull(), // water, fire, smoke, mold, wind, hail, impact
  category: varchar("category", { length: 50 }), // For water: category_1, category_2, category_3

  // Affected areas
  affectedWalls: jsonb("affected_walls").default(sql`'[]'::jsonb`), // ["north", "south", "east", "west"]
  floorAffected: boolean("floor_affected").default(false),
  ceilingAffected: boolean("ceiling_affected").default(false),

  // Extent of damage
  extentFt: decimal("extent_ft", { precision: 6, scale: 2 }).default("0"), // How far from wall the damage extends
  severity: varchar("severity", { length: 20 }), // minor, moderate, severe

  // Source information
  source: varchar("source", { length: 255 }), // e.g., "burst pipe under sink"

  // Polygon for precise damage zone boundaries
  polygon: jsonb("polygon").default(sql`'[]'::jsonb`), // Array of {x, y} points
  isFreeform: boolean("is_freeform").default(false), // For irregular damage zones

  // Notes
  notes: text("notes"),

  // Sort order for display
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_damage_zones_claim_idx").on(table.claimId),
  roomIdx: index("claim_damage_zones_room_idx").on(table.roomId),
  orgIdx: index("claim_damage_zones_org_idx").on(table.organizationId),
}));

export const insertClaimDamageZoneSchema = createInsertSchema(claimDamageZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimDamageZone = z.infer<typeof insertClaimDamageZoneSchema>;
export type ClaimDamageZone = typeof claimDamageZones.$inferSelect;

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
  
  // Full text extraction for document search and display
  fullText: text("full_text"),
  pageTexts: jsonb("page_texts").default(sql`'[]'::jsonb`), // Array of text per page

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

  // Locking for finalization
  isLocked: boolean("is_locked").default(false),

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

// ============================================
// ESTIMATE COVERAGES TABLE (Xactimate hierarchy)
// ============================================

export const estimateCoverages = pgTable("estimate_coverages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),

  // Coverage type: 0=Dwelling, 1=Other Structures, 2=Contents
  coverageType: varchar("coverage_type", { length: 1 }).notNull().default("0"),
  coverageName: varchar("coverage_name", { length: 100 }).notNull(),

  // Policy limits
  policyLimit: decimal("policy_limit", { precision: 12, scale: 2 }).default("0"),
  deductible: decimal("deductible", { precision: 12, scale: 2 }).default("0"),

  // Calculated totals
  lineItemTotal: decimal("line_item_total", { precision: 12, scale: 2 }).default("0"),
  taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).default("0"),
  overheadTotal: decimal("overhead_total", { precision: 12, scale: 2 }).default("0"),
  profitTotal: decimal("profit_total", { precision: 12, scale: 2 }).default("0"),
  rcvTotal: decimal("rcv_total", { precision: 12, scale: 2 }).default("0"),
  depreciationTotal: decimal("depreciation_total", { precision: 12, scale: 2 }).default("0"),
  acvTotal: decimal("acv_total", { precision: 12, scale: 2 }).default("0"),
  recoverableDepreciation: decimal("recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  nonRecoverableDepreciation: decimal("non_recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  netClaim: decimal("net_claim", { precision: 12, scale: 2 }).default("0"),

  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("estimate_coverages_estimate_idx").on(table.estimateId),
}));

export type EstimateCoverage = typeof estimateCoverages.$inferSelect;
export type InsertEstimateCoverage = typeof estimateCoverages.$inferInsert;

// ============================================
// ESTIMATE STRUCTURES TABLE
// ============================================

export const estimateStructures = pgTable("estimate_structures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  coverageId: uuid("coverage_id"),

  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  // Link to sketch
  sketchName: varchar("sketch_name", { length: 100 }),
  sketchPage: integer("sketch_page").default(1),

  // Structure metadata
  yearBuilt: integer("year_built"),
  constructionType: varchar("construction_type", { length: 50 }),
  stories: integer("stories").default(1),

  // Calculated totals
  totalSf: decimal("total_sf", { precision: 12, scale: 2 }).default("0"),
  rcvTotal: decimal("rcv_total", { precision: 12, scale: 2 }).default("0"),
  acvTotal: decimal("acv_total", { precision: 12, scale: 2 }).default("0"),

  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("estimate_structures_estimate_idx").on(table.estimateId),
  coverageIdx: index("estimate_structures_coverage_idx").on(table.coverageId),
}));

export type EstimateStructure = typeof estimateStructures.$inferSelect;
export type InsertEstimateStructure = typeof estimateStructures.$inferInsert;

// ============================================
// ESTIMATE AREAS TABLE
// ============================================

export const estimateAreas = pgTable("estimate_areas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  structureId: uuid("structure_id").notNull(),

  name: varchar("name", { length: 100 }).notNull(),
  areaType: varchar("area_type", { length: 50 }).notNull(), // exterior, interior, roofing, specialty

  // Calculated totals
  totalSf: decimal("total_sf", { precision: 12, scale: 2 }).default("0"),
  rcvTotal: decimal("rcv_total", { precision: 12, scale: 2 }).default("0"),
  acvTotal: decimal("acv_total", { precision: 12, scale: 2 }).default("0"),

  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  structureIdx: index("estimate_areas_structure_idx").on(table.structureId),
}));

export type EstimateArea = typeof estimateAreas.$inferSelect;
export type InsertEstimateArea = typeof estimateAreas.$inferInsert;

// ============================================
// ESTIMATE ZONES TABLE (Enhanced)
// ============================================

export const estimateZones = pgTable("estimate_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  areaId: uuid("area_id").notNull(),

  // Zone identification
  name: varchar("name", { length: 100 }).notNull(),
  zoneCode: varchar("zone_code", { length: 20 }),
  zoneType: varchar("zone_type", { length: 20 }).notNull().default("room"), // room, elevation, roof, deck, linear
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, measured, scoped, complete

  // Room type for interior zones
  roomType: varchar("room_type", { length: 50 }),
  floorLevel: varchar("floor_level", { length: 20 }).default("main"),

  // Manual entry dimensions
  lengthFt: decimal("length_ft", { precision: 8, scale: 2 }),
  widthFt: decimal("width_ft", { precision: 8, scale: 2 }),
  heightFt: decimal("height_ft", { precision: 8, scale: 2 }).default("8.0"),
  pitch: varchar("pitch", { length: 10 }),
  pitchMultiplier: decimal("pitch_multiplier", { precision: 6, scale: 4 }).default("1.0"),

  // Calculated dimensions stored as JSONB
  dimensions: jsonb("dimensions").default(sql`'{}'::jsonb`),

  // Room info for Xactimate
  roomInfo: jsonb("room_info").default(sql`'{}'::jsonb`),

  // Sketch polygon data
  sketchPolygon: jsonb("sketch_polygon").default(sql`'null'::jsonb`),

  // Damage info
  damageType: varchar("damage_type", { length: 50 }),
  damageSeverity: varchar("damage_severity", { length: 20 }),
  waterCategory: integer("water_category"),
  waterClass: integer("water_class"),
  affectedSurfaces: jsonb("affected_surfaces").default(sql`'[]'::jsonb`),

  // Photo references
  photoIds: jsonb("photo_ids").default(sql`'[]'::jsonb`),

  // Calculated totals
  lineItemCount: integer("line_item_count").default(0),
  rcvTotal: decimal("rcv_total", { precision: 12, scale: 2 }).default("0"),
  acvTotal: decimal("acv_total", { precision: 12, scale: 2 }).default("0"),

  // Notes
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  areaIdx: index("estimate_zones_area_idx").on(table.areaId),
  statusIdx: index("estimate_zones_status_idx").on(table.status),
  typeIdx: index("estimate_zones_type_idx").on(table.zoneType),
}));

export const insertEstimateZoneSchema = createInsertSchema(estimateZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EstimateZone = typeof estimateZones.$inferSelect;
export type InsertEstimateZone = z.infer<typeof insertEstimateZoneSchema>;

// ============================================
// ESTIMATE MISSING WALLS TABLE
// ============================================

export const estimateMissingWalls = pgTable("estimate_missing_walls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").notNull(),

  name: varchar("name", { length: 100 }),
  openingType: varchar("opening_type", { length: 50 }).notNull().default("door"), // door, window, opening

  // Dimensions
  widthFt: decimal("width_ft", { precision: 6, scale: 2 }).notNull(),
  heightFt: decimal("height_ft", { precision: 6, scale: 2 }).notNull(),
  quantity: integer("quantity").default(1),

  // Where does it go
  goesToFloor: boolean("goes_to_floor").default(true),
  goesToCeiling: boolean("goes_to_ceiling").default(false),
  opensInto: varchar("opens_into", { length: 100 }), // "Exterior" or zone name

  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  zoneIdx: index("missing_walls_zone_idx").on(table.zoneId),
}));

export type EstimateMissingWall = typeof estimateMissingWalls.$inferSelect;
export type InsertEstimateMissingWall = typeof estimateMissingWalls.$inferInsert;

// ============================================
// ESTIMATE SUBROOMS TABLE
// ============================================

export const estimateSubrooms = pgTable("estimate_subrooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").notNull(),

  name: varchar("name", { length: 100 }).notNull(),
  subroomType: varchar("subroom_type", { length: 50 }), // closet, bump_out, bay_window

  // Dimensions
  lengthFt: decimal("length_ft", { precision: 8, scale: 2 }).notNull(),
  widthFt: decimal("width_ft", { precision: 8, scale: 2 }).notNull(),
  heightFt: decimal("height_ft", { precision: 8, scale: 2 }),

  // Calculated dimensions
  dimensions: jsonb("dimensions").default(sql`'{}'::jsonb`),

  // Whether to add or subtract from parent zone
  isAddition: boolean("is_addition").default(true),

  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  zoneIdx: index("subrooms_zone_idx").on(table.zoneId),
}));

export type EstimateSubroom = typeof estimateSubrooms.$inferSelect;
export type InsertEstimateSubroom = typeof estimateSubrooms.$inferInsert;

// ============================================
// ESTIMATE TOTALS TABLE
// ============================================

export const estimateTotals = pgTable("estimate_totals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull().unique(),

  // Line item subtotals
  lineItemTotal: decimal("line_item_total", { precision: 12, scale: 2 }).default("0"),
  materialTotal: decimal("material_total", { precision: 12, scale: 2 }).default("0"),
  laborTotal: decimal("labor_total", { precision: 12, scale: 2 }).default("0"),
  equipmentTotal: decimal("equipment_total", { precision: 12, scale: 2 }).default("0"),

  // Tax
  taxTotal: decimal("tax_total", { precision: 12, scale: 2 }).default("0"),

  // O&P
  opBase: decimal("op_base", { precision: 12, scale: 2 }).default("0"),
  overheadTotal: decimal("overhead_total", { precision: 12, scale: 2 }).default("0"),
  profitTotal: decimal("profit_total", { precision: 12, scale: 2 }).default("0"),

  // RCV/ACV
  rcvTotal: decimal("rcv_total", { precision: 12, scale: 2 }).default("0"),
  depreciationTotal: decimal("depreciation_total", { precision: 12, scale: 2 }).default("0"),
  recoverableDepreciation: decimal("recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  nonRecoverableDepreciation: decimal("non_recoverable_depreciation", { precision: 12, scale: 2 }).default("0"),
  acvTotal: decimal("acv_total", { precision: 12, scale: 2 }).default("0"),

  // Homeowner items
  homeownerTotal: decimal("homeowner_total", { precision: 12, scale: 2 }).default("0"),
  contractorTotal: decimal("contractor_total", { precision: 12, scale: 2 }).default("0"),

  // Net claim
  deductibleTotal: decimal("deductible_total", { precision: 12, scale: 2 }).default("0"),
  netClaim: decimal("net_claim", { precision: 12, scale: 2 }).default("0"),

  // Trade counts for O&P eligibility
  tradeCount: integer("trade_count").default(0),
  qualifiesForOp: boolean("qualifies_for_op").default(false),

  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("estimate_totals_estimate_idx").on(table.estimateId),
}));

export type EstimateTotals = typeof estimateTotals.$inferSelect;

// ============================================
// DIMENSION TYPES (TypeScript)
// ============================================

export interface ZoneDimensions {
  sfFloor?: number;
  syFloor?: number;
  lfFloorPerim?: number;
  sfCeiling?: number;
  lfCeilingPerim?: number;
  sfWalls?: number;
  sfWallsCeiling?: number;
  sfLongWall?: number;
  sfShortWall?: number;
  sfTotal?: number;
  // Roof-specific
  sfSkRoof?: number;
  skRoofSquares?: number;
  lfSkRoofPerim?: number;
  lfSkRoofRidge?: number;
  lfSkRoofEave?: number;
  lfSkRoofRake?: number;
  // Linear-specific
  lfTotal?: number;
  // Deck-specific
  lfRailing?: number;
}

export interface RoomInfo {
  ceilingHeight?: number;
  shape?: string;
  dimString?: string;
  hasVaultedCeiling?: boolean;
  vaultPitch?: string;
}

// ============================================
// WORKFLOW STATUS TYPES
// ============================================

export type EstimateStatus = 'draft' | 'sketching' | 'scoping' | 'pricing' | 'review' | 'approved' | 'exported';
export type ZoneStatus = 'pending' | 'measured' | 'scoped' | 'complete';
export type ZoneType = 'room' | 'elevation' | 'roof' | 'deck' | 'linear' | 'custom';

// ============================================
// CARRIER PROFILES TABLE
// ============================================

export const carrierProfiles = pgTable("carrier_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identification
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),

  // Carrier classification
  carrierType: varchar("carrier_type", { length: 50 }).notNull().default("national"),
  strictnessLevel: varchar("strictness_level", { length: 20 }).notNull().default("standard"),

  // O&P Rules
  opThreshold: decimal("op_threshold", { precision: 12, scale: 2 }).default("2500.00"),
  opTradeMinimum: integer("op_trade_minimum").default(3),
  opPctOverhead: decimal("op_pct_overhead", { precision: 5, scale: 2 }).default("10.00"),
  opPctProfit: decimal("op_pct_profit", { precision: 5, scale: 2 }).default("10.00"),

  // Tax Rules
  taxOnMaterialsOnly: boolean("tax_on_materials_only").default(false),
  taxOnLabor: boolean("tax_on_labor").default(true),
  taxOnEquipment: boolean("tax_on_equipment").default(false),

  // Depreciation Rules
  depreciationMethod: varchar("depreciation_method", { length: 30 }).default("straight_line"),
  maxDepreciationPct: decimal("max_depreciation_pct", { precision: 5, scale: 2 }).default("80.00"),
  defaultDepreciationRecoverable: boolean("default_depreciation_recoverable").default(true),

  // Documentation Requirements
  requiresPhotosAllRooms: boolean("requires_photos_all_rooms").default(false),
  requiresMoistureReadings: boolean("requires_moisture_readings").default(false),
  requiresItemizedInvoice: boolean("requires_itemized_invoice").default(true),

  // Rule Configuration
  ruleConfig: jsonb("rule_config").default(sql`'{}'::jsonb`),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
});

export const insertCarrierProfileSchema = createInsertSchema(carrierProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarrierProfile = z.infer<typeof insertCarrierProfileSchema>;
export type CarrierProfile = typeof carrierProfiles.$inferSelect;

// ============================================
// CARRIER RULES TABLE
// ============================================

export const carrierRules = pgTable("carrier_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierProfileId: uuid("carrier_profile_id").notNull(),

  // Rule identification
  ruleCode: varchar("rule_code", { length: 50 }).notNull(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  ruleType: varchar("rule_type", { length: 50 }).notNull(),

  // What does this rule affect?
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetValue: varchar("target_value", { length: 100 }),

  // Rule conditions
  conditions: jsonb("conditions").default(sql`'{}'::jsonb`),

  // Rule effect
  effectType: varchar("effect_type", { length: 50 }).notNull(),
  effectValue: jsonb("effect_value").notNull(),

  // Rule metadata
  explanationTemplate: text("explanation_template"),
  carrierReference: varchar("carrier_reference", { length: 255 }),
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
  expirationDate: date("expiration_date"),

  // Priority
  priority: integer("priority").default(100),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  profileIdx: index("carrier_rules_profile_idx").on(table.carrierProfileId),
  typeIdx: index("carrier_rules_type_idx").on(table.ruleType),
}));

export const insertCarrierRuleSchema = createInsertSchema(carrierRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarrierRule = z.infer<typeof insertCarrierRuleSchema>;
export type CarrierRule = typeof carrierRules.$inferSelect;

// ============================================
// JURISDICTIONS TABLE
// ============================================

export const jurisdictions = pgTable("jurisdictions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identification
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  stateCode: varchar("state_code", { length: 10 }),
  countryCode: varchar("country_code", { length: 10 }).default("US"),

  // Tax Configuration
  salesTaxRate: decimal("sales_tax_rate", { precision: 6, scale: 4 }).default("0.0000"),
  laborTaxable: boolean("labor_taxable").default(false),
  materialsTaxable: boolean("materials_taxable").default(true),
  equipmentTaxable: boolean("equipment_taxable").default(false),

  // O&P Configuration
  opAllowed: boolean("op_allowed").default(true),
  opThresholdOverride: decimal("op_threshold_override", { precision: 12, scale: 2 }),
  opTradeMinimumOverride: integer("op_trade_minimum_override"),
  opMaxPct: decimal("op_max_pct", { precision: 5, scale: 2 }).default("20.00"),

  // Labor Restrictions
  licensedTradesOnly: boolean("licensed_trades_only").default(false),
  licensedTrades: jsonb("licensed_trades").default(sql`'[]'::jsonb`),
  laborRateMaximum: jsonb("labor_rate_maximum").default(sql`'{}'::jsonb`),

  // Regional Minimums
  minimumCharge: decimal("minimum_charge", { precision: 12, scale: 2 }),
  serviceCallMinimum: decimal("service_call_minimum", { precision: 12, scale: 2 }),

  // Regulatory Constraints
  regulatoryConstraints: jsonb("regulatory_constraints").default(sql`'{}'::jsonb`),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  stateIdx: index("jurisdictions_state_idx").on(table.stateCode),
}));

export const insertJurisdictionSchema = createInsertSchema(jurisdictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJurisdiction = z.infer<typeof insertJurisdictionSchema>;
export type Jurisdiction = typeof jurisdictions.$inferSelect;

// ============================================
// JURISDICTION RULES TABLE
// ============================================

export const jurisdictionRules = pgTable("jurisdiction_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jurisdictionId: uuid("jurisdiction_id").notNull(),

  // Rule identification
  ruleCode: varchar("rule_code", { length: 50 }).notNull(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  ruleType: varchar("rule_type", { length: 50 }).notNull(),

  // What does this rule affect?
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetValue: varchar("target_value", { length: 100 }),

  // Rule conditions
  conditions: jsonb("conditions").default(sql`'{}'::jsonb`),

  // Rule effect
  effectType: varchar("effect_type", { length: 50 }).notNull(),
  effectValue: jsonb("effect_value").notNull(),

  // Rule metadata
  explanationTemplate: text("explanation_template"),
  regulatoryReference: varchar("regulatory_reference", { length: 255 }),
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
  expirationDate: date("expiration_date"),

  // Priority
  priority: integer("priority").default(100),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  jurisdictionIdx: index("jurisdiction_rules_jurisdiction_idx").on(table.jurisdictionId),
  typeIdx: index("jurisdiction_rules_type_idx").on(table.ruleType),
}));

export const insertJurisdictionRuleSchema = createInsertSchema(jurisdictionRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJurisdictionRule = z.infer<typeof insertJurisdictionRuleSchema>;
export type JurisdictionRule = typeof jurisdictionRules.$inferSelect;

// ============================================
// RULE EFFECTS TABLE (Audit Trail)
// ============================================

export const ruleEffects = pgTable("rule_effects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // What was affected
  estimateId: uuid("estimate_id").notNull(),
  estimateLineItemId: uuid("estimate_line_item_id"),
  zoneId: uuid("zone_id"),

  // Rule source
  ruleSource: varchar("rule_source", { length: 20 }).notNull(),
  ruleId: uuid("rule_id"),
  ruleCode: varchar("rule_code", { length: 50 }).notNull(),

  // Effect details
  effectType: varchar("effect_type", { length: 50 }).notNull(),

  // Values
  originalValue: jsonb("original_value"),
  modifiedValue: jsonb("modified_value"),

  // Explanation
  explanationText: text("explanation_text").notNull(),

  // Metadata
  appliedAt: timestamp("applied_at").default(sql`NOW()`),
  appliedBy: varchar("applied_by", { length: 100 }),

  // Override tracking
  isOverride: boolean("is_override").default(false),
  overrideReason: text("override_reason"),
  overrideBy: varchar("override_by", { length: 100 }),
}, (table) => ({
  estimateIdx: index("rule_effects_estimate_idx").on(table.estimateId),
  lineItemIdx: index("rule_effects_line_item_idx").on(table.estimateLineItemId),
  sourceIdx: index("rule_effects_source_idx").on(table.ruleSource),
}));

export const insertRuleEffectSchema = createInsertSchema(ruleEffects).omit({
  id: true,
  appliedAt: true,
});

export type InsertRuleEffect = z.infer<typeof insertRuleEffectSchema>;
export type RuleEffect = typeof ruleEffects.$inferSelect;

// ============================================
// CARRIER EXCLUDED ITEMS TABLE
// ============================================

export const carrierExcludedItems = pgTable("carrier_excluded_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierProfileId: uuid("carrier_profile_id").notNull(),
  lineItemCode: varchar("line_item_code", { length: 50 }).notNull(),
  exclusionReason: text("exclusion_reason").notNull(),
  carrierReference: varchar("carrier_reference", { length: 255 }),
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
  expirationDate: date("expiration_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  profileIdx: index("carrier_excluded_profile_idx").on(table.carrierProfileId),
  codeIdx: index("carrier_excluded_code_idx").on(table.lineItemCode),
}));

export type CarrierExcludedItem = typeof carrierExcludedItems.$inferSelect;

// ============================================
// CARRIER ITEM CAPS TABLE
// ============================================

export const carrierItemCaps = pgTable("carrier_item_caps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierProfileId: uuid("carrier_profile_id").notNull(),

  // Target
  lineItemCode: varchar("line_item_code", { length: 50 }),
  categoryId: varchar("category_id", { length: 20 }),

  // Caps
  maxQuantity: decimal("max_quantity", { precision: 12, scale: 4 }),
  maxQuantityPerZone: decimal("max_quantity_per_zone", { precision: 12, scale: 4 }),
  maxUnitPrice: decimal("max_unit_price", { precision: 12, scale: 4 }),
  maxTotalCost: decimal("max_total_cost", { precision: 12, scale: 2 }),

  // Explanation
  capReason: text("cap_reason"),
  carrierReference: varchar("carrier_reference", { length: 255 }),

  // Validity
  effectiveDate: date("effective_date").default(sql`CURRENT_DATE`),
  expirationDate: date("expiration_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  profileIdx: index("carrier_caps_profile_idx").on(table.carrierProfileId),
  codeIdx: index("carrier_caps_code_idx").on(table.lineItemCode),
}));

export type CarrierItemCap = typeof carrierItemCaps.$inferSelect;

// ============================================
// RULE TYPES (TypeScript)
// ============================================

export type CarrierType = 'national' | 'regional' | 'specialty';
export type StrictnessLevel = 'lenient' | 'standard' | 'strict';
export type RuleType = 'exclusion' | 'cap' | 'documentation' | 'combination' | 'modification';
export type RuleTargetType = 'line_item' | 'category' | 'trade' | 'estimate' | 'tax';
export type RuleEffectType = 'exclude' | 'cap_quantity' | 'cap_cost' | 'require_doc' | 'warn' | 'modify_pct';
export type RuleSource = 'carrier' | 'jurisdiction' | 'line_item_default';
export type LineItemRuleStatus = 'allowed' | 'modified' | 'denied' | 'warning';

// ============================================
// RULE CONFIGURATION INTERFACES
// ============================================

export interface CarrierRuleConfig {
  // Additional carrier-specific settings
  requiresPreApprovalAbove?: number;
  defaultJustificationRequired?: boolean;
  autoApplyDocRequirements?: boolean;
  [key: string]: unknown;
}

export interface RegulatoryConstraints {
  asbestosTestingRequiredPre1980?: boolean;
  leadTestingRequiredPre1978?: boolean;
  permitRequired?: boolean;
  licensedContractorRequired?: boolean;
  [key: string]: unknown;
}

export interface RuleConditions {
  damageType?: string[];
  waterCategory?: number[];
  claimTotalMin?: number;
  claimTotalMax?: number;
  zoneType?: string[];
  roomType?: string[];
  [key: string]: unknown;
}

export interface ExcludeEffect {
  reason: string;
}

export interface CapQuantityEffect {
  maxQuantity?: number;
  maxPerZone?: number;
  reason?: string;
}

export interface CapCostEffect {
  maxTotal?: number;
  maxPerUnit?: number;
  reason?: string;
}

export interface RequireDocEffect {
  required: string[];
  justificationMinLength?: number;
}

export interface ModifyPctEffect {
  multiplier: number;
  reason: string;
}

export type RuleEffectValue =
  | ExcludeEffect
  | CapQuantityEffect
  | CapCostEffect
  | RequireDocEffect
  | ModifyPctEffect;

// ============================================
// RULES EVALUATION RESULT INTERFACES
// ============================================

export interface LineItemRuleResult {
  lineItemId: string;
  lineItemCode: string;
  status: LineItemRuleStatus;
  originalQuantity?: number;
  modifiedQuantity?: number;
  originalUnitPrice?: number;
  modifiedUnitPrice?: number;
  documentationRequired: string[];
  appliedRules: AppliedRule[];
  explanation: string;
}

export interface AppliedRule {
  ruleSource: RuleSource;
  ruleCode: string;
  ruleName: string;
  effectType: RuleEffectType;
  originalValue?: unknown;
  modifiedValue?: unknown;
  explanation: string;
}

export interface RulesEvaluationResult {
  estimateId: string;
  carrierProfileId?: string;
  jurisdictionId?: string;
  evaluatedAt: Date;

  // Summary
  totalItems: number;
  allowedItems: number;
  modifiedItems: number;
  deniedItems: number;
  warningItems: number;

  // Per-item results
  lineItemResults: LineItemRuleResult[];

  // Estimate-level effects
  estimateEffects: AppliedRule[];

  // Full audit log
  auditLog: RuleAuditEntry[];
}

export interface RuleAuditEntry {
  timestamp: Date;
  ruleSource: RuleSource;
  ruleCode: string;
  targetType: RuleTargetType;
  targetId?: string;
  effectType: RuleEffectType;
  originalValue?: unknown;
  modifiedValue?: unknown;
  explanation: string;
}
