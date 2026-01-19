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
import { ClaimBriefingContent, PromptKey, UnifiedClaimContext } from '../../shared/schema';
import { getPromptWithFallback } from './promptService';
import { buildUnifiedClaimContext } from './unifiedClaimContextService';

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
  updatedAt?: string;
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
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Generate a claim briefing for a specific claim
 *
 * ENHANCED VERSION - Uses UnifiedClaimContext for rich policy, endorsement, and depreciation data.
 *
 * Uses ONLY canonical data sources:
 * - claims.loss_context for FNOL facts
 * - Effective policy (dynamically computed) for policy context
 * - endorsement_extractions for endorsement modifications with inspection requirements
 * - Calculated depreciation values from roof schedules
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
    // Step 1: Build UnifiedClaimContext (rich context with endorsements, depreciation, etc.)
    const context = await buildUnifiedClaimContext(claimId, organizationId);
    if (!context) {
      return {
        success: false,
        error: 'Claim not found or unable to build UnifiedClaimContext',
      };
    }

    // Step 2: Generate source hash for caching
    // NOTE: Only include stable, content-based fields that indicate actual claim data changes.
    // EXCLUDED: builtAt (timestamp), completenessScore (fluctuates with async enrichment)
    const hashInput = {
      claimId: context.claimId,
      peril: context.peril.primary,
      deductible: context.deductibles.applicableForPeril.amount,
      roofAge: context.property.roof.ageAtLoss,
      endorsementCount: context.endorsements.extracted.length,
      alertCount: context.alerts.length,
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
          updatedAt: cached.updated_at,
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

      // [BRIEFING_AUDIT] Log prompt data for verification
      console.log('[BRIEFING_AUDIT] Full prompt being sent:', JSON.stringify({
        systemPromptPreview: promptConfig.systemPrompt.substring(0, 500),
        userPromptPreview: userPrompt.substring(0, 1000),
        propertyDataIncluded: {
          hasYearBuilt: userPrompt.includes('Year Built') || userPrompt.includes('year_built'),
          hasStories: userPrompt.includes('Stories') || userPrompt.includes('stories'),
          hasRoofYearInstalled: userPrompt.includes('Roof Year Installed') || userPrompt.includes('year_installed'),
          hasRoofAgeAtLoss: userPrompt.includes('Roof Age at Loss') || userPrompt.includes('ageAtLoss'),
          hasExteriorDamaged: userPrompt.includes('Exterior Damaged'),
          hasInteriorDamaged: userPrompt.includes('Interior Damaged'),
        },
        policyDataIncluded: {
          hasCoverageA: userPrompt.includes('Coverage A') || userPrompt.includes('Dwelling'),
          hasDeductibles: userPrompt.includes('Deductible'),
          hasEndorsements: userPrompt.includes('Endorsement') || userPrompt.includes('endorsement'),
        },
        contextMetrics: {
          promptLength: userPrompt.length,
          hasDepreciationContext: userPrompt.includes('DEPRECIATION'),
          hasAlertsSection: userPrompt.includes('COVERAGE ALERTS'),
          hasInsightsSection: userPrompt.includes('CLAIM INSIGHTS'),
        }
      }, null, 2));

      const completion = await openai.chat.completions.create({
        model: promptConfig.model,
        messages: [
          { role: 'system', content: promptConfig.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: promptConfig.temperature,
        max_completion_tokens: promptConfig.maxTokens || 3000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from AI');
      }

      const briefingContent = JSON.parse(responseContent) as ClaimBriefingContent;

      // Update record with error handling
      const updatedAt = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from('claim_briefings')
        .update({
          briefing_json: briefingContent,
          status: 'generated',
          model: promptConfig.model,
          prompt_tokens: completion.usage?.prompt_tokens,
          completion_tokens: completion.usage?.completion_tokens,
          total_tokens: completion.usage?.total_tokens,
          updated_at: updatedAt,
        })
        .eq('id', briefingId);

      if (updateError) {
        console.error('[ClaimBriefing] Failed to update briefing record:', updateError);
        throw new Error(`Failed to save briefing: ${updateError.message}`);
      }

      // Increment claim's briefing_version for cache invalidation
      // This allows voice agents to detect when the briefing has been updated
      try {
        const { error: rpcError } = await supabaseAdmin.rpc('increment_claim_version', {
          p_claim_id: claimId,
          p_version_type: 'briefing',
        });
        if (rpcError) {
          // Fallback: If RPC doesn't exist, do manual increment
          const { data: claimData } = await supabaseAdmin
            .from('claims')
            .select('briefing_version')
            .eq('id', claimId)
            .single();
          const currentVersion = claimData?.briefing_version || 0;
          await supabaseAdmin
            .from('claims')
            .update({
              briefing_version: currentVersion + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', claimId);
        }
      } catch (err) {
        // Silently fail - version increment is not critical
        console.error('[ClaimBriefing] Failed to increment briefing version:', err);
      }

      console.log(`[ClaimBriefing] Generated enhanced briefing for claim ${claimId} with ${context.meta.dataCompleteness.completenessScore}% data completeness`);

      return {
        success: true,
        briefing: briefingContent,
        briefingId,
        sourceHash,
        cached: false,
        model: promptConfig.model,
        updatedAt,
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
    console.error(`[ClaimBriefing] Error generating briefing for claim ${claimId}:`, error);
    return {
      success: false,
      error: (error as Error).message,
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
  const context = await buildUnifiedClaimContext(claimId, organizationId);
  if (!context) {
    return true; // Claim not found, consider stale
  }

  // Generate hash using the same logic as generateClaimBriefing
  // NOTE: Only include stable, content-based fields - NOT timestamps or volatile scores
  const hashInput = {
    claimId: context.claimId,
    peril: context.peril.primary,
    deductible: context.deductibles.applicableForPeril.amount,
    roofAge: context.property.roof.ageAtLoss,
    endorsementCount: context.endorsements.extracted.length,
    alertCount: context.alerts.length,
  };
  const currentHash = crypto.createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');

  const briefing = await getClaimBriefing(claimId, organizationId);

  if (!briefing) {
    console.log('[Briefing Staleness] No briefing exists');
    return true; // No briefing exists
  }

  const isStale = briefing.sourceHash !== currentHash;
  console.log('[Briefing Staleness] Hash comparison:', {
    storedHash: briefing.sourceHash,
    currentHash,
    hashInput,
    isStale
  });

  return isStale;
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
 * Build explicit depreciation context for targeted AI suggestions
 */
function buildDepreciationContext(context: UnifiedClaimContext): string {
  const lines: string[] = ['DEPRECIATION DATA (use these SPECIFIC values in your recommendations):'];

  // Roof depreciation details
  const roof = context.property.roof;
  if (roof.yearInstalled || roof.ageAtLoss !== undefined) {
    lines.push('\nROOF:');
    if (roof.yearInstalled) {
      lines.push(`- Year Installed: ${roof.yearInstalled}`);
    }
    if (roof.ageAtLoss !== undefined) {
      lines.push(`- Age at Loss: ${roof.ageAtLoss} years`);
    }
    if (roof.material) {
      lines.push(`- Material: ${roof.material}`);
    }
    
    // Add payment schedule info if available
    if (context.insights.estimatedRoofPaymentPct !== undefined) {
      const depreciationPct = 100 - context.insights.estimatedRoofPaymentPct;
      lines.push(`- Scheduled Payment: ${context.insights.estimatedRoofPaymentPct}% of RCV`);
      lines.push(`- Depreciation Applied: ${depreciationPct}%`);
      lines.push(`- ACTION: Document roof condition, manufacturer stamps, and any prior repairs to verify age`);
    }
  }

  // Personal property settlement basis
  lines.push('\nPERSONAL PROPERTY:');
  if (context.insights.hasPersonalPropertyRCV) {
    lines.push(`- Settlement: RCV (Replacement Cost Value) - depreciation is recoverable`);
    lines.push(`- ACTION: Document age and condition for holdback calculation`);
  } else {
    lines.push(`- Settlement: ACV (Actual Cash Value) - depreciation is NOT recoverable`);
    lines.push(`- ACTION: Document age, condition, and remaining useful life for each item`);
  }

  // Check for specific damaged items that need depreciation
  if (context.property.yearBuilt) {
    lines.push('\nPROPERTY AGE:');
    lines.push(`- Year Built: ${context.property.yearBuilt}`);
    const propertyAge = new Date().getFullYear() - parseInt(context.property.yearBuilt);
    lines.push(`- Property Age: ~${propertyAge} years`);
    lines.push(`- ACTION: Consider age-based depreciation for HVAC, water heaters, flooring, and other building components`);
  }

  // Add specific documentation requirements
  lines.push('\nDEPRECIATION DOCUMENTATION REQUIREMENTS:');
  lines.push('- For EACH item subject to depreciation, document:');
  lines.push('  1. Actual age (not estimated) - look for manufacturer stamps, permits, receipts');
  lines.push('  2. Current condition (good/fair/poor) with photos');
  lines.push('  3. Any prior damage or repairs');
  lines.push('  4. Remaining useful life estimate');

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
  const depreciationContext = buildDepreciationContext(context);

  return `You are an expert insurance claim inspection advisor. Generate a comprehensive, field-ready claim briefing using the rich claim data provided.

IMPORTANT RULES:
1. Do NOT make coverage determinations or final policy interpretations
2. Focus on practical inspection planning and field execution
3. Use the specific policy details, endorsement impacts, and coverage alerts provided
4. Highlight inspection requirements from endorsements
5. CRITICAL: Use the SPECIFIC depreciation data provided - include actual ages, percentages, and item-specific documentation needs
6. If the roof has a payment schedule, explain what documentation is needed to verify the age
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

${depreciationContext}

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
    "depreciation_factors": [
      {
        "item": "item name (e.g., Roof, Hot Tub Cover, HVAC)",
        "age": "actual age or 'verify age' if unknown",
        "depreciation_pct": "percentage or 'TBD based on condition'",
        "documentation_needed": "specific documentation to collect (e.g., manufacturer stamp, permit records, receipts)"
      }
    ],
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

// NOTE: generateEnhancedClaimBriefing has been merged into generateClaimBriefing
// The main function now uses UnifiedClaimContext for rich policy, endorsement, and depreciation data
