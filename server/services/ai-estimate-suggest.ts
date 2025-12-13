// AI Estimate Suggestion Service
// Uses OpenAI to analyze damage zones and suggest appropriate line items

import OpenAI from 'openai';
import { pool } from '../db';

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
      `SELECT code, description, category_id, unit,
              COALESCE(base_material_cost, 0) + COALESCE(base_labor_cost, 0) as base_price
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
    `${li.code}: ${li.description} (${li.unit}, ~$${parseFloat(li.base_price).toFixed(2)})`
  ).join('\n');

  const systemPrompt = `You are an expert insurance claims estimator specializing in property damage restoration.
Your task is to analyze damage zones and suggest appropriate line items for an estimate.

IMPORTANT GUIDELINES:
1. For water damage, ALWAYS include extraction, drying equipment, and antimicrobial treatment
2. For Category 2/3 water, include additional sanitization and possible demolition
3. Calculate quantities based on affected square footage
4. Include demolition before reconstruction items
5. Group items by room/damage zone
6. Consider IICRC S500/S520 standards for water/mold
7. Include equipment charges (dehumidifiers, air movers) by the day

Return your response as a valid JSON object with this exact structure:
{
  "suggestions": [
    {
      "lineItemCode": "string",
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
}`;

  const userPrompt = `Analyze these damage zones and suggest line items:

DAMAGE ZONES:
${damageDescription}

AVAILABLE LINE ITEMS (use only these codes):
${lineItemList}

Generate a comprehensive estimate with appropriate quantities. Be thorough but realistic.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
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
          unitPrice: parseFloat(lineItem.base_price),
        });
      }
    }

    // Calculate total estimated cost
    const totalEstimatedCost = validatedSuggestions.reduce(
      (sum, item) => sum + (item.unitPrice || 0) * item.quantity,
      0
    );

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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an insurance estimator. Match user descriptions to line item codes.
Return JSON: {"matches": [{"code": "string", "description": "string", "quantity": number}]}
Only use codes from the provided list. Suggest 1-3 most relevant items.`
      },
      {
        role: 'user',
        content: `User said: "${description}" for ${roomName} (${damageType} damage)${quantity ? `, quantity: ${quantity}` : ''}

Available items:
${lineItemList}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
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
              COALESCE(base_material_cost, 0) + COALESCE(base_labor_cost, 0) as base_price,
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
        `SELECT code, description, category_id, unit,
                COALESCE(base_material_cost, 0) + COALESCE(base_labor_cost, 0) as base_price
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
