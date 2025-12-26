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
 * Build FNOL facts section from loss_context
 */
function buildFnolFactsSection(context: PerilAwareClaimContext): string {
  const lossContext = context.lossContext;
  if (!lossContext) {
    return 'FNOL FACTS:\n- No structured FNOL data available';
  }

  const lines: string[] = ['FNOL FACTS:'];

  // FNOL reporting info
  if (lossContext.fnol) {
    if (lossContext.fnol.reportDate) lines.push(`- Report Date: ${lossContext.fnol.reportDate}`);
    if (lossContext.fnol.reportedBy) lines.push(`- Reported By: ${lossContext.fnol.reportedBy}`);
    if (lossContext.fnol.occupiedAtTimeOfLoss !== undefined) {
      lines.push(`- Occupied at Time of Loss: ${lossContext.fnol.occupiedAtTimeOfLoss ? 'Yes' : 'No'}`);
    }
    if (lossContext.fnol.temporaryRepairsMade !== undefined) {
      lines.push(`- Temporary Repairs Made: ${lossContext.fnol.temporaryRepairsMade ? 'Yes' : 'No'}`);
    }
    if (lossContext.fnol.mitigationSteps && lossContext.fnol.mitigationSteps.length > 0) {
      lines.push(`- Mitigation Steps: ${lossContext.fnol.mitigationSteps.join(', ')}`);
    }
  }

  // Property info
  if (lossContext.property) {
    if (lossContext.property.yearBuilt) lines.push(`- Year Built: ${lossContext.property.yearBuilt}`);
    if (lossContext.property.roofType) lines.push(`- Roof Type: ${lossContext.property.roofType}`);
    if (lossContext.property.constructionType) lines.push(`- Construction: ${lossContext.property.constructionType}`);
    if (lossContext.property.stories) lines.push(`- Stories: ${lossContext.property.stories}`);
    if (lossContext.property.hasBasement) lines.push(`- Has Basement: Yes (Finished: ${lossContext.property.basementFinished ? 'Yes' : 'No'})`);
  }

  // Damage summary
  if (lossContext.damage_summary) {
    const ds = lossContext.damage_summary;
    if (ds.areasAffected && ds.areasAffected.length > 0) {
      lines.push(`- Areas Affected: ${ds.areasAffected.join(', ')}`);
    }
    if (ds.waterSource) lines.push(`- Water Source: ${ds.waterSource}`);
    if (ds.waterCategory) lines.push(`- Water Category: ${ds.waterCategory}`);
    if (ds.moldVisible) lines.push('- Mold Visible: Yes');
    if (ds.structuralConcerns) lines.push('- Structural Concerns: Yes');
    if (ds.habitability) lines.push(`- Habitability: ${ds.habitability}`);
  }

  return lines.length > 1 ? lines.join('\n') : 'FNOL FACTS:\n- No structured FNOL data available';
}

/**
 * Build basic policy context when effective policy is not available
 * Uses claim table fields as fallback
 */
function buildBasicPolicyContext(context: PerilAwareClaimContext): string {
  const lines: string[] = ['POLICY CONTEXT (from claim data):'];

  if (context.policyContext.policyNumber) lines.push(`- Policy Number: ${context.policyContext.policyNumber}`);
  if (context.policyContext.state) lines.push(`- State: ${context.policyContext.state}`);
  if (context.policyContext.dwellingLimit) lines.push(`- Dwelling Limit: ${context.policyContext.dwellingLimit}`);
  if (context.policyContext.coverageA) lines.push(`- Coverage A: ${context.policyContext.coverageA}`);
  if (context.policyContext.coverageB) lines.push(`- Coverage B: ${context.policyContext.coverageB}`);
  if (context.policyContext.coverageC) lines.push(`- Coverage C: ${context.policyContext.coverageC}`);
  if (context.policyContext.coverageD) lines.push(`- Coverage D: ${context.policyContext.coverageD}`);
  if (context.policyContext.deductible) lines.push(`- Deductible: ${context.policyContext.deductible}`);
  if (context.policyContext.windHailDeductible) lines.push(`- Wind/Hail Deductible: ${context.policyContext.windHailDeductible}`);
  if (context.policyContext.yearRoofInstall) lines.push(`- Year Roof Installed: ${context.policyContext.yearRoofInstall}`);

  return lines.join('\n');
}

/**
 * Build the AI prompt for generating a claim briefing
 *
 * Uses ONLY canonical data sources:
 * - Effective policy for coverage limits, deductibles, roof settlement
 * - FNOL facts from loss_context
 * - Endorsements from endorsement_extractions (NOT endorsements_listed)
 */
function buildBriefingPrompt(
  context: PerilAwareClaimContext,
  effectivePolicySummary?: string
): string {
  const mergedGuidance = getMergedInspectionGuidance(context.primaryPeril, context.secondaryPerils);

  // Build FNOL facts section from loss_context
  const fnolFacts = buildFnolFactsSection(context);

  return `You are an expert insurance claim inspection advisor. Generate a field-ready claim briefing for an adjuster based on the following claim data.

IMPORTANT RULES:
1. Do NOT make coverage determinations or policy interpretations
2. Focus ONLY on inspection planning and field execution
3. Be practical, concise, and field-focused
4. If information is missing, add it to "open_questions_for_adjuster"
5. Do NOT guess or assume - only use provided data
6. Rephrase provided policy facts - do NOT infer policy rules

CLAIM DATA:
- Claim Number: ${context.claimNumber}
- Policyholder: ${context.policyholderName || 'Unknown'}
- Primary Peril: ${context.primaryPeril}
- Secondary Perils: ${context.secondaryPerils.join(', ') || 'None'}
- Date of Loss: ${context.dateOfLoss || 'Unknown'}
- Loss Description: ${context.lossDescription || 'No description provided'}
- Property Location: ${[context.propertyAddress, context.propertyCity, context.propertyState, context.propertyZip].filter(Boolean).join(', ') || 'Unknown'}

${fnolFacts}

${effectivePolicySummary || buildBasicPolicyContext(context)}

ENDORSEMENTS (from policy extraction):
${context.endorsements.length > 0 ? context.endorsements.map(e => `- ${e.formNumber}: ${e.documentTitle || 'No title'}
  Key Changes: ${JSON.stringify(e.keyChanges)}
  Relevant to perils: ${e.relevantToPerils.join(', ') || 'General'}`).join('\n') : 'No endorsements extracted'}

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
 *
 * @param context - The peril-aware claim context
 * @param userPromptTemplate - Optional template for custom prompt
 * @param effectivePolicySummary - Optional effective policy summary for prompt injection
 */
function buildBriefingPromptWithTemplate(
  context: PerilAwareClaimContext,
  userPromptTemplate: string | null,
  effectivePolicySummary?: string
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

    // Add effective policy summary to template variables if available
    if (effectivePolicySummary) {
      (variables as any).effectivePolicySummary = effectivePolicySummary;
    }

    return substituteVariables(userPromptTemplate, variables);
  }

  // Fall back to the existing buildBriefingPrompt function with effective policy
  return buildBriefingPrompt(context, effectivePolicySummary);
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Generate a claim briefing for a specific claim
 *
 * Uses ONLY canonical data sources:
 * - claims.loss_context for FNOL facts
 * - Effective policy (dynamically computed) for policy context
 * - endorsement_extractions for endorsement modifications
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

    // Step 1.5: Load effective policy (dynamically computed - no caching)
    let effectivePolicySummary: string | undefined;
    try {
      const { getEffectivePolicyForClaim, generateEffectivePolicySummary, formatEffectivePolicySummaryForPrompt } =
        await import('./effectivePolicyService');

      const effectivePolicy = await getEffectivePolicyForClaim(claimId, organizationId);
      if (effectivePolicy) {
        const summary = generateEffectivePolicySummary(effectivePolicy);
        effectivePolicySummary = formatEffectivePolicySummaryForPrompt(summary);
      }
    } catch (effectivePolicyError) {
      console.warn('[ClaimBriefing] Could not load effective policy, using basic policy context:', effectivePolicyError);
      // Continue with basic policy context from perilAwareContext
    }

    // Step 2: Generate source hash for caching (include effective policy in hash)
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
      // Pass effective policy summary for use in prompt
      const userPrompt = buildBriefingPromptWithTemplate(context, promptConfig.userPromptTemplate, effectivePolicySummary);

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
