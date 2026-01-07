// Scope Engine - State management for voice-driven estimate building
// Similar to geometry-engine but for line items

import { create } from 'zustand';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ScopeLineItem {
  id: string;
  code: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  total?: number;
  roomName?: string;
  damageZoneId?: string;
  notes?: string;
  source: 'voice' | 'manual' | 'ai_suggested';
  addedAt: Date;
}

export interface ScopeCommand {
  id: string;
  action: string;
  params: AddLineItemParams | UpdateLineItemParams | RemoveLineItemParams | SetQuantityParams | SuggestItemsParams | SetContextParams | Record<string, unknown>;
  result: string;
  timestamp: Date;
}

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type ScopeSessionState = 'idle' | 'connecting' | 'connected' | 'error';

interface ScopeEngineState {
  // Line items
  lineItems: ScopeLineItem[];
  pendingItems: ScopeLineItem[]; // Items suggested but not confirmed

  // Context
  currentRoom: string | null;
  currentDamageType: string | null;
  claimId: string | null; // Current claim ID for context-aware tools

  // Session
  commandHistory: ScopeCommand[];
  transcript: TranscriptEntry[];
  sessionState: ScopeSessionState;
  undoStack: ScopeLineItem[][];

  // Actions
  addLineItem: (params: AddLineItemParams) => string;
  updateLineItem: (params: UpdateLineItemParams) => string;
  removeLineItem: (params: RemoveLineItemParams) => string;
  setQuantity: (params: SetQuantityParams) => string;
  suggestItems: (params: SuggestItemsParams) => string;
  confirmSuggestions: () => string;
  rejectSuggestions: () => string;
  setContext: (params: SetContextParams) => string;
  undo: (steps: number) => string;
  clearAll: () => string;

  // Session management
  addTranscript: (role: 'user' | 'assistant', content: string) => void;
  setSessionState: (state: ScopeSessionState) => void;
  setClaimId: (claimId: string | null) => void;
  resetSession: () => void;

  // Getters
  getLineItems: () => ScopeLineItem[];
  getSubtotal: () => number;
}

// ============================================
// PARAMETER TYPES
// ============================================

export interface AddLineItemParams {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  roomName?: string;
  damageZoneId?: string;
  notes?: string;
}

export interface UpdateLineItemParams {
  code?: string;
  itemIndex?: number;
  quantity?: number;
  notes?: string;
  roomName?: string;
}

export interface RemoveLineItemParams {
  code?: string;
  itemIndex?: number;
  description?: string; // Allow removal by description match
}

export interface SetQuantityParams {
  code?: string;
  itemIndex?: number;
  quantity: number;
}

export interface SuggestItemsParams {
  items: Array<{
    code: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
  }>;
  roomName?: string;
}

export interface SetContextParams {
  roomName?: string;
  damageType?: string;
}

// ============================================
// SCOPE ENGINE STORE
// ============================================

export const useScopeEngine = create<ScopeEngineState>((set, get) => ({
  // Initial state
  lineItems: [],
  pendingItems: [],
  currentRoom: null,
  currentDamageType: null,
  claimId: null,
  commandHistory: [],
  transcript: [],
  sessionState: 'idle',
  undoStack: [],

  // Add a line item
  addLineItem: (params) => {
    const state = get();

    // Save current state for undo
    set({ undoStack: [...state.undoStack, [...state.lineItems]] });

    const newItem: ScopeLineItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      code: params.code,
      description: params.description,
      category: params.code.split('>')[0] || 'general', // Extract category from code prefix
      quantity: params.quantity,
      unit: params.unit,
      unitPrice: params.unitPrice,
      total: params.unitPrice ? params.unitPrice * params.quantity : undefined,
      roomName: params.roomName || state.currentRoom || undefined,
      damageZoneId: params.damageZoneId,
      notes: params.notes,
      source: 'voice',
      addedAt: new Date(),
    };

    // Check if item already exists - if so, add to quantity
    const existingIndex = state.lineItems.findIndex(li => li.code === params.code);

    if (existingIndex >= 0) {
      const updatedItems = [...state.lineItems];
      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        quantity: updatedItems[existingIndex].quantity + params.quantity,
        total: updatedItems[existingIndex].unitPrice
          ? updatedItems[existingIndex].unitPrice! * (updatedItems[existingIndex].quantity + params.quantity)
          : undefined,
      };

      set({ lineItems: updatedItems });

      const command: ScopeCommand = {
        id: `cmd_${Date.now()}`,
        action: 'add_line_item',
        params,
        result: `Updated ${params.code}: added ${params.quantity} ${params.unit} (total: ${updatedItems[existingIndex].quantity})`,
        timestamp: new Date(),
      };
      set({ commandHistory: [...state.commandHistory, command] });

      return `Updated ${params.description}. Added ${params.quantity} ${params.unit}, new total is ${updatedItems[existingIndex].quantity} ${params.unit}.`;
    }

    set({ lineItems: [...state.lineItems, newItem] });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'add_line_item',
      params,
      result: `Added ${params.code}: ${params.quantity} ${params.unit}`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Added ${params.description}: ${params.quantity} ${params.unit}${params.roomName ? ` for ${params.roomName}` : ''}.`;
  },

  // Update a line item
  updateLineItem: (params) => {
    const state = get();
    set({ undoStack: [...state.undoStack, [...state.lineItems]] });

    let targetIndex = params.itemIndex;

    // Find by code if index not provided
    if (targetIndex === undefined && params.code) {
      targetIndex = state.lineItems.findIndex(li => li.code === params.code);
    }

    if (targetIndex === undefined || targetIndex < 0 || targetIndex >= state.lineItems.length) {
      return `Could not find that line item to update.`;
    }

    const updatedItems = [...state.lineItems];
    const item = updatedItems[targetIndex];

    if (params.quantity !== undefined) {
      item.quantity = params.quantity;
      item.total = item.unitPrice ? item.unitPrice * params.quantity : undefined;
    }
    if (params.notes !== undefined) {
      item.notes = params.notes;
    }
    if (params.roomName !== undefined) {
      item.roomName = params.roomName;
    }

    set({ lineItems: updatedItems });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'update_line_item',
      params,
      result: `Updated ${item.code}`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Updated ${item.description}${params.quantity !== undefined ? ` to ${params.quantity} ${item.unit}` : ''}.`;
  },

  // Remove a line item
  removeLineItem: (params) => {
    const state = get();
    set({ undoStack: [...state.undoStack, [...state.lineItems]] });

    let targetIndex = params.itemIndex;

    if (targetIndex === undefined && params.code) {
      targetIndex = state.lineItems.findIndex(li => li.code === params.code);
    }

    if (targetIndex === undefined && params.description) {
      // Try to match by description (fuzzy)
      const desc = params.description.toLowerCase();
      targetIndex = state.lineItems.findIndex(li =>
        li.description.toLowerCase().includes(desc)
      );
    }

    if (targetIndex === undefined || targetIndex < 0 || targetIndex >= state.lineItems.length) {
      return `Could not find that line item to remove.`;
    }

    const removedItem = state.lineItems[targetIndex];
    const updatedItems = state.lineItems.filter((_, i) => i !== targetIndex);

    set({ lineItems: updatedItems });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'remove_line_item',
      params,
      result: `Removed ${removedItem.code}`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Removed ${removedItem.description} from the estimate.`;
  },

  // Set quantity for a specific item
  setQuantity: (params) => {
    return get().updateLineItem({
      code: params.code,
      itemIndex: params.itemIndex,
      quantity: params.quantity,
    });
  },

  // Add suggestions (pending items)
  suggestItems: (params) => {
    const state = get();

    const pendingItems: ScopeLineItem[] = params.items.map((item, index) => ({
      id: `pending_${Date.now()}_${index}`,
      code: item.code,
      description: item.description,
      category: item.code.split('>')[0] || 'general', // Extract category from code prefix
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.unitPrice ? item.unitPrice * item.quantity : undefined,
      roomName: params.roomName || state.currentRoom || undefined,
      source: 'ai_suggested' as const,
      addedAt: new Date(),
    }));

    set({ pendingItems });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'suggest_items',
      params,
      result: `Suggested ${params.items.length} items`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `I'm suggesting ${params.items.length} line items. Say "confirm" to add them or "reject" to dismiss.`;
  },

  // Confirm pending suggestions
  confirmSuggestions: () => {
    const state = get();

    if (state.pendingItems.length === 0) {
      return `No pending suggestions to confirm.`;
    }

    set({ undoStack: [...state.undoStack, [...state.lineItems]] });

    const confirmedItems = state.pendingItems.map(item => ({
      ...item,
      id: `li_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }));

    set({
      lineItems: [...state.lineItems, ...confirmedItems],
      pendingItems: [],
    });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'confirm_suggestions',
      params: {},
      result: `Confirmed ${confirmedItems.length} items`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Added ${confirmedItems.length} suggested items to the estimate.`;
  },

  // Reject pending suggestions
  rejectSuggestions: () => {
    const state = get();
    const count = state.pendingItems.length;

    set({ pendingItems: [] });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'reject_suggestions',
      params: {},
      result: `Rejected ${count} suggestions`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Dismissed ${count} suggested items.`;
  },

  // Set context (current room, damage type)
  setContext: (params) => {
    const updates: Partial<ScopeEngineState> = {};

    if (params.roomName !== undefined) {
      updates.currentRoom = params.roomName;
    }
    if (params.damageType !== undefined) {
      updates.currentDamageType = params.damageType;
    }

    set(updates);

    const parts: string[] = [];
    if (params.roomName) parts.push(`room: ${params.roomName}`);
    if (params.damageType) parts.push(`damage: ${params.damageType}`);

    return `Set context to ${parts.join(', ')}.`;
  },

  // Undo
  undo: (steps) => {
    const state = get();

    if (state.undoStack.length === 0) {
      return `Nothing to undo.`;
    }

    const actualSteps = Math.min(steps, state.undoStack.length);
    const newStack = [...state.undoStack];
    let restoredItems = state.lineItems;

    for (let i = 0; i < actualSteps; i++) {
      restoredItems = newStack.pop() || [];
    }

    set({
      lineItems: restoredItems,
      undoStack: newStack,
    });

    return `Undid ${actualSteps} action${actualSteps > 1 ? 's' : ''}.`;
  },

  // Clear all items
  clearAll: () => {
    const state = get();
    set({ undoStack: [...state.undoStack, [...state.lineItems]] });

    const count = state.lineItems.length;
    set({ lineItems: [], pendingItems: [] });

    const command: ScopeCommand = {
      id: `cmd_${Date.now()}`,
      action: 'clear_all',
      params: {},
      result: `Cleared ${count} items`,
      timestamp: new Date(),
    };
    set({ commandHistory: [...state.commandHistory, command] });

    return `Cleared all ${count} line items from the estimate.`;
  },

  // Session management
  addTranscript: (role, content) => {
    const entry: TranscriptEntry = {
      id: `tr_${Date.now()}`,
      role,
      content,
      timestamp: new Date(),
    };
    set(state => ({ transcript: [...state.transcript, entry] }));
  },

  setSessionState: (sessionState) => {
    set({ sessionState });
  },

  setClaimId: (claimId) => {
    set({ claimId });
  },

  resetSession: () => {
    set({
      lineItems: [],
      pendingItems: [],
      currentRoom: null,
      currentDamageType: null,
      claimId: null,
      commandHistory: [],
      transcript: [],
      undoStack: [],
      sessionState: 'idle',
    });
  },

  // Getters
  getLineItems: () => get().lineItems,

  getSubtotal: () => {
    return get().lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  },
}));

// Export singleton for use in agent tools
export const scopeEngine = useScopeEngine;
