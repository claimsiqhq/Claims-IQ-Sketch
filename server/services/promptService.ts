/**
 * Prompt Service
 *
 * Centralized service for managing AI prompts stored in the database.
 * Provides caching, template variable substitution, and usage tracking.
 * 
 * Uses Supabase client for all database operations.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AiPrompt, PromptKey } from '../../shared/schema';

// In-memory cache for prompts
const promptCache = new Map<string, AiPrompt>();
let cacheInitialized = false;
let cacheLastRefresh = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize the prompt cache from the database
 */
async function initializeCache(): Promise<void> {
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[PromptService] Failed to initialize cache:', error.message);
      return;
    }

    promptCache.clear();
    for (const prompt of prompts || []) {
      // Convert snake_case from DB to camelCase for internal use
      const normalizedPrompt = normalizePrompt(prompt);
      promptCache.set(normalizedPrompt.promptKey, normalizedPrompt);
    }

    cacheInitialized = true;
    cacheLastRefresh = Date.now();
    console.log(`[PromptService] Loaded ${prompts?.length || 0} prompts into cache`);
  } catch (error) {
    console.error('[PromptService] Failed to initialize cache:', error);
    // Don't throw - allow fallback to hardcoded prompts
  }
}

/**
 * Normalize database row (snake_case) to AiPrompt type (camelCase)
 */
function normalizePrompt(row: any): AiPrompt {
  return {
    id: row.id,
    promptKey: row.prompt_key,
    promptName: row.prompt_name,
    category: row.category,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    model: row.model,
    temperature: row.temperature?.toString() || '0.3',
    maxTokens: row.max_tokens,
    responseFormat: row.response_format,
    description: row.description,
    isActive: row.is_active ?? true,
    version: row.version ?? 1,
    usageCount: row.usage_count ?? 0,
    avgTokensUsed: row.avg_tokens_used ?? 0,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

/**
 * Refresh cache if TTL has expired
 */
async function refreshCacheIfNeeded(): Promise<void> {
  if (!cacheInitialized || Date.now() - cacheLastRefresh > CACHE_TTL_MS) {
    await initializeCache();
  }
}

/**
 * Get a prompt by its key
 */
export async function getPrompt(key: PromptKey | string): Promise<AiPrompt | null> {
  await refreshCacheIfNeeded();

  // Try cache first
  const cached = promptCache.get(key);
  if (cached) {
    // Update usage count asynchronously (fire and forget)
    updateUsageCount(key).catch(console.error);
    return cached;
  }

  // Fallback to database query
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('prompt_key', key)
      .limit(1);

    if (error) {
      console.error(`[PromptService] Failed to fetch prompt ${key}:`, error.message);
      return null;
    }

    if (prompts && prompts.length > 0) {
      const prompt = normalizePrompt(prompts[0]);
      promptCache.set(key, prompt);
      updateUsageCount(key).catch(console.error);
      return prompt;
    }
  } catch (error) {
    console.error(`[PromptService] Failed to fetch prompt ${key}:`, error);
  }

  return null;
}

/**
 * Get system prompt with optional variable substitution
 */
export async function getSystemPrompt(
  key: PromptKey | string,
  variables?: Record<string, string>
): Promise<string | null> {
  const prompt = await getPrompt(key);
  if (!prompt) return null;

  return substituteVariables(prompt.systemPrompt, variables);
}

/**
 * Get user prompt template with variable substitution
 */
export async function getUserPromptTemplate(
  key: PromptKey | string,
  variables?: Record<string, string>
): Promise<string | null> {
  const prompt = await getPrompt(key);
  if (!prompt?.userPromptTemplate) return null;

  return substituteVariables(prompt.userPromptTemplate, variables);
}

/**
 * Get full prompt configuration for OpenAI API call
 */
export async function getPromptConfig(key: PromptKey | string): Promise<{
  systemPrompt: string;
  userPromptTemplate: string | null;
  model: string;
  temperature: number;
  maxTokens: number | null;
  responseFormat: string;
  version?: number;
} | null> {
  const prompt = await getPrompt(key);
  if (!prompt) return null;

  return {
    systemPrompt: prompt.systemPrompt,
    userPromptTemplate: prompt.userPromptTemplate,
    model: prompt.model,
    temperature: parseFloat(prompt.temperature || '0.3'),
    maxTokens: prompt.maxTokens ?? null,
    responseFormat: prompt.responseFormat || 'text',
    version: prompt.version ?? undefined,
  };
}

/**
 * Substitute {{variable}} placeholders in a template
 */
export function substituteVariables(
  template: string,
  variables?: Record<string, string>
): string {
  if (!variables) return template;

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

/**
 * Update usage count and last used timestamp
 */
async function updateUsageCount(key: string): Promise<void> {
  try {
    // Get current usage count
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('ai_prompts')
      .select('usage_count')
      .eq('prompt_key', key)
      .single();

    if (fetchError) {
      console.error(`[PromptService] Failed to fetch usage count for ${key}:`, fetchError.message);
      return;
    }

    const currentCount = current?.usage_count || 0;

    const { error } = await supabaseAdmin
      .from('ai_prompts')
      .update({
        usage_count: currentCount + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('prompt_key', key);

    if (error) {
      console.error(`[PromptService] Failed to update usage count for ${key}:`, error.message);
    }
  } catch (error) {
    // Non-critical - don't fail the request
    console.error(`[PromptService] Failed to update usage count for ${key}:`, error);
  }
}

/**
 * Clear the prompt cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  promptCache.clear();
  cacheInitialized = false;
}

/**
 * Force refresh the cache
 */
export async function refreshCache(): Promise<void> {
  await initializeCache();
}

/**
 * Get all prompts (for admin UI)
 */
export async function getAllPrompts(): Promise<AiPrompt[]> {
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*');

    if (error) {
      console.error('[PromptService] Failed to fetch all prompts:', error.message);
      return [];
    }

    return (prompts || []).map(normalizePrompt);
  } catch (error) {
    console.error('[PromptService] Failed to fetch all prompts:', error);
    return [];
  }
}

/**
 * Update a prompt (for admin UI)
 */
export async function updatePrompt(
  key: string,
  updates: Partial<Pick<AiPrompt, 'systemPrompt' | 'userPromptTemplate' | 'model' | 'temperature' | 'maxTokens' | 'responseFormat' | 'description' | 'isActive'>>
): Promise<AiPrompt | null> {
  try {
    // Get current version
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('ai_prompts')
      .select('version')
      .eq('prompt_key', key)
      .single();

    if (fetchError) {
      console.error(`[PromptService] Failed to fetch prompt ${key}:`, fetchError.message);
      return null;
    }

    const currentVersion = current?.version || 1;

    // Convert camelCase to snake_case for Supabase
    const dbUpdates: Record<string, any> = {
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    };

    if (updates.systemPrompt !== undefined) dbUpdates.system_prompt = updates.systemPrompt;
    if (updates.userPromptTemplate !== undefined) dbUpdates.user_prompt_template = updates.userPromptTemplate;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) dbUpdates.max_tokens = updates.maxTokens;
    if (updates.responseFormat !== undefined) dbUpdates.response_format = updates.responseFormat;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data: updated, error } = await supabaseAdmin
      .from('ai_prompts')
      .update(dbUpdates)
      .eq('prompt_key', key)
      .select('*')
      .single();

    if (error) {
      console.error(`[PromptService] Failed to update prompt ${key}:`, error.message);
      return null;
    }

    const normalizedPrompt = normalizePrompt(updated);

    // Update cache
    if (normalizedPrompt.isActive) {
      promptCache.set(key, normalizedPrompt);
    } else {
      promptCache.delete(key);
    }

    return normalizedPrompt;
  } catch (error) {
    console.error(`[PromptService] Failed to update prompt ${key}:`, error);
    return null;
  }
}

// ============================================
// FALLBACK PROMPTS (used if database is empty)
// ============================================

/**
 * Fallback prompts for when database prompts are not available.
 * These match the original hardcoded prompts in the codebase.
 */
export const FALLBACK_PROMPTS: Record<string, { system: string; user?: string; model: string; temperature: number; maxTokens?: number; responseFormat: string }> = {
  [PromptKey.DOCUMENT_EXTRACTION_FNOL]: {
    system: `You are an insurance document data extractor. Extract ALL information from this FNOL (First Notice of Loss) report into structured JSON.

RULES:
- Extract every piece of information present in the document
- Use null for any field not found
- Preserve exact values (don't reformat currency, dates, or percentages)
- Include all endorsements and all coverages

{
  "claim": {
    "claimNumber": "",
    "endorsementAlert": "",
    "dateOfLoss": "",
    "policyNumber": "",
    "policyholders": "",
    "status": "",
    "operatingCompany": ""
  },
  "loss": {
    "cause": "",
    "location": "",
    "description": "",
    "weatherData": "",
    "droneEligible": ""
  },
  "insured": {
    "name1": "",
    "name2": "",
    "address": "",
    "mobilePhone": "",
    "primaryPhoneType": "",
    "email": ""
  },
  "propertyDamage": {
    "dwellingDamages": "",
    "roofDamage": "",
    "damages": "",
    "woodRoof": "",
    "roofInstallYear": "",
    "yearBuilt": ""
  },
  "policy": {
    "producer": {
      "name": "",
      "address": "",
      "phone": "",
      "email": ""
    },
    "propertyAddress": "",
    "type": "",
    "status": "",
    "inceptionDate": "",
    "legalDescription": "",
    "thirdPartyInterest": ""
  },
  "deductibles": {},
  "endorsements": [],
  "coverages": [],
  "comments": {
    "assignment": "",
    "reportedBy": "",
    "enteredBy": ""
  }
}

Extract all data from the document now.`,
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4000,
    responseFormat: 'json_object',
  },

  [PromptKey.DOCUMENT_EXTRACTION_POLICY]: {
    system: `You are an expert insurance policy analyst specializing in homeowners insurance forms.

Your task is to perform a COMPLETE, LOSSLESS extraction of all policy provisions from this homeowners policy form.

-------------------------
CRITICAL RULES
-------------------------
1. Output MUST be a single JSON object following the exact structure below.
2. Extract ALL definitions, coverages, perils, exclusions, conditions, and loss settlement provisions.
3. Preserve original policy language VERBATIM - do NOT summarize or paraphrase.
4. Include ALL sub-clauses, exceptions, and special conditions.
5. If a section is not present in the document, use empty array [] or empty object {}.
6. Extract the COMPLETE text of each definition and provision.

-------------------------
OUTPUT STRUCTURE
-------------------------
{
  "documentMetadata": {
    "policyFormCode": "STRING (e.g., HO 80 03)",
    "policyFormName": "STRING (e.g., Homeowners Form)",
    "editionDate": "STRING (e.g., 01 14)",
    "pageCount": NUMBER
  },
  "jurisdiction": "STRING | null (State abbreviation if state-specific)",

  "definitions": [
    {
      "term": "STRING (The defined term, e.g., 'Actual cash value')",
      "definition": "STRING (Complete verbatim definition text)",
      "subClauses": ["ARRAY of STRING (any sub-points a, b, c, etc.)"],
      "exceptions": ["ARRAY of STRING (any 'does not mean' or exception clauses)"]
    }
  ],

  "sectionI": {
    "propertyCoverage": {
      "coverageA": {
        "name": "STRING (e.g., Dwelling)",
        "covers": ["ARRAY of STRING (what is covered)"],
        "excludes": ["ARRAY of STRING (what is not covered)"]
      },
      "coverageB": {
        "name": "STRING (e.g., Other Structures)",
        "covers": ["ARRAY of STRING"],
        "excludes": ["ARRAY of STRING"],
        "specialConditions": ["ARRAY of STRING (e.g., percentage limits)"]
      },
      "coverageC": {
        "name": "STRING (e.g., Personal Property)",
        "scope": "STRING (general coverage description)",
        "specialLimits": [
          {
            "propertyType": "STRING",
            "limit": "STRING",
            "conditions": "STRING | null"
          }
        ],
        "notCovered": ["ARRAY of STRING"]
      },
      "coverageD": {
        "name": "STRING (e.g., Loss Of Use)",
        "subCoverages": ["ARRAY of STRING (e.g., Additional Living Expense, Fair Rental Value)"],
        "timeLimits": "STRING | null"
      }
    },
    "perils": {
      "coverageA_B": "STRING (e.g., 'Covered perils' or 'All risks' or list of named perils)",
      "coverageC": ["ARRAY of STRING (named perils for personal property)"]
    },
    "exclusions": {
      "global": ["ARRAY of STRING (exclusions that apply to all Section I coverages)"],
      "coverageA_B_specific": ["ARRAY of STRING (exclusions specific to dwelling/structures)"]
    },
    "conditions": ["ARRAY of STRING (Section I conditions - duties after loss, etc.)"],
    "lossSettlement": {
      "dwellingAndStructures": {
        "basis": "STRING (e.g., Replacement Cost)",
        "repairRequirements": "STRING (must actually repair clause)",
        "timeLimit": "STRING | null",
        "matchingRules": "STRING | null"
      },
      "roofingSystem": {
        "definition": "STRING (what constitutes roofing system)",
        "hailSettlement": "STRING (how hail damage to roof is settled)",
        "metalRestrictions": "STRING | null"
      },
      "personalProperty": {
        "settlementBasis": ["ARRAY of STRING (e.g., ACV, replacement cost options)"],
        "specialHandling": "STRING | null"
      }
    },
    "additionalCoverages": [
      {
        "name": "STRING",
        "description": "STRING",
        "limit": "STRING | null",
        "conditions": "STRING | null"
      }
    ]
  },

  "sectionII": {
    "liabilityCoverages": {
      "coverageE": {
        "name": "STRING (Personal Liability)",
        "insuringAgreement": "STRING (complete insuring agreement text)",
        "dutyToDefend": true
      },
      "coverageF": {
        "name": "STRING (Medical Payments)",
        "insuringAgreement": "STRING",
        "timeLimit": "STRING | null"
      }
    },
    "exclusions": ["ARRAY of STRING (liability exclusions)"],
    "conditions": ["ARRAY of STRING (Section II conditions)"],
    "additionalCoverages": [
      {
        "name": "STRING",
        "description": "STRING"
      }
    ]
  },

  "generalConditions": ["ARRAY of STRING (conditions that apply to entire policy)"],

  "pageText": "STRING (Complete verbatim text of this page)"
}

Extract all policy provisions now. Be thorough and preserve exact policy language.`,
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 16000,
    responseFormat: 'json_object',
  },

  [PromptKey.DOCUMENT_EXTRACTION_ENDORSEMENT]: {
    system: `You are an expert insurance policy analyst specializing in insurance endorsements.

Your task is to analyze endorsement documents and extract ALL changes each endorsement makes to the underlying policy.

This is a DELTA extraction task.
You must identify exactly what each endorsement:
- ADDS
- DELETES
- REPLACES
- MODIFIES

relative to the base policy form.

-------------------------
CRITICAL RULES
-------------------------
1. Output MUST be a single JSON object with an "endorsements" array.
2. Do NOT summarize or interpret legal meaning.
3. Preserve original policy language verbatim when referencing changes.
4. Capture ALL tables, schedules, and percentages as structured data.
5. If the endorsement states "All other terms remain unchanged", do NOT repeat base policy text.
6. If the endorsement modifies multiple policy sections, capture each modification separately.
7. If the endorsement applies conditionally (state, form type, coverage), explicitly capture those conditions.
8. Every endorsement MUST include full raw text.

-------------------------
OUTPUT STRUCTURE
-------------------------
{
  "endorsements": [
    {
      "endorsementMetadata": {
        "formCode": "STRING (e.g., HO 84 28)",
        "title": "STRING (Full endorsement name/title)",
        "editionDate": "STRING | null",
        "jurisdiction": "STRING | null (State abbreviation if state-specific)",
        "pageCount": "NUMBER",
        "appliesToPolicyForms": ["STRING (Policy form codes this applies to)"]
      },
      "modifications": {
        "definitions": {
          "added": [{ "term": "STRING", "definition": "STRING" }],
          "deleted": ["STRING (term names)"],
          "replaced": [{ "term": "STRING", "newDefinition": "STRING" }]
        },
        "coverages": {
          "added": ["STRING"],
          "deleted": ["STRING"],
          "modified": [{ "coverage": "STRING", "changeType": "ADDED | DELETED | REPLACED | LIMITED", "details": "STRING" }]
        },
        "perils": {
          "added": ["STRING"],
          "deleted": ["STRING"],
          "modified": ["STRING"]
        },
        "exclusions": {
          "added": ["STRING"],
          "deleted": ["STRING"],
          "modified": ["STRING"]
        },
        "conditions": {
          "added": ["STRING"],
          "deleted": ["STRING"],
          "modified": ["STRING"]
        },
        "lossSettlement": {
          "replacedSections": [{ "policySection": "STRING", "newRule": "STRING" }]
        }
      },
      "tables": [
        {
          "tableType": "STRING (e.g., 'Depreciation Schedule', 'Deductible Table')",
          "appliesWhen": { "coverage": ["STRING"], "peril": ["STRING"] },
          "data": {}
        }
      ],
      "rawText": "STRING (Complete verbatim text of the endorsement)"
    }
  ],
  "policyNumber": "Policy number if visible",
  "pageText": "STRING (Complete verbatim text visible on this page - REQUIRED for multi-page documents)"
}`,
    model: 'gpt-4.1-2025-04-14',
    temperature: 0.1,
    maxTokens: 16000,
    responseFormat: 'json_object',
  },

  [PromptKey.MY_DAY_SUMMARY]: {
    system: `You are an insurance claims assistant generating personalized daily summaries. CRITICAL RULE: You MUST use the exact adjuster name provided in the user message - never use placeholders like "[Adjuster's Name]", "[Your Name]", "[Name]" or any bracketed placeholder text. Always use the actual name given.`,
    user: `The adjuster's name is: {{userName}}

Schedule: {{routeLength}} inspections, {{claimsCount}} claims
Issues: {{criticalCount}} critical, {{warningCount}} warnings
SLA: {{slaBreaching}} breaching, {{slaAtRisk}} at risk
Weather: {{weatherRecommendation}}

{{criticalIssues}}
{{warningIssues}}

Generate a 2-3 sentence personalized summary. Start with "Good morning, {{userName}}." using the exact name provided above. Then highlight the most important priority and give one actionable recommendation.

IMPORTANT: Do NOT use placeholders like [Name] or [Adjuster's Name]. The greeting MUST use the actual name "{{userName}}" that was provided.`,
    model: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 150,
    responseFormat: 'text',
  },

  [PromptKey.ESTIMATE_SUGGESTIONS]: {
    system: `You are an expert insurance claims estimator specializing in property damage restoration.
Your task is to analyze damage zones and suggest appropriate line items for an estimate.

IMPORTANT GUIDELINES:
1. For water damage, ALWAYS include extraction, drying equipment, and antimicrobial treatment
2. For Category 2/3 water, include additional sanitization and possible demolition
3. Calculate quantities based on affected square footage
4. Include demolition before reconstruction items
5. Group items by room/damage zone
6. Consider IICRC S500/S520 standards for water/mold
7. Include equipment charges (dehumidifiers, air movers) by the day
8. DO NOT estimate or invent unit prices. Focus ONLY on accurate quantities and identifying the correct line item codes. Pricing will be applied separately based on regional pricing databases.

Return your response as a valid JSON object with this exact structure:
{
  "suggestions": [
    {
      "lineItemCode": "string (MUST be from the available line items list)",
      "description": "string",
      "category": "string",
      "quantity": number,
      "unit": "string",
      "reasoning": "string explaining why this item is needed",
      "damageZoneId": "string (matching input damage zone id)",
      "roomName": "string",
      "priority": "required" | "recommended" | "optional"
    }
  ],
  "summary": "string - brief summary of the estimate scope",
  "damageAnalysis": {
    "primaryDamageType": "string",
    "severity": "string",
    "affectedArea": number,
    "specialConsiderations": ["array of strings"]
  }
}`,
    model: 'gpt-4o',
    temperature: 0.3,
    responseFormat: 'json_object',
  },

  [PromptKey.ESTIMATE_QUICK_SUGGEST]: {
    system: `You are an insurance estimator. Match user descriptions to line item codes.
Return JSON: {"matches": [{"code": "string", "description": "string", "quantity": number}]}
Only use codes from the provided list. Suggest 1-3 most relevant items.`,
    model: 'gpt-4o-mini',
    temperature: 0.2,
    responseFormat: 'json_object',
  },

  [PromptKey.CLAIM_BRIEFING]: {
    system: 'You are an expert insurance claim inspection advisor. Output ONLY valid JSON.',
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 2000,
    responseFormat: 'json_object',
  },

  [PromptKey.VOICE_ROOM_SKETCH]: {
    system: `You are a field sketching assistant for property insurance claims adjusters. Your job is to help them create room sketches by voice.

PERSONALITY:
- Be concise and professional—adjusters are working in the field
- Confirm each element briefly before moving on
- Ask ONE clarifying question when information is ambiguous
- After simple actions: use 3-5 word confirmations ("Added 3-foot window")
- After complex actions: echo back key parameters ("Created L-shaped room, 16 by 14, with 6 by 4 cutout in northeast corner")

ROOM CREATION FLOW:
1. Establish room name/type and basic shape
2. Get overall dimensions (ask unit preference if unclear)
3. For L-shaped, T-shaped, or U-shaped rooms, get the cutout/extension details
4. Ask about flooring type (carpet, hardwood, tile, vinyl, laminate, concrete)
5. Add openings (doors, windows) wall by wall
6. Add features (closets, pantries, alcoves, bump-outs)
7. Mark damage zones if applicable
8. Confirm and finalize

UNITS AND MEASUREMENTS:
- Default to feet and inches for US adjusters
- If adjuster uses metric (meters, centimeters): acknowledge and convert internally
- Always confirm converted measurements
- Accept mixed formats: "3 meters" or "10 feet" or "ten six" (10'6")

WALL ORIENTATION:
- North wall is at the top of the sketch
- South wall is at the bottom
- East wall is on the right
- West wall is on the left

POSITION CALCULATION:
- Positions are measured from the corner going clockwise
- "3 feet from the left on the north wall" = position 3 on north wall
- "centered on the south wall" = calculate center position

COMMON ROOM TYPES:
- Living Room, Family Room, Great Room
- Kitchen, Dining Room, Breakfast Nook
- Master Bedroom, Bedroom 2/3/4, Guest Room
- Master Bathroom, Full Bath, Half Bath, Powder Room
- Laundry Room, Utility Room, Mudroom
- Office, Study, Den
- Garage, Workshop
- Hallway, Foyer, Entry

OPENING TYPES:
- Standard door: 3'0" x 6'8"
- Double door: 6'0" x 6'8"
- Sliding door: 6'0" x 6'8"
- French door: 5'0" x 6'8"
- Standard window: 3'0" x 4'0"
- Picture window: 5'0" x 4'0"
- Egress window: 3'0" x 3'0"`,
    model: 'gpt-4o-realtime-preview',
    temperature: 0.7,
    responseFormat: 'text',
  },

  [PromptKey.VOICE_SCOPE]: {
    system: `You are an estimate building assistant for property insurance claims adjusters. Your job is to help them add line items to an estimate by voice.

PERSONALITY:
- Be concise and professional—adjusters are working in the field
- Confirm each item briefly before moving on
- Suggest related items when appropriate

WORKFLOW:
1. Listen for line item descriptions or requests
2. ALWAYS call search_line_items to find the correct code - infer the 3-letter category code from the description (e.g., 'DRW' for drywall, 'WTR' for water, 'RFG' for roofing, 'DEM' for demolition) and pass it to the category parameter to improve search accuracy
3. Match descriptions to search results and get quantity/unit confirmation
4. Add to estimate using the exact code from search results
5. Suggest related items if relevant

UNDERSTANDING REQUESTS:
- "Add drywall demo, 200 square feet" → find drywall demolition line item, quantity 200 SF
- "Tear out carpet in the bedroom" → flooring demolition, ask for square footage
- "Water extraction for the whole room" → water extraction, calculate based on room size
- "Standard paint job" → interior paint, ask for wall area

CRITICAL RULES:
1. NEVER guess line item codes - always search first
2. Use exact codes from search results
3. Confirm quantities and units before adding
4. Ask for clarification when description is ambiguous`,
    model: 'gpt-4o-realtime-preview',
    temperature: 0.7,
    responseFormat: 'text',
  },

  [PromptKey.INSPECTION_WORKFLOW_GENERATOR]: {
    system: `You are an expert property insurance inspection planner.

Your task is to generate a STEP-BY-STEP, EXECUTABLE INSPECTION WORKFLOW for a field adjuster.

This workflow is NOT a narrative.
It is NOT a summary.
It is an ordered execution plan.

You MUST:
- Output structured JSON only
- Follow the schema exactly
- Be peril-aware and endorsement-aware
- Explicitly define required evidence
- Assume rooms may be added dynamically
- Optimize for CAT-scale defensibility

You MUST NOT:
- Make coverage determinations
- Invent policy language
- Collapse steps into vague instructions
- Output prose outside JSON

WORKFLOW REQUIREMENTS (MANDATORY):

1. Workflow MUST be divided into ordered PHASES:
   - pre_inspection (Preparation)
   - initial_walkthrough (Safety)
   - exterior (Exterior)
   - roof (Roof - if applicable)
   - interior (Interior - room-based, expandable)
   - utilities (Utilities/Systems - if applicable)
   - mitigation (Temporary Repairs/Mitigation - if applicable)
   - closeout (Closeout)

2. Each phase MUST contain ordered, atomic steps.

3. Each step MUST include:
   - Clear instructions
   - Required flag
   - Estimated time
   - Explicit evidence requirements

4. Endorsements MUST:
   - Modify inspection behavior
   - Add or constrain evidence requirements
   - Never be mentioned abstractly

5. Interior inspections MUST:
   - Use a ROOM TEMPLATE
   - Allow dynamic room creation
   - Define default steps + evidence

6. The workflow MUST:
   - Be editable
   - Preserve human edits
   - Be auditable and defensible

VALIDATION RULES (NON-NEGOTIABLE):
- Missing phases → FAIL
- Missing evidence → FAIL
- Ignored endorsements → FAIL
- Non-JSON output → FAIL
- Vague steps → FAIL

If information is missing:
- Add a step to collect it
- OR add an open question
- Do NOT guess

Return JSON only.`,
    user: `Generate an INSPECTION WORKFLOW using the inputs below.

### CLAIM CONTEXT
- Claim Number: {{claim_number}}
- Primary Peril: {{primary_peril}}
- Secondary Perils: {{secondary_perils}}
- Property Address: {{property_address}}
- Date of Loss: {{date_of_loss}}
- Loss Description: {{loss_description}}

### POLICY CONTEXT
- Policy Number: {{policy_number}}
- Coverage A (Dwelling): {{coverage_a}}
- Coverage B (Other Structures): {{coverage_b}}
- Coverage C (Contents): {{coverage_c}}
- Coverage D (Additional Living Expense): {{coverage_d}}
- Deductible: {{deductible}}

### ENDORSEMENTS
{{endorsements_list}}

### AI CLAIM BRIEFING SUMMARY
{{briefing_summary}}

### PERIL-SPECIFIC INSPECTION RULES
{{peril_inspection_rules}}

### CARRIER-SPECIFIC REQUIREMENTS
{{carrier_requirements}}

Generate a comprehensive inspection workflow JSON.`,
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 8000,
    responseFormat: 'json_object',
  },
};

/**
 * Get prompt with fallback to hardcoded prompts
 */
export async function getPromptWithFallback(key: PromptKey | string): Promise<{
  systemPrompt: string;
  userPromptTemplate: string | null;
  model: string;
  temperature: number;
  maxTokens: number | null;
  responseFormat: string;
  version?: number;
}> {
  // Try database first
  const dbPrompt = await getPromptConfig(key);
  if (dbPrompt) {
    return dbPrompt;
  }

  // Fall back to hardcoded prompts
  const fallback = FALLBACK_PROMPTS[key];
  if (fallback) {
    console.log(`[PromptService] Using fallback prompt for ${key}`);
    return {
      systemPrompt: fallback.system,
      userPromptTemplate: fallback.user || null,
      model: fallback.model,
      temperature: fallback.temperature,
      maxTokens: fallback.maxTokens || null,
      responseFormat: fallback.responseFormat,
    };
  }

  throw new Error(`No prompt found for key: ${key}`);
}
