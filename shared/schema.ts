import { sql, relations } from "drizzle-orm";
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
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
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
  userId: uuid("user_id").notNull().references(() => users.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
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
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: 'set null' }),

  // Claim identifier (format: XX-XXX-XXXXXX)
  claimNumber: varchar("claim_number", { length: 50 }).notNull(),

  // Carrier/Region
  carrierId: uuid("carrier_id").references(() => carrierProfiles.id, { onDelete: 'set null' }),
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

  // Policy limits and deductibles
  dwellingLimit: varchar("dwelling_limit", { length: 50 }), // "$793,200"
  // Peril-specific deductibles (e.g., wind/hail percentage deductibles)
  // Structure: { "wind_hail": "$7,932 1%", "flood": "$5,000", etc. }
  // Note: year_roof_install is stored in loss_context.property.roof.year_installed
  perilSpecificDeductibles: jsonb("peril_specific_deductibles").default(sql`'{}'::jsonb`),
  // @deprecated Use endorsement_extractions table instead
  endorsementsListed: jsonb("endorsements_listed").default(sql`'[]'::jsonb`),

  // Coverage amounts (numeric for calculations)
  coverageA: decimal("coverage_a", { precision: 12, scale: 2 }),
  coverageB: decimal("coverage_b", { precision: 12, scale: 2 }),
  coverageC: decimal("coverage_c", { precision: 12, scale: 2 }),
  coverageD: decimal("coverage_d", { precision: 12, scale: 2 }),
  deductible: decimal("deductible", { precision: 12, scale: 2 }),

  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default("draft"), // draft, fnol, open, in_progress, review, approved, closed

  // Assignment
  assignedAdjusterId: uuid("assigned_adjuster_id").references(() => users.id),

  // Totals (calculated from estimates)
  totalRcv: decimal("total_rcv", { precision: 12, scale: 2 }).default("0"),
  totalAcv: decimal("total_acv", { precision: 12, scale: 2 }).default("0"),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0"),

  // Pricing snapshot for estimate calculations
  pricingSnapshot: jsonb("pricing_snapshot").default(sql`'{}'::jsonb`),

  // Metadata for additional fields
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Loss context - canonical storage for FNOL/loss-intake facts
  // Structure: { fnol: {...}, property: {...}, damage_summary: {...} }
  lossContext: jsonb("loss_context").notNull().default(sql`'{}'::jsonb`),

  // Raw OpenAI response - stored before any transformation for debugging/auditing
  rawOpenaiResponse: jsonb("raw_openai_response"),

  // Version tracking for cache invalidation (voice agents use these to detect stale context)
  briefingVersion: integer("briefing_version").notNull().default(0),
  workflowVersion: integer("workflow_version").notNull().default(0),

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
// POLICY FORM EXTRACTIONS TABLE (Comprehensive)
// ============================================

/**
 * Comprehensive policy extraction with full lossless content
 * Stores complete policy structure including sections, definitions, coverages
 *
 * NEW: Supports is_canonical for versioning and extraction_data for lossless storage
 */
export const policyFormExtractions = pgTable("policy_form_extractions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id"),
  documentId: uuid("document_id"), // Link to source document

  // Document metadata
  documentType: varchar("document_type", { length: 100 }),
  policyFormCode: varchar("policy_form_code", { length: 100 }),
  policyFormName: varchar("policy_form_name", { length: 255 }),
  editionDate: varchar("edition_date", { length: 50 }),
  jurisdiction: varchar("jurisdiction", { length: 50 }),
  pageCount: integer("page_count"),

  // Complete extraction as JSONB (lossless PolicyFormExtraction)
  extractionData: jsonb("extraction_data").default(sql`'{}'::jsonb`),
  extractionVersionNum: integer("extraction_version").default(1),
  sourceFormCode: varchar("source_form_code", { length: 100 }),

  // Canonical flag for versioning
  isCanonical: boolean("is_canonical").default(true),

  // Policy structure {tableOfContents: [], policyStatement: "", agreement: ""}
  policyStructure: jsonb("policy_structure").default(sql`'{}'::jsonb`),

  // Definitions [{term, definition, subClauses: [], exceptions: []}]
  definitions: jsonb("definitions").default(sql`'[]'::jsonb`),

  // Section I - Property Coverage
  // {propertyCoverage, perils, exclusions, additionalCoverages, conditions, lossSettlement}
  sectionI: jsonb("section_i").default(sql`'{}'::jsonb`),

  // Section II - Liability Coverage
  // {liabilityCoverages, exclusions, additionalCoverages, conditions}
  sectionII: jsonb("section_ii").default(sql`'{}'::jsonb`),

  // General conditions array
  generalConditions: jsonb("general_conditions").default(sql`'[]'::jsonb`),

  // Raw page text (full verbatim)
  rawPageText: text("raw_page_text"),

  // Processing metadata
  extractionModel: varchar("extraction_model", { length: 100 }),
  extractionVersion: varchar("extraction_version_str", { length: 20 }), // Legacy string version
  extractionStatus: varchar("extraction_status", { length: 30 }).default("completed"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),

  // Status
  status: varchar("status", { length: 30 }).default("completed"),
  errorMessage: text("error_message"),

  // Raw OpenAI response - stored before any transformation for debugging/auditing
  rawOpenaiResponse: jsonb("raw_openai_response"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("pfe_org_idx").on(table.organizationId),
  claimIdx: index("pfe_claim_idx").on(table.claimId),
  documentIdx: index("pfe_document_idx").on(table.documentId),
  formCodeIdx: index("pfe_form_code_idx").on(table.policyFormCode),
  canonicalIdx: index("pfe_canonical_idx").on(table.isCanonical),
}));

export const insertPolicyFormExtractionSchema = createInsertSchema(policyFormExtractions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPolicyFormExtraction = z.infer<typeof insertPolicyFormExtractionSchema>;
export type PolicyFormExtraction = typeof policyFormExtractions.$inferSelect;

// TypeScript interfaces for the JSONB structure
export interface PolicyDefinition {
  term: string;
  definition: string;
  subClauses?: string[];
  exceptions?: string[];
}

export interface PolicyCoverage {
  name: string;
  covers?: string[];
  excludes?: string[];
  specialConditions?: string[];
  scope?: string;
  specialLimits?: {
    propertyType: string;
    limit: string;
    conditions?: string;
  }[];
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
  additionalCoverages?: {
    name: string;
    description?: string;
    limit?: string;
    conditions?: string;
  }[];
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
    coverageE?: {
      name: string;
      insuringAgreement?: string;
      dutyToDefend?: boolean;
    };
    coverageF?: {
      name: string;
      insuringAgreement?: string;
      timeLimit?: string;
    };
  };
  exclusions?: string[];
  additionalCoverages?: {
    name: string;
    description?: string;
    limit?: string;
  }[];
  conditions?: string[];
}

export interface PolicyStructure {
  tableOfContents?: string[];
  policyStatement?: string;
  agreement?: string;
}


// ============================================
// ENDORSEMENT EXTRACTIONS TABLE
// ============================================

/**
 * Endorsement extractions with delta-only modifications
 * Stores complete endorsement extraction data with explicit type and priority
 */
export const endorsementExtractions = pgTable("endorsement_extractions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  claimId: uuid("claim_id"),
  documentId: uuid("document_id"), // Link to source document

  // Endorsement identification
  formCode: varchar("form_code", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }),
  editionDate: varchar("edition_date", { length: 50 }),
  jurisdiction: varchar("jurisdiction", { length: 50 }),

  // What this endorsement applies to
  appliesToPolicyForms: jsonb("applies_to_policy_forms").default(sql`'[]'::jsonb`),
  appliesToCoverages: jsonb("applies_to_coverages").default(sql`'[]'::jsonb`),

  // Complete extraction as JSONB (lossless)
  extractionData: jsonb("extraction_data").default(sql`'{}'::jsonb`),
  extractionVersion: integer("extraction_version").default(1),

  // Type and precedence (MANDATORY for resolution)
  endorsementType: varchar("endorsement_type", { length: 50 }).notNull().default("general"),
    // loss_settlement (1-10), coverage_specific (11-30), state_amendatory (31-50), general (51-100)
  precedencePriority: integer("precedence_priority").notNull().default(75),

  // Delta modifications (structured for queries)
  modifications: jsonb("modifications").default(sql`'{}'::jsonb`),
  // Structure: { definitions: {added, deleted, replaced}, coverages, perils, exclusions, conditions, lossSettlement }

  // Tables (depreciation schedules, etc.)
  tables: jsonb("tables").default(sql`'[]'::jsonb`),

  // Raw endorsement text (full verbatim)
  rawText: text("raw_text"),

  // Processing metadata
  extractionModel: varchar("extraction_model", { length: 100 }),
  extractionStatus: varchar("extraction_status", { length: 30 }).default("completed"),
  status: varchar("status", { length: 30 }).default("completed"),
  errorMessage: text("error_message"),

  // Raw OpenAI response - stored before any transformation for debugging/auditing
  rawOpenaiResponse: jsonb("raw_openai_response"),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("ee_org_idx").on(table.organizationId),
  claimIdx: index("ee_claim_idx").on(table.claimId),
  documentIdx: index("ee_document_idx").on(table.documentId),
  formCodeIdx: index("ee_form_code_idx").on(table.formCode),
  typeIdx: index("ee_type_idx").on(table.endorsementType),
  priorityIdx: index("ee_priority_idx").on(table.precedencePriority),
}));

export const insertEndorsementExtractionSchema = createInsertSchema(endorsementExtractions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEndorsementExtraction = z.infer<typeof insertEndorsementExtractionSchema>;
export type EndorsementExtractionRow = typeof endorsementExtractions.$inferSelect;

// TypeScript interfaces for endorsement extraction JSONB structures
export interface EndorsementModifications {
  definitions?: {
    added?: Array<{ term: string; definition: string }>;
    deleted?: string[];
    replaced?: Array<{ term: string; newDefinition: string }>;
  };
  coverages?: {
    added?: string[];
    deleted?: string[];
    modified?: Array<{ coverage: string; changeType: string; details: string }>;
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
    replacedSections?: Array<{ policySection: string; newRule: string }>;
  };
}

export interface EndorsementTable {
  tableType: string;
  appliesWhen?: { coverage?: string[]; peril?: string[] };
  data?: Record<string, unknown>;
}

// ============================================
// CLAIM BRIEFINGS TABLE
// ============================================

/**
 * AI-generated claim briefings for field adjusters.
 * Briefings are cached by source_hash to avoid regeneration.
 */
export const claimBriefings = pgTable("claim_briefings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: 'cascade' }),

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
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: 'cascade' }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),

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
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: 'cascade' }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  structureId: uuid("structure_id").references(() => claimStructures.id, { onDelete: 'cascade' }), // Links to claim_structures - the parent structure

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

  // Flow context (for linking to flow engine movements)
  flowInstanceId: uuid("flow_instance_id").references(() => claimFlowInstances.id, { onDelete: 'set null' }),
  movementId: text("movement_id"), // Format: "phaseId:movementId"
  createdDuringInspection: boolean("created_during_inspection").default(false),

  // Sort order for display
  sortOrder: integer("sort_order").default(0),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_rooms_claim_idx").on(table.claimId),
  orgIdx: index("claim_rooms_org_idx").on(table.organizationId),
  flowIdx: index("claim_rooms_flow_idx").on(table.flowInstanceId, table.movementId),
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
/**
 * ClaimDamageZones - Damage areas captured during Voice Sketch sessions
 * 
 * PURPOSE: Stores damage zone polygons and metadata captured via the Voice Sketch
 * feature. These represent the initial damage assessment before an estimate is created.
 * 
 * RELATIONSHIP TO OTHER ZONE TABLES:
 * - claimDamageZones: Voice Sketch captured zones (claim-level, pre-estimate)
 * - damageZones: Basic zone data within an estimate (estimate-level, legacy)
 * - estimateZones: Enhanced zone data with full Xactimate compatibility (estimate-level)
 * 
 * DATA FLOW:
 * 1. Voice Sketch creates claimDamageZones during initial scoping
 * 2. When estimate is created, claimDamageZones are optionally converted to estimateZones
 * 3. estimateZones hold the "official" zone data used for calculations
 * 
 * FK: claimId -> claims.id, roomId -> claimRooms.id, organizationId -> organizations.id
 */
export const claimDamageZones = pgTable("claim_damage_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: 'cascade' }),
  roomId: uuid("room_id").references(() => claimRooms.id, { onDelete: 'cascade' }), // Optional link to specific room
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),

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

  // Flow context (for linking to flow engine movements)
  flowInstanceId: uuid("flow_instance_id").references(() => claimFlowInstances.id, { onDelete: 'set null' }),
  movementId: text("movement_id"), // Format: "phaseId:movementId"

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
  flowIdx: index("claim_damage_zones_flow_idx").on(table.flowInstanceId, table.movementId),
}));

export const insertClaimDamageZoneSchema = createInsertSchema(claimDamageZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimDamageZone = z.infer<typeof insertClaimDamageZoneSchema>;
export type ClaimDamageZone = typeof claimDamageZones.$inferSelect;

// ============================================
// PHOTO TAXONOMY CATEGORIES TABLE
// ============================================

export const photoCategories = pgTable("photo_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Taxonomy prefix (e.g., 'OV', 'RF', 'RF-TSQ', 'EXT', 'WTR')
  prefix: varchar("prefix", { length: 20 }).notNull().unique(),

  // Parent category for hierarchical prefixes
  parentPrefix: varchar("parent_prefix", { length: 20 }),

  // Display info
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  // Photo requirements
  minRequired: integer("min_required").default(0),
  maxAllowed: integer("max_allowed"),

  // Peril applicability (empty array means all perils)
  perilTypes: text("peril_types").array().default(sql`'{}'::text[]`),

  // Property type applicability
  propertyTypes: text("property_types").array().default(sql`ARRAY['residential', 'commercial']`),

  // UI ordering
  sortOrder: integer("sort_order").default(0),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  prefixIdx: index("idx_photo_categories_prefix").on(table.prefix),
  parentIdx: index("idx_photo_categories_parent").on(table.parentPrefix),
}));

export const insertPhotoCategorySchema = createInsertSchema(photoCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPhotoCategory = z.infer<typeof insertPhotoCategorySchema>;
export type PhotoCategory = typeof photoCategories.$inferSelect;

// ============================================
// CLAIM PHOTOS TABLE
// ============================================

export const claimPhotos = pgTable("claim_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").references(() => claims.id, { onDelete: 'cascade' }), // Nullable - allows uncategorized photos not yet assigned to a claim
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),

  // Optional hierarchy links (photos can be at any level)
  structureId: uuid("structure_id").references(() => claimStructures.id, { onDelete: 'set null' }),
  roomId: uuid("room_id").references(() => claimRooms.id, { onDelete: 'set null' }),
  damageZoneId: uuid("damage_zone_id").references(() => claimDamageZones.id, { onDelete: 'set null' }),

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

  // Flow context (for linking to flow engine movements)
  flowInstanceId: uuid("flow_instance_id").references(() => claimFlowInstances.id, { onDelete: 'set null' }),
  movementId: text("movement_id"), // Format: "phaseId:movementId"
  capturedContext: text("captured_context"), // Additional context about how/when photo was captured

  // Taxonomy categorization
  taxonomyPrefix: varchar("taxonomy_prefix", { length: 20 }), // e.g., 'RF-TSQ', 'WTR-SRC'
  taxonomyCategoryId: uuid("taxonomy_category_id").references(() => photoCategories.id, { onDelete: 'set null' }),
  autoCategorized: boolean("auto_categorized").default(false), // True if AI auto-categorized

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
  flowInstanceIdx: index("claim_photos_flow_instance_idx").on(table.flowInstanceId),
  movementIdx: index("claim_photos_movement_idx").on(table.movementId),
  taxonomyIdx: index("claim_photos_taxonomy_idx").on(table.taxonomyPrefix),
  taxonomyCategoryIdx: index("claim_photos_taxonomy_category_idx").on(table.taxonomyCategoryId),
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
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  claimId: uuid("claim_id").references(() => claims.id, { onDelete: 'cascade' }),

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
  organizationId: uuid("organization_id").references(() => organizations.id), // Tenant isolation
  claimId: uuid("claim_id").references(() => claims.id, { onDelete: 'cascade' }),
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
  estimateId: uuid("estimate_id").notNull().references(() => estimates.id, { onDelete: 'cascade' }),

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
  damageZoneId: uuid("damage_zone_id").references(() => damageZones.id, { onDelete: 'set null' }),
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
// DAMAGE ZONES TABLE (Legacy)
// ============================================
/**
 * DamageZones - Legacy zone table for basic estimate damage areas
 * 
 * @deprecated Use estimateZones for new development. This table is maintained
 * for backwards compatibility with existing estimates.
 * 
 * PURPOSE: Original zone storage for estimates. Provides basic room dimensions
 * and damage classification without the enhanced Xactimate integration.
 * 
 * MIGRATION PATH:
 * - New estimates should use estimateZones instead
 * - Existing estimates will continue to work with this table
 * - Consider migrating existing data to estimateZones when feasible
 * 
 * RELATIONSHIP TO OTHER ZONE TABLES:
 * - claimDamageZones: Voice Sketch captured zones (claim-level, pre-estimate)
 * - damageZones: THIS TABLE - Basic estimate zones (legacy)
 * - estimateZones: Enhanced zones with Xactimate compatibility (current)
 * 
 * FK: estimateId -> estimates.id
 */
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
// @deprecated This table is superseded by the estimate_zones + estimate_areas hierarchy.
// The modern spatial structure uses:
//   - estimate_zones: Top-level spatial containers (rooms/exteriors)
//   - estimate_areas: Granular damage areas within zones
// This table exists for backwards compatibility but new code should use the zones/areas system.
// Do not add new references to this table.

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
/**
 * EstimateZones - Primary zone table for estimate areas with full Xactimate compatibility
 * 
 * PURPOSE: Stores detailed zone information for estimates including:
 * - Room dimensions (manual entry or from Voice Sketch)
 * - Sketch polygon data for visualization
 * - Xactimate-compatible room info
 * - Damage classification and severity
 * - Line item totals for reporting
 * 
 * HIERARCHY POSITION:
 * Estimate -> Coverage -> Structure -> Area -> Zone -> Line Item
 * 
 * This table is at the "Zone" level, representing individual rooms or areas
 * that contain line items. Each zone belongs to an "Area" (e.g., "First Floor Interior").
 * 
 * RELATIONSHIP TO OTHER ZONE TABLES:
 * - claimDamageZones: Voice Sketch captured zones (claim-level, pre-estimate)
 * - damageZones: Basic estimate zones (deprecated/legacy)
 * - estimateZones: THIS TABLE - Enhanced zones with Xactimate compatibility (current)
 * 
 * DATA SOURCES:
 * - Manual entry: User types in dimensions
 * - Voice Sketch: Converted from claimDamageZones
 * - AI Suggestions: Generated from document analysis
 * 
 * FK: areaId -> estimateAreas.id
 */
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
  ceilingHeightFt: decimal("ceiling_height_ft", { precision: 6, scale: 2 }).default("8.0"), // Alias for clarity
  pitch: varchar("pitch", { length: 10 }),
  pitchMultiplier: decimal("pitch_multiplier", { precision: 6, scale: 4 }).default("1.0"),

  // Canonical geometry for voice-first sketch (see docs/sketch-esx-architecture.md)
  // Floor plan positioning in feet
  originXFt: decimal("origin_x_ft", { precision: 8, scale: 2 }).default("0"),
  originYFt: decimal("origin_y_ft", { precision: 8, scale: 2 }).default("0"),
  // Polygon vertices in feet, CCW winding order: [{x, y}, {x, y}, ...]
  polygonFt: jsonb("polygon_ft").default(sql`'[]'::jsonb`),
  // Shape type for rendering hints
  shapeType: varchar("shape_type", { length: 10 }).default("RECT"), // RECT, L, T, POLY
  // Level grouping for ESX export
  levelName: varchar("level_name", { length: 50 }).default("Main Level"),

  // Calculated dimensions stored as JSONB
  dimensions: jsonb("dimensions").default(sql`'{}'::jsonb`),

  // Room info for Xactimate
  roomInfo: jsonb("room_info").default(sql`'{}'::jsonb`),

  // Sketch polygon data (legacy - use polygonFt for canonical geometry)
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
// ZONE OPENINGS TABLE (Canonical Geometry)
// ============================================
/**
 * ZoneOpenings - Wall openings (doors, windows, cased openings) for canonical geometry
 *
 * PURPOSE: Stores openings referenced by wall index into the zone's polygon.
 * This supports the voice-first sketch workflow where openings are placed
 * precisely on walls derived from the room polygon.
 *
 * WALL INDEXING:
 * - wall_index corresponds to the polygon edge (0 = edge from vertex 0 to vertex 1)
 * - offset_from_vertex_ft is the distance along the wall from the starting vertex
 *
 * See: docs/sketch-esx-architecture.md for full architecture details.
 */
export const zoneOpenings = pgTable("zone_openings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").notNull().references(() => estimateZones.id, { onDelete: 'cascade' }),

  // Opening type
  openingType: varchar("opening_type", { length: 30 }).notNull(), // door, window, cased_opening, archway, sliding_door, french_door

  // Wall reference (index into polygon edges)
  wallIndex: integer("wall_index").notNull(), // 0-based index of polygon edge

  // Position on wall
  offsetFromVertexFt: decimal("offset_from_vertex_ft", { precision: 8, scale: 2 }).notNull(), // Distance from starting vertex

  // Dimensions
  widthFt: decimal("width_ft", { precision: 6, scale: 2 }).notNull(),
  heightFt: decimal("height_ft", { precision: 6, scale: 2 }).notNull(),
  sillHeightFt: decimal("sill_height_ft", { precision: 6, scale: 2 }), // For windows

  // Optional: which zone this opening connects to
  connectsToZoneId: uuid("connects_to_zone_id").references(() => estimateZones.id, { onDelete: 'set null' }),

  // Metadata
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  zoneIdx: index("zone_openings_zone_idx").on(table.zoneId),
  wallIdx: index("zone_openings_wall_idx").on(table.zoneId, table.wallIndex),
}));

export const insertZoneOpeningSchema = createInsertSchema(zoneOpenings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ZoneOpening = typeof zoneOpenings.$inferSelect;
export type InsertZoneOpening = z.infer<typeof insertZoneOpeningSchema>;

// ============================================
// ZONE CONNECTIONS TABLE (Canonical Geometry)
// ============================================
/**
 * ZoneConnections - Room-to-room relationships for floor plan topology
 *
 * PURPOSE: Stores connections between zones for:
 * - Floor plan visualization (connecting rooms)
 * - ESX export (room groupings and relationships)
 * - Voice sketch connectivity ("this room connects to the kitchen")
 *
 * CONNECTION TYPES:
 * - door: Standard door connection
 * - opening: Cased opening or archway
 * - shared_wall: Rooms share a wall segment (no opening)
 *
 * See: docs/sketch-esx-architecture.md for full architecture details.
 */
export const zoneConnections = pgTable("zone_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull().references(() => estimates.id, { onDelete: 'cascade' }),

  // Connected zones
  fromZoneId: uuid("from_zone_id").notNull().references(() => estimateZones.id, { onDelete: 'cascade' }),
  toZoneId: uuid("to_zone_id").notNull().references(() => estimateZones.id, { onDelete: 'cascade' }),

  // Connection type
  connectionType: varchar("connection_type", { length: 30 }).notNull(), // door, opening, shared_wall, hallway, stairway

  // Optional: reference to the opening that creates this connection
  openingId: uuid("opening_id").references(() => zoneOpenings.id, { onDelete: 'set null' }),

  // Metadata
  notes: text("notes"),

  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("zone_connections_estimate_idx").on(table.estimateId),
  fromIdx: index("zone_connections_from_idx").on(table.fromZoneId),
  toIdx: index("zone_connections_to_idx").on(table.toZoneId),
}));

export const insertZoneConnectionSchema = createInsertSchema(zoneConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ZoneConnection = typeof zoneConnections.$inferSelect;
export type InsertZoneConnection = z.infer<typeof insertZoneConnectionSchema>;

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
 * Asset definition within a workflow step (source of truth in workflow_json)
 */
export interface WorkflowJsonAsset {
  asset_type: string;
  label: string;
  required: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Step definition within workflow_json (source of truth)
 * step_index in inspection_workflow_steps MUST match the array position here (1-indexed compatible)
 * steps[0] → step_index = 1, steps[n-1] → step_index = n
 */
export interface WorkflowJsonStep {
  phase: InspectionPhase;
  step_type: InspectionStepType;
  title: string;
  instructions: string;
  required: boolean;
  tags?: string[];
  estimated_minutes: number;
  assets?: WorkflowJsonAsset[];
  peril_specific?: string | null;
  // Endorsement/policy source if step was generated from policy requirements
  endorsement_source?: string | null;
  // Dynamic workflow fields (optional)
  origin?: string;
  source_rule_id?: string;
  conditions?: Record<string, unknown>;
  evidence_requirements?: Record<string, unknown>[];
  blocking?: string;
  blocking_condition?: Record<string, unknown>;
  geometry_binding?: Record<string, unknown>;
  room_id?: string;
  room_name?: string;
}

/**
 * Structure for workflow JSON content
 * IMPORTANT: workflow_json.steps is the SOURCE OF TRUTH for all inspection steps.
 * inspection_workflow_steps table entries MUST be derived from this array.
 */
export interface InspectionWorkflowJson {
  metadata: {
    claim_number: string;
    primary_peril: string;
    secondary_perils: string[];
    property_type?: string;
    estimated_total_time_minutes: number;
    generated_at: string;
    data_completeness?: number;
    endorsement_driven_steps?: number;
    rules_applied?: string[];
  };
  phases: {
    phase: InspectionPhase;
    title: string;
    description: string;
    estimated_minutes: number;
    step_count: number;
  }[];
  /**
   * SOURCE OF TRUTH: All workflow steps in order.
   * - This array MUST be non-empty for a valid workflow
   * - step_index = array position + 1 (1-indexed)
   * - inspection_workflow_steps rows are derived from this array
   */
  steps: WorkflowJsonStep[];
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

  // Dynamic workflow fields (from migration 038)
  origin: varchar("origin", { length: 30 }).default("manual"), // base_rule, policy_rule, peril_rule, discovery, geometry, manual
  sourceRuleId: varchar("source_rule_id", { length: 100 }),
  conditions: jsonb("conditions").default(sql`'{}'::jsonb`),
  evidenceRequirements: jsonb("evidence_requirements").default(sql`'[]'::jsonb`),
  blocking: varchar("blocking", { length: 20 }).default("advisory"), // blocking, advisory, conditional
  blockingCondition: jsonb("blocking_condition"),
  geometryBinding: jsonb("geometry_binding"),
  endorsementSource: varchar("endorsement_source", { length: 100 }),

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
  templateId: uuid("template_id"), // Optional: link to checklist template if using templates

  // Progress tracking
  totalItems: integer("total_items").notNull().default(0),
  completedItems: integer("completed_items").notNull().default(0),
  status: varchar("status", { length: 30 }).notNull().default("active"), // active, completed, archived

  // Metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),

  // Audit fields
  createdBy: uuid("created_by").references(() => users.id), // User who created the checklist

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

// ============================================
// EFFECTIVE POLICY RESOLUTION TYPES
// ============================================

/**
 * Loss settlement basis for coverage components
 */
export type LossSettlementBasis = "RCV" | "ACV" | "SCHEDULED";

/**
 * Coverage rules for a specific coverage type (A, B, C, D)
 */
export interface CoverageRules {
  limit?: string;                    // Coverage limit from policy
  deductible?: string;               // Deductible amount if specific to this coverage
  settlementBasis?: LossSettlementBasis;  // How loss is settled
  specialLimits?: {
    propertyType: string;
    limit: string;
    conditions?: string;
  }[];
  exclusions?: string[];             // Items excluded from this coverage
  conditions?: string[];             // Special conditions that apply
  sourceEndorsement?: string;        // Endorsement that modified this coverage
}

/**
 * Roofing system loss settlement rules
 * Captures complex roof schedules from endorsements
 */
export interface RoofingSystemLossSettlement {
  applies: boolean;                  // Whether special roofing rules apply
  basis: LossSettlementBasis;        // RCV, ACV, or SCHEDULED
  paymentPercentage?: number;        // Percentage of RCV paid (for schedules)
  ageBasedSchedule?: {               // Age-based depreciation schedule
    minAge: number;
    maxAge: number;
    paymentPercentage: number;
  }[];
  appliesTo?: string[];              // Roof materials this applies to
  exclusions?: string[];             // Materials excluded from schedule
  metalComponentRule?: {             // Special rule for metal components
    coveredOnlyIf?: string;          // e.g., "water intrusion occurs"
    settlementBasis?: LossSettlementBasis;
  };
  sourceEndorsement?: string;        // Endorsement that establishes these rules
}

/**
 * The resolved effective policy for a claim
 * Merges base policy with all applicable endorsements
 *
 * Precedence order (highest to lowest):
 * 1. Loss settlement / schedule endorsements
 * 2. Coverage-specific endorsements
 * 3. State amendatory endorsements
 * 4. Base policy form
 *
 * Conflicts resolved using "most specific rule wins"
 */
export interface EffectivePolicy {
  claimId: string;
  jurisdiction?: string;             // State or jurisdiction code
  policyNumber?: string;             // Policy number for reference
  effectiveDate?: string;            // Policy effective date

  // Coverage limits and rules
  coverages: {
    coverageA?: CoverageRules;       // Dwelling
    coverageB?: CoverageRules;       // Other Structures
    coverageC?: CoverageRules;       // Personal Property
    coverageD?: CoverageRules;       // Loss of Use
  };

  // Loss settlement provisions
  lossSettlement: {
    dwellingAndStructures?: {
      basis: LossSettlementBasis;
      repairRequirements?: string;
      timeLimit?: string;
      matchingRules?: string;
      sourceEndorsement?: string;
    };
    roofingSystem?: RoofingSystemLossSettlement;
    personalProperty?: {
      settlementBasis: LossSettlementBasis;
      specialHandling?: string[];
      sourceEndorsement?: string;
    };
  };

  // Deductibles
  deductibles: {
    standard?: string;
    windHail?: string;
    hurricane?: string;
    namedStorm?: string;
    sourceEndorsements?: string[];
  };

  // Global exclusions and conditions
  exclusions: string[];              // All applicable exclusions
  conditions: string[];              // All applicable conditions

  // Source tracking for auditability
  // Maps provision name to list of source document IDs
  sourceMap: Record<string, string[]>;

  // Resolution metadata
  resolvedAt: string;                // ISO timestamp of resolution
  resolvedFromDocuments: {
    basePolicyId?: string;
    endorsementIds: string[];
  };
}

/**
 * Policy validation result for estimate line items
 * Advisory only - does not block estimates
 */
export type PolicyValidationSeverity = "info" | "warning";

export interface PolicyValidationResult {
  id: string;
  severity: PolicyValidationSeverity;
  policyRule: string;                // The rule being applied
  ruleDescription: string;           // Human-readable description
  sourceEndorsement?: string;        // Endorsement source if applicable
  affectedLineItemIds: string[];     // Line items affected by this rule
  affectedLineItemCodes?: string[];  // Xactimate codes for display
  recommendedAction: string;         // What the adjuster should do

  // Additional context for specific validations
  context?: {
    depreciationSchedule?: {         // For depreciation-related validations
      roofAge?: number;
      depreciationPercentage?: number;
    };
    exclusionReason?: string;        // For exclusion-related validations
    documentationRequired?: string[]; // For documentation-related validations
  };
}

/**
 * Complete policy validation response
 */
export interface PolicyValidationResponse {
  claimId: string;
  effectivePolicyId?: string;
  validatedAt: string;
  totalLineItems: number;
  validationResults: PolicyValidationResult[];
  summary: {
    infoCount: number;
    warningCount: number;
  };
}

/**
 * Feature flags for effective policy resolution
 * Stored in organization.settings JSONB
 */
export interface EffectivePolicyFeatureFlags {
  enabled: boolean;
  version: number;
  enableInspectionIntegration: boolean;
  enableEstimateValidation: boolean;
}

// ============================================
// UNIFIED CLAIM CONTEXT (Rich Data Integration)
// ============================================
// This unified context merges FNOL + Policy + Endorsements into a single
// rich data structure that powers AI briefing, workflow generation,
// coverage analysis, and UI display.

/**
 * Raw FNOL extraction structure (matches AI prompt output)
 * This is what the AI returns - 100% of FNOL data
 */
export interface FNOLExtractionRaw {
  claim_information_report?: {
    claim_number?: string;
    date_of_loss?: string;
    policy_number?: string;
    policyholders?: string[];
    claim_status?: string;
    operating_company?: string;
    loss_details?: {
      cause?: string;
      location?: string;
      description?: string;
      weather_data_status?: string;
      drone_eligible_at_fnol?: string;
    };
  };
  insured_information?: {
    name_1?: string;
    name_1_address?: string;
    name_2?: string;
    name_2_address?: string;
    email?: string;
    phone?: string;
  };
  property_damage_information?: {
    dwelling_incident_damages?: string;
    roof_damage?: string;
    exterior_damages?: string;
    interior_damages?: string;
    number_of_stories?: number;
    wood_roof?: string;
    year_roof_installed?: string;
    year_built?: string;
  };
  policy_information?: {
    producer?: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
    };
    risk_address?: string;
    policy_type?: string;
    status?: string;
    inception_date?: string;
    expiration_date?: string;
    legal_description?: string;
    third_party_interest?: string;
    line_of_business?: string;
    deductibles?: {
      policy_deductible?: string;
      wind_hail_deductible?: string;
      hurricane_deductible?: string;
      flood_deductible?: string;
      earthquake_deductible?: string;
    };
  };
  policy_level_endorsements?: Array<{
    code?: string;
    description?: string;
  }>;
  policy_coverage?: {
    location?: string;
    coverages?: {
      coverage_a_dwelling?: { limit?: string; percentage?: string; valuation_method?: string };
      coverage_b_scheduled_structures?: { limit?: string; item?: string; article_number?: string; valuation_method?: string };
      coverage_b_unscheduled_structures?: { limit?: string; valuation_method?: string };
      coverage_c_personal_property?: { limit?: string; percentage?: string };
      coverage_d_loss_of_use?: { limit?: string; percentage?: string };
      coverage_e_personal_liability?: { limit?: string };
      coverage_f_medical_expense?: { limit?: string };
      [key: string]: { limit?: string; percentage?: string; [k: string]: any } | undefined;
    };
  };
  report_metadata?: {
    reported_by?: string;
    report_method?: string;
    reported_date?: string;
    entered_date?: string;
    report_source?: string;
  };
}

/**
 * Raw Policy extraction structure (matches AI prompt output)
 */
export interface PolicyExtractionRaw {
  document_info?: {
    form_number?: string;
    form_name?: string;
    total_pages?: number;
    copyright?: string;
    execution?: {
      location?: string;
      signatories?: string[];
    };
  };
  table_of_contents?: Record<string, number>;
  agreement_and_definitions?: {
    policy_components?: string[];
    key_definitions?: Record<string, string>;
  };
  section_I_property_coverages?: {
    coverage_a_dwelling?: { included?: string[]; excluded?: string[] };
    coverage_b_other_structures?: { definition?: string; excluded_types?: string[] };
    coverage_c_personal_property?: {
      scope?: string;
      limit_away_from_premises?: string;
      special_limits_of_liability?: Record<string, number>;
    };
    coverage_d_loss_of_use?: {
      additional_living_expense?: string;
      civil_authority_prohibits_use?: string;
    };
  };
  section_I_perils_insured_against?: {
    dwelling_perils?: string[];
    personal_property_perils?: string[];
  };
  section_I_exclusions?: {
    general_exclusions?: string[];
  };
  section_I_additional_coverages?: Record<string, string | number>;
  section_I_how_we_settle_losses?: {
    dwelling_and_other_structures?: {
      initial_payment?: string;
      replacement_cost?: string;
      hail_damage_metal_siding?: string;
    };
    roofing_system?: {
      settlement_method?: string;
      cosmetic_exclusion?: string;
    };
  };
  section_II_liability_coverages?: {
    coverage_e_personal_liability?: string;
    coverage_f_medical_expense?: string;
    liability_exclusions?: string[];
  };
  general_conditions?: Record<string, string>;
}

/**
 * Raw Endorsement extraction structure (matches AI prompt output)
 * Note: AI returns named objects, not an array
 */
export interface EndorsementExtractionRaw {
  [endorsementKey: string]: {
    form_number?: string;
    purpose?: string;
    definitions_modified?: Record<string, any>;
    property_coverage_changes?: Record<string, any>;
    settlement_and_conditions?: Record<string, any>;
    liability_modifications?: Record<string, any>;
    roof_surface_payment_schedule_examples?: Record<string, any>;
    complete_schedule?: Array<{
      roof_age_years?: number;
      architectural_shingle_pct?: number;
      other_composition_pct?: number;
      metal_pct?: number;
      tile_pct?: number;
      slate_pct?: number;
      wood_pct?: number;
      rubber_pct?: number;
      [materialType: string]: number | undefined;
    }>;
    [key: string]: any;
  };
}

/**
 * Roof payment schedule entry (normalized from endorsement)
 */
export interface RoofPaymentScheduleEntry {
  roofAgeYears: number;
  architecturalShinglePct: number;
  otherCompositionPct: number;
  metalPct: number;
  tilePct: number;
  slatePct: number;
  woodPct: number;
  rubberPct: number;
}

/**
 * Endorsement impact analysis
 */
export interface EndorsementImpact {
  formCode: string;
  title: string;
  category: 'loss_settlement' | 'coverage_modification' | 'exclusion' | 'definition' | 'state_amendatory' | 'general';
  precedencePriority: number;
  impacts: string[];
  inspectionRequirements: string[];
  estimateConsiderations: string[];
  hasRoofSchedule: boolean;
  roofSchedule?: RoofPaymentScheduleEntry[];
}

/**
 * Coverage limit with source tracking
 */
export interface CoverageLimit {
  limit: number;
  limitFormatted: string;
  percentage?: number;
  valuationMethod?: 'RCV' | 'ACV';
  specialItems?: Array<{ item: string; limit: number; articleNumber?: string }>;
  source: 'fnol' | 'policy' | 'endorsement';
}

/**
 * Special limits of liability for personal property
 */
export interface SpecialLimitsOfLiability {
  moneyBankNotes?: number;
  jewelry?: number;
  firearms?: number;
  silverware?: number;
  securities?: number;
  watercraft?: number;
  trailers?: number;
  businessProperty?: number;
  tradingCards?: number;
  rugs?: number;
  tools?: number;
  [category: string]: number | undefined;
}

/**
 * Deductible structure with all peril types
 */
export interface DeductibleStructure {
  standard?: { amount: number; formatted: string; isPercentage: boolean };
  windHail?: { amount: number; formatted: string; isPercentage: boolean };
  hurricane?: { amount: number; formatted: string; isPercentage: boolean };
  flood?: { amount: number; formatted: string; isPercentage: boolean };
  earthquake?: { amount: number; formatted: string; isPercentage: boolean };
  applicableForPeril: { amount: number; formatted: string; perilType: string };
}

/**
 * Property details with computed fields
 */
export interface PropertyDetails {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  yearBuilt?: number;
  stories?: number;
  roof: {
    yearInstalled?: number;
    ageAtLoss?: number;
    isWoodRoof: boolean;
    material?: string;
    damageScope?: string;
  };
  exteriorDamaged: boolean;
  interiorDamaged: boolean;
  // Multi-structure detection (Coverage B - Other Structures)
  hasOtherStructures?: boolean;
  otherStructuresCoverage?: number;
  otherStructuresPercentage?: number;
}

/**
 * Loss settlement rules (merged from policy + endorsements)
 */
export interface LossSettlementRules {
  dwelling: {
    basis: LossSettlementBasis;
    repairTimeLimitMonths?: number;
    fallbackBasis?: LossSettlementBasis;
    sourceEndorsement?: string;
  };
  roofing: {
    basis: LossSettlementBasis;
    isScheduled: boolean;
    schedule?: RoofPaymentScheduleEntry[];
    calculatedPaymentPct?: number;
    metalFunctionalRequirement: boolean;
    metalFunctionalRuleText?: string;
    sourceEndorsement?: string;
  };
  personalProperty: {
    basis: LossSettlementBasis;
    sourceEndorsement?: string;
  };
}

/**
 * Coverage gap or warning
 */
export interface CoverageAlert {
  severity: 'info' | 'warning' | 'critical';
  category: 'deductible' | 'limit' | 'exclusion' | 'depreciation' | 'documentation' | 'coverage' | 'policy_validation';
  title: string;
  description: string;
  actionRequired?: string;
  relatedEndorsement?: string;
}

/**
 * Policy validation - checks if policy was active at loss date
 */
export interface PolicyValidation {
  policyType?: string;           // HO-3, HO-5, etc.
  status?: string;               // active, cancelled, expired
  inceptionDate?: string;        // Policy start date
  expirationDate?: string;       // Policy end date
  wasActiveAtLoss: boolean;      // Computed: was policy active on date of loss?
  validationMessage?: string;    // Any validation warnings
}

/**
 * Coverage scope details from policy extraction
 */
export interface CoverageScope {
  dwelling?: {
    included?: string[];
    excluded?: string[];
  };
  otherStructures?: {
    definition?: string;
    excludedTypes?: string[];
  };
  personalProperty?: {
    scope?: string;
    limitAwayFromPremises?: string;
  };
  lossOfUse?: {
    additionalLivingExpense?: string;
    civilAuthorityProhibitsUse?: string;
  };
}

/**
 * Perils insured against from policy
 */
export interface PerilsCovered {
  dwellingPerils?: string[];
  personalPropertyPerils?: string[];
  isOpenPeril?: boolean;        // Open peril = all risks except excluded
  isNamedPeril?: boolean;       // Named peril = only listed perils covered
}

/**
 * Loss details from FNOL
 */
export interface LossDetails {
  description?: string;          // Full loss narrative
  dwellingIncidentDamages?: string;
  cause?: string;
  location?: string;
  weatherDataStatus?: string;
  droneEligibleAtFnol?: boolean;
}

/**
 * Third party interests (mortgagees, additional insureds)
 */
export interface ThirdPartyInterest {
  type?: string;                 // mortgagee, additional_insured, loss_payee
  name?: string;
  details?: string;
}

/**
 * Settlement rules for dwelling and other structures from policy
 */
export interface DwellingSettlementRules {
  initialPayment?: string;
  replacementCost?: string;
  hailDamageMetalSiding?: string;
  matchingRules?: string;
  repairTimeLimit?: string;
}

/**
 * Producer/Agent information
 */
export interface ProducerInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
}

/**
 * Peril analysis with applicable rules
 */
export interface PerilAnalysis {
  primary: Peril;
  primaryDisplay: string;
  secondary: Peril[];
  secondaryDisplay: string[];
  applicableDeductible: { amount: number; formatted: string };
  applicableExclusions: string[];
  inspectionFocus: string[];
  commonMisses: string[];
}

/**
 * Computed insights from the claim data
 */
export interface ClaimInsights {
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
}

/**
 * UNIFIED CLAIM CONTEXT
 * The single source of truth that merges FNOL + Policy + Endorsements
 * and powers all downstream consumers (briefing, workflow, UI, etc.)
 */
export interface UnifiedClaimContext {
  // === IDENTITY ===
  claimId: string;
  claimNumber: string;
  policyNumber?: string;
  dateOfLoss?: string;
  dateOfLossFormatted?: string;
  reportedDate?: string;
  reportedBy?: string;

  // === INSURED ===
  insured: {
    name: string;
    name2?: string;
    policyholders?: string[];      // All named policyholders from FNOL
    email?: string;
    phone?: string;
    mailingAddress?: string;
    secondaryAddress?: string;     // name_2_address
  };

  // === PROPERTY ===
  property: PropertyDetails;

  // === LOSS DETAILS (from FNOL) ===
  lossDetails: LossDetails;

  // === POLICY VALIDATION ===
  policyValidation: PolicyValidation;

  // === THIRD PARTY INTERESTS ===
  thirdPartyInterests?: ThirdPartyInterest[];

  // === PRODUCER ===
  producer?: ProducerInfo;

  // === PERIL ANALYSIS ===
  peril: PerilAnalysis;

  // === PERILS COVERED (from Policy) ===
  perilsCovered?: PerilsCovered;

  // === COVERAGE LIMITS ===
  coverages: {
    dwelling?: CoverageLimit;
    otherStructures?: CoverageLimit;
    personalProperty?: CoverageLimit;
    lossOfUse?: CoverageLimit;
    personalLiability?: CoverageLimit;
    medicalPayments?: CoverageLimit;
    additionalCoverages: Record<string, CoverageLimit>;
  };

  // === COVERAGE SCOPE (from Policy) ===
  coverageScope?: CoverageScope;

  // === DWELLING SETTLEMENT RULES (from Policy) ===
  dwellingSettlementRules?: DwellingSettlementRules;

  // === SPECIAL LIMITS ===
  specialLimits: SpecialLimitsOfLiability;

  // === DEDUCTIBLES ===
  deductibles: DeductibleStructure;

  // === LOSS SETTLEMENT ===
  lossSettlement: LossSettlementRules;

  // === EXCLUSIONS ===
  exclusions: {
    general: string[];
    liability: string[];           // Section II liability exclusions
    endorsementAdded: string[];
    endorsementRemoved: string[];
    applicableToPeril: string[];
  };

  // === ENDORSEMENTS ===
  endorsements: {
    listedOnFnol: Array<{ code: string; description: string }>;
    extracted: EndorsementImpact[];
    byCategory: {
      lossSettlement: EndorsementImpact[];
      coverageModification: EndorsementImpact[];
      stateAmendatory: EndorsementImpact[];
      other: EndorsementImpact[];
    };
  };

  // === POLICY DEFINITIONS ===
  definitions: Record<string, string>;

  // === COVERAGE ALERTS ===
  alerts: CoverageAlert[];

  // === COMPUTED INSIGHTS ===
  insights: ClaimInsights;

  // === METADATA ===
  meta: {
    builtAt: string;
    fnolDocumentId?: string;
    policyDocumentId?: string;
    endorsementDocumentIds: string[];
    dataCompleteness: {
      hasFnol: boolean;
      hasPolicy: boolean;
      hasEndorsements: boolean;
      completenessScore: number; // 0-100
    };
  };
}

/**
 * Roof depreciation calculation result
 */
export interface RoofDepreciationResult {
  roofAge: number;
  roofMaterial: string;
  scheduleFormCode?: string;
  paymentPercentage: number;
  depreciationPercentage: number;
  isScheduledBasis: boolean;
  scheduleEntry?: RoofPaymentScheduleEntry;
  notes: string[];
}

/**
 * Coverage analysis result
 */
export interface CoverageAnalysisResult {
  claimId: string;
  analyzedAt: string;
  alerts: CoverageAlert[];
  endorsementImpacts: EndorsementImpact[];
  depreciation?: RoofDepreciationResult;
  estimatedMaxPayments: {
    dwelling?: number;
    otherStructures?: number;
    personalProperty?: number;
    total?: number;
  };
  recommendations: string[];
}

// ============================================
// DRIZZLE RELATIONS (Type-safe Joins)
// ============================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(organizationMemberships),
  claims: many(claims),
  documents: many(documents),
  estimates: many(estimates),
  policyFormExtractions: many(policyFormExtractions),
  endorsementExtractions: many(endorsementExtractions),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  memberships: many(organizationMemberships),
  currentOrganization: one(organizations, {
    fields: [users.currentOrganizationId],
    references: [organizations.id],
  }),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  user: one(users, {
    fields: [organizationMemberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [claims.organizationId],
    references: [organizations.id],
  }),
  documents: many(documents),
  estimates: many(estimates),
  policyFormExtractions: many(policyFormExtractions),
  endorsementExtractions: many(endorsementExtractions),
  claimBriefings: many(claimBriefings),
  claimStructures: many(claimStructures),
  claimPhotos: many(claimPhotos),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  claim: one(claims, {
    fields: [documents.claimId],
    references: [claims.id],
  }),
}));

export const estimatesRelations = relations(estimates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [estimates.organizationId],
    references: [organizations.id],
  }),
  claim: one(claims, {
    fields: [estimates.claimId],
    references: [claims.id],
  }),
  structures: many(estimateStructures),
  lineItems: many(estimateLineItems),
}));

export const estimateStructuresRelations = relations(estimateStructures, ({ one, many }) => ({
  estimate: one(estimates, {
    fields: [estimateStructures.estimateId],
    references: [estimates.id],
  }),
  areas: many(estimateAreas),
}));

export const estimateAreasRelations = relations(estimateAreas, ({ one, many }) => ({
  structure: one(estimateStructures, {
    fields: [estimateAreas.structureId],
    references: [estimateStructures.id],
  }),
  zones: many(estimateZones),
}));

export const estimateZonesRelations = relations(estimateZones, ({ one, many }) => ({
  area: one(estimateAreas, {
    fields: [estimateZones.areaId],
    references: [estimateAreas.id],
  }),
  lineItems: many(estimateLineItems),
}));

export const estimateLineItemsRelations = relations(estimateLineItems, ({ one }) => ({
  estimate: one(estimates, {
    fields: [estimateLineItems.estimateId],
    references: [estimates.id],
  }),
  damageZone: one(damageZones, {
    fields: [estimateLineItems.damageZoneId],
    references: [damageZones.id],
  }),
}));

export const policyFormExtractionsRelations = relations(policyFormExtractions, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyFormExtractions.organizationId],
    references: [organizations.id],
  }),
  claim: one(claims, {
    fields: [policyFormExtractions.claimId],
    references: [claims.id],
  }),
  document: one(documents, {
    fields: [policyFormExtractions.documentId],
    references: [documents.id],
  }),
}));

export const endorsementExtractionsRelations = relations(endorsementExtractions, ({ one }) => ({
  organization: one(organizations, {
    fields: [endorsementExtractions.organizationId],
    references: [organizations.id],
  }),
  claim: one(claims, {
    fields: [endorsementExtractions.claimId],
    references: [claims.id],
  }),
  document: one(documents, {
    fields: [endorsementExtractions.documentId],
    references: [documents.id],
  }),
}));

export const claimBriefingsRelations = relations(claimBriefings, ({ one }) => ({
  claim: one(claims, {
    fields: [claimBriefings.claimId],
    references: [claims.id],
  }),
}));

export const claimStructuresRelations = relations(claimStructures, ({ one, many }) => ({
  claim: one(claims, {
    fields: [claimStructures.claimId],
    references: [claims.id],
  }),
  rooms: many(claimRooms),
}));

export const claimRoomsRelations = relations(claimRooms, ({ one, many }) => ({
  structure: one(claimStructures, {
    fields: [claimRooms.structureId],
    references: [claimStructures.id],
  }),
  damageZones: many(claimDamageZones),
}));

export const claimDamageZonesRelations = relations(claimDamageZones, ({ one }) => ({
  room: one(claimRooms, {
    fields: [claimDamageZones.roomId],
    references: [claimRooms.id],
  }),
}));

export const claimPhotosRelations = relations(claimPhotos, ({ one }) => ({
  claim: one(claims, {
    fields: [claimPhotos.claimId],
    references: [claims.id],
  }),
}));

// ============================================
// MS365 CALENDAR INTEGRATION TABLES
// ============================================

// Store MS365 OAuth tokens for each user
export const userMs365Tokens = pgTable("user_ms365_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"), // Nullable - tokens might not have expiration initially
  accountId: text("account_id"),
  scopes: text("scopes").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserMs365TokenSchema = createInsertSchema(userMs365Tokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserMs365Token = z.infer<typeof insertUserMs365TokenSchema>;
export type UserMs365Token = typeof userMs365Tokens.$inferSelect;

// Store scheduled inspection appointments
export const inspectionAppointments = pgTable("inspection_appointments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull(),
  userId: uuid("user_id").notNull(),
  organizationId: uuid("organization_id"),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  durationMinutes: integer("duration_minutes").default(60),
  status: varchar("status", { length: 50 }).default("scheduled"),
  appointmentType: varchar("appointment_type", { length: 50 }).default("initial_inspection"),
  ms365EventId: text("ms365_event_id"),
  // MS365 calendar sync fields
  allDay: boolean("all_day").default(false),
  reminderMinutes: integer("reminder_minutes").default(30),
  attendees: jsonb("attendees").default([]),
  recurrence: jsonb("recurrence"),
  syncStatus: varchar("sync_status", { length: 50 }).default("synced"),
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInspectionAppointmentSchema = createInsertSchema(inspectionAppointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInspectionAppointment = z.infer<typeof insertInspectionAppointmentSchema>;
export type InspectionAppointment = typeof inspectionAppointments.$inferSelect;

export const inspectionAppointmentsRelations = relations(inspectionAppointments, ({ one }) => ({
  claim: one(claims, {
    fields: [inspectionAppointments.claimId],
    references: [claims.id],
  }),
}));

// ============================================
// SCOPE ENGINE FOUNDATION TABLES
// ============================================
// Scope defines WHAT work is required, independent of pricing.
// See: docs/SCOPE_ENGINE.md for architecture details.

/**
 * Scope Trades - Canonical trade definitions for construction work
 * Maps to Xactimate trades and drives O&P eligibility
 */
export const scopeTrades = pgTable("scope_trades", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  xactCategoryPrefix: varchar("xact_category_prefix", { length: 10 }),
  sortOrder: integer("sort_order").default(0),
  opEligible: boolean("op_eligible").default(true),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  codeIdx: index("scope_trades_code_idx").on(table.code),
}));

export const insertScopeTradeSchema = createInsertSchema(scopeTrades).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScopeTrade = z.infer<typeof insertScopeTradeSchema>;
export type ScopeTrade = typeof scopeTrades.$inferSelect;

/**
 * Line Items - Main catalog of items (V2)
 * Replaces scope_line_items
 */
export const lineItems = pgTable("line_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id"),
  code: varchar("code").notNull().unique(),
  name: varchar("name").notNull(),
  description: text("description"),
  unit: varchar("unit").notNull(),
  unitPrice: decimal("unit_price").default("0"),
  materialCost: decimal("material_cost").default("0"),
  laborCost: decimal("labor_cost").default("0"),
  equipmentCost: decimal("equipment_cost").default("0"),
  tradeCode: varchar("trade_code"),
  depreciationType: varchar("depreciation_type"),
  defaultCoverageCode: varchar("default_coverage_code").default("A"),
  laborHoursPerUnit: decimal("labor_hours_per_unit"),
  xactimateCode: varchar("xactimate_code"),
  quantityFormula: text("quantity_formula"),
  scopeConditions: jsonb("scope_conditions"),
  requiresItems: jsonb("requires_items").default(sql`'[]'::jsonb`),
  autoAddItems: jsonb("auto_add_items").default(sql`'[]'::jsonb`),
  excludesItems: jsonb("excludes_items").default(sql`'[]'::jsonb`),
  replacesItems: jsonb("replaces_items").default(sql`'[]'::jsonb`),
  carrierSensitivityLevel: varchar("carrier_sensitivity_level").default("medium"),
  validationRules: jsonb("validation_rules"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  // Add indexes if needed
}));

export type LineItem = typeof lineItems.$inferSelect;

// Alias to lineItems for scope engine relations
export const scopeLineItems = lineItems; 

/**
 * Scope Line Item Companion Rules TypeScript interface
 */
export interface ScopeCompanionRules {
  requires?: string[];
  auto_adds?: string[];
  excludes?: string[];
}

/**
 * Scope Conditions TypeScript interface
 */
export interface ScopeConditionsConfig {
  damage_types?: string[];
  surfaces?: string[];
  severity?: string[];
  zone_types?: string[];
  room_types?: string[];
  floor_levels?: string[];
}

/**
 * Scope Items - Assembled scope linking zones to line items
 * This is the "scope" - WHAT work is required
 */
export const scopeItems = pgTable("scope_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  zoneId: uuid("zone_id"),
  wallIndex: integer("wall_index"),
  lineItemId: uuid("line_item_id"),
  lineItemCode: varchar("line_item_code", { length: 30 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 10 }).notNull(),
  wasteFactor: decimal("waste_factor", { precision: 4, scale: 3 }).default("0.00"),
  quantityWithWaste: decimal("quantity_with_waste", { precision: 12, scale: 4 }).notNull(),
  provenance: varchar("provenance", { length: 30 }).notNull().default("geometry_derived"),
  provenanceDetails: jsonb("provenance_details").default(sql`'{}'::jsonb`),
  tradeCode: varchar("trade_code", { length: 10 }),
  coverageType: varchar("coverage_type", { length: 1 }).default("A"),
  sortOrder: integer("sort_order").default(0),
  status: varchar("status", { length: 20 }).default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("scope_items_estimate_idx").on(table.estimateId),
  zoneIdx: index("scope_items_zone_idx").on(table.zoneId),
  lineItemIdx: index("scope_items_line_item_idx").on(table.lineItemId),
  tradeIdx: index("scope_items_trade_idx").on(table.tradeCode),
  statusIdx: index("scope_items_status_idx").on(table.status),
}));

export const insertScopeItemSchema = createInsertSchema(scopeItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScopeItem = z.infer<typeof insertScopeItemSchema>;
export type ScopeItem = typeof scopeItems.$inferSelect;

/**
 * Provenance types for scope items
 */
export type ScopeProvenance =
  | 'geometry_derived'
  | 'manual'
  | 'template'
  | 'ai_suggested'
  | 'voice_command';

/**
 * Provenance details TypeScript interface
 */
export interface ScopeProvenanceDetails {
  source_metric?: string;
  formula?: string;
  computed_at?: string;
  template_id?: string;
  voice_transcript?: string;
  original_quantity?: number;
  modification_reason?: string;
}

/**
 * Scope Summary - Aggregate scope by trade
 * NO pricing - just counts and quantities
 */
export const scopeSummary = pgTable("scope_summary", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: uuid("estimate_id").notNull(),
  tradeCode: varchar("trade_code", { length: 10 }).notNull(),
  lineItemCount: integer("line_item_count").default(0),
  zoneCount: integer("zone_count").default(0),
  quantitiesByUnit: jsonb("quantities_by_unit").default(sql`'{}'::jsonb`),
  pendingCount: integer("pending_count").default(0),
  approvedCount: integer("approved_count").default(0),
  excludedCount: integer("excluded_count").default(0),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  estimateIdx: index("scope_summary_estimate_idx").on(table.estimateId),
  tradeIdx: index("scope_summary_trade_idx").on(table.tradeCode),
}));

export const insertScopeSummarySchema = createInsertSchema(scopeSummary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScopeSummary = z.infer<typeof insertScopeSummarySchema>;
export type ScopeSummary = typeof scopeSummary.$inferSelect;

// ============================================
// SCOPE ENGINE RELATIONS
// ============================================

export const scopeTradesRelations = relations(scopeTrades, ({ many }) => ({
  lineItems: many(scopeLineItems),
  scopeItems: many(scopeItems),
}));

export const scopeLineItemsRelations = relations(scopeLineItems, ({ one, many }) => ({
  trade: one(scopeTrades, {
    fields: [scopeLineItems.tradeCode],
    references: [scopeTrades.code],
  }),
  scopeItems: many(scopeItems),
}));

export const scopeItemsRelations = relations(scopeItems, ({ one }) => ({
  estimate: one(estimates, {
    fields: [scopeItems.estimateId],
    references: [estimates.id],
  }),
  zone: one(estimateZones, {
    fields: [scopeItems.zoneId],
    references: [estimateZones.id],
  }),
  lineItem: one(scopeLineItems, {
    fields: [scopeItems.lineItemId],
    references: [scopeLineItems.id],
  }),
  trade: one(scopeTrades, {
    fields: [scopeItems.tradeCode],
    references: [scopeTrades.code],
  }),
}));

export const scopeSummaryRelations = relations(scopeSummary, ({ one }) => ({
  estimate: one(estimates, {
    fields: [scopeSummary.estimateId],
    references: [estimates.id],
  }),
  trade: one(scopeTrades, {
    fields: [scopeSummary.tradeCode],
    references: [scopeTrades.code],
  }),
}));

// ============================================
// DYNAMIC WORKFLOW EVIDENCE TYPES
// ============================================

/**
 * Step origin - where the step came from
 */
export enum StepOrigin {
  BASE_RULE = "base_rule",
  POLICY_RULE = "policy_rule",
  PERIL_RULE = "peril_rule",
  DISCOVERY = "discovery",
  GEOMETRY = "geometry",
  MANUAL = "manual",
}

/**
 * Blocking behavior for workflow steps
 */
export enum BlockingBehavior {
  BLOCKING = "blocking",
  ADVISORY = "advisory",
  CONDITIONAL = "conditional",
}

/**
 * Evidence types that can be required
 */
export enum EvidenceType {
  PHOTO = "photo",
  MEASUREMENT = "measurement",
  NOTE = "note",
  SIGNATURE = "signature",
  DOCUMENT = "document",
  CHECKLIST = "checklist",
}

/**
 * Photo angle requirements
 */
export type PhotoAngle =
  | "overview"
  | "detail"
  | "measurement"
  | "before_after"
  | "north"
  | "south"
  | "east"
  | "west"
  | "aerial"
  | "cross_section";

/**
 * Photo requirement specification
 */
export interface PhotoRequirement {
  minCount: number;
  maxCount?: number;
  angles?: PhotoAngle[];
  subjects?: string[];
  quality?: {
    minResolution?: number;
    requireFlash?: boolean;
    requireNoBlur?: boolean;
  };
  metadata?: {
    requireGps?: boolean;
    requireTimestamp?: boolean;
  };
}

/**
 * Measurement requirement specification
 */
export interface MeasurementRequirement {
  type: "linear" | "area" | "volume" | "moisture" | "temperature";
  unit: string;
  minReadings?: number;
  locations?: string[];
  tolerance?: number;
}

/**
 * Note requirement specification
 */
export interface NoteRequirement {
  minLength?: number;
  promptText: string;
  structuredFields?: {
    field: string;
    type: "text" | "number" | "boolean" | "select";
    required: boolean;
    options?: string[];
  }[];
}

/**
 * Evidence requirement for a workflow step
 */
export interface EvidenceRequirementSpec {
  type: EvidenceType;
  label: string;
  description?: string;
  required: boolean;
  photo?: PhotoRequirement;
  measurement?: MeasurementRequirement;
  note?: NoteRequirement;
}

/**
 * Geometry binding scope
 */
export type GeometryScope =
  | "structure"
  | "room"
  | "wall"
  | "zone"
  | "feature"
  | "exterior";

/**
 * Geometry binding specification
 */
export interface GeometryBindingSpec {
  scope: GeometryScope;
  structureId?: string;
  roomId?: string;
  wallDirection?: "north" | "south" | "east" | "west";
  zoneId?: string;
  featureId?: string;
  exteriorFace?: "north" | "south" | "east" | "west" | "roof";
}

// ============================================
// WORKFLOW STEP EVIDENCE TABLE
// ============================================

/**
 * Tracks evidence attached to workflow steps
 */
export const workflowStepEvidence = pgTable("workflow_step_evidence", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  stepId: uuid("step_id").notNull(),
  requirementId: varchar("requirement_id", { length: 100 }).notNull(),
  evidenceType: varchar("evidence_type", { length: 30 }).notNull(),

  // Reference to actual evidence
  photoId: uuid("photo_id"),
  measurementData: jsonb("measurement_data"),
  noteData: jsonb("note_data"),

  // Validation status
  validated: boolean("validated").default(false),
  validationErrors: jsonb("validation_errors").default(sql`'[]'::jsonb`),

  // Capture info
  capturedAt: timestamp("captured_at").default(sql`NOW()`),
  capturedBy: varchar("captured_by", { length: 100 }),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  stepIdx: index("workflow_step_evidence_step_idx").on(table.stepId),
  photoIdx: index("workflow_step_evidence_photo_idx").on(table.photoId),
  typeIdx: index("workflow_step_evidence_type_idx").on(table.evidenceType),
}));

export const insertWorkflowStepEvidenceSchema = createInsertSchema(workflowStepEvidence).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkflowStepEvidence = z.infer<typeof insertWorkflowStepEvidenceSchema>;
export type WorkflowStepEvidence = typeof workflowStepEvidence.$inferSelect;

// ============================================
// WORKFLOW MUTATIONS TABLE
// ============================================

/**
 * Audit trail for dynamic workflow changes
 */
export const workflowMutations = pgTable("workflow_mutations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: uuid("workflow_id").notNull(),

  // Mutation details
  trigger: varchar("trigger", { length: 50 }).notNull(),
  mutationData: jsonb("mutation_data").notNull(),

  // Result
  stepsAdded: jsonb("steps_added").default(sql`'[]'::jsonb`),
  stepsRemoved: jsonb("steps_removed").default(sql`'[]'::jsonb`),
  stepsModified: jsonb("steps_modified").default(sql`'[]'::jsonb`),

  // Audit
  triggeredBy: varchar("triggered_by", { length: 100 }),
  triggeredAt: timestamp("triggered_at").default(sql`NOW()`),

  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  workflowIdx: index("workflow_mutations_workflow_idx").on(table.workflowId),
  triggerIdx: index("workflow_mutations_trigger_idx").on(table.trigger),
}));

export const insertWorkflowMutationSchema = createInsertSchema(workflowMutations).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkflowMutation = z.infer<typeof insertWorkflowMutationSchema>;
export type WorkflowMutation = typeof workflowMutations.$inferSelect;

// ============================================
// WORKFLOW RULES TABLE
// ============================================

/**
 * Configurable workflow rules for dynamic step generation
 */
export const workflowRules = pgTable("workflow_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id"),

  // Rule identification
  ruleId: varchar("rule_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 20 }).default("1.0"),

  // Rule definition
  conditions: jsonb("conditions").notNull(),
  stepTemplate: jsonb("step_template").notNull(),
  evidence: jsonb("evidence").default(sql`'[]'::jsonb`),
  blocking: varchar("blocking", { length: 20 }).default("advisory"),
  blockingCondition: jsonb("blocking_condition"),
  geometryScope: varchar("geometry_scope", { length: 30 }),
  priority: integer("priority").default(50),
  origin: varchar("origin", { length: 30 }).default("base_rule"),
  sourceReference: varchar("source_reference", { length: 100 }),

  // Status
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),

  // Timestamps
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("workflow_rules_org_idx").on(table.organizationId),
  activeIdx: index("workflow_rules_active_idx").on(table.isActive),
  originIdx: index("workflow_rules_origin_idx").on(table.origin),
}));

export const insertWorkflowRuleSchema = createInsertSchema(workflowRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkflowRule = z.infer<typeof insertWorkflowRuleSchema>;
export type WorkflowRule = typeof workflowRules.$inferSelect;

// ============================================
// FLOW DEFINITIONS TABLE
// ============================================

/**
 * Flow JSON structure for typed guidance
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

export interface FlowJsonPhase {
  id: string;
  name: string;
  description: string;
  sequence_order: number;
  movements: FlowJsonMovement[];
}

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
 * Flow Definitions Table
 * Stores JSON-based flow definitions for the flow engine.
 * Each flow defines the movements (inspection steps) an adjuster performs for a specific peril type.
 */
export const flowDefinitions = pgTable("flow_definitions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id"), // null = system-wide

  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  perilType: varchar("peril_type", { length: 50 }).notNull(), // "water", "wind", "hail", "fire", etc.
  propertyType: varchar("property_type", { length: 50 }).notNull().default("residential"), // "residential", "commercial"

  // The actual flow structure (JSON)
  flowJson: jsonb("flow_json").notNull().$type<FlowJson>(),

  // Versioning and status
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),

  // Audit fields
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  orgIdx: index("flow_definitions_org_idx").on(table.organizationId),
  perilIdx: index("flow_definitions_peril_idx").on(table.perilType),
  propertyIdx: index("flow_definitions_property_idx").on(table.propertyType),
  activeIdx: index("flow_definitions_active_idx").on(table.isActive),
}));

export const insertFlowDefinitionSchema = createInsertSchema(flowDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFlowDefinition = z.infer<typeof insertFlowDefinitionSchema>;
export type FlowDefinition = typeof flowDefinitions.$inferSelect;

// ============================================
// CLAIM FLOW INSTANCES TABLE
// ============================================

/**
 * Tracks active flow instances for claims.
 * Each claim can have one active flow at a time.
 */
export const claimFlowInstances = pgTable("claim_flow_instances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  flowDefinitionId: uuid("flow_definition_id").notNull().references(() => flowDefinitions.id),
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, paused, completed, cancelled
  
  // Current position in flow
  currentPhaseId: varchar("current_phase_id", { length: 100 }),
  currentPhaseIndex: integer("current_phase_index").notNull().default(0),
  
  // Progress tracking (JSONB arrays)
  completedMovements: jsonb("completed_movements").notNull().default([]).$type<string[]>(), // ["phaseId:movementId", ...]
  dynamicMovements: jsonb("dynamic_movements").notNull().default([]).$type<any[]>(), // Custom/room-specific movements
  
  // Timestamps
  startedAt: timestamp("started_at").default(sql`NOW()`),
  completedAt: timestamp("completed_at"),
  
  // Audit
  createdAt: timestamp("created_at").default(sql`NOW()`),
  updatedAt: timestamp("updated_at").default(sql`NOW()`),
}, (table) => ({
  claimIdx: index("claim_flow_instances_claim_idx").on(table.claimId),
  statusIdx: index("claim_flow_instances_status_idx").on(table.status),
  flowDefIdx: index("claim_flow_instances_flow_def_idx").on(table.flowDefinitionId),
}));

export const insertClaimFlowInstanceSchema = createInsertSchema(claimFlowInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClaimFlowInstance = z.infer<typeof insertClaimFlowInstanceSchema>;
export type ClaimFlowInstance = typeof claimFlowInstances.$inferSelect;

// ============================================
// MOVEMENT COMPLETIONS TABLE
// ============================================

/**
 * Records when movements are completed with evidence.
 */
export const movementCompletions = pgTable("movement_completions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  flowInstanceId: uuid("flow_instance_id").notNull().references(() => claimFlowInstances.id, { onDelete: "cascade" }),
  movementId: varchar("movement_id", { length: 200 }).notNull(), // "phaseId:movementId" format
  movementPhase: varchar("movement_phase", { length: 100 }), // Phase ID for easier querying
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  
  // Completion status
  status: varchar("status", { length: 20 }).notNull().default("completed"), // completed, skipped
  
  // Evidence and notes
  notes: text("notes"),
  evidenceData: jsonb("evidence_data").$type<{
    photos?: string[];
    audioId?: string;
    measurements?: any;
  }>(),
  
  // Skip tracking
  skippedRequired: boolean("skipped_required").default(false), // Track if a required step was skipped
  
  // AI validation tracking
  evidenceValidated: boolean("evidence_validated").default(false), // Whether AI validation was performed
  evidenceValidationResult: jsonb("evidence_validation_result"), // AI validation result JSON
  
  // Audit
  completedAt: timestamp("completed_at").default(sql`NOW()`),
  completedBy: uuid("completed_by"),
  
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  flowInstanceIdx: index("movement_completions_flow_instance_idx").on(table.flowInstanceId),
  movementIdx: index("movement_completions_movement_idx").on(table.movementId),
  claimIdx: index("movement_completions_claim_idx").on(table.claimId),
  skippedRequiredIdx: index("movement_completions_skipped_required_idx").on(table.flowInstanceId, table.skippedRequired),
  phaseIdx: index("movement_completions_phase_idx").on(table.flowInstanceId, table.movementPhase),
}));

export const insertMovementCompletionSchema = createInsertSchema(movementCompletions).omit({
  id: true,
  createdAt: true,
});

export type InsertMovementCompletion = z.infer<typeof insertMovementCompletionSchema>;
export type MovementCompletion = typeof movementCompletions.$inferSelect;

// ============================================
// MOVEMENT EVIDENCE TABLE
// ============================================

/**
 * Stores evidence attached to movements (photos, audio, measurements).
 */
export const movementEvidence = pgTable("movement_evidence", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  flowInstanceId: uuid("flow_instance_id").notNull().references(() => claimFlowInstances.id, { onDelete: "cascade" }),
  movementId: varchar("movement_id", { length: 200 }).notNull(),
  
  // Evidence type and reference
  evidenceType: varchar("evidence_type", { length: 30 }).notNull(), // photo, audio, measurement, note
  referenceId: varchar("reference_id", { length: 100 }), // ID of photo, audio, etc.
  evidenceData: jsonb("evidence_data"), // Additional data
  
  // Audit
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").default(sql`NOW()`),
}, (table) => ({
  flowInstanceIdx: index("movement_evidence_flow_instance_idx").on(table.flowInstanceId),
  movementIdx: index("movement_evidence_movement_idx").on(table.movementId),
  typeIdx: index("movement_evidence_type_idx").on(table.evidenceType),
}));

export const insertMovementEvidenceSchema = createInsertSchema(movementEvidence).omit({
  id: true,
  createdAt: true,
});

export type InsertMovementEvidence = z.infer<typeof insertMovementEvidenceSchema>;
export type MovementEvidence = typeof movementEvidence.$inferSelect;

// ============================================
// EXPORT VALIDATION TYPES
// ============================================

/**
 * Risk level for export
 */
export type ExportRiskLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "blocked";

/**
 * Evidence gap in export validation
 */
export interface EvidenceGap {
  stepId: string;
  stepTitle: string;
  requirement: EvidenceRequirementSpec;
  isBlocking: boolean;
  reason: string;
}

/**
 * Export validation result
 */
export interface ExportValidationResult {
  canExport: boolean;
  riskLevel: ExportRiskLevel;
  gaps: EvidenceGap[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    blockedSteps: number;
    evidenceComplete: number;
    evidenceMissing: number;
  };
  warnings: string[];
}

// ============================================
// SESSIONS TABLE (for Passport.js session storage)
// ============================================

export const sessions = pgTable("sessions", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  // Note: expire is TIMESTAMPTZ in database (handled by migration)
  // Drizzle timestamp maps to TIMESTAMP, but migration creates TIMESTAMPTZ
  expire: timestamp("expire").notNull(),
}, (table) => ({
  expireIdx: index("sessions_expire_idx").on(table.expire),
}));
