import { create } from 'zustand';
import { Claim, Room, DamageZone, ClaimLineItem } from './types';
import {
  Region,
  CarrierProfile,
  EstimateCalculationResult,
  calculateEstimate as apiCalculateEstimate,
  getRegions,
  getCarrierProfiles,
  EstimateLineItemInput,
  AuthUser,
  login as apiLogin,
  logout as apiLogout,
  checkAuth as apiCheckAuth,
  updateClaim as apiUpdateClaim
} from './api';

interface EstimateSettings {
  regionId: string;
  carrierProfileId: string | null;
  overheadPct: number;
  profitPct: number;
}

/**
 * User object for UI display purposes.
 * Derived from AuthUser when authenticated.
 * null when not authenticated - components should handle this case explicitly.
 */
interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface StoreState {
  // Auth state
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;

  /**
   * User object for UI components.
   * null when not authenticated - use isAuthenticated check before accessing.
   */
  user: User | null;

  claims: Claim[];
  activeClaim: Claim | null;

  // Estimate-related state
  regions: Region[];
  carriers: CarrierProfile[];
  estimateSettings: EstimateSettings;
  calculatedEstimate: EstimateCalculationResult | null;
  isCalculating: boolean;
  estimateError: string | null;

  // Auth actions
  login: (username: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  clearAuthError: () => void;
  updateAuthUser: (updates: Partial<AuthUser>) => void;

  // Actions
  setActiveClaim: (claimId: string | null) => void;
  ensureClaim: (claimId: string, claimData?: Partial<Claim>) => void;
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
  // Auth state defaults
  authUser: null,
  isAuthenticated: false,
  isAuthLoading: true, // Start as loading until we check
  authError: null,

  // User is null until authenticated - no mock fallback
  user: null,

  claims: [],
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

  // Auth actions
  login: async (username, password, rememberMe = false) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const response = await apiLogin(username, password, rememberMe);
      if (response.user) {
        // Construct display name from firstName/lastName, falling back to username
        const displayName = [response.user.firstName, response.user.lastName]
          .filter(Boolean)
          .join(' ') || response.user.username;
        set({
          authUser: response.user,
          isAuthenticated: true,
          isAuthLoading: false,
          authError: null,
          user: {
            id: response.user.id,
            name: displayName,
            email: response.user.email || '',
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
          },
        });
        return true;
      }
      set({ isAuthLoading: false, authError: 'Login failed' });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ isAuthLoading: false, authError: message });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiLogout();
    } catch (error) {
      // Logout error - user will see error toast
    }
    set({
      authUser: null,
      isAuthenticated: false,
      isAuthLoading: false,
      authError: null,
      user: null,
    });
  },

  checkAuth: async () => {
    set({ isAuthLoading: true });
    try {
      const response = await apiCheckAuth();
      // Construct display name from firstName/lastName, falling back to username
      const displayName = response.user
        ? ([response.user.firstName, response.user.lastName].filter(Boolean).join(' ') || response.user.username)
        : '';
      set({
        authUser: response.user,
        isAuthenticated: response.authenticated,
        isAuthLoading: false,
        user: response.user ? {
          id: response.user.id,
          name: displayName,
          email: response.user.email || '',
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
        } : null,
      });
      return response.authenticated;
    } catch (error) {
      console.error('Check auth failed:', error);
      set({
        authUser: null,
        isAuthenticated: false,
        isAuthLoading: false,
        user: null,
      });
      return false;
    }
  },

  clearAuthError: () => set({ authError: null }),

  updateAuthUser: (updates) => set((state) => {
    if (!state.authUser) return state;
    const updatedAuthUser = { ...state.authUser, ...updates };
    const displayName = [updatedAuthUser.firstName, updatedAuthUser.lastName].filter(Boolean).join(' ') || updatedAuthUser.username;
    return {
      authUser: updatedAuthUser,
      user: {
        id: updatedAuthUser.id,
        name: displayName,
        email: updatedAuthUser.email || '',
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
      },
    };
  }),

  setActiveClaim: (claimId) => set((state) => ({
    activeClaim: claimId ? state.claims.find((c) => c.id === claimId) || null : null,
    calculatedEstimate: null, // Clear estimate when switching claims
    estimateError: null,
  })),

  // Ensures a claim exists in the store, creating it if necessary
  // This is called when loading a claim from the API to enable sketch operations
  ensureClaim: (claimId, claimData) => set((state) => {
    const existingClaim = state.claims.find((c) => c.id === claimId);
    if (existingClaim) {
      // Update existing claim with new data and set as active
      const updatedClaim = { ...existingClaim, ...claimData };
      return {
        claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
        activeClaim: updatedClaim,
      };
    }
    // Create new claim with defaults for sketch operations
    const newClaim: Claim = {
      id: claimId,
      claimId: claimData?.claimId || claimId,
      status: claimData?.status || 'open',
      rooms: [],
      damageZones: [],
      lineItems: [],
      createdAt: claimData?.createdAt || new Date().toISOString(),
      updatedAt: claimData?.updatedAt || new Date().toISOString(),
      ...claimData,
    };
    return {
      claims: [...state.claims, newClaim],
      activeClaim: newClaim,
    };
  }),

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

    const rooms = claim.rooms || [];
    const updatedClaim = { ...claim, rooms: [...rooms, room], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  updateRoom: (claimId, roomId, data) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const rooms = claim.rooms || [];
    const updatedRooms = rooms.map((r) => r.id === roomId ? { ...r, ...data } : r);
    const updatedClaim = { ...claim, rooms: updatedRooms, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  deleteRoom: (claimId, roomId) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const rooms = claim.rooms || [];
    const updatedRooms = rooms.filter((r) => r.id !== roomId);
    const updatedClaim = { ...claim, rooms: updatedRooms, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  addDamageZone: (claimId, zone) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const damageZones = claim.damageZones || [];
    const updatedClaim = { ...claim, damageZones: [...damageZones, zone], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  addLineItem: (claimId, item) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const lineItems = claim.lineItems || [];
    const updatedClaim = { ...claim, lineItems: [...lineItems, item], updatedAt: new Date().toISOString() };
    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim,
      calculatedEstimate: null, // Clear cached estimate when line items change
    };
  }),

  updateLineItem: (claimId, itemId, data) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const lineItems = claim.lineItems || [];
    const updatedLineItems = lineItems.map((item) =>
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

    const lineItems = claim.lineItems || [];
    const updatedLineItems = lineItems.filter((item) => item.id !== itemId);
    const updatedClaim = { ...claim, lineItems: updatedLineItems, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim,
      calculatedEstimate: null, // Clear cached estimate when line items change
    };
  }),

  createClaim: (claimData) => set((state) => {
    // Generate a proper UUID for optimistic client-side claim creation
    // This will be replaced by server-generated UUID when synced
    const tempUuid = crypto.randomUUID();
    const newClaim: Claim = {
      ...claimData,
      id: tempUuid,
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
      let [regions, carriers] = await Promise.all([
        getRegions(),
        getCarrierProfiles(),
      ]);

      // Ensure arrays (handle API response format changes)
      regions = Array.isArray(regions) ? regions : [];
      carriers = Array.isArray(carriers) ? carriers : [];

      // If no data found, seed it
      if (regions.length === 0 || carriers.length === 0) {
        try {
          await fetch('/api/admin/seed-reference-data', {
            method: 'POST',
            credentials: 'include',
          });
          // Reload after seeding
          [regions, carriers] = await Promise.all([
            getRegions(),
            getCarrierProfiles(),
          ]);
          // Ensure arrays again after reload
          regions = Array.isArray(regions) ? regions : [];
          carriers = Array.isArray(carriers) ? carriers : [];
        } catch (seedError) {
          console.error('Failed to seed reference data:', seedError);
        }
      }

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
      // Failed to load regions and carriers - ensure arrays are set to empty
      set((state) => ({
        regions: [],
        carriers: [],
      }));
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
    const claimLineItems = claim?.lineItems || [];
    const claimRooms = claim?.rooms || [];

    if (!claim || claimLineItems.length === 0) {
      set({ estimateError: 'No line items to calculate' });
      return null;
    }

    if (!state.estimateSettings.regionId) {
      set({ estimateError: 'Please select a region' });
      return null;
    }

    set({ isCalculating: true, estimateError: null });

    try {
      const lineItems: EstimateLineItemInput[] = claimLineItems.map(item => ({
        lineItemCode: item.code,
        quantity: item.quantity,
        roomName: claimRooms[0]?.name, // Use first room as default
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
