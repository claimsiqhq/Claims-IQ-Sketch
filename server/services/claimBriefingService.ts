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
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ClaimBriefingContent, PromptKey } from '../../shared/schema';
import {
  buildPerilAwareClaimContext,
  buildPerilAwareClaimContextWithInspection,
  PerilAwareClaimContext,
} from './perilAwareContext';
import {
  getInspectionRulesForPeril,
  getMergedInspectionGuidance,
} from '../config/perilInspectionRules';
import { getPromptWithFallback, substituteVariables } from './promptService';

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

/**
 * Build the briefing prompt using a template or fall back to the hardcoded version
 */
function buildBriefingPromptWithTemplate(
  context: PerilAwareClaimContext,
  userPromptTemplate: string | null
): string {
  // If we have a template, use variable substitution
  if (userPromptTemplate) {
    const inspectionRules = getInspectionRulesForPeril(context.primaryPeril);
    const mergedGuidance = getMergedInspectionGuidance(context.primaryPeril, context.secondaryPerils);

    // Extract additional property details from context if available
    const propertyDetails = (context as any).propertyDetails || {};
    const policyholderInfo = (context as any).policyholderInfo || {};
    const documentText = (context as any).documentText || '';

    const variables = {
      // Basic claim info
      claimNumber: context.claimNumber,
      primaryPeril: context.primaryPeril,
      secondaryPerils: context.secondaryPerils.join(', ') || 'None',
      dateOfLoss: context.dateOfLoss || 'Unknown',
      reportDate: (context as any).reportDate || 'Unknown',
      lossDescription: context.lossDescription || 'No description provided',
      propertyLocation: [context.propertyAddress, context.propertyCity, context.propertyState, context.propertyZip].filter(Boolean).join(', ') || 'Unknown',

      // Policyholder information
      policyholderName: context.policyholderName || policyholderInfo.name || 'Unknown',
      contactPhone: policyholderInfo.phone || (context as any).contactPhone || 'Not provided',
      contactEmail: policyholderInfo.email || (context as any).contactEmail || 'Not provided',

      // Policy context
      policyNumber: context.policyContext.policyNumber || 'Unknown',
      carrier: (context as any).carrier || context.policyContext.carrier || 'Unknown',
      state: context.policyContext.state || 'Unknown',
      dwellingLimit: context.policyContext.dwellingLimit || 'Unknown',
      otherStructuresLimit: context.policyContext.otherStructuresLimit || 'Unknown',
      personalPropertyLimit: context.policyContext.personalPropertyLimit || 'Unknown',
      lossOfUseLimit: context.policyContext.lossOfUseLimit || 'Unknown',
      deductible: context.policyContext.deductible || 'Unknown',
      windHailDeductible: context.policyContext.windHailDeductible || 'Unknown',

      // Property details
      yearBuilt: propertyDetails.yearBuilt || context.policyContext.yearBuilt || 'Unknown',
      yearRoofInstall: context.policyContext.yearRoofInstall || 'Unknown',
      roofType: propertyDetails.roofType || context.policyContext.roofType || 'Unknown',
      constructionType: propertyDetails.constructionType || context.policyContext.constructionType || 'Unknown',
      stories: propertyDetails.stories || context.policyContext.stories || 'Unknown',
      squareFootage: propertyDetails.squareFootage || context.policyContext.squareFootage || 'Unknown',

      // Endorsements
      endorsementsListed: context.policyContext.endorsementsListed.join(', ') || 'None',
      endorsementsDetail: context.endorsements.length > 0
        ? context.endorsements.map(e => `- ${e.formNumber}: ${e.documentTitle || 'No title'} - ${e.description || 'No description'}\n  Key Changes: ${JSON.stringify(e.keyChanges)}`).join('\n')
        : 'No endorsements loaded',

      // Damage zones
      damageZones: context.damageZones.length > 0
        ? context.damageZones.map(z => `- ${z.name}: ${z.damageType || 'Unknown damage'} (${z.damageSeverity || 'unknown severity'})\n  Peril: ${z.associatedPeril || 'Unknown'}, Water Category: ${z.waterCategory || 'N/A'}`).join('\n')
        : 'No damage zones defined',

      // Coverage advisories
      coverageAdvisories: context.coverageAdvisories.length > 0
        ? context.coverageAdvisories.map(a => `- [${a.type.toUpperCase()}] ${a.message}`).join('\n')
        : 'No advisories',

      // Inspection guidance
      priorityAreas: mergedGuidance.priorityAreas.slice(0, 5).map(a => a.area).join(', '),
      commonMisses: mergedGuidance.commonMisses.slice(0, 3).map(m => m.issue).join(', '),

      // Document text (for comprehensive analysis)
      documentText: documentText || 'No document text available',
    };

    return substituteVariables(userPromptTemplate, variables);
  }

  // Fall back to the existing buildBriefingPrompt function
  return buildBriefingPrompt(context);
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
      const { data: cachedBriefings, error: cachedError } = await supabaseAdmin
        .from('claim_briefings')
        .select('*')
        .eq('claim_id', claimId)
        .eq('source_hash', sourceHash)
        .eq('status', 'generated')
        .order('created_at', { ascending: false })
        .limit(1);

      if (cachedError) {
        console.error('Error checking cached briefing:', cachedError);
      } else if (cachedBriefings && cachedBriefings.length > 0) {
        const cached = cachedBriefings[0];
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
    const { data: insertResult, error: insertError } = await supabaseAdmin
      .from('claim_briefings')
      .insert({
        organization_id: organizationId,
        claim_id: claimId,
        peril: context.primaryPeril,
        secondary_perils: context.secondaryPerils,
        source_hash: sourceHash,
        briefing_json: {},
        status: 'generating',
      })
      .select('id')
      .single();

    if (insertError || !insertResult) {
      return {
        success: false,
        error: `Failed to create briefing record: ${insertError?.message || 'Unknown error'}`,
      };
    }

    const briefingId = insertResult.id;

    try {
      // Get prompt configuration from database (falls back to hardcoded if not available)
      const promptConfig = await getPromptWithFallback(PromptKey.CLAIM_BRIEFING);

      // Build the user prompt using template variables or fallback to buildBriefingPrompt
      const userPrompt = buildBriefingPromptWithTemplate(context, promptConfig.userPromptTemplate);

      // Call OpenAI
      const completion = await openai.chat.completions.create({
        model: promptConfig.model,
        messages: [
          {
            role: 'system',
            content: promptConfig.systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: promptConfig.temperature,
        max_tokens: promptConfig.maxTokens || 2000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from AI');
      }

      // Parse the JSON response
      let briefingContent: ClaimBriefingContent;
      try {
        const parsed = JSON.parse(responseContent);
        
        // Normalize the response - AI might return slightly different structures
        briefingContent = {
          claim_summary: parsed.claim_summary || {
            primary_peril: context.primaryPeril || 'unknown',
            secondary_perils: context.secondaryPerils || [],
            overview: parsed.overview || parsed.summary || ['No summary available'],
          },
          inspection_strategy: parsed.inspection_strategy || {
            where_to_start: parsed.where_to_start || ['Exterior overview', 'Primary damage area'],
            what_to_prioritize: parsed.what_to_prioritize || parsed.priorities || ['Document all visible damage'],
            common_misses: parsed.common_misses || ['Secondary damage', 'Hidden moisture'],
          },
          peril_specific_risks: parsed.peril_specific_risks || parsed.risks || [],
          endorsement_watchouts: parsed.endorsement_watchouts || [],
          photo_requirements: parsed.photo_requirements || [],
          sketch_requirements: parsed.sketch_requirements || [],
          depreciation_considerations: parsed.depreciation_considerations || [],
          open_questions_for_adjuster: parsed.open_questions_for_adjuster || parsed.open_questions || [],
        };

        // Ensure claim_summary has required nested fields
        if (!briefingContent.claim_summary.overview) {
          briefingContent.claim_summary.overview = ['Review claim details'];
        }
        if (!briefingContent.inspection_strategy.where_to_start) {
          briefingContent.inspection_strategy.where_to_start = ['Start with exterior inspection'];
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', responseContent);
        throw new Error(`Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
      }

      // Update the briefing record
      const { error: updateError } = await supabaseAdmin
        .from('claim_briefings')
        .update({
          briefing_json: briefingContent,
          status: 'generated',
          model: completion.model,
          prompt_tokens: completion.usage?.prompt_tokens || 0,
          completion_tokens: completion.usage?.completion_tokens || 0,
          total_tokens: completion.usage?.total_tokens || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', briefingId);

      if (updateError) {
        console.error('Error updating briefing:', updateError);
      }

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
      const { error: errorUpdateError } = await supabaseAdmin
        .from('claim_briefings')
        .update({
          status: 'error',
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', briefingId);

      if (errorUpdateError) {
        console.error('Error updating briefing error status:', errorUpdateError);
      }

      return {
        success: false,
        error: `AI generation failed: ${errorMessage}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the latest briefing for a claim
 */
export async function getClaimBriefing(
  claimId: string,
  organizationId: string
): Promise<StoredBriefing | null> {
  const { data, error } = await supabaseAdmin
    .from('claim_briefings')
    .select('id, claim_id, peril, source_hash, briefing_json, status, model, prompt_tokens, completion_tokens, total_tokens, created_at, updated_at')
    .eq('claim_id', claimId)
    .eq('organization_id', organizationId)
    .eq('status', 'generated')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    claimId: data.claim_id,
    peril: data.peril,
    sourceHash: data.source_hash,
    briefingJson: data.briefing_json as ClaimBriefingContent,
    status: data.status,
    model: data.model,
    promptTokens: data.prompt_tokens,
    completionTokens: data.completion_tokens,
    totalTokens: data.total_tokens,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
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
  const { data, error } = await supabaseAdmin
    .from('claim_briefings')
    .delete()
    .eq('claim_id', claimId)
    .eq('organization_id', organizationId)
    .select();

  if (error) {
    console.error('Error deleting claim briefings:', error);
    return 0;
  }

  return data?.length || 0;
}
