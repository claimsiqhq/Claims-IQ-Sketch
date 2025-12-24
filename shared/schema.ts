import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, boolean, timestamp, jsonb, uuid, date, index, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// CANONICAL PERIL ENUM (PERIL PARITY FOUNDATION)
// ============================================
// This enum provides first-class support for ALL perils, ensuring no peril
// is favored over another in schema, ingestion, or UI behavior.

export enum Peril {
  WIND_HAIL = "wind_hail",
  FIRE = "fire",
  WATER = "water",        // Non-flood water damage (pipes, appliances, etc.)
  FLOOD = "flood",        // External water intrusion (rising water, storm surge)
  SMOKE = "smoke",
  MOLD = "mold",
  IMPACT = "impact",      // Vehicle, tree, debris impact
  OTHER = "other"
}

// Peril display labels for UI
export const PERIL_LABELS: Record<Peril, string> = {
  [Peril.WIND_HAIL]: "Wind / Hail",
  [Peril.FIRE]: "Fire",
  [Peril.WATER]: "Water",
  [Peril.FLOOD]: "Flood",
  [Peril.SMOKE]: "Smoke",
  [Peril.MOLD]: "Mold",
  [Peril.IMPACT]: "Impact",
  [Peril.OTHER]: "Other"
};

// Secondary peril associations - perils that commonly co-occur
export const SECONDARY_PERIL_MAP: Partial<Record<Peril, Peril[]>> = {
  [Peril.FIRE]: [Peril.SMOKE, Peril.WATER],  // Fire often causes smoke and water (firefighting)
  [Peril.WATER]: [Peril.MOLD],               // Water damage often leads to mold
  [Peril.FLOOD]: [Peril.MOLD, Peril.WATER],  // Flood can cause mold and other water damage
  [Peril.WIND_HAIL]: [Peril.WATER],          // Roof damage can lead to water intrusion
};

// Peril metadata type definitions
export interface WaterPerilMetadata {
  source?: "plumbing" | "appliance" | "weather" | "hvac" | "unknown";
  duration?: "sudden" | "repeated" | "gradual" | "unknown";
  contamination_level?: "clean" | "gray" | "black" | "unknown";  // IICRC categories
  mold_risk?: boolean;
  affected_levels?: string[];  // basement, main, upper
}

export interface FirePerilMetadata {
  origin_room?: string;
  damage_types?: ("flame" | "smoke" | "heat" | "soot")[];
  habitability?: "habitable" | "partial" | "uninhabitable";
  cause?: "electrical" | "cooking" | "heating" | "arson" | "lightning" | "unknown";
}

export interface FloodPerilMetadata {
  source?: "rising_water" | "storm_surge" | "overflow" | "surface_runoff";
  flood_zone?: string;  // FEMA flood zone if known
  coverage_warning?: string;  // Advisory about flood coverage
  water_depth_inches?: number;
}

export interface WindHailPerilMetadata {
  wind_speed_mph?: number;
  hail_size_inches?: number;
  roof_damage?: boolean;
  siding_damage?: boolean;
  window_damage?: boolean;
  exterior_only?: boolean;
}

export interface SmokePerilMetadata {
  source?: "fire" | "neighboring_fire" | "wildfire" | "other";
  migration_pattern?: string[];  // rooms/areas affected
  residue_type?: "dry" | "wet" | "oily";
}

export interface MoldPerilMetadata {
  cause?: "water_damage" | "humidity" | "flood" | "unknown";
  testing_required?: boolean;
  remediation_protocol?: string;
}

export interface ImpactPerilMetadata {
  impact_source?: "vehicle" | "tree" | "debris" | "aircraft" | "other";
  structural_damage?: boolean;
  affected_area?: string;
}

// Union type for all peril metadata
export type PerilMetadataValue =
  | WaterPerilMetadata
  | FirePerilMetadata
  | FloodPerilMetadata
  | WindHailPerilMetadata
  | SmokePerilMetadata
  | MoldPerilMetadata
  | ImpactPerilMetadata
  | Record<string, unknown>;

// Full peril metadata structure - keyed by peril type
export interface PerilMetadata {
  water?: WaterPerilMetadata;
  fire?: FirePerilMetadata;
  flood?: FloodPerilMetadata;
  wind_hail?: WindHailPerilMetadata;
  smoke?: SmokePerilMetadata;
  mold?: MoldPerilMetadata;
  impact?: ImpactPerilMetadata;
  other?: Record<string, unknown>;
}

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
  lossType: varchar("loss_type", { length: 100 }), // "Hail", "Fire", "Water", "Wind" - LEGACY, use primaryPeril
  lossDescription: text("loss_description"), // "Hail storm, roofing company says damage..."

  // Peril Parity Fields (canonical peril tracking)
  // These fields provide first-class support for ALL perils, not just wind/hail
  primaryPeril: varchar("primary_peril", { length: 50 }), // Canonical peril enum value
  secondaryPerils: jsonb("secondary_perils").default(sql`'[]'::jsonb`), // Array of secondary peril values
  perilConfidence: decimal("peril_confidence", { precision: 3, scale: 2 }), // 0.00-1.00 confidence in peril inference
  perilMetadata: jsonb("peril_metadata").default(sql`'{}'::jsonb`), // Peril-specific structured data

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
  status: varchar("status", { length: 30 }).notNull().default("draft"), // draft, fnol, open, in_progress, review, approved, closed

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
// CLAIM BRIEFINGS TABLE
// ============================================

/**
 * AI-generated claim briefings for field adjusters.
 * Briefings are cached by source_hash to avoid regeneration.
 */
export const claimBriefings = pgTable("claim_briefings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id").notNull(),

  // Peril context
  peril: varchar("peril", { length: 50 }).notNull(),
  secondaryPerils: jsonb("secondary_perils").default(sql`'[]'::jsonb`),

  // Cache key - hash of inputs used to generate briefing
  sourceHash: varchar("source_hash", { length: 64 }).notNull(),

  // The briefing content (structured JSON)
  briefingJson: jsonb("briefing_json").notNull(),

  // Status tracking: 'generating', 'generated', 'error', 'stale'
  status: varchar("status", { length: 20 }).notNull().default("generated"),

  // AI model used
  model: varchar("model", { length: 100 }),

  // Token usage tracking
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),

  // Error tracking (if generation failed)
  errorMessage: text("error_message"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_briefings_claim_idx").on(table.claimId),
  sourceHashIdx: index("claim_briefings_source_hash_idx").on(table.claimId, table.sourceHash),
  orgIdx: index("claim_briefings_org_idx").on(table.organizationId),
}));

export const insertClaimBriefingSchema = createInsertSchema(claimBriefings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimBriefing = z.infer<typeof insertClaimBriefingSchema>;
export type ClaimBriefing = typeof claimBriefings.$inferSelect;

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

// ============================================
// CLAIM STRUCTURES TABLE (Voice Sketch - Hierarchy)
// ============================================

export const claimStructures = pgTable("claim_structures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  organizationId: uuid("organization_id").notNull(),

  // Structure identification
  name: varchar("name", { length: 100 }).notNull(), // "Main House", "Detached Garage", etc.
  structureType: varchar("structure_type", { length: 50 }).notNull(), // main_dwelling, detached_garage, shed, etc.
  description: text("description"),
  address: text("address"),

  // Building characteristics
  stories: integer("stories").default(1),
  yearBuilt: integer("year_built"),
  constructionType: varchar("construction_type", { length: 50 }), // frame, masonry, steel, etc.
  roofType: varchar("roof_type", { length: 50 }), // shingle, tile, metal, flat, etc.

  // Photos stored as JSON array
  photos: jsonb("photos").default(sql`'[]'::jsonb`),
  notes: jsonb("notes").default(sql`'[]'::jsonb`),

  // Sort order for display
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_structures_claim_idx").on(table.claimId),
  orgIdx: index("claim_structures_org_idx").on(table.organizationId),
}));

export const insertClaimStructureSchema = createInsertSchema(claimStructures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimStructure = z.infer<typeof insertClaimStructureSchema>;
export type ClaimStructure = typeof claimStructures.$inferSelect;

// ============================================
// CLAIM ROOMS TABLE (Voice Sketch)
// ============================================

export const claimRooms = pgTable("claim_rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  structureId: uuid("structure_id"), // Links to claim_structures - the parent structure

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

  // Peril context (canonical peril association)
  // Enables peril-aware AI and UI behavior without guessing
  associatedPeril: varchar("associated_peril", { length: 50 }), // Canonical peril enum value
  perilConfidence: decimal("peril_confidence", { precision: 3, scale: 2 }), // 0.00-1.00

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
  perilIdx: index("claim_damage_zones_peril_idx").on(table.associatedPeril),
}));

export const insertClaimDamageZoneSchema = createInsertSchema(claimDamageZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimDamageZone = z.infer<typeof insertClaimDamageZoneSchema>;
export type ClaimDamageZone = typeof claimDamageZones.$inferSelect;

// ============================================
// CLAIM PHOTOS TABLE
// ============================================

export const claimPhotos = pgTable("claim_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id"), // Nullable - allows uncategorized photos not yet assigned to a claim
  organizationId: uuid("organization_id").notNull(),

  // Optional hierarchy links (photos can be at any level)
  structureId: uuid("structure_id"),
  roomId: uuid("room_id"),
  damageZoneId: uuid("damage_zone_id"),

  // Storage info
  storagePath: varchar("storage_path", { length: 500 }).notNull(),
  publicUrl: varchar("public_url", { length: 1000 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size"),

  // Photo metadata
  label: varchar("label", { length: 255 }),
  hierarchyPath: varchar("hierarchy_path", { length: 500 }),
  description: text("description"),

  // GPS coordinates (from device when photo was captured)
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  geoAddress: varchar("geo_address", { length: 500 }), // Reverse geocoded address

  // AI Analysis results (from OpenAI Vision)
  aiAnalysis: jsonb("ai_analysis").default(sql`'{}'::jsonb`),
  qualityScore: integer("quality_score"),
  damageDetected: boolean("damage_detected").default(false),

  // Analysis status for async processing
  analysisStatus: varchar("analysis_status", { length: 30 }).default("pending"), // pending, analyzing, completed, failed, concerns
  analysisError: text("analysis_error"), // Error message if analysis failed

  // Timestamps
  capturedAt: timestamp("captured_at").default(sql`NOW()`),
  analyzedAt: timestamp("analyzed_at"),
  uploadedBy: varchar("uploaded_by"),

  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_photos_claim_idx").on(table.claimId),
  orgIdx: index("claim_photos_org_idx").on(table.organizationId),
  structureIdx: index("claim_photos_structure_idx").on(table.structureId),
  roomIdx: index("claim_photos_room_idx").on(table.roomId),
  damageIdx: index("claim_photos_damage_idx").on(table.damageZoneId),
}));

export const insertClaimPhotoSchema = createInsertSchema(claimPhotos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimPhoto = z.infer<typeof insertClaimPhotoSchema>;
export type ClaimPhoto = typeof claimPhotos.$inferSelect;

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

  // Preview generation - page images stored in Supabase
  pageCount: integer("page_count"),
  previewStatus: varchar("preview_status", { length: 30 }).default("pending"), // pending, processing, completed, failed
  previewGeneratedAt: timestamp("preview_generated_at"),
  previewError: text("preview_error"),

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

  // Peril context (canonical peril association)
  // Links this damage zone to a canonical peril for AI and UI behavior
  associatedPeril: varchar("associated_peril", { length: 50 }), // Canonical peril enum value
  perilConfidence: decimal("peril_confidence", { precision: 3, scale: 2 }), // 0.00-1.00

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

  // Peril context (canonical peril association)
  associatedPeril: varchar("associated_peril", { length: 50 }), // Canonical peril enum value
  perilConfidence: decimal("peril_confidence", { precision: 3, scale: 2 }), // 0.00-1.00

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

  // Carrier-Specific Inspection Overlays
  // Per-peril inspection preferences that influence AI guidance
  carrierInspectionOverlays: jsonb("carrier_inspection_overlays").default(sql`'{}'::jsonb`),

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

/**
 * Carrier Inspection Overlay - Per-peril inspection preferences
 */
export interface CarrierPerilOverlay {
  // Test square requirements (wind/hail)
  require_test_squares?: boolean;
  test_square_count?: number;

  // Photo requirements
  photo_density?: 'low' | 'standard' | 'high';

  // Duration confirmation (water)
  require_duration_confirmation?: boolean;

  // Moisture readings (water)
  require_moisture_readings?: boolean;

  // Origin documentation (fire)
  require_origin_documentation?: boolean;

  // High water mark (flood)
  require_high_water_mark?: boolean;

  // Mold protocol
  require_mold_testing?: boolean;

  // Areas to emphasize during inspection
  emphasis?: string[];

  // Areas to de-emphasize (but not ignore)
  de_emphasis?: string[];

  // Custom carrier notes
  notes?: string;
}

/**
 * Complete carrier inspection overlays structure
 */
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

// ============================================
// XACTIMATE PRICE LIST TABLES
// ============================================
// These tables store the imported Xactimate price list data
// for line item lookup and estimate building.

export const xactCategories = pgTable("xact_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Xactimate identifiers
  catId: integer("cat_id").notNull(),
  xactId: integer("xact_id").notNull(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  
  // Description
  description: text("description").notNull(),
  
  // Coverage type: 0=Structure, 1=Landscaping, 2=Contents
  coverageType: integer("coverage_type").default(0),
  
  // Cost distribution percentages
  laborDistPct: integer("labor_dist_pct").default(59),
  materialDistPct: integer("material_dist_pct").default(41),
  
  // Flags
  opEligible: boolean("op_eligible").default(true),
  taxable: boolean("taxable").default(true),
  noPrefix: boolean("no_prefix").default(false),
  
  // Metadata
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  codeIdx: index("xact_cat_code_idx").on(table.code),
}));

export type XactCategory = typeof xactCategories.$inferSelect;

export const xactLineItems = pgTable("xact_line_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Xactimate identifiers
  itemId: integer("item_id").notNull(),
  xactId: integer("xact_id").notNull(),
  
  // Category reference
  categoryCode: varchar("category_code", { length: 10 }).notNull(),
  
  // Item code and full code
  selectorCode: varchar("selector_code", { length: 30 }).notNull(),
  fullCode: varchar("full_code", { length: 40 }).notNull(),
  
  // Description
  description: text("description").notNull(),
  
  // Unit of measure
  unit: varchar("unit", { length: 10 }).notNull(),
  
  // Flags
  opEligible: boolean("op_eligible").default(true),
  taxable: boolean("taxable").default(true),
  
  // Labor efficiency (minutes)
  laborEfficiency: integer("labor_efficiency"),
  
  // Material distribution percentage (item-level override)
  materialDistPct: integer("material_dist_pct"),
  
  // Search optimization
  searchGroup: varchar("search_group", { length: 20 }),
  searchCategory: varchar("search_category", { length: 20 }),
  
  // Activity type data (stored as JSONB for flexibility)
  activities: jsonb("activities").default(sql`'[]'::jsonb`),
  
  // Additional metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  
  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  catCodeIdx: index("xact_items_cat_idx").on(table.categoryCode),
  fullCodeIdx: index("xact_items_full_code_idx").on(table.fullCode),
  selectorIdx: index("xact_items_selector_idx").on(table.selectorCode),
  descIdx: index("xact_items_desc_idx").on(table.description),
}));

export type XactLineItem = typeof xactLineItems.$inferSelect;

export const insertXactCategorySchema = createInsertSchema(xactCategories).omit({
  id: true,
  createdAt: true,
});

export type InsertXactCategory = z.infer<typeof insertXactCategorySchema>;

export const insertXactLineItemSchema = createInsertSchema(xactLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertXactLineItem = z.infer<typeof insertXactLineItemSchema>;

export const xactComponents = pgTable("xact_components", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  componentType: varchar("component_type", { length: 20 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 10 }),
  amount: decimal("amount", { precision: 12, scale: 4 }),
  xactId: varchar("xact_id", { length: 20 }),
  
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  codeIdx: index("xact_comp_code_idx").on(table.code),
  typeIdx: index("xact_comp_type_idx").on(table.componentType),
}));

export type XactComponent = typeof xactComponents.$inferSelect;

// ============================================
// AI PROMPTS TABLE
// ============================================

/**
 * AI Prompts table for storing OpenAI prompts.
 * Allows editing prompts from the database without code changes.
 */
export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identifier and categorization
  promptKey: varchar("prompt_key", { length: 100 }).notNull().unique(),
  promptName: varchar("prompt_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // document, briefing, estimate, voice, analysis

  // Prompt content
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template"),

  // Model configuration
  model: varchar("model", { length: 100 }).notNull().default("gpt-4o"),
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.3"),
  maxTokens: integer("max_tokens"),
  responseFormat: varchar("response_format", { length: 50 }).default("text"), // text, json_object

  // Metadata
  description: text("description"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),

  // Usage tracking
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  avgTokensUsed: integer("avg_tokens_used"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  keyIdx: index("ai_prompts_key_idx").on(table.promptKey),
  categoryIdx: index("ai_prompts_category_idx").on(table.category),
  activeIdx: index("ai_prompts_active_idx").on(table.isActive),
}));

export const insertAiPromptSchema = createInsertSchema(aiPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiPrompt = z.infer<typeof insertAiPromptSchema>;
export type AiPrompt = typeof aiPrompts.$inferSelect;

/**
 * Prompt categories for organization
 */
export enum PromptCategory {
  DOCUMENT = "document",
  BRIEFING = "briefing",
  ESTIMATE = "estimate",
  VOICE = "voice",
  ANALYSIS = "analysis",
}

/**
 * Prompt keys for type-safe access
 */
export enum PromptKey {
  // Document extraction prompts
  DOCUMENT_EXTRACTION_FNOL = "document.extraction.fnol",
  DOCUMENT_EXTRACTION_POLICY = "document.extraction.policy",
  DOCUMENT_EXTRACTION_ENDORSEMENT = "document.extraction.endorsement",

  // Analysis prompts
  MY_DAY_SUMMARY = "analysis.my_day_summary",

  // Estimate prompts
  ESTIMATE_SUGGESTIONS = "estimate.suggestions",
  ESTIMATE_QUICK_SUGGEST = "estimate.quick_suggest",

  // Briefing prompts
  CLAIM_BRIEFING = "briefing.claim",

  // Voice agent prompts
  VOICE_ROOM_SKETCH = "voice.room_sketch",
  VOICE_SCOPE = "voice.scope",

  // Inspection workflow prompts
  INSPECTION_WORKFLOW_GENERATOR = "workflow.inspection_generator",
}

// ============================================
// INSPECTION WORKFLOW TYPES
// ============================================

/**
 * Workflow status values for inspection workflows
 */
export enum InspectionWorkflowStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  COMPLETED = "completed",
  ARCHIVED = "archived",
}

/**
 * Step status values for individual workflow steps
 */
export enum InspectionStepStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  SKIPPED = "skipped",
  BLOCKED = "blocked",
}

/**
 * Step type values for workflow steps
 */
export enum InspectionStepType {
  PHOTO = "photo",
  MEASUREMENT = "measurement",
  CHECKLIST = "checklist",
  OBSERVATION = "observation",
  DOCUMENTATION = "documentation",
  SAFETY_CHECK = "safety_check",
  EQUIPMENT = "equipment",
  INTERVIEW = "interview",
}

/**
 * Phase values for grouping workflow steps
 */
export enum InspectionPhase {
  PRE_INSPECTION = "pre_inspection",
  INITIAL_WALKTHROUGH = "initial_walkthrough",
  EXTERIOR = "exterior",
  INTERIOR = "interior",
  DOCUMENTATION = "documentation",
  WRAP_UP = "wrap_up",
}

/**
 * Asset type values for workflow assets
 */
export enum WorkflowAssetType {
  PHOTO = "photo",
  VIDEO = "video",
  MEASUREMENT = "measurement",
  DOCUMENT = "document",
  SIGNATURE = "signature",
  AUDIO_NOTE = "audio_note",
}

/**
 * Structure representing generated_from metadata
 */
export interface WorkflowGeneratedFrom {
  fnol_id?: string;
  policy_id?: string;
  endorsement_ids?: string[];
  briefing_id?: string;
  peril_rules_version?: string;
  carrier_overlay_id?: string;
  generated_at: string;
  model?: string;
  prompt_version?: number;
}

/**
 * Structure for workflow JSON content
 */
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
    priority: "high" | "medium" | "low";
  }[];
}

// ============================================
// INSPECTION WORKFLOWS TABLE
// ============================================

/**
 * Main inspection workflow table.
 * Stores step-by-step inspection workflows derived from FNOL, Policy,
 * Endorsements, AI Claim Briefing, and peril inspection rules.
 */
export const inspectionWorkflows = pgTable("inspection_workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id").notNull(),

  // Versioning - increment on regeneration
  version: integer("version").notNull().default(1),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("draft"), // draft, active, completed, archived

  // Peril context (copied from claim for quick access)
  primaryPeril: varchar("primary_peril", { length: 50 }),
  secondaryPerils: jsonb("secondary_perils").default(sql`'[]'::jsonb`),

  // Reference to the briefing used to generate this workflow
  sourceBriefingId: uuid("source_briefing_id"),

  // The complete workflow structure (JSON)
  workflowJson: jsonb("workflow_json").notNull(),

  // Tracking what data was used to generate this workflow
  generatedFrom: jsonb("generated_from").default(sql`'{}'::jsonb`),

  // Audit trail
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
  completedAt: timestamp("completed_at"),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  claimIdx: index("inspection_workflows_claim_idx").on(table.claimId),
  orgIdx: index("inspection_workflows_org_idx").on(table.organizationId),
  statusIdx: index("inspection_workflows_status_idx").on(table.status),
  claimVersionIdx: index("inspection_workflows_claim_version_idx").on(table.claimId, table.version),
}));

export const insertInspectionWorkflowSchema = createInsertSchema(inspectionWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  archivedAt: true,
});

export type InsertInspectionWorkflow = z.infer<typeof insertInspectionWorkflowSchema>;
export type InspectionWorkflow = typeof inspectionWorkflows.$inferSelect;

// ============================================
// INSPECTION WORKFLOW STEPS TABLE
// ============================================

/**
 * Individual steps within an inspection workflow.
 * Each step represents a discrete action the adjuster must take.
 */
export const inspectionWorkflowSteps = pgTable("inspection_workflow_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").notNull(),

  // Ordering and grouping
  stepIndex: integer("step_index").notNull(),
  phase: varchar("phase", { length: 50 }).notNull(), // pre_inspection, initial_walkthrough, exterior, interior, documentation, wrap_up

  // Step details
  stepType: varchar("step_type", { length: 50 }).notNull(), // photo, measurement, checklist, observation, documentation, safety_check, equipment, interview
  title: varchar("title", { length: 255 }).notNull(),
  instructions: text("instructions"),

  // Requirements
  required: boolean("required").default(true),
  tags: jsonb("tags").default(sql`'[]'::jsonb`), // Array of tags for filtering/grouping

  // Dependencies (step IDs that must be completed first)
  dependencies: jsonb("dependencies").default(sql`'[]'::jsonb`),

  // Time tracking
  estimatedMinutes: integer("estimated_minutes").default(5),
  actualMinutes: integer("actual_minutes"),

  // Completion tracking
  status: varchar("status", { length: 30 }).notNull().default("pending"), // pending, in_progress, completed, skipped, blocked
  completedBy: varchar("completed_by"),
  completedAt: timestamp("completed_at"),

  // Notes from adjuster
  notes: text("notes"),

  // Room association (if this step applies to a specific room)
  roomId: uuid("room_id"),
  roomName: varchar("room_name", { length: 100 }),

  // Peril-specific flag
  perilSpecific: varchar("peril_specific", { length: 50 }), // If set, this step only applies to this peril

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  workflowIdx: index("inspection_steps_workflow_idx").on(table.workflowId),
  phaseIdx: index("inspection_steps_phase_idx").on(table.workflowId, table.phase),
  statusIdx: index("inspection_steps_status_idx").on(table.workflowId, table.status),
  orderIdx: index("inspection_steps_order_idx").on(table.workflowId, table.stepIndex),
}));

export const insertInspectionWorkflowStepSchema = createInsertSchema(inspectionWorkflowSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInspectionWorkflowStep = z.infer<typeof insertInspectionWorkflowStepSchema>;
export type InspectionWorkflowStep = typeof inspectionWorkflowSteps.$inferSelect;

// ============================================
// INSPECTION WORKFLOW ASSETS TABLE
// ============================================

/**
 * Assets associated with workflow steps.
 * Tracks required/captured photos, measurements, documents, etc.
 */
export const inspectionWorkflowAssets = pgTable("inspection_workflow_assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  stepId: uuid("step_id").notNull(),

  // Asset details
  assetType: varchar("asset_type", { length: 30 }).notNull(), // photo, video, measurement, document, signature, audio_note
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),

  // Requirements
  required: boolean("required").default(true),

  // Asset-specific metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Captured file reference (null until captured)
  fileId: uuid("file_id"),
  filePath: text("file_path"),
  fileUrl: text("file_url"),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("pending"), // pending, captured, approved, rejected

  // Capture info
  capturedBy: varchar("captured_by"),
  capturedAt: timestamp("captured_at"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  stepIdx: index("inspection_assets_step_idx").on(table.stepId),
  typeIdx: index("inspection_assets_type_idx").on(table.stepId, table.assetType),
  statusIdx: index("inspection_assets_status_idx").on(table.stepId, table.status),
}));

export const insertInspectionWorkflowAssetSchema = createInsertSchema(inspectionWorkflowAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInspectionWorkflowAsset = z.infer<typeof insertInspectionWorkflowAssetSchema>;
export type InspectionWorkflowAsset = typeof inspectionWorkflowAssets.$inferSelect;

// ============================================
// INSPECTION WORKFLOW ROOMS TABLE
// ============================================

/**
 * Rooms added to an inspection workflow.
 * Allows expanding the workflow with room-specific steps.
 */
export const inspectionWorkflowRooms = pgTable("inspection_workflow_rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").notNull(),

  // Room details
  name: varchar("name", { length: 100 }).notNull(),
  level: varchar("level", { length: 50 }), // basement, main, upper, attic
  roomType: varchar("room_type", { length: 50 }), // bedroom, bathroom, kitchen, living, etc.

  // Dimensions (if known)
  lengthFt: decimal("length_ft", { precision: 8, scale: 2 }),
  widthFt: decimal("width_ft", { precision: 8, scale: 2 }),
  heightFt: decimal("height_ft", { precision: 8, scale: 2 }),

  // Notes
  notes: text("notes"),

  // Link to claim room (if exists)
  claimRoomId: uuid("claim_room_id"),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  workflowIdx: index("inspection_rooms_workflow_idx").on(table.workflowId),
  levelIdx: index("inspection_rooms_level_idx").on(table.workflowId, table.level),
}));

export const insertInspectionWorkflowRoomSchema = createInsertSchema(inspectionWorkflowRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInspectionWorkflowRoom = z.infer<typeof insertInspectionWorkflowRoomSchema>;
export type InspectionWorkflowRoom = typeof inspectionWorkflowRooms.$inferSelect;

// ============================================
// CLAIM CHECKLIST TABLES
// ============================================

/**
 * Claim Severity Enum
 * Used to determine checklist complexity and required items
 */
export enum ClaimSeverity {
  MINOR = "minor",         // Small claims, limited damage
  MODERATE = "moderate",   // Standard claims
  SEVERE = "severe",       // Major damage, complex claims
  CATASTROPHIC = "catastrophic"  // CAT events, total loss potential
}

export const SEVERITY_LABELS: Record<ClaimSeverity, string> = {
  [ClaimSeverity.MINOR]: "Minor",
  [ClaimSeverity.MODERATE]: "Moderate",
  [ClaimSeverity.SEVERE]: "Severe",
  [ClaimSeverity.CATASTROPHIC]: "Catastrophic"
};

/**
 * Checklist Category Enum
 * Groups checklist items by processing phase
 */
export enum ChecklistCategory {
  DOCUMENTATION = "documentation",
  VERIFICATION = "verification",
  INSPECTION = "inspection",
  ESTIMATION = "estimation",
  REVIEW = "review",
  SETTLEMENT = "settlement"
}

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  [ChecklistCategory.DOCUMENTATION]: "Documentation",
  [ChecklistCategory.VERIFICATION]: "Verification",
  [ChecklistCategory.INSPECTION]: "Inspection",
  [ChecklistCategory.ESTIMATION]: "Estimation",
  [ChecklistCategory.REVIEW]: "Review",
  [ChecklistCategory.SETTLEMENT]: "Settlement"
};

/**
 * Claim Checklists Table
 * Master checklist for a claim, generated based on peril and severity
 */
export const claimChecklists = pgTable("claim_checklists", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  organizationId: uuid("organization_id").notNull(),

  // Checklist context
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Generation context - what triggered this checklist
  peril: varchar("peril", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 30 }).notNull().default("moderate"),
  templateVersion: varchar("template_version", { length: 20 }).default("1.0"),

  // Progress tracking
  totalItems: integer("total_items").notNull().default(0),
  completedItems: integer("completed_items").notNull().default(0),
  status: varchar("status", { length: 30 }).notNull().default("active"), // active, completed, archived

  // Metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  claimIdx: index("claim_checklists_claim_idx").on(table.claimId),
  orgIdx: index("claim_checklists_org_idx").on(table.organizationId),
  statusIdx: index("claim_checklists_status_idx").on(table.status),
  perilIdx: index("claim_checklists_peril_idx").on(table.peril),
}));

export const insertClaimChecklistSchema = createInsertSchema(claimChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertClaimChecklist = z.infer<typeof insertClaimChecklistSchema>;
export type ClaimChecklist = typeof claimChecklists.$inferSelect;

/**
 * Claim Checklist Items Table
 * Individual items within a claim checklist
 */
export const claimChecklistItems = pgTable("claim_checklist_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  checklistId: uuid("checklist_id").notNull(),

  // Item details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),

  // Conditions - when this item applies
  requiredForPerils: jsonb("required_for_perils").default(sql`'[]'::jsonb`), // Empty = all perils
  requiredForSeverities: jsonb("required_for_severities").default(sql`'[]'::jsonb`), // Empty = all severities
  conditionalLogic: jsonb("conditional_logic").default(sql`'{}'::jsonb`), // Advanced conditions

  // Item requirements
  required: boolean("required").default(true),
  priority: integer("priority").default(1), // 1=high, 2=medium, 3=low
  sortOrder: integer("sort_order").default(0),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("pending"), // pending, in_progress, completed, skipped, blocked, na
  completedBy: varchar("completed_by"),
  completedAt: timestamp("completed_at"),
  skippedReason: text("skipped_reason"),

  // Notes and evidence
  notes: text("notes"),
  linkedDocumentIds: jsonb("linked_document_ids").default(sql`'[]'::jsonb`),

  // Due date (optional)
  dueDate: timestamp("due_date"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  checklistIdx: index("checklist_items_checklist_idx").on(table.checklistId),
  categoryIdx: index("checklist_items_category_idx").on(table.checklistId, table.category),
  statusIdx: index("checklist_items_status_idx").on(table.checklistId, table.status),
  orderIdx: index("checklist_items_order_idx").on(table.checklistId, table.sortOrder),
}));

export const insertClaimChecklistItemSchema = createInsertSchema(claimChecklistItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertClaimChecklistItem = z.infer<typeof insertClaimChecklistItemSchema>;
export type ClaimChecklistItem = typeof claimChecklistItems.$inferSelect;

/**
 * Checklist Template Items
 * Master templates that generate checklist items for claims
 */
export interface ChecklistTemplateItem {
  id: string;
  title: string;
  description?: string;
  category: ChecklistCategory;
  requiredForPerils: Peril[]; // Empty = all perils
  requiredForSeverities: ClaimSeverity[]; // Empty = all severities
  required: boolean;
  priority: 1 | 2 | 3;
  sortOrder: number;
}
