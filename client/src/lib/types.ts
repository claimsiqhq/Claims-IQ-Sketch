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
  policyholder?: string;
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM
  riskLocation?: string; // Full address string
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc. - LEGACY field
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  yearRoofInstall?: string; // Format: MM-DD-YYYY
  windHailDeductible?: string; // Format: $X,XXX X%
  dwellingLimit?: string; // Format: $XXX,XXX
  endorsementsListed?: string[];
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

  // Legacy compatibility fields (computed from new fields)
  rooms?: Room[];
  damageZones?: DamageZone[];
  lineItems?: ClaimLineItem[];
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
