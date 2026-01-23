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

// Claim context cache (per claimId)
const claimContextCache = new Map<string, { context: any; timestamp: number }>();
const CLAIM_CONTEXT_TTL_MS = 2 * 60 * 1000; // 2 minute cache

/**
 * Fetch claim context from API
 */
async function fetchClaimContext(claimId: string): Promise<any | null> {
  // Check cache first
  const cached = claimContextCache.get(claimId);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CLAIM_CONTEXT_TTL_MS) {
    return cached.context;
  }

  try {
    const response = await fetch(`/api/claims/${claimId}/scope-context`, {
      credentials: 'include',
    });

    if (!response.ok) {
      // Failed to fetch claim context - will use default context
      return null;
    }

    const context = await response.json();
    claimContextCache.set(claimId, { context, timestamp: now });
    return context;
  } catch (error) {
    // Error fetching claim context - will use default context
    return null;
  }
}

/**
 * Fetch prompt instructions from the database API
 * Returns cached version if available and not expired
 * Throws error if prompt not available - database is the ONLY source
 */
async function fetchInstructionsFromAPI(claimId?: string): Promise<string> {
  // Check cache first
  const now = Date.now();
  if (cachedInstructions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    // If we have claim context, inject it into the cached prompt
    if (claimId) {
      const claimContext = await fetchClaimContext(claimId);
      if (claimContext) {
        return injectClaimContext(cachedInstructions, claimContext);
      }
    }
    return cachedInstructions;
  }

  const response = await fetch('/api/prompts/voice.scope/config', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(
      `[ScopeAgent] Failed to fetch prompt from database (HTTP ${response.status}). ` +
      `The prompt "voice.scope" must exist in the ai_prompts table.`
    );
  }

  const data = await response.json();
  if (!data.config?.systemPrompt) {
    throw new Error(
      `[ScopeAgent] No systemPrompt found in database response. ` +
      `Check that the "voice.scope" prompt is properly configured in ai_prompts.`
    );
  }

  cachedInstructions = data.config.systemPrompt;
  cacheTimestamp = now;
  // Instructions loaded from database

  // Inject claim context if available
  if (claimId) {
    const claimContext = await fetchClaimContext(claimId);
    if (claimContext) {
      return injectClaimContext(cachedInstructions, claimContext);
    }
  }

  return cachedInstructions;
}

/**
 * Inject claim context into prompt template
 */
function injectClaimContext(prompt: string, context: any): string {
  if (!context) return prompt;

  const contextSection = `
## CLAIM CONTEXT

**Claim Number:** ${context.claimNumber || 'Unknown'}
**Primary Peril:** ${context.primaryPeril || 'Unknown'}
**Secondary Perils:** ${context.secondaryPerils?.join(', ') || 'None'}

${context.briefing ? `
### AI Briefing Summary
**Primary Peril:** ${context.briefing.primaryPeril || 'Unknown'}
**Overview:** ${context.briefing.overview?.join('; ') || 'No overview available'}
**Inspection Priorities:** ${context.briefing.priorities?.join('; ') || 'No priorities'}
**Common Misses:** ${context.briefing.commonMisses?.join('; ') || 'No common misses'}
**Photo Requirements:** ${context.briefing.photoRequirements?.map((p: any) => `${p.category}: ${p.items?.join(', ')}`).join('; ') || 'None'}
**Sketch Requirements:** ${context.briefing.sketchRequirements?.join('; ') || 'None'}
**Depreciation Considerations:** ${context.briefing.depreciationConsiderations?.join('; ') || 'None'}
` : '### AI Briefing Summary\nNo briefing available for this claim.'}

${context.workflow ? `
### Inspection Workflow
**Total Steps:** ${context.workflow.totalSteps || 0}
**Key Steps:**
${context.workflow.steps?.map((s: any) => `- [${s.phase}] ${s.title}: ${s.instructions}`).join('\n') || 'No workflow steps available'}
` : '### Inspection Workflow\nNo workflow available for this claim.'}

---
`;

  // Inject context section after the main instructions
  // Look for a good insertion point (after the main role description)
  const insertionPoint = prompt.indexOf('## CLAIM CONTEXT');
  if (insertionPoint !== -1) {
    // Replace existing context section
    const nextSection = prompt.indexOf('---', insertionPoint);
    if (nextSection !== -1) {
      return prompt.slice(0, insertionPoint) + contextSection + prompt.slice(nextSection + 3);
    }
  }

  // Otherwise, append at the beginning after the role description
  const roleEnd = prompt.indexOf('\n\n');
  if (roleEnd !== -1) {
    return prompt.slice(0, roleEnd + 2) + contextSection + prompt.slice(roleEnd + 2);
  }

  return contextSection + '\n\n' + prompt;
}

// Tool: Add a line item
const addLineItemTool = tool({
  name: 'add_line_item',
  description: 'Add a line item to the estimate. Use this when the adjuster specifies a work item to add. Depreciation will be applied automatically if item age or condition is known from claim context.',
  parameters: z.object({
    code: z.string().describe('Line item code (e.g., DEM-DRW-REM for drywall demolition)'),
    description: z.string().describe('Human readable description of the work'),
    quantity: z.number().describe('Quantity (e.g., 200 for 200 SF)'),
    unit: z.string().describe('Unit of measure (SF, LF, EA, HR, DAY)'),
    unitPrice: z.number().optional().describe('Price per unit if known'),
    roomName: z.string().optional().describe('Which room this is for'),
    notes: z.string().optional().describe('Additional notes'),
    itemAge: z.number().optional().describe('Age of item in years (for depreciation calculation)'),
    condition: z.enum(['good', 'fair', 'poor']).optional().describe('Condition of item (affects depreciation)'),
  }),
  execute: async (params) => {
    const result = scopeEngine.getState().addLineItem(params);
    
    // Apply depreciation if age or condition provided
    if (params.itemAge !== undefined || params.condition !== undefined) {
      const items = scopeEngine.getState().getLineItems();
      const newItem = items[items.length - 1];
      
      if (newItem && params.itemAge !== undefined) {
        // Simple straight-line depreciation: assume 20-year useful life
        // In future, this should fetch from depreciation_schedules table
        const usefulLifeYears = 20;
        const depreciationPercent = Math.min((params.itemAge / usefulLifeYears) * 100, 80);
        
        scopeEngine.getState().applyDepreciation(
          newItem.id,
          depreciationPercent,
          params.itemAge,
          params.condition
        );
      }
    }
    
    return result;
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
      // Search line items error - returning error message to user
      return 'Search failed: Network error or service unavailable.';
    }
  },
});

// Tool: Get current estimate summary
const getEstimateSummaryTool = tool({
  name: 'get_estimate_summary',
  description: 'Get a summary of the current estimate including item count, RCV, ACV, and depreciation.',
  parameters: z.object({}),
  execute: async () => {
    const state = scopeEngine.getState();
    const items = state.lineItems;
    const rcv = state.getTotalRCV();
    const acv = state.getTotalACV();
    const depreciation = state.getTotalDepreciation();

    if (items.length === 0) {
      return 'The estimate is currently empty.';
    }

    const summary = items.map(item => {
      let itemDesc = `${item.description}: ${item.quantity} ${item.unit}`;
      if (item.depreciationAmount) {
        itemDesc += ` (ACV: $${item.acv?.toFixed(2) || '0.00'})`;
      }
      return itemDesc;
    }).join(', ');

    let result = `Current estimate has ${items.length} items. RCV: $${rcv.toFixed(2)}`;
    if (depreciation > 0) {
      result += `, ACV: $${acv.toFixed(2)}, Depreciation: $${depreciation.toFixed(2)}`;
    }
    result += `. Items: ${summary}`;

    return result;
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

// Tool: Get workflow steps
const getWorkflowStepsTool = tool({
  name: 'get_workflow_steps',
  description: 'Get the inspection workflow steps for the current claim. Use this to understand what needs to be inspected and ensure scope items align with workflow priorities.',
  parameters: z.object({
    phase: z.string().optional().describe('Filter by workflow phase (exterior, interior, documentation, etc.)'),
  }),
  execute: async (params) => {
    try {
      const claimId = scopeEngine.getState().claimId;
      if (!claimId) {
        return 'No claim ID available. Workflow steps cannot be retrieved.';
      }

      const response = await fetch(`/api/claims/${claimId}/scope-context`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return 'Failed to fetch workflow steps.';
      }

      const context = await response.json();
      if (!context.workflow || !context.workflow.steps || context.workflow.steps.length === 0) {
        return 'No workflow steps available for this claim.';
      }

      let steps = context.workflow.steps;
      if (params.phase) {
        steps = steps.filter((s: any) => s.phase.toLowerCase() === params.phase.toLowerCase());
      }

      if (steps.length === 0) {
        return `No workflow steps found for phase "${params.phase}".`;
      }

      return steps.map((s: any) => `[${s.phase}] ${s.title}: ${s.instructions}${s.required ? ' (REQUIRED)' : ''}`).join('\n');
    } catch (error) {
      // Get workflow steps error - returning error message to user
      return 'Failed to retrieve workflow steps.';
    }
  },
});

// Tool: Get briefing priorities
const getBriefingPrioritiesTool = tool({
  name: 'get_briefing_priorities',
  description: 'Get the AI briefing priorities and inspection strategy for the current claim. Use this to ensure scope items align with what the briefing recommends focusing on.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const claimId = scopeEngine.getState().claimId;
      if (!claimId) {
        return 'No claim ID available. Briefing priorities cannot be retrieved.';
      }

      const response = await fetch(`/api/claims/${claimId}/scope-context`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return 'Failed to fetch briefing priorities.';
      }

      const context = await response.json();
      if (!context.briefing) {
        return 'No briefing available for this claim.';
      }

      const briefing = context.briefing;
      const parts: string[] = [];

      if (briefing.priorities && briefing.priorities.length > 0) {
        parts.push(`**Inspection Priorities:**\n${briefing.priorities.map((p: string) => `- ${p}`).join('\n')}`);
      }

      if (briefing.commonMisses && briefing.commonMisses.length > 0) {
        parts.push(`**Common Misses:**\n${briefing.commonMisses.map((m: string) => `- ${m}`).join('\n')}`);
      }

      if (briefing.overview && briefing.overview.length > 0) {
        parts.push(`**Claim Overview:**\n${briefing.overview.map((o: string) => `- ${o}`).join('\n')}`);
      }

      return parts.length > 0 ? parts.join('\n\n') : 'No briefing priorities available.';
    } catch (error) {
      // Get briefing priorities error - returning error message to user
      return 'Failed to retrieve briefing priorities.';
    }
  },
});

// Tool: Get photo requirements
const getPhotoRequirementsTool = tool({
  name: 'get_photo_requirements',
  description: 'Get the photo requirements from the AI briefing. Use this to remind the adjuster about required photos when adding scope items.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const claimId = scopeEngine.getState().claimId;
      if (!claimId) {
        return 'No claim ID available. Photo requirements cannot be retrieved.';
      }

      const response = await fetch(`/api/claims/${claimId}/scope-context`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return 'Failed to fetch photo requirements.';
      }

      const context = await response.json();
      if (!context.briefing || !context.briefing.photoRequirements || context.briefing.photoRequirements.length === 0) {
        return 'No specific photo requirements available for this claim.';
      }

      return context.briefing.photoRequirements.map((p: any) => `**${p.category}:**\n${p.items?.map((i: string) => `- ${i}`).join('\n') || 'No items listed'}`).join('\n\n');
    } catch (error) {
      // Get photo requirements error - returning error message to user
      return 'Failed to retrieve photo requirements.';
    }
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
  getWorkflowStepsTool,
  getBriefingPrioritiesTool,
  getPhotoRequirementsTool,
  undoTool,
  clearAllTool,
  confirmSuggestionsTool,
  rejectSuggestionsTool,
];

/**
 * Create a scope agent with instructions loaded from database
 * Database is the ONLY source - throws if prompt not available
 * 
 * @param claimId - Optional claim ID to inject claim context into prompt
 */
export async function createScopeAgentAsync(claimId?: string): Promise<RealtimeAgent> {
  const instructions = await fetchInstructionsFromAPI(claimId);

  return new RealtimeAgent({
    name: 'ScopeAgent',
    instructions,
    tools: agentTools,
  });
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
