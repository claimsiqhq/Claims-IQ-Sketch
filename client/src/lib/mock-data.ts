import { Claim, LineItem } from './types';

export const MOCK_USER = {
  id: 'u1',
  name: 'Alex Adjuster',
  email: 'alex@claims-iq.com',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
};

export const MOCK_LINE_ITEMS: LineItem[] = [
  // Water Mitigation
  { id: 'wm1', code: 'WTR-EXT', category: 'Water Mitigation', description: 'Water extraction from floor', unit: 'SF', unitPrice: 0.85 },
  { id: 'wm2', code: 'WTR-DEH', category: 'Water Mitigation', description: 'Dehumidifier (Large)', unit: 'DA', unitPrice: 125.00 },
  { id: 'wm3', code: 'WTR-FAN', category: 'Water Mitigation', description: 'Air mover (Centrifugal)', unit: 'DA', unitPrice: 35.00 },
  
  // Drywall
  { id: 'dw1', code: 'DRY-RMV', category: 'Drywall', description: 'Remove drywall, wet', unit: 'SF', unitPrice: 1.15 },
  { id: 'dw2', code: 'DRY-LF', category: 'Drywall', description: '1/2" Drywall - hung, taped, floated, ready for paint', unit: 'SF', unitPrice: 2.45 },
  { id: 'dw3', code: 'DRY-TEX', category: 'Drywall', description: 'Texture - light orange peel', unit: 'SF', unitPrice: 0.65 },
  
  // Flooring
  { id: 'fl1', code: 'FLR-RMV', category: 'Flooring', description: 'Remove laminate flooring', unit: 'SF', unitPrice: 1.85 },
  { id: 'fl2', code: 'FLR-LAM', category: 'Flooring', description: 'Laminate flooring - simulated wood - High grade', unit: 'SF', unitPrice: 4.55 },
  { id: 'fl3', code: 'FLR-PAD', category: 'Flooring', description: 'Vapor barrier/pad for laminate', unit: 'SF', unitPrice: 0.45 },
  
  // Painting
  { id: 'pt1', code: 'PNT-P', category: 'Painting', description: 'Seal/prime walls', unit: 'SF', unitPrice: 0.55 },
  { id: 'pt2', code: 'PNT-2', category: 'Painting', description: 'Paint walls - 2 coats', unit: 'SF', unitPrice: 1.15 },
  { id: 'pt3', code: 'PNT-TRIM', category: 'Painting', description: 'Paint baseboard - 2 coats', unit: 'LF', unitPrice: 1.35 },
  
  // Roofing
  { id: 'rf1', code: 'RFG-3TAB', category: 'Roofing', description: '3-tab composition shingle', unit: 'SQ', unitPrice: 215.00 },
  { id: 'rf2', code: 'RFG-REM', category: 'Roofing', description: 'Remove 3-tab shingle', unit: 'SQ', unitPrice: 55.00 },
];

export const MOCK_CLAIMS: Claim[] = [
  {
    id: 'c1',
    policyNumber: 'POL-987654321',
    carrier: 'SafeGuard Insurance',
    status: 'open',
    customerName: 'Sarah Jenkins',
    address: {
      street: '123 Maple Avenue',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
    },
    dateOfLoss: '2025-05-12',
    type: 'Water',
    description: 'Pipe burst in kitchen caused flooding in kitchen and living room.',
    rooms: [
      { id: 'r1', name: 'Kitchen', type: 'Kitchen', width: 12, height: 14, x: 0, y: 0, ceilingHeight: 9, flooringType: 'Tile', wallFinish: 'Paint' },
      { id: 'r2', name: 'Living Room', type: 'Living Room', width: 16, height: 20, x: 14, y: 0, ceilingHeight: 9, flooringType: 'Hardwood', wallFinish: 'Paint' },
    ],
    damageZones: [
      { id: 'dz1', roomId: 'r1', type: 'Water', severity: 'High', affectedSurfaces: ['Floor', 'Wall South'], affectedArea: 168, photos: [], notes: 'Standing water for 4 hours' }
    ],
    lineItems: [],
    createdAt: '2025-05-12T10:00:00Z',
    updatedAt: '2025-05-12T14:30:00Z',
  },
  {
    id: 'c2',
    policyNumber: 'POL-123456789',
    carrier: 'National Mutual',
    status: 'review',
    customerName: 'Robert Chen',
    address: {
      street: '456 Oak Drive',
      city: 'Shelbyville',
      state: 'IL',
      zip: '62565',
    },
    dateOfLoss: '2025-04-28',
    type: 'Wind/Hail',
    description: 'Hail damage to roof and siding on north elevation.',
    rooms: [],
    damageZones: [],
    lineItems: [],
    createdAt: '2025-04-29T09:15:00Z',
    updatedAt: '2025-05-10T11:20:00Z',
  },
  {
    id: 'c3',
    policyNumber: 'POL-555666777',
    carrier: 'SafeGuard Insurance',
    status: 'draft',
    customerName: 'Emily Wilson',
    address: {
      street: '789 Pine Lane',
      city: 'Capital City',
      state: 'IL',
      zip: '62701',
    },
    dateOfLoss: '2025-05-13',
    type: 'Fire',
    description: 'Small kitchen fire, smoke damage throughout first floor.',
    rooms: [],
    damageZones: [],
    lineItems: [],
    createdAt: '2025-05-13T08:00:00Z',
    updatedAt: '2025-05-13T08:00:00Z',
  }
];
