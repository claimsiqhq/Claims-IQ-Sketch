/**
 * Prompt Service
 *
 * Centralized service for managing AI prompts stored in the database.
 * Provides caching, template variable substitution, and usage tracking.
 */

import { db } from '../db';
import { aiPrompts, AiPrompt, PromptKey } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

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
    const prompts = await db.select().from(aiPrompts).where(eq(aiPrompts.isActive, true));

    promptCache.clear();
    for (const prompt of prompts) {
      promptCache.set(prompt.promptKey, prompt);
    }

    cacheInitialized = true;
    cacheLastRefresh = Date.now();
    console.log(`[PromptService] Loaded ${prompts.length} prompts into cache`);
  } catch (error) {
    console.error('[PromptService] Failed to initialize cache:', error);
    // Don't throw - allow fallback to hardcoded prompts
  }
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
    const [prompt] = await db
      .select()
      .from(aiPrompts)
      .where(eq(aiPrompts.promptKey, key))
      .limit(1);

    if (prompt) {
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
} | null> {
  const prompt = await getPrompt(key);
  if (!prompt) return null;

  return {
    systemPrompt: prompt.systemPrompt,
    userPromptTemplate: prompt.userPromptTemplate,
    model: prompt.model,
    temperature: parseFloat(prompt.temperature || '0.3'),
    maxTokens: prompt.maxTokens,
    responseFormat: prompt.responseFormat || 'text',
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
    await db
      .update(aiPrompts)
      .set({
        usageCount: sql`${aiPrompts.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiPrompts.promptKey, key));
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
    return await db.select().from(aiPrompts);
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
    const [updated] = await db
      .update(aiPrompts)
      .set({
        ...updates,
        version: sql`${aiPrompts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(aiPrompts.promptKey, key))
      .returning();

    // Update cache
    if (updated) {
      if (updated.isActive) {
        promptCache.set(key, updated);
      } else {
        promptCache.delete(key);
      }
    }

    return updated || null;
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
    system: `You are an expert insurance document analyzer with a specialty in First Notice of Loss (FNOL) reports. Your task is to analyze the provided text/document content, which may contain one or more FNOL reports, and extract all relevant information for each claim into a structured JSON array.

Output Rules:
1. The output MUST be a single JSON array containing one object for each distinct claim found in the source text.
2. Strictly adhere to the field names, hierarchy, and data types specified in the template below.
3. Use the most accurate and complete information directly from the source.
4. For missing data, set the value to null.
5. Date/Time Format: Strictly use "MM/DD/YYYY@HH:MM AM/PM" (e.g., 05/24/2025@1:29 PM).
6. Limit/Currency Format: Preserve the format found in the source (e.g., "$7,932 1%").

JSON Template:
{
  "claims": [
    {
      "claimInformation": {
        "claimNumber": "STRING",
        "dateOfLoss": "STRING",
        "claimStatus": "STRING",
        "operatingCompany": "STRING",
        "causeOfLoss": "STRING",
        "riskLocation": "STRING",
        "lossDescription": "STRING",
        "droneEligibleAtFNOL": "STRING"
      },
      "insuredInformation": {
        "policyholderName1": "STRING",
        "policyholderName2": "STRING",
        "contactMobilePhone": "STRING",
        "contactEmail": "STRING"
      },
      "propertyDamageDetails": {
        "yearBuilt": "STRING (YYYY)",
        "yearRoofInstall": "STRING (YYYY)",
        "roofDamageReported": "STRING",
        "numberOfStories": "STRING"
      },
      "policyDetails": {
        "policyNumber": "STRING",
        "inceptionDate": "STRING (MM/DD/YYYY)",
        "producer": "STRING",
        "thirdPartyInterest": "STRING",
        "deductibles": {
          "policyDeductible": "STRING",
          "windHailDeductible": "STRING"
        }
      },
      "coverages": [
        {"coverageName": "STRING", "limit": "STRING", "valuationMethod": "STRING"}
      ],
      "endorsementsListed": ["ARRAY of STRING (Form Numbers/Titles)"]
    }
  ]
}

ADDITIONALLY: Include a "pageText" field at the root level containing the complete verbatim text from this page, preserving the original layout as much as possible.`,
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4000,
    responseFormat: 'json_object',
  },

  [PromptKey.DOCUMENT_EXTRACTION_POLICY]: {
    system: `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):
{
  "policyholder": "Named insured on the policy",
  "policyholderSecondary": "Second named insured",
  "riskLocation": "Full insured property address",
  "policyNumber": "Policy number",
  "state": "State code (2-letter)",
  "carrier": "Insurance company name",
  "yearRoofInstall": "Roof installation date if available",
  "policyDeductible": "Policy deductible ($X,XXX)",
  "windHailDeductible": "Wind/hail deductible ($X,XXX X%)",
  "coverages": [
    {"code": "A", "name": "Coverage A - Dwelling", "limit": "$XXX,XXX", "valuationMethod": "RCV or ACV"}
  ],
  "dwellingLimit": "Coverage A limit",
  "scheduledStructures": [],
  "endorsementDetails": [],
  "endorsementsListed": ["Array of endorsement form numbers"],
  "mortgagee": "Mortgagee/lender info"
}`,
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4000,
    responseFormat: 'json_object',
  },

  [PromptKey.DOCUMENT_EXTRACTION_ENDORSEMENT]: {
    system: `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):
{
  "policyNumber": "Policy number this endorsement applies to",
  "endorsementDetails": [
    {"formNumber": "HO XX XX", "name": "Full endorsement name", "additionalInfo": "Key provisions or limits"}
  ],
  "endorsementsListed": ["Array of endorsement form numbers, e.g., 'HO 84 28'"]
}`,
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4000,
    responseFormat: 'json_object',
  },

  [PromptKey.MY_DAY_SUMMARY]: {
    system: `You are an insurance claims assistant. Generate a brief, actionable summary for an adjuster's day.`,
    user: `Context:
- {{routeLength}} inspections scheduled
- {{claimsCount}} active claims
- {{criticalCount}} critical issues, {{warningCount}} warnings
- SLA status: {{slaBreaching}} breaching, {{slaAtRisk}} at risk, {{slaSafe}} safe
- Weather: {{weatherRecommendation}}

Key issues:
{{criticalIssues}}
{{warningIssues}}

Generate a 2-3 sentence summary that:
1. Highlights the most important priority
2. Mentions any weather or SLA concerns
3. Gives one actionable recommendation

Be concise and professional.`,
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
