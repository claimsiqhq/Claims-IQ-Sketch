export type ClaimStatus = 'draft' | 'open' | 'review' | 'approved' | 'closed';

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
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
}

export interface ClaimLineItem extends LineItem {
  quantity: number;
  total: number;
  damageZoneId?: string;
  notes?: string;
}

export interface Claim {
  id: string;
  policyNumber: string;
  carrier: string;
  status: ClaimStatus;
  customerName: string;
  address: Address;
  dateOfLoss: string;
  type: 'Water' | 'Fire' | 'Wind/Hail' | 'Impact' | 'Other';
  description: string;
  rooms: Room[];
  damageZones: DamageZone[];
  lineItems: ClaimLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}
