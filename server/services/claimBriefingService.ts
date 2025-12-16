/**
 * AI Claim Briefing Service
 *
 * Generates peril-aware, policy-aware claim briefings for field adjusters.
 *
 * Purpose:
 * - Generate field-ready claim briefings when adjuster opens a claim
 * - Uses normalized peril data, FNOL, policy metadata, and endorsements
 * - Does NOT make coverage determinations
 * - Helps adjusters PLAN the inspection
 *
 * Rules:
 * - NO coverage decisions
 * - NO policy interpretation beyond inspection guidance
 * - If info is missing → add to open_questions_for_adjuster
 * - Tone: practical, field-focused, concise
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { pool } from '../db';
import { ClaimBriefingContent } from '../../shared/schema';
import {
  buildPerilAwareClaimContext,
  buildPerilAwareClaimContextWithInspection,
  PerilAwareClaimContext,
} from './perilAwareContext';
import {
  getInspectionRulesForPeril,
  getMergedInspectionGuidance,
} from '../config/perilInspectionRules';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ClaimBriefingResult {
  success: boolean;
  briefing?: ClaimBriefingContent;
  briefingId?: string;
  sourceHash?: string;
  cached?: boolean;
  error?: string;
  model?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StoredBriefing {
  id: string;
  claimId: string;
  peril: string;
  sourceHash: string;
  briefingJson: ClaimBriefingContent;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a hash of the claim context for cache invalidation
 */
function generateSourceHash(context: PerilAwareClaimContext): string {
  const hashInput = {
    claimId: context.claimId,
    primaryPeril: context.primaryPeril,
    secondaryPerils: context.secondaryPerils,
    perilMetadata: context.perilMetadata,
    lossDescription: context.lossDescription,
    dateOfLoss: context.dateOfLoss,
    endorsements: context.endorsements.map(e => ({
      id: e.id,
      formNumber: e.formNumber,
      keyChanges: e.keyChanges,
    })),
    policyContext: context.policyContext,
    damageZones: context.damageZones.map(z => ({
      id: z.id,
      damageType: z.damageType,
      associatedPeril: z.associatedPeril,
    })),
    updatedAt: context.updatedAt,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex');
}

/**
 * Build the AI prompt for generating a claim briefing
 */
function buildBriefingPrompt(context: PerilAwareClaimContext): string {
  const inspectionRules = getInspectionRulesForPeril(context.primaryPeril);
  const mergedGuidance = getMergedInspectionGuidance(context.primaryPeril, context.secondaryPerils);

  return `You are an expert insurance claim inspection advisor. Generate a field-ready claim briefing for an adjuster based on the following claim data.

IMPORTANT RULES:
1. Do NOT make coverage determinations or policy interpretations
2. Focus ONLY on inspection planning and field execution
3. Be practical, concise, and field-focused
4. If information is missing, add it to "open_questions_for_adjuster"
5. Do NOT guess or assume - only use provided data

CLAIM DATA:
- Claim Number: ${context.claimNumber}
- Primary Peril: ${context.primaryPeril}
- Secondary Perils: ${context.secondaryPerils.join(', ') || 'None'}
- Date of Loss: ${context.dateOfLoss || 'Unknown'}
- Loss Description: ${context.lossDescription || 'No description provided'}
- Property Location: ${[context.propertyAddress, context.propertyCity, context.propertyState, context.propertyZip].filter(Boolean).join(', ') || 'Unknown'}

POLICY CONTEXT:
- Policy Number: ${context.policyContext.policyNumber || 'Unknown'}
- State: ${context.policyContext.state || 'Unknown'}
- Dwelling Limit: ${context.policyContext.dwellingLimit || 'Unknown'}
- Deductible: ${context.policyContext.deductible || 'Unknown'}
- Wind/Hail Deductible: ${context.policyContext.windHailDeductible || 'Unknown'}
- Year Roof Installed: ${context.policyContext.yearRoofInstall || 'Unknown'}
- Endorsements Listed: ${context.policyContext.endorsementsListed.join(', ') || 'None'}

ENDORSEMENTS DETAIL:
${context.endorsements.length > 0 ? context.endorsements.map(e => `- ${e.formNumber}: ${e.documentTitle || 'No title'} - ${e.description || 'No description'}
  Key Changes: ${JSON.stringify(e.keyChanges)}`).join('\n') : 'No endorsements loaded'}

DAMAGE ZONES:
${context.damageZones.length > 0 ? context.damageZones.map(z => `- ${z.name}: ${z.damageType || 'Unknown damage'} (${z.damageSeverity || 'unknown severity'})
  Peril: ${z.associatedPeril || 'Unknown'}, Water Category: ${z.waterCategory || 'N/A'}`).join('\n') : 'No damage zones defined'}

COVERAGE ADVISORIES:
${context.coverageAdvisories.length > 0 ? context.coverageAdvisories.map(a => `- [${a.type.toUpperCase()}] ${a.message}`).join('\n') : 'No advisories'}

PERIL-SPECIFIC INSPECTION GUIDANCE (use as reference):
Priority Areas: ${mergedGuidance.priorityAreas.slice(0, 5).map(a => a.area).join(', ')}
Common Misses: ${mergedGuidance.commonMisses.slice(0, 3).map(m => m.issue).join(', ')}

Generate a JSON briefing with this EXACT structure:
{
  "claim_summary": {
    "primary_peril": "string - the main peril",
    "secondary_perils": ["array of secondary perils"],
    "overview": ["array of 2-4 brief overview points about this claim"]
  },
  "inspection_strategy": {
    "where_to_start": ["array of 2-4 specific areas to begin inspection"],
    "what_to_prioritize": ["array of 3-5 priority items for this peril/claim"],
    "common_misses": ["array of 2-4 things commonly missed for this peril"]
  },
  "peril_specific_risks": ["array of 3-5 risks specific to this peril type"],
  "endorsement_watchouts": [
    {
      "endorsement_id": "form number",
      "impact": "brief description of impact",
      "inspection_implications": ["what this means for inspection"]
    }
  ],
  "photo_requirements": [
    {
      "category": "category name",
      "items": ["specific photos needed"]
    }
  ],
  "sketch_requirements": ["array of sketch/diagram needs for this claim"],
  "depreciation_considerations": ["array of depreciation items to document"],
  "open_questions_for_adjuster": ["array of questions that need answers before/during inspection"]
}

Respond ONLY with valid JSON. No explanation, no markdown.`;
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Generate a claim briefing for a specific claim
 *
 * @param claimId - The UUID of the claim
 * @param organizationId - The organization ID
 * @param forceRegenerate - Skip cache and regenerate
 * @returns ClaimBriefingResult
 */
export async function generateClaimBriefing(
  claimId: string,
  organizationId: string,
  forceRegenerate: boolean = false
): Promise<ClaimBriefingResult> {
  const client = await pool.connect();

  try {
    // Step 1: Build the peril-aware claim context
    const context = await buildPerilAwareClaimContext(claimId);
    if (!context) {
      return {
        success: false,
        error: 'Claim not found or unable to build context',
      };
    }

    // Step 2: Generate source hash for caching
    const sourceHash = generateSourceHash(context);

    // Step 3: Check for cached briefing (unless force regenerate)
    if (!forceRegenerate) {
      const cachedResult = await client.query(
        `SELECT * FROM claim_briefings
         WHERE claim_id = $1 AND source_hash = $2 AND status = 'generated'
         ORDER BY created_at DESC
         LIMIT 1`,
        [claimId, sourceHash]
      );

      if (cachedResult.rows.length > 0) {
        const cached = cachedResult.rows[0];
        return {
          success: true,
          briefing: cached.briefing_json as ClaimBriefingContent,
          briefingId: cached.id,
          sourceHash: cached.source_hash,
          cached: true,
          model: cached.model,
        };
      }
    }

    // Step 4: Generate new briefing with AI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!process.env.OPENAI_API_KEY) {
      return {
        success: false,
        error: 'OpenAI API key not configured',
      };
    }

    // Mark as generating
    const insertResult = await client.query(
      `INSERT INTO claim_briefings (organization_id, claim_id, peril, secondary_perils, source_hash, briefing_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'generating')
       RETURNING id`,
      [
        organizationId,
        claimId,
        context.primaryPeril,
        JSON.stringify(context.secondaryPerils),
        sourceHash,
        JSON.stringify({}),
      ]
    );
    const briefingId = insertResult.rows[0].id;

    try {
      // Call OpenAI
      const prompt = buildBriefingPrompt(context);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert insurance claim inspection advisor. Output ONLY valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for consistency
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from AI');
      }

      // Parse the JSON response
      const briefingContent: ClaimBriefingContent = JSON.parse(responseContent);

      // Validate required fields
      if (!briefingContent.claim_summary || !briefingContent.inspection_strategy) {
        throw new Error('Invalid briefing structure from AI');
      }

      // Update the briefing record
      await client.query(
        `UPDATE claim_briefings SET
           briefing_json = $1,
           status = 'generated',
           model = $2,
           prompt_tokens = $3,
           completion_tokens = $4,
           total_tokens = $5,
           updated_at = NOW()
         WHERE id = $6`,
        [
          JSON.stringify(briefingContent),
          completion.model,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0,
          completion.usage?.total_tokens || 0,
          briefingId,
        ]
      );

      return {
        success: true,
        briefing: briefingContent,
        briefingId,
        sourceHash,
        cached: false,
        model: completion.model,
        tokenUsage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (aiError) {
      // Update with error status
      const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown AI error';
      await client.query(
        `UPDATE claim_briefings SET
           status = 'error',
           error_message = $1,
           updated_at = NOW()
         WHERE id = $2`,
        [errorMessage, briefingId]
      );

      return {
        success: false,
        error: `AI generation failed: ${errorMessage}`,
      };
    }
  } finally {
    client.release();
  }
}

/**
 * Get the latest briefing for a claim
 */
export async function getClaimBriefing(
  claimId: string,
  organizationId: string
): Promise<StoredBriefing | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, claim_id, peril, source_hash, briefing_json, status, model,
              prompt_tokens, completion_tokens, total_tokens, created_at, updated_at
       FROM claim_briefings
       WHERE claim_id = $1 AND organization_id = $2 AND status = 'generated'
       ORDER BY created_at DESC
       LIMIT 1`,
      [claimId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      claimId: row.claim_id,
      peril: row.peril,
      sourceHash: row.source_hash,
      briefingJson: row.briefing_json as ClaimBriefingContent,
      status: row.status,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
  }
}

/**
 * Check if a briefing is stale (claim data has changed)
 */
export async function isBriefingStale(
  claimId: string,
  organizationId: string
): Promise<boolean> {
  const context = await buildPerilAwareClaimContext(claimId);
  if (!context) {
    return true; // Claim not found, consider stale
  }

  const currentHash = generateSourceHash(context);
  const briefing = await getClaimBriefing(claimId, organizationId);

  if (!briefing) {
    return true; // No briefing exists
  }

  return briefing.sourceHash !== currentHash;
}

/**
 * Delete all briefings for a claim
 */
export async function deleteClaimBriefings(
  claimId: string,
  organizationId: string
): Promise<number> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `DELETE FROM claim_briefings
       WHERE claim_id = $1 AND organization_id = $2`,
      [claimId, organizationId]
    );

    return result.rowCount || 0;
  } finally {
    client.release();
  }
}
