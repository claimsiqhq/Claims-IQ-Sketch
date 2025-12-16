export type ClaimStatus = 'draft' | 'open' | 'review' | 'approved' | 'closed';

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
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc.
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
