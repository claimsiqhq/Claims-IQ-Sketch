// AI Estimate Suggestion Service
// Uses OpenAI to analyze damage zones and suggest appropriate line items

import OpenAI from 'openai';
import { pool } from '../db';
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

  const client = await pool.connect();
  let availableLineItems: any[] = [];

  try {
    // Get line items for relevant categories
    const categoryArray = Array.from(relevantCategories);
    const result = await client.query(
      `SELECT code, description, category_id, unit
       FROM line_items
       WHERE is_active = true
         AND (${categoryArray.map((_, i) => `category_id LIKE $${i + 1} || '%'`).join(' OR ')})
       ORDER BY category_id, code
       LIMIT 200`,
      categoryArray
    );
    availableLineItems = result.rows;
  } finally {
    client.release();
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
    const response = await openai.chat.completions.create({
      model: promptConfig.model,
      messages: [
        { role: 'system', content: promptConfig.systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: promptConfig.temperature,
    });

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

  // Get relevant line items
  const categories = DAMAGE_TYPE_CATEGORIES[damageType] || ['GEN'];
  const client = await pool.connect();
  let availableLineItems: any[] = [];

  try {
    const result = await client.query(
      `SELECT code, description, category_id, unit
       FROM line_items
       WHERE is_active = true
         AND (${categories.map((_, i) => `category_id LIKE $${i + 1} || '%'`).join(' OR ')})
       ORDER BY code
       LIMIT 100`,
      categories
    );
    availableLineItems = result.rows;
  } finally {
    client.release();
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

  const response = await openai.chat.completions.create({
    model: promptConfig.model,
    messages: [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: promptConfig.temperature,
  });

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
  const client = await pool.connect();

  try {
    // Use PostgreSQL full-text search with ranking
    const result = await client.query(
      `SELECT code, description, category_id, unit,
              ts_rank(to_tsvector('english', description), plainto_tsquery('english', $1)) as rank
       FROM line_items
       WHERE is_active = true
         AND to_tsvector('english', description) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [query, limit]
    );

    // If no full-text results, try ILIKE fallback
    if (result.rows.length === 0) {
      const fallbackResult = await client.query(
        `SELECT code, description, category_id, unit
         FROM line_items
         WHERE is_active = true
           AND (description ILIKE $1 OR code ILIKE $1)
         ORDER BY code
         LIMIT $2`,
        [`%${query}%`, limit]
      );
      return fallbackResult.rows;
    }

    return result.rows;
  } finally {
    client.release();
  }
}
