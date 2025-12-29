// Scope Voice Agent
// RealtimeAgent for voice-driven estimate building with OpenAI Agents SDK
//
// Prompts are loaded dynamically from the database via /api/prompts/voice.scope/config
// This ensures the database is the single source of truth for all AI prompts.

import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { scopeEngine } from '../services/scope-engine';

// Prompt cache to avoid repeated API calls
let cachedInstructions: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache

// Fallback instructions if API fails - kept in sync with database version
const FALLBACK_INSTRUCTIONS = `You are an estimate building assistant for property insurance claims adjusters. Your job is to help them add line items to an estimate by voice.

PERSONALITY:
- Be concise and professional—adjusters are working in the field
- Confirm each item briefly before moving on
- Suggest related items when appropriate

WORKFLOW:
1. Listen for line item descriptions or requests
2. ALWAYS call search_line_items to find the correct code
3. Match descriptions to search results and get quantity/unit confirmation
4. Add to estimate using the exact code from search results
5. Suggest related items if relevant

CRITICAL - NO GUESSING: You do NOT have the line item database in your memory. You MUST search for every line item using search_line_items before adding it. Never invent a code.

XACTIMATE CATEGORY CODES:
- WTR: Water Extraction & Remediation
- DRY: Drywall
- PNT: Painting
- CLN: Cleaning
- PLM: Plumbing
- ELE: Electrical
- RFG: Roofing

ERROR HANDLING:
- If can't find item: "I couldn't find an exact match. Did you mean [alternative]?"
- If quantity unclear: "What quantity for that?"
- If unit unclear: "Is that per square foot or linear foot?"`;

/**
 * Fetch prompt instructions from the database API
 * Returns cached version if available and not expired
 */
async function fetchInstructionsFromAPI(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (cachedInstructions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedInstructions;
  }

  try {
    const response = await fetch('/api/prompts/voice.scope/config', {
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('[ScopeAgent] Failed to fetch prompt from API:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.config?.systemPrompt) {
      cachedInstructions = data.config.systemPrompt;
      cacheTimestamp = now;
      console.log('[ScopeAgent] Loaded instructions from database');
      return cachedInstructions;
    }

    return null;
  } catch (error) {
    console.warn('[ScopeAgent] Error fetching prompt from API:', error);
    return null;
  }
}

// Tool: Add a line item
const addLineItemTool = tool({
  name: 'add_line_item',
  description: 'Add a line item to the estimate. Use this when the adjuster specifies a work item to add.',
  parameters: z.object({
    code: z.string().describe('Line item code (e.g., DEM-DRW-REM for drywall demolition)'),
    description: z.string().describe('Human readable description of the work'),
    quantity: z.number().describe('Quantity (e.g., 200 for 200 SF)'),
    unit: z.string().describe('Unit of measure (SF, LF, EA, HR, DAY)'),
    unitPrice: z.number().optional().describe('Price per unit if known'),
    roomName: z.string().optional().describe('Which room this is for'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().addLineItem(params);
  },
});

// Tool: Remove a line item
const removeLineItemTool = tool({
  name: 'remove_line_item',
  description: 'Remove a line item from the estimate. Can identify by code, index, or description.',
  parameters: z.object({
    code: z.string().optional().describe('Line item code to remove'),
    itemIndex: z.number().optional().describe('Index of item in the list (0-based)'),
    description: z.string().optional().describe('Description to match (partial match)'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().removeLineItem(params);
  },
});

// Tool: Update quantity
const setQuantityTool = tool({
  name: 'set_quantity',
  description: 'Update the quantity of an existing line item.',
  parameters: z.object({
    code: z.string().optional().describe('Line item code to update'),
    itemIndex: z.number().optional().describe('Index of item in the list'),
    quantity: z.number().describe('New quantity'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().setQuantity(params);
  },
});

// Tool: Update line item details
const updateLineItemTool = tool({
  name: 'update_line_item',
  description: 'Update details of an existing line item (quantity, notes, room).',
  parameters: z.object({
    code: z.string().optional().describe('Line item code to update'),
    itemIndex: z.number().optional().describe('Index of item in the list'),
    quantity: z.number().optional().describe('New quantity'),
    notes: z.string().optional().describe('New or updated notes'),
    roomName: z.string().optional().describe('New room assignment'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().updateLineItem(params);
  },
});

// Tool: Set context (current room, damage type)
const setContextTool = tool({
  name: 'set_context',
  description: 'Set the current working context (room name and/or damage type). Items added will default to this context.',
  parameters: z.object({
    roomName: z.string().optional().describe('Current room (e.g., master_bedroom, kitchen)'),
    damageType: z.string().optional().describe('Type of damage (water, fire, smoke, mold)'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().setContext(params);
  },
});

// Tool: Search for line items
const searchLineItemsTool = tool({
  name: 'search_line_items',
  description: 'Search for available line item codes by description. Use this when you need to find the right code for user requests.',
  parameters: z.object({
    query: z.string().describe('Search terms (e.g., "drywall removal", "water extraction")'),
    category: z.string().optional().describe('Category to filter (DEM, WTR, DRW, etc.)'),
  }),
  execute: async (params) => {
    try {
      // Use the correct endpoint: /api/line-items (not /api/line-items/search)
      const url = `/api/line-items?q=${encodeURIComponent(params.query)}${params.category ? `&category=${encodeURIComponent(params.category)}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        return 'Search failed: Unable to fetch line items from the database.';
      }

      const data = await response.json();
      const items = data.items || data || [];

      // Return top 5 results as a concise string for the agent
      const topResults = items.slice(0, 5).map((item: { code: string; description: string; unit: string; basePrice?: number }) => ({
        code: item.code,
        description: item.description,
        unit: item.unit,
        price: item.basePrice,
      }));

      if (topResults.length === 0) {
        return `No line items found for "${params.query}". Try different search terms or check the category.`;
      }

      return JSON.stringify(topResults);
    } catch (error) {
      console.error('Search line items error:', error);
      return 'Search failed: Network error or service unavailable.';
    }
  },
});

// Tool: Get current estimate summary
const getEstimateSummaryTool = tool({
  name: 'get_estimate_summary',
  description: 'Get a summary of the current estimate including item count and subtotal.',
  parameters: z.object({}),
  execute: async () => {
    const state = scopeEngine.getState();
    const items = state.lineItems;
    const subtotal = state.getSubtotal();

    if (items.length === 0) {
      return 'The estimate is currently empty.';
    }

    const summary = items.map(item =>
      `${item.description}: ${item.quantity} ${item.unit}`
    ).join(', ');

    return `Current estimate has ${items.length} items totaling $${subtotal.toFixed(2)}. Items: ${summary}`;
  },
});

// Tool: Suggest related items
const suggestRelatedTool = tool({
  name: 'suggest_related_items',
  description: 'Suggest related line items based on damage type and existing items. Call this to offer helpful suggestions.',
  parameters: z.object({
    basedOn: z.string().describe('What to base suggestions on (damage type or existing item code)'),
  }),
  execute: async (params) => {
    return JSON.stringify({ action: 'suggest', basedOn: params.basedOn });
  },
});

// Tool: Undo last action
const undoTool = tool({
  name: 'undo',
  description: 'Undo the last action (add, remove, or update).',
  parameters: z.object({
    steps: z.number().default(1).describe('Number of actions to undo'),
  }),
  execute: async (params) => {
    return scopeEngine.getState().undo(params.steps ?? 1);
  },
});

// Tool: Clear all items
const clearAllTool = tool({
  name: 'clear_all',
  description: 'Remove all items from the estimate. Ask for confirmation first.',
  parameters: z.object({
    confirmed: z.boolean().describe('Whether the user confirmed they want to clear all'),
  }),
  execute: async (params) => {
    if (!params.confirmed) {
      return 'Please confirm you want to clear all items from the estimate.';
    }
    return scopeEngine.getState().clearAll();
  },
});

// Tool: Confirm pending suggestions
const confirmSuggestionsTool = tool({
  name: 'confirm_suggestions',
  description: 'Confirm and add pending AI-suggested items to the estimate.',
  parameters: z.object({}),
  execute: async () => {
    return scopeEngine.getState().confirmSuggestions();
  },
});

// Tool: Reject pending suggestions
const rejectSuggestionsTool = tool({
  name: 'reject_suggestions',
  description: 'Reject and dismiss pending AI-suggested items.',
  parameters: z.object({}),
  execute: async () => {
    return scopeEngine.getState().rejectSuggestions();
  },
});

// Tool list for agent creation
const agentTools = [
  addLineItemTool,
  removeLineItemTool,
  setQuantityTool,
  updateLineItemTool,
  setContextTool,
  searchLineItemsTool,
  getEstimateSummaryTool,
  suggestRelatedTool,
  undoTool,
  clearAllTool,
  confirmSuggestionsTool,
  rejectSuggestionsTool,
];

/**
 * Create a scope agent with instructions loaded from database
 * This is the preferred way to create an agent - it fetches prompts from Supabase
 */
export async function createScopeAgentAsync(): Promise<RealtimeAgent> {
  // Try to fetch instructions from database
  const dbInstructions = await fetchInstructionsFromAPI();

  // Use database instructions or fall back to local template
  const instructions = dbInstructions || FALLBACK_INSTRUCTIONS;

  if (!dbInstructions) {
    console.warn('[ScopeAgent] Using fallback instructions - database prompt not available');
  }

  return new RealtimeAgent({
    name: 'ScopeAgent',
    instructions,
    tools: agentTools,
  });
}

/**
 * Create scope agent synchronously (uses cached or fallback instructions)
 * @deprecated Use createScopeAgentAsync for database-loaded prompts
 */
export function createScopeAgent(): RealtimeAgent {
  // Use cached instructions if available, otherwise use fallback
  const instructions = cachedInstructions || FALLBACK_INSTRUCTIONS;

  return new RealtimeAgent({
    name: 'ScopeAgent',
    instructions,
    tools: agentTools,
  });
}

// Default agent (backwards compatible) - uses fallback instructions initially
// Call initializeScopeAgent() to load from database
export const scopeAgent = new RealtimeAgent({
  name: 'ScopeAgent',
  instructions: FALLBACK_INSTRUCTIONS,
  tools: agentTools,
});

/**
 * Initialize the scope agent by pre-fetching instructions from database
 * Call this during app initialization to warm the cache
 */
export async function initializeScopeAgent(): Promise<void> {
  await fetchInstructionsFromAPI();
}

// Export individual tools for testing
export const tools = {
  addLineItem: addLineItemTool,
  removeLineItem: removeLineItemTool,
  setQuantity: setQuantityTool,
  updateLineItem: updateLineItemTool,
  setContext: setContextTool,
  searchLineItems: searchLineItemsTool,
  getEstimateSummary: getEstimateSummaryTool,
  suggestRelated: suggestRelatedTool,
  undo: undoTool,
  clearAll: clearAllTool,
  confirmSuggestions: confirmSuggestionsTool,
  rejectSuggestions: rejectSuggestionsTool,
};
