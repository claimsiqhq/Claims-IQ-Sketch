import { create } from 'zustand';
import { Claim, LineItem, User, Room, DamageZone, ClaimLineItem } from './types';
import { MOCK_CLAIMS, MOCK_USER, MOCK_LINE_ITEMS } from './mock-data';

interface StoreState {
  user: User;
  claims: Claim[];
  activeClaim: Claim | null;
  lineItemCatalog: LineItem[];

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
}

export const useStore = create<StoreState>((set) => ({
  user: MOCK_USER,
  claims: MOCK_CLAIMS,
  activeClaim: null,
  lineItemCatalog: MOCK_LINE_ITEMS,

  setActiveClaim: (claimId) => set((state) => ({
    activeClaim: claimId ? state.claims.find((c) => c.id === claimId) || null : null
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
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
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
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
    };
  }),

  deleteLineItem: (claimId, itemId) => set((state) => {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return {};

    const updatedLineItems = claim.lineItems.filter((item) => item.id !== itemId);
    const updatedClaim = { ...claim, lineItems: updatedLineItems, updatedAt: new Date().toISOString() };

    return {
      claims: state.claims.map((c) => c.id === claimId ? updatedClaim : c),
      activeClaim: state.activeClaim?.id === claimId ? updatedClaim : state.activeClaim
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
  })
}));
