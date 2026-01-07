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

  // FNOL reporting info (canonical schema - snake_case)
  if (lossContext.fnol) {
    if (lossContext.fnol.reported_date) lines.push(`- Report Date: ${lossContext.fnol.reported_date}`);
    if (lossContext.fnol.reported_by) lines.push(`- Reported By: ${lossContext.fnol.reported_by}`);
    if (lossContext.fnol.drone_eligible !== undefined) {
      lines.push(`- Drone Eligible: ${lossContext.fnol.drone_eligible ? 'Yes' : 'No'}`);
    }
    if (lossContext.fnol.weather) {
      lines.push(`- Weather Lookup: ${lossContext.fnol.weather.lookup_status || 'Unknown'}`);
      if (lossContext.fnol.weather.message) {
        lines.push(`- Weather Message: ${lossContext.fnol.weather.message}`);
      }
    }
  }

  // Property info (canonical schema - snake_case)
  if (lossContext.property) {
    if (lossContext.property.year_built) lines.push(`- Year Built: ${lossContext.property.year_built}`);
    if (lossContext.property.stories) lines.push(`- Stories: ${lossContext.property.stories}`);
    if (lossContext.property.occupancy) lines.push(`- Occupancy: ${lossContext.property.occupancy}`);
    if (lossContext.property.roof) {
      if (lossContext.property.roof.material) lines.push(`- Roof Material: ${lossContext.property.roof.material}`);
      if (lossContext.property.roof.year_installed) lines.push(`- Roof Year Installed: ${lossContext.property.roof.year_installed}`);
      if (lossContext.property.roof.damage_scope) lines.push(`- Roof Damage Scope: ${lossContext.property.roof.damage_scope}`);
      if (lossContext.property.roof.wood_roof !== undefined) {
        lines.push(`- Wood Roof: ${lossContext.property.roof.wood_roof ? 'Yes' : 'No'}`);
      }
    }
  }

  // Damage summary (canonical schema - snake_case)
  if (lossContext.damage_summary) {
    const ds = lossContext.damage_summary;
    if (ds.coverage_a) lines.push(`- Coverage A: ${ds.coverage_a}`);
    if (ds.coverage_b) lines.push(`- Coverage B: ${ds.coverage_b}`);
    if (ds.coverage_c) lines.push(`- Coverage C: ${ds.coverage_c}`);
    if (ds.coverage_d) lines.push(`- Coverage D: ${ds.coverage_d}`);
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
  // Peril-specific deductibles
  if (context.policyContext.perilSpecificDeductibles && Object.keys(context.policyContext.perilSpecificDeductibles).length > 0) {
    for (const [peril, deductible] of Object.entries(context.policyContext.perilSpecificDeductibles)) {
      const perilLabel = peril.replace('_', ' ').toUpperCase();
      lines.push(`- ${perilLabel} Deductible: ${deductible}`);
    }
  }
  // Year roof installed from loss_context
  if (context.lossContext?.property?.roof?.year_installed) {
    lines.push(`- Year Roof Installed: ${context.lossContext.property.roof.year_installed}`);
  }

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
Safety/Peril Risks: ${mergedGuidance.safetyConsiderations.slice(0, 5).join('; ')}
Required Photos by Category:
${mergedGuidance.requiredPhotos.slice(0, 5).map(p => `- ${p.category}: ${p.items.slice(0, 4).join(', ')}`).join('\n')}

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
    
    // Extract from loss_context (canonical schema)
    const lossContext = context.lossContext || {};
    const lossContextFnol = lossContext.fnol || {};
    const lossContextProperty = lossContext.property || {};
    const lossContextRoof = lossContextProperty.roof || {};

    const variables = {
      // Basic claim info
      claimNumber: context.claimNumber,
      primaryPeril: context.primaryPeril,
      secondaryPerils: context.secondaryPerils.join(', ') || 'None',
      dateOfLoss: context.dateOfLoss || 'Unknown',
      reportDate: lossContextFnol.reported_date || (context as any).reportDate || 'Unknown',
      reportedBy: lossContextFnol.reported_by || 'Unknown',
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
      perilSpecificDeductibles: context.policyContext.perilSpecificDeductibles || {},

      // Property details (from loss_context canonical schema)
      yearBuilt: lossContextProperty.year_built?.toString() || context.policyContext.yearBuilt || 'Unknown',
      yearRoofInstall: lossContextRoof.year_installed?.toString() || 'Unknown',
      roofType: lossContextRoof.material || context.policyContext.roofType || 'Unknown',
      roofDamageScope: lossContextRoof.damage_scope || 'Unknown',
      occupancy: lossContextProperty.occupancy || 'Unknown',
      stories: lossContextProperty.stories?.toString() || context.policyContext.stories?.toString() || 'Unknown',

      // Endorsements (from endorsement_extractions table)
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
      safetyPerilRisks: mergedGuidance.safetyConsiderations.slice(0, 5).join('; '),
      requiredPhotos: mergedGuidance.requiredPhotos.slice(0, 5).map(p => `- ${p.category}: ${p.items.slice(0, 4).join(', ')}`).join('\n'),

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

// ============================================
// ENHANCED BRIEFING WITH UNIFIED CLAIM CONTEXT
// ============================================

import { UnifiedClaimContext } from '../../shared/schema';
import { buildUnifiedClaimContext, calculateRoofDepreciation } from './unifiedClaimContextService';

/**
 * Build rich FNOL facts section from UnifiedClaimContext
 * This uses the new comprehensive extraction data
 */
function buildRichFnolFacts(context: UnifiedClaimContext): string {
  const lines: string[] = ['FNOL FACTS (Comprehensive):'];

  // Reporting info
  if (context.reportedDate) lines.push(`- Report Date: ${context.reportedDate}`);
  if (context.reportedBy) lines.push(`- Reported By: ${context.reportedBy}`);

  // Property details
  lines.push('\nPROPERTY DETAILS:');
  lines.push(`- Address: ${context.property.address}`);
  if (context.property.yearBuilt) lines.push(`- Year Built: ${context.property.yearBuilt}`);
  if (context.property.stories) lines.push(`- Stories: ${context.property.stories}`);

  // Roof info (critical for hail claims)
  if (context.property.roof.yearInstalled) {
    lines.push(`- Roof Year Installed: ${context.property.roof.yearInstalled}`);
  }
  if (context.property.roof.ageAtLoss !== undefined) {
    lines.push(`- Roof Age at Loss: ${context.property.roof.ageAtLoss} years`);
  }
  if (context.property.roof.isWoodRoof) {
    lines.push(`- Wood Roof: Yes (fire risk consideration)`);
  }
  if (context.property.roof.damageScope) {
    lines.push(`- Roof Damage Scope: ${context.property.roof.damageScope}`);
  }

  // Damage scope
  lines.push('\nDAMAGE SCOPE:');
  lines.push(`- Exterior Damaged: ${context.property.exteriorDamaged ? 'Yes' : 'No'}`);
  lines.push(`- Interior Damaged: ${context.property.interiorDamaged ? 'Yes' : 'No'}`);

  return lines.join('\n');
}

/**
 * Build rich policy context from UnifiedClaimContext
 */
function buildRichPolicyContext(context: UnifiedClaimContext): string {
  const lines: string[] = ['POLICY CONTEXT (Comprehensive):'];

  // Basic policy info
  if (context.policyNumber) lines.push(`- Policy Number: ${context.policyNumber}`);

  // Coverage limits
  lines.push('\nCOVERAGE LIMITS:');
  if (context.coverages.dwelling) {
    lines.push(`- Coverage A (Dwelling): ${context.coverages.dwelling.limitFormatted} (${context.coverages.dwelling.valuationMethod || 'RCV'})`);
  }
  if (context.coverages.otherStructures) {
    lines.push(`- Coverage B (Other Structures): ${context.coverages.otherStructures.limitFormatted}`);
    if (context.coverages.otherStructures.specialItems?.length) {
      for (const item of context.coverages.otherStructures.specialItems) {
        lines.push(`  - Scheduled: ${item.item} ($${item.limit.toLocaleString()})`);
      }
    }
  }
  if (context.coverages.personalProperty) {
    lines.push(`- Coverage C (Personal Property): ${context.coverages.personalProperty.limitFormatted}`);
  }
  if (context.coverages.lossOfUse) {
    lines.push(`- Coverage D (Loss of Use): ${context.coverages.lossOfUse.limitFormatted}`);
  }
  if (context.coverages.personalLiability) {
    lines.push(`- Coverage E (Personal Liability): ${context.coverages.personalLiability.limitFormatted}`);
  }
  if (context.coverages.medicalPayments) {
    lines.push(`- Coverage F (Medical Payments): ${context.coverages.medicalPayments.limitFormatted}`);
  }

  // Additional coverages
  const additionalCoverages = Object.entries(context.coverages.additionalCoverages);
  if (additionalCoverages.length > 0) {
    lines.push('\nADDITIONAL COVERAGES:');
    for (const [key, coverage] of additionalCoverages) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lines.push(`- ${label}: ${coverage.limitFormatted}`);
    }
  }

  // Deductibles
  lines.push('\nDEDUCTIBLES:');
  if (context.deductibles.standard) {
    lines.push(`- Standard Deductible: ${context.deductibles.standard.formatted}`);
  }
  if (context.deductibles.windHail) {
    lines.push(`- Wind/Hail Deductible: ${context.deductibles.windHail.formatted}`);
  }
  if (context.deductibles.hurricane) {
    lines.push(`- Hurricane Deductible: ${context.deductibles.hurricane.formatted}`);
  }
  if (context.deductibles.flood) {
    lines.push(`- Flood Deductible: ${context.deductibles.flood.formatted}`);
  }
  lines.push(`- APPLICABLE FOR THIS CLAIM: ${context.deductibles.applicableForPeril.formatted} (${context.deductibles.applicableForPeril.perilType})`);

  // Loss settlement
  lines.push('\nLOSS SETTLEMENT:');
  lines.push(`- Dwelling: ${context.lossSettlement.dwelling.basis}`);
  lines.push(`- Roofing: ${context.lossSettlement.roofing.basis}${context.lossSettlement.roofing.isScheduled ? ' (Scheduled)' : ''}`);
  if (context.lossSettlement.roofing.calculatedPaymentPct !== undefined) {
    lines.push(`  - Estimated Payment: ${context.lossSettlement.roofing.calculatedPaymentPct}% of RCV`);
  }
  if (context.lossSettlement.roofing.metalFunctionalRequirement) {
    lines.push(`  - Metal Functional Requirement: APPLIES (cosmetic damage excluded)`);
  }
  lines.push(`- Personal Property: ${context.lossSettlement.personalProperty.basis}`);

  // Special limits
  const specialLimits = Object.entries(context.specialLimits).filter(([_, v]) => v !== undefined);
  if (specialLimits.length > 0) {
    lines.push('\nSPECIAL LIMITS OF LIABILITY:');
    for (const [key, value] of specialLimits) {
      if (value) {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
        lines.push(`- ${label}: $${value.toLocaleString()}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build endorsement details from UnifiedClaimContext
 */
function buildRichEndorsementDetails(context: UnifiedClaimContext): string {
  const lines: string[] = ['ENDORSEMENTS:'];

  // Listed on FNOL
  if (context.endorsements.listedOnFnol.length > 0) {
    lines.push('\nListed on FNOL:');
    for (const e of context.endorsements.listedOnFnol) {
      lines.push(`- ${e.code}: ${e.description}`);
    }
  }

  // Extracted endorsements with impacts
  if (context.endorsements.extracted.length > 0) {
    lines.push('\nExtracted Endorsements (with inspection impact):');
    for (const e of context.endorsements.extracted) {
      lines.push(`\n[${e.formCode}] ${e.title}`);
      lines.push(`  Category: ${e.category.replace(/_/g, ' ')}`);

      if (e.impacts.length > 0) {
        lines.push(`  Impacts:`);
        for (const impact of e.impacts.slice(0, 3)) {
          lines.push(`    - ${impact}`);
        }
      }

      if (e.inspectionRequirements.length > 0) {
        lines.push(`  Inspection Requirements:`);
        for (const req of e.inspectionRequirements) {
          lines.push(`    - ${req}`);
        }
      }

      if (e.hasRoofSchedule) {
        lines.push(`  ** HAS ROOF PAYMENT SCHEDULE **`);
      }
    }
  } else {
    lines.push('No endorsements extracted');
  }

  return lines.join('\n');
}

/**
 * Build coverage alerts section
 */
function buildCoverageAlertsSection(context: UnifiedClaimContext): string {
  if (context.alerts.length === 0) {
    return 'COVERAGE ALERTS:\n- No alerts identified';
  }

  const lines: string[] = ['COVERAGE ALERTS:'];

  // Sort by severity
  const sorted = [...context.alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  for (const alert of sorted) {
    const icon = alert.severity === 'critical' ? '!!' : alert.severity === 'warning' ? '!' : '-';
    lines.push(`${icon} [${alert.severity.toUpperCase()}] ${alert.title}`);
    lines.push(`  ${alert.description}`);
    if (alert.actionRequired) {
      lines.push(`  Action: ${alert.actionRequired}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build claim insights section
 */
function buildInsightsSection(context: UnifiedClaimContext): string {
  const lines: string[] = ['CLAIM INSIGHTS:'];

  if (context.insights.estimatedRoofPaymentPct !== undefined) {
    lines.push(`- Estimated Roof Payment: ${context.insights.estimatedRoofPaymentPct}% of RCV (${100 - context.insights.estimatedRoofPaymentPct}% depreciation)`);
  }

  if (context.insights.hasOandLCoverage) {
    lines.push(`- O&L Coverage: Yes ($${context.insights.oandLLimit?.toLocaleString() || 'check limit'})`);
  }

  if (context.insights.hasPersonalPropertyRCV) {
    lines.push(`- Personal Property: RCV basis`);
  } else {
    lines.push(`- Personal Property: ACV basis (depreciation applies)`);
  }

  if (context.insights.specialLimitsToWatch.length > 0) {
    lines.push(`- Special Limits to Watch: ${context.insights.specialLimitsToWatch.join(', ')}`);
  }

  if (context.insights.coverageGaps.length > 0) {
    lines.push('\nPotential Coverage Gaps:');
    for (const gap of context.insights.coverageGaps) {
      lines.push(`  - ${gap}`);
    }
  }

  if (context.insights.stateSpecificRules.length > 0) {
    lines.push('\nState-Specific Rules:');
    for (const rule of context.insights.stateSpecificRules.slice(0, 3)) {
      lines.push(`  - ${rule}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build enhanced briefing prompt using UnifiedClaimContext
 */
function buildEnhancedBriefingPrompt(context: UnifiedClaimContext): string {
  const fnolFacts = buildRichFnolFacts(context);
  const policyContext = buildRichPolicyContext(context);
  const endorsementDetails = buildRichEndorsementDetails(context);
  const alertsSection = buildCoverageAlertsSection(context);
  const insightsSection = buildInsightsSection(context);

  return `You are an expert insurance claim inspection advisor. Generate a comprehensive, field-ready claim briefing using the rich claim data provided.

IMPORTANT RULES:
1. Do NOT make coverage determinations or final policy interpretations
2. Focus on practical inspection planning and field execution
3. Use the specific policy details, endorsement impacts, and coverage alerts provided
4. Highlight inspection requirements from endorsements
5. Emphasize the applicable deductible and any depreciation schedules
6. If the roof has a payment schedule, explain what documentation is needed
7. Be concise but thorough

CLAIM IDENTITY:
- Claim Number: ${context.claimNumber}
- Policy Number: ${context.policyNumber || 'Unknown'}
- Insured: ${context.insured.name}${context.insured.name2 ? ` & ${context.insured.name2}` : ''}
- Date of Loss: ${context.dateOfLossFormatted || 'Unknown'}

PERIL ANALYSIS:
- Primary Peril: ${context.peril.primaryDisplay}
- Secondary Perils: ${context.peril.secondaryDisplay.join(', ') || 'None'}
- Applicable Deductible: ${context.peril.applicableDeductible.formatted}
- Inspection Focus Areas: ${context.peril.inspectionFocus.join(', ') || 'Standard inspection'}
- Common Misses for this Peril: ${context.peril.commonMisses.join(', ') || 'None identified'}

${fnolFacts}

${policyContext}

${endorsementDetails}

${alertsSection}

${insightsSection}

DATA COMPLETENESS: ${context.meta.dataCompleteness.completenessScore}% (FNOL: ${context.meta.dataCompleteness.hasFnol ? 'Yes' : 'No'}, Policy: ${context.meta.dataCompleteness.hasPolicy ? 'Yes' : 'No'}, Endorsements: ${context.meta.dataCompleteness.hasEndorsements ? 'Yes' : 'No'})

Generate a JSON briefing with this EXACT structure:
{
  "claim_summary": {
    "primary_peril": "string - the main peril",
    "secondary_perils": ["array of secondary perils"],
    "overview": ["array of 3-5 key points about this specific claim, including applicable deductible and any depreciation factors"],
    "key_policy_factors": ["array of 2-4 policy-specific factors that affect this claim (e.g., scheduled roof depreciation, O&L coverage, special limits)"]
  },
  "inspection_strategy": {
    "where_to_start": ["array of 2-4 specific areas to begin inspection based on reported damage"],
    "what_to_prioritize": ["array of 4-6 priority items specific to this claim's peril and endorsements"],
    "common_misses": ["array of 2-4 things commonly missed for this peril type"],
    "endorsement_driven_requirements": ["array of specific documentation requirements from endorsements"]
  },
  "peril_specific_risks": ["array of 3-5 risks specific to this peril type"],
  "endorsement_watchouts": [
    {
      "endorsement_id": "form number",
      "impact": "brief description of how this endorsement affects the claim",
      "inspection_implications": ["array of what this means for inspection - be specific"]
    }
  ],
  "coverage_considerations": {
    "applicable_deductible": "string - the deductible that applies to this claim",
    "depreciation_factors": ["array of depreciation considerations - roof schedule, ACV items, etc."],
    "special_limits_to_watch": ["array of special limits that may be exceeded"],
    "potential_coverage_issues": ["array of coverage gaps or concerns identified"]
  },
  "photo_requirements": [
    {
      "category": "category name",
      "items": ["specific photos needed - be precise about what to capture"]
    }
  ],
  "sketch_requirements": ["array of sketch/diagram needs for this claim"],
  "documentation_checklist": ["array of specific documents and evidence to collect based on policy and endorsements"],
  "open_questions_for_adjuster": ["array of questions that need answers before/during inspection"]
}

Respond ONLY with valid JSON. No explanation, no markdown.`;
}

/**
 * Generate enhanced claim briefing using UnifiedClaimContext
 *
 * This is the recommended entry point for briefing generation.
 * It uses the full richness of FNOL + Policy + Endorsement data.
 */
export async function generateEnhancedClaimBriefing(
  claimId: string,
  organizationId: string,
  forceRegenerate: boolean = false
): Promise<ClaimBriefingResult> {
  try {
    // Step 1: Build UnifiedClaimContext
    const context = await buildUnifiedClaimContext(claimId, organizationId);
    if (!context) {
      console.warn(`[EnhancedBriefing] Could not build UnifiedClaimContext for claim ${claimId}, falling back to legacy briefing`);
      // Fall back to legacy briefing generation
      return generateClaimBriefing(claimId, organizationId, forceRegenerate);
    }

    // Step 2: Generate source hash for caching
    const hashInput = {
      claimId: context.claimId,
      peril: context.peril.primary,
      deductible: context.deductibles.applicableForPeril.amount,
      roofAge: context.property.roof.ageAtLoss,
      endorsementCount: context.endorsements.extracted.length,
      alertCount: context.alerts.length,
      completeness: context.meta.dataCompleteness.completenessScore,
      builtAt: context.meta.builtAt,
    };
    const sourceHash = crypto.createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');

    // Step 3: Check for cached briefing
    if (!forceRegenerate) {
      const { data: cachedBriefings } = await supabaseAdmin
        .from('claim_briefings')
        .select('*')
        .eq('claim_id', claimId)
        .eq('source_hash', sourceHash)
        .eq('status', 'generated')
        .order('created_at', { ascending: false })
        .limit(1);

      if (cachedBriefings && cachedBriefings.length > 0) {
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

    // Step 4: Generate new briefing
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    // Create record
    const { data: insertResult, error: insertError } = await supabaseAdmin
      .from('claim_briefings')
      .insert({
        organization_id: organizationId,
        claim_id: claimId,
        peril: context.peril.primary,
        secondary_perils: context.peril.secondary,
        source_hash: sourceHash,
        briefing_json: {},
        status: 'generating',
      })
      .select('id')
      .single();

    if (insertError || !insertResult) {
      return { success: false, error: `Failed to create briefing record: ${insertError?.message}` };
    }

    const briefingId = insertResult.id;

    try {
      const promptConfig = await getPromptWithFallback(PromptKey.CLAIM_BRIEFING);
      const userPrompt = buildEnhancedBriefingPrompt(context);

      const completion = await openai.chat.completions.create({
        model: promptConfig.model,
        messages: [
          { role: 'system', content: promptConfig.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: promptConfig.temperature,
        max_tokens: promptConfig.maxTokens || 3000, // Increased for richer output
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from AI');
      }

      const briefingContent = JSON.parse(responseContent) as ClaimBriefingContent;

      // Update record
      await supabaseAdmin
        .from('claim_briefings')
        .update({
          briefing_json: briefingContent,
          status: 'generated',
          model: promptConfig.model,
          prompt_tokens: completion.usage?.prompt_tokens,
          completion_tokens: completion.usage?.completion_tokens,
          total_tokens: completion.usage?.total_tokens,
          updated_at: new Date().toISOString(),
        })
        .eq('id', briefingId);

      console.log(`[EnhancedBriefing] Generated briefing for claim ${claimId} with ${context.meta.dataCompleteness.completenessScore}% data completeness`);

      return {
        success: true,
        briefing: briefingContent,
        briefingId,
        sourceHash,
        cached: false,
        model: promptConfig.model,
        tokenUsage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (aiError) {
      await supabaseAdmin
        .from('claim_briefings')
        .update({
          status: 'failed',
          error_message: (aiError as Error).message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', briefingId);

      throw aiError;
    }
  } catch (error) {
    console.error(`[EnhancedBriefing] Error generating briefing for claim ${claimId}:`, error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
