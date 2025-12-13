import { create } from 'zustand';
import { Claim, User, Room, DamageZone, ClaimLineItem } from './types';
import { MOCK_CLAIMS, MOCK_USER } from './mock-data';
import {
  Region,
  CarrierProfile,
  EstimateCalculationResult,
  calculateEstimate as apiCalculateEstimate,
  getRegions,
  getCarrierProfiles,
  EstimateLineItemInput
} from './api';

interface EstimateSettings {
  regionId: string;
  carrierProfileId: string | null;
  overheadPct: number;
  profitPct: number;
}

interface StoreState {
  user: User;
  claims: Claim[];
  activeClaim: Claim | null;

  // Estimate-related state
  regions: Region[];
  carriers: CarrierProfile[];
  estimateSettings: EstimateSettings;
  calculatedEstimate: EstimateCalculationResult | null;
  isCalculating: boolean;
  estimateError: string | null;

  // Actions
  setActiveClaim: (claimId: string | null) => void;
  updateClaim: (claimId: string, data: Partial<Claim>) => void;
  addRoom: (claimId: string, room: Room) => void;
  updateRoom: (claimId: string, roomId: string, data: Partial<Room>) => void;
  deleteRoom: (claimId: string, roomId: string) => void;
  addDamageZone: (claimId: string, zone: DamageZone) => void;
  addLineItem: (claimId: string, item: ClaimLineItem) => void;
  updateLineItem: (claimId: string, itemId: string, data: Partial<ClaimLineItem>) => void;
  deleteLineItem: (claimId: string, itemId: string) => void;
  createClaim: (claim: Omit<Claim, 'id' | 'createdAt' | 'updatedAt'>) => void;

  // Estimate actions
  loadRegionsAndCarriers: () => Promise<void>;
  setEstimateSettings: (settings: Partial<EstimateSettings>) => void;
  calculateEstimate: (claimId: string) => Promise<EstimateCalculationResult | null>;
  clearEstimate: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  user: MOCK_USER,
  claims: MOCK_CLAIMS,
  activeClaim: null,

  // Estimate state defaults
  regions: [],
  carriers: [],
  estimateSettings: {
    regionId: '',
    carrierProfileId: null,
    overheadPct: 10,
    profitPct: 10,
  },
  calculatedEstimate: null,
  isCalculating: false,
  estimateError: null,

  setActiveClaim: (claimId) => set((state) => ({
    activeClaim: claimId ? state.claims.find((c) => c.id === claimId) || null : null,
    calculatedEstimate: null, // Clear estimate when switching claims
    estimateError: null,
  })),

  updateClaim: (claimId, data) => set((state) => {
    const updatedClaims = state.claims.map((c) =>
      c.id === claimId ? { ...c, ...data, updatedAt: new Date().toISOString() } : c
    );
    return {
      claims: updatedClaims,
      activeClaim: state.activeClaim?.id === claimId ? { ...state.activeClaim, ...data, updatedAt: new Date().toISOString() } : state.activeClaim
    };
  }),

  addRoom: (claimId, room) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedClaim = { ...claim, rooms: [...claim.rooms, room], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  updateRoom: (claimId, roomId, data) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedRooms = claim.rooms.map((r) => r.id === roomId ? { ...r, ...data } : r);
    const updatedClaim = { ...claim, rooms: updatedRooms, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  deleteRoom: (claimId, roomId) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedRooms = claim.rooms.filter((r) => r.id !== roomId);
    const updatedClaim = { ...claim, rooms: updatedRooms, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  addDamageZone: (claimId, zone) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedClaim = { ...claim, damageZones: [...claim.damageZones, zone], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  addLineItem: (claimId, item) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedClaim = { ...claim, lineItems: [...claim.lineItems, item], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim,
      calculatedEstimate: null, // Clear cached estimate when line items change
    };
  }),

  updateLineItem: (claimId, itemId, data) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedLineItems = claim.lineItems.map((item) =>
      item.id === itemId ? { ...item, ...data } : item
    );
    const updatedClaim = { ...claim, lineItems: updatedLineItems, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim,
      calculatedEstimate: null, // Clear cached estimate when line items change
    };
  }),

  deleteLineItem: (claimId, itemId) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedLineItems = claim.lineItems.filter((item) => item.id !== itemId);
    const updatedClaim = { ...claim, lineItems: updatedLineItems, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim,
      calculatedEstimate: null, // Clear cached estimate when line items change
    };
  }),

  createClaim: (claimData) => set((state) => {
    const newClaim: Claim = {
      ...claimData,
      id: `c${state.claims.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return {
      claims: [newClaim, ...state.claims]
    };
  }),

  // Estimate actions
  loadRegionsAndCarriers: async () => {
    try {
      const [regions, carriers] = await Promise.all([
        getRegions(),
        getCarrierProfiles(),
      ]);

      set((state) => ({
        regions,
        carriers,
        estimateSettings: {
          ...state.estimateSettings,
          // Set default region if not set
          regionId: state.estimateSettings.regionId || (regions[0]?.id || ''),
        }
      }));
    } catch (error) {
      console.error('Failed to load regions and carriers:', error);
    }
  },

  setEstimateSettings: (settings) => set((state) => ({
    estimateSettings: { ...state.estimateSettings, ...settings },
    calculatedEstimate: null, // Clear cached estimate when settings change
  })),

  calculateEstimate: async (claimId) => {
    const state = get();
    const claim = state.claims.find(c => c.id === claimId);

    if (!claim || claim.lineItems.length === 0) {
      set({ estimateError: 'No line items to calculate' });
      return null;
    }

    if (!state.estimateSettings.regionId) {
      set({ estimateError: 'Please select a region' });
      return null;
    }

    set({ isCalculating: true, estimateError: null });

    try {
      const lineItems: EstimateLineItemInput[] = claim.lineItems.map(item => ({
        lineItemCode: item.code,
        quantity: item.quantity,
        roomName: claim.rooms[0]?.name, // Use first room as default
      }));

      const result = await apiCalculateEstimate({
        lineItems,
        regionId: state.estimateSettings.regionId,
        carrierProfileId: state.estimateSettings.carrierProfileId || undefined,
        overheadPct: state.estimateSettings.overheadPct,
        profitPct: state.estimateSettings.profitPct,
      });

      set({
        calculatedEstimate: result,
        isCalculating: false,
        estimateError: null,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to calculate estimate';
      set({
        estimateError: message,
        isCalculating: false,
        calculatedEstimate: null,
      });
      return null;
    }
  },

  clearEstimate: () => set({
    calculatedEstimate: null,
    estimateError: null,
  }),
}));
