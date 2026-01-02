export type ClaimStatus = 'draft' | 'open' | 'review' | 'approved' | 'closed';

// Canonical Peril enum - first-class support for ALL perils
export enum Peril {
  WIND_HAIL = "wind_hail",
  FIRE = "fire",
  WATER = "water",
  FLOOD = "flood",
  SMOKE = "smoke",
  MOLD = "mold",
  IMPACT = "impact",
  OTHER = "other"
}

// Peril display labels
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

// Peril badge colors for UI
export const PERIL_COLORS: Record<Peril, { bg: string; text: string; border: string }> = {
  [Peril.WIND_HAIL]: { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-300" },
  [Peril.FIRE]: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  [Peril.WATER]: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  [Peril.FLOOD]: { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300" },
  [Peril.SMOKE]: { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300" },
  [Peril.MOLD]: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  [Peril.IMPACT]: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  [Peril.OTHER]: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" }
};

// Peril-specific hints/advisories for UI
export const PERIL_HINTS: Partial<Record<Peril, string>> = {
  [Peril.WATER]: "Consider confirming water source and duration for accurate scoping",
  [Peril.FIRE]: "Check for smoke migration and contents damage throughout structure",
  [Peril.FLOOD]: "⚠️ Flood damage typically excluded under HO policies unless separate flood coverage exists",
  [Peril.MOLD]: "Mold testing may be required before remediation",
  [Peril.SMOKE]: "Assess smoke residue type and migration patterns"
};

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}

export type WallDirection = 'north' | 'south' | 'east' | 'west';
export type OpeningType = 'door' | 'window' | 'sliding_door' | 'french_door' | 'archway';
export type PositionType = 'left' | 'center' | 'right';

export interface RoomOpening {
  id: string;
  type: OpeningType;
  wall: WallDirection;
  width: number; // in feet
  height: number; // in feet
  position: PositionType;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  width: number; // in feet
  height: number; // in feet
  x: number; // position on canvas
  y: number; // position on canvas
  ceilingHeight: number;
  flooringType?: string;
  wallFinish?: string;
  openings?: RoomOpening[];
}

export interface DamageZone {
  id: string;
  roomId: string;
  type: 'Water' | 'Fire' | 'Smoke' | 'Mold' | 'Impact' | 'Wind' | 'Other';
  severity: 'Low' | 'Medium' | 'High' | 'Total';
  affectedSurfaces: string[]; // ['Floor', 'Wall North', etc.]
  affectedArea: number; // sq ft
  notes?: string;
  photos: string[];
}

export interface LineItem {
  id: string;
  code: string;
  category: string;
  description: string;
  unit: string;
  unitPrice: number;
  quantity?: number;
}

export interface ClaimLineItem extends LineItem {
  quantity: number;
  total: number;
  damageZoneId?: string;
  notes?: string;
}

export interface Claim {
  id: string;
  claimId: string; // Format: XX-XXX-XXXXXX
  claimNumber?: string; // Display claim number
  policyholder?: string;
  insuredName?: string; // Same as policyholder, from insured_name column
  insuredPhone?: string; // From insured_phone column
  insuredEmail?: string; // From insured_email column
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM
  riskLocation?: string; // Full address string (legacy)
  propertyAddress?: string; // Formatted property address
  propertyStreetAddress?: string; // Street address only
  propertyCity?: string; // City only
  propertyState?: string; // State abbreviation
  propertyZip?: string; // ZIP code only
  propertyZipCode?: string; // Alias for propertyZip
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc. - LEGACY field
  lossType?: string; // Canonical loss type
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  dwellingLimit?: string; // Format: $XXX,XXX
  perilSpecificDeductibles?: Record<string, string>; // { "wind_hail": "$7,932 1%", etc. }
  // yearRoofInstall is now in lossContext.property.roof.year_installed
  status: ClaimStatus;
  assignedAdjusterId?: string;
  totalRcv?: string;
  totalAcv?: string;
  totalPaid?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  documentCount?: number;
  estimateCount?: number;

  // Peril Parity Fields - canonical peril tracking for ALL perils
  primaryPeril?: Peril | string;  // Canonical peril enum value
  secondaryPerils?: (Peril | string)[];  // Array of secondary perils
  perilConfidence?: number;  // 0.00-1.00 confidence in inference
  perilMetadata?: Record<string, any>;  // Peril-specific structured data

  // Canonical FNOL truth from claims.loss_context
  lossContext?: LossContext;

  // Legacy compatibility fields (computed from new fields)
  rooms?: Room[];
  damageZones?: DamageZone[];
  lineItems?: ClaimLineItem[];
}

/**
 * Loss context structure (canonical FNOL storage)
 * NOTE: Field names match backend snake_case format from documentProcessor.ts buildLossContext()
 */
export interface LossContext {
  fnol?: {
    reported_by?: string;
    reported_date?: string;
    drone_eligible?: boolean;
    weather?: {
      status?: string;
      message?: string;
    };
  };
  property?: {
    year_built?: number;
    stories?: number;
    roof?: {
      material?: string;
      year_installed?: number;
      damage_scope?: "Exterior Only" | "Interior" | "Both";
    };
  };
  damage_summary?: {
    coverage_a?: string;
    coverage_b?: string;
    coverage_c?: string;
  };
}

/**
 * Effective policy computed from policy_form_extractions + endorsement_extractions
 * NEVER stored in database - always computed dynamically
 */
export interface EffectivePolicy {
  claimId: string;
  jurisdiction?: string;
  policyNumber?: string;
  effectiveDate?: string;

  coverages: {
    coverageA?: CoverageRules;
    coverageB?: CoverageRules;
    coverageC?: CoverageRules;
    coverageD?: CoverageRules;
  };

  lossSettlement: {
    dwellingAndStructures?: {
      basis: 'RCV' | 'ACV' | 'SCHEDULED';
      repairRequirements?: string;
      timeLimit?: string;
      matchingRules?: string;
      sourceEndorsement?: string;
    };
    roofingSystem?: RoofingSystemLossSettlement;
    personalProperty?: {
      settlementBasis: 'RCV' | 'ACV' | 'SCHEDULED';
      specialHandling?: string[];
      sourceEndorsement?: string;
    };
  };

  deductibles: {
    standard?: string;
    windHail?: string;
    hurricane?: string;
    namedStorm?: string;
    sourceEndorsements?: string[];
  };

  exclusions: string[];
  conditions: string[];

  sourceMap: Record<string, string[]>;
  resolvedAt: string;
  resolvedFromDocuments: {
    basePolicyId?: string;
    endorsementIds: string[];
  };
}

export interface CoverageRules {
  limit?: string;
  deductible?: string;
  settlementBasis?: 'RCV' | 'ACV' | 'SCHEDULED';
  specialLimits?: {
    propertyType: string;
    limit: string;
    conditions?: string;
  }[];
  sourceEndorsement?: string;
}

export interface RoofingSystemLossSettlement {
  applies: boolean;
  basis: 'RCV' | 'ACV' | 'SCHEDULED';
  paymentPercentage?: number;
  ageBasedSchedule?: {
    minAge: number;
    maxAge: number;
    paymentPercentage: number;
  }[];
  appliesTo?: string[];
  exclusions?: string[];
  metalComponentRule?: {
    coveredOnlyIf?: string;
    settlementBasis?: 'RCV' | 'ACV' | 'SCHEDULED';
  };
  sourceEndorsement?: string;
}

/**
 * Effective policy summary for UI display
 */
export interface EffectivePolicySummary {
  coverageLimits: {
    coverageA?: string;
    coverageB?: string;
    coverageC?: string;
    coverageD?: string;
  };
  deductibles: {
    standard?: string;
    windHail?: string;
  };
  roofSettlement: {
    basis: string;
    isScheduled: boolean;
    hasMetalRestrictions: boolean;
    sourceEndorsement?: string;
  };
  majorExclusions: string[];
  endorsementWatchouts: {
    formCode: string;
    summary: string;
  }[];
}

export interface PolicyForm {
  id: string;
  organizationId: string;
  claimId?: string;
  formType: string;
  formNumber: string;
  documentTitle?: string;
  description?: string;
  keyProvisions?: {
    sections?: string[];
    loss_settlement_roofing_system_wind_hail?: string;
    dwelling_unoccupied_exclusion_period?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Endorsement {
  id: string;
  organizationId: string;
  claimId?: string;
  formType: string;
  formNumber: string;
  documentTitle?: string;
  description?: string;
  keyChanges?: {
    actual_cash_value_definition?: string;
    dwelling_unoccupied_exclusion_period?: string;
    metal_siding_and_trim_loss_settlement_wind_hail?: string;
    loss_settlement_wind_hail?: string;
    roofing_schedule_application?: string;
    metal_roofing_loss_settlement?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

// ==========================================
// MY DAY (Adjuster Operations View) Types
// ==========================================

// Time window for scheduled inspections
export interface TimeWindow {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

// Badges that can appear on inspection/claim cards
export type InspectionBadge = 'mitigation_likely' | 'evidence_at_risk' | 'sla_today' | 'contact_required' | 'calendar_synced';

// Weather condition types
export type WeatherConditionType = 'rain' | 'freeze' | 'wind' | 'heat' | 'storm' | 'clear';

// Risk severity levels
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

// SLA urgency levels
export type SlaUrgency = 'normal' | 'warning' | 'critical' | 'breached';

// Inspection stop in today's route
export interface InspectionStop {
  id: string;
  claimId: string;
  claimNumber: string;
  insuredName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  timeWindow: TimeWindow;
  peril: Peril;
  reason: string; // "Active water risk", "Inspection scheduled", "SLA today"
  badges: InspectionBadge[];
  estimatedDuration: number; // minutes
  travelTimeFromPrevious?: number; // minutes
  notes?: string;
}

// Claims requiring non-field work today
export interface OnDeckClaim {
  id: string;
  claimId: string;
  claimNumber: string;
  peril: Peril;
  reason: string; // "Upload missing photos", "Complete mitigation doc", etc.
  slaDeadline?: string; // ISO timestamp if applicable
  slaHoursRemaining?: number;
  priority: 'low' | 'medium' | 'high';
}

// Risk/mitigation watch item
export interface RiskWatchItem {
  id: string;
  claimId: string;
  claimNumber: string;
  peril: Peril;
  riskDescription: string; // "Mold window closing", "Roof exposed before rain"
  hoursUntilCritical: number;
  severity: RiskSeverity;
  affectedInspectionId?: string; // Links to inspection if weather affects it
}

// Weather condition affecting today's work
export interface WeatherCondition {
  id: string;
  type: WeatherConditionType;
  description: string; // "Rain starting at 2pm"
  impact: string; // "roof risk", "water loss escalation"
  startTime?: string; // HH:MM
  endTime?: string;
  affectedClaimIds: string[];
  severity: 'advisory' | 'warning' | 'danger';
}

// SLA/Hygiene item (collapsible section)
export interface SlaHygieneItem {
  id: string;
  claimId: string;
  claimNumber: string;
  issueType: 'missing_artifact' | 'stuck_claim' | 'upcoming_sla';
  description: string;
  dueDate?: string;
  daysOverdue?: number;
  priority: 'low' | 'medium' | 'high';
}

// Day context summary for header
export interface DayContext {
  adjusterName: string;
  territory?: string;
  catEvent?: string;
  inspectionCount: number;
  riskCount: number;
  slaDeadlineCount: number;
  hasWeatherAlert: boolean;
  hasSafetyAlert: boolean;
  hasSlaBreach: boolean;
}

// Complete My Day data structure
export interface MyDayData {
  date: string; // ISO date
  context: DayContext;
  route: InspectionStop[];
  onDeck: OnDeckClaim[];
  riskWatch: RiskWatchItem[];
  weather: WeatherCondition[];
  slaHygiene: SlaHygieneItem[];
}
