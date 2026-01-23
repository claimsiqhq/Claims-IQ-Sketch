// AI Estimate Suggestion Service
// Uses OpenAI to analyze damage zones and suggest appropriate line items

import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { PromptKey } from '../../shared/schema';
import { getPromptWithFallback, substituteVariables } from './promptService';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface DamageZoneInput {
  id: string;
  roomName: string;
  roomType?: string;
  damageType: string; // water, fire, smoke, mold, wind, impact
  damageSeverity?: string; // minor, moderate, severe, total_loss
  waterCategory?: number; // 1, 2, or 3 for water damage
  waterClass?: number; // 1, 2, 3, or 4
  squareFootage?: number;
  affectedSurfaces?: string[]; // Floor, Wall North, Ceiling, etc.
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  notes?: string;
}

export interface SuggestedLineItem {
  lineItemCode: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  reasoning: string;
  damageZoneId: string;
  roomName: string;
  priority: 'required' | 'recommended' | 'optional';
}

export interface AISuggestionResult {
  suggestions: SuggestedLineItem[];
  summary: string;
  totalEstimatedCost?: number;
  damageAnalysis: {
    primaryDamageType: string;
    severity: string;
    affectedArea: number;
    specialConsiderations: string[];
  };
}

// ============================================
// LINE ITEM CATEGORIES FOR DIFFERENT DAMAGE TYPES
// ============================================

const DAMAGE_TYPE_CATEGORIES: Record<string, string[]> = {
  water: ['WTR', 'DEM', 'DRY', 'FLR', 'DRW', 'PLM', 'CLN', 'ANT'],
  fire: ['FIR', 'DEM', 'CLN', 'DRW', 'PNT', 'ELE', 'INS'],
  smoke: ['SMK', 'CLN', 'DRW', 'PNT', 'SEA', 'ODR'],
  mold: ['MLD', 'DEM', 'ANT', 'CLN', 'DRW', 'SEA'],
  wind: ['WND', 'DEM', 'ROF', 'EXT', 'WIN', 'SID'],
  impact: ['DEM', 'DRW', 'PNT', 'GEN'],
};

// ============================================
// AI SUGGESTION SERVICE
// ============================================

export async function generateEstimateSuggestions(
  damageZones: DamageZoneInput[],
  regionId: string = 'US-NATIONAL'
): Promise<AISuggestionResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Fetch available line items based on damage types
  const relevantCategories = new Set<string>();
  for (const zone of damageZones) {
    const categories = DAMAGE_TYPE_CATEGORIES[zone.damageType] || ['GEN'];
    categories.forEach(cat => relevantCategories.add(cat));
  }

  // Get line items for relevant categories using Supabase
  const categoryArray = Array.from(relevantCategories);
  let availableLineItems: any[] = [];

  // Build OR filter for categories
  const categoryFilters = categoryArray.map(cat => `category_id.ilike.${cat}%`).join(',');

  const { data: lineItems, error } = await supabaseAdmin
    .from('line_items')
    .select('code, description, category_id, unit')
    .eq('is_active', true)
    .or(categoryFilters)
    .order('category_id')
    .order('code')
    .limit(200);

  if (!error && lineItems) {
    availableLineItems = lineItems;
  }

  // Build the prompt for OpenAI
  const damageDescription = damageZones.map(zone => {
    let desc = `- ${zone.roomName} (${zone.roomType || 'room'}): ${zone.damageType} damage`;
    if (zone.damageSeverity) desc += `, severity: ${zone.damageSeverity}`;
    if (zone.waterCategory) desc += `, IICRC Category ${zone.waterCategory}`;
    if (zone.waterClass) desc += `, Class ${zone.waterClass}`;
    if (zone.squareFootage) desc += `, ${zone.squareFootage} SF`;
    if (zone.affectedSurfaces?.length) desc += `, affecting: ${zone.affectedSurfaces.join(', ')}`;
    if (zone.notes) desc += `. Notes: ${zone.notes}`;
    return desc;
  }).join('\n');

  const lineItemList = availableLineItems.map(li =>
    `${li.code}: ${li.description} (${li.unit})`
  ).join('\n');

  // Get prompt from database (falls back to hardcoded if not available)
  const promptConfig = await getPromptWithFallback(PromptKey.ESTIMATE_SUGGESTIONS);

  // Build user prompt with variable substitution
  const userPrompt = promptConfig.userPromptTemplate
    ? substituteVariables(promptConfig.userPromptTemplate, {
        damageDescription,
        lineItemList,
      })
    : `Analyze these damage zones and suggest line items:

DAMAGE ZONES:
${damageDescription}

AVAILABLE LINE ITEMS (use only these codes):
${lineItemList}

Generate a comprehensive estimate with appropriate quantities. Be thorough but realistic.`;

  try {
    // GPT-5.x models require max_completion_tokens instead of max_tokens
    const isGpt5Model = promptConfig.model?.startsWith('gpt-5') || promptConfig.model?.includes('gpt-5');
    const requestParams: Record<string, unknown> = {
      model: promptConfig.model,
      messages: [
        { role: 'system', content: promptConfig.systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: promptConfig.temperature,
    };

    // Use max_completion_tokens for GPT-5.x, max_tokens for GPT-4.x and older
    if (isGpt5Model && promptConfig.maxTokens) {
      requestParams.max_completion_tokens = promptConfig.maxTokens;
    } else if (!isGpt5Model && promptConfig.maxTokens) {
      requestParams.max_tokens = promptConfig.maxTokens;
    }

    const response = await openai.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content) as AISuggestionResult;

    // Validate and enrich suggestions with actual pricing
    const validatedSuggestions: SuggestedLineItem[] = [];
    const lineItemMap = new Map(availableLineItems.map(li => [li.code, li]));

    for (const suggestion of result.suggestions) {
      const lineItem = lineItemMap.get(suggestion.lineItemCode);
      if (lineItem) {
        validatedSuggestions.push({
          ...suggestion,
          description: lineItem.description,
          category: lineItem.category_id,
          unit: lineItem.unit,
        });
      }
    }

    // Total cost will be calculated when items are added to estimate with regional pricing
    const totalEstimatedCost = 0;

    return {
      ...result,
      suggestions: validatedSuggestions,
      totalEstimatedCost,
    };
  } catch (error) {
    console.error('AI suggestion error:', error);
    throw error;
  }
}

// ============================================
// QUICK SUGGEST (for voice interface)
// ============================================

export async function quickSuggestLineItems(
  description: string,
  roomName: string,
  damageType: string,
  quantity?: number
): Promise<{ code: string; description: string; quantity: number }[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Get relevant line items using Supabase
  const categories = DAMAGE_TYPE_CATEGORIES[damageType] || ['GEN'];
  let availableLineItems: any[] = [];

  // Build OR filter for categories
  const categoryFilters = categories.map(cat => `category_id.ilike.${cat}%`).join(',');

  const { data: lineItems, error } = await supabaseAdmin
    .from('line_items')
    .select('code, description, category_id, unit')
    .eq('is_active', true)
    .or(categoryFilters)
    .order('code')
    .limit(100);

  if (!error && lineItems) {
    availableLineItems = lineItems;
  }

  const lineItemList = availableLineItems.map(li =>
    `${li.code}: ${li.description} (${li.unit})`
  ).join('\n');

  // Get prompt from database (falls back to hardcoded if not available)
  const promptConfig = await getPromptWithFallback(PromptKey.ESTIMATE_QUICK_SUGGEST);

  // Build user prompt with variable substitution
  const userPrompt = promptConfig.userPromptTemplate
    ? substituteVariables(promptConfig.userPromptTemplate, {
        description,
        roomName,
        damageType,
        quantityInfo: quantity ? `, quantity: ${quantity}` : '',
        lineItemList,
      })
    : `User said: "${description}" for ${roomName} (${damageType} damage)${quantity ? `, quantity: ${quantity}` : ''}

Available items:
${lineItemList}`;

  // GPT-5.x models require max_completion_tokens instead of max_tokens
  const isGpt5Model = promptConfig.model?.startsWith('gpt-5') || promptConfig.model?.includes('gpt-5');
  const requestParams: Record<string, unknown> = {
    model: promptConfig.model,
    messages: [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: promptConfig.temperature,
  };

  // Use max_completion_tokens for GPT-5.x, max_tokens for GPT-4.x and older
  if (isGpt5Model && promptConfig.maxTokens) {
    requestParams.max_completion_tokens = promptConfig.maxTokens;
  } else if (!isGpt5Model && promptConfig.maxTokens) {
    requestParams.max_tokens = promptConfig.maxTokens;
  }

  const response = await openai.chat.completions.create(requestParams);

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const result = JSON.parse(content);
  return result.matches || [];
}

// ============================================
// SEARCH LINE ITEMS BY NATURAL LANGUAGE
// ============================================

export async function searchLineItemsByDescription(
  query: string,
  limit: number = 10
): Promise<any[]> {
  // Try ILIKE search (Supabase doesn't support full-text search directly in the same way)
  const { data: lineItems, error } = await supabaseAdmin
    .from('line_items')
    .select('code, description, category_id, unit')
    .eq('is_active', true)
    .or(`description.ilike.%${query}%,code.ilike.%${query}%`)
    .order('code')
    .limit(limit);

  if (error || !lineItems) {
    return [];
  }

  return lineItems;
}
