/**
 * Coverage Analysis Service
 *
 * Analyzes claim coverage using UnifiedClaimContext to provide:
 * - Coverage gap identification
 * - Depreciation calculations
 * - Payment estimates
 * - Endorsement impact summaries
 * - Actionable recommendations
 *
 * This service does NOT make coverage determinations.
 * It provides advisory analysis only.
 */

import {
  UnifiedClaimContext,
  CoverageAnalysisResult,
  CoverageAlert,
  RoofDepreciationResult,
  EndorsementImpact,
  Peril,
} from '../../shared/schema';
import {
  buildUnifiedClaimContext,
  calculateRoofDepreciation,
  getEndorsementInspectionRequirements,
  getEndorsementEstimateConsiderations,
} from './unifiedClaimContextService';

// ============================================
// COVERAGE ANALYSIS FUNCTIONS
// ============================================

/**
 * Analyze coverage gaps based on claim data
 */
function analyzeCoverageGaps(context: UnifiedClaimContext): CoverageAlert[] {
  const alerts: CoverageAlert[] = [];

  // Check for flood claims without flood coverage
  if (context.peril.primary === Peril.FLOOD) {
    if (!context.deductibles.flood) {
      alerts.push({
        severity: 'critical',
        category: 'deductible',
        title: 'Flood Coverage May Not Apply',
        description: 'This is a flood claim but no flood deductible is specified. Standard homeowners policies typically exclude flood.',
        actionRequired: 'Verify separate flood policy exists (NFIP or private)',
      });
    }
  }

  // Check for mold claims with coverage limits
  if (context.peril.primary === Peril.MOLD) {
    if (context.insights.hasFungiCoverage && context.insights.fungiLimit) {
      alerts.push({
        severity: 'warning',
        category: 'limit',
        title: 'Fungi/Bacteria Coverage Limited',
        description: `Mold/fungi coverage is capped at $${context.insights.fungiLimit.toLocaleString()}`,
        actionRequired: 'Document mold extent carefully for limit awareness',
      });
    } else {
      alerts.push({
        severity: 'critical',
        category: 'exclusion',
        title: 'Mold May Be Excluded',
        description: 'No specific fungi/bacteria coverage identified. Mold is typically excluded unless resulting from a covered peril.',
        actionRequired: 'Determine if mold resulted from a covered water damage event',
      });
    }
  }

  // Check for water damage and potential mold
  if (context.peril.primary === Peril.WATER) {
    alerts.push({
      severity: 'info',
      category: 'documentation',
      title: 'Document Moisture and Mold Potential',
      description: 'Water damage claims may develop mold. Fungi/bacteria coverage may be limited.',
      actionRequired: context.insights.hasFungiCoverage
        ? `Document moisture readings. Fungi coverage: $${context.insights.fungiLimit?.toLocaleString() || 'check policy'}`
        : 'Check if fungi/bacteria coverage applies',
    });
  }

  // Check for high-value items
  if (context.peril.primary === Peril.FIRE || context.peril.primary === Peril.WATER) {
    const specialLimits = context.specialLimits;
    if (specialLimits.jewelry && specialLimits.jewelry <= 2500) {
      alerts.push({
        severity: 'info',
        category: 'limit',
        title: 'Jewelry Special Limit',
        description: `Jewelry coverage limited to $${specialLimits.jewelry.toLocaleString()} unless scheduled`,
        actionRequired: 'Ask insured about high-value jewelry items',
      });
    }
    if (specialLimits.firearms && specialLimits.firearms <= 5000) {
      alerts.push({
        severity: 'info',
        category: 'limit',
        title: 'Firearms Special Limit',
        description: `Firearms coverage limited to $${specialLimits.firearms.toLocaleString()} for theft`,
        actionRequired: 'Document any firearm losses carefully',
      });
    }
  }

  // Check for O&L coverage on significant damage
  if (!context.insights.hasOandLCoverage) {
    alerts.push({
      severity: 'info',
      category: 'limit',
      title: 'No Ordinance or Law Coverage',
      description: 'If code upgrades are required during repairs, additional costs may not be covered.',
      actionRequired: 'Note any code deficiencies that may require upgrade during repair',
    });
  }

  // Check personal property valuation
  if (!context.insights.hasPersonalPropertyRCV) {
    alerts.push({
      severity: 'info',
      category: 'depreciation',
      title: 'Personal Property on ACV Basis',
      description: 'Contents will be depreciated. Consider replacement cost endorsement for future.',
      actionRequired: 'Calculate depreciation on personal property items',
    });
  }

  return alerts;
}

/**
 * Estimate maximum payments based on coverage limits
 */
function estimateMaxPayments(
  context: UnifiedClaimContext,
  depreciation?: RoofDepreciationResult
): CoverageAnalysisResult['estimatedMaxPayments'] {
  const dwelling = context.coverages.dwelling?.limit;
  const otherStructures = context.coverages.otherStructures?.limit;
  const personalProperty = context.coverages.personalProperty?.limit;

  // Apply roof depreciation if scheduled
  let dwellingAdjusted = dwelling;
  if (dwelling && depreciation?.isScheduledBasis) {
    // Rough estimate: assume roof is 30% of dwelling value for hail claims
    if (context.peril.primary === Peril.WIND_HAIL) {
      const estimatedRoofValue = dwelling * 0.3;
      const roofPayment = estimatedRoofValue * (depreciation.paymentPercentage / 100);
      const nonRoofDamage = dwelling * 0.1; // Rough estimate for other damage
      dwellingAdjusted = roofPayment + nonRoofDamage;
    }
  }

  const deductible = context.deductibles.applicableForPeril.amount || 0;

  return {
    dwelling: dwellingAdjusted ? Math.max(0, dwellingAdjusted - deductible) : undefined,
    otherStructures: otherStructures ? Math.max(0, otherStructures - deductible) : undefined,
    personalProperty: personalProperty ? Math.max(0, personalProperty - deductible) : undefined,
    total: undefined, // Would need actual damage assessment
  };
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  context: UnifiedClaimContext,
  depreciation?: RoofDepreciationResult
): string[] {
  const recommendations: string[] = [];

  // Roof-related recommendations
  if (depreciation?.isScheduledBasis) {
    recommendations.push(`Verify roof age (currently calculated as ${depreciation.roofAge} years) with permit records or manufacturer stamps`);
    recommendations.push(`Confirm roof material type for accurate schedule lookup (currently: ${depreciation.roofMaterial})`);

    if (depreciation.paymentPercentage < 70) {
      recommendations.push('Consider discussing depreciation impact with insured before completing estimate');
    }
  }

  // Metal component recommendations
  if (context.lossSettlement.roofing.metalFunctionalRequirement && context.peril.primary === Peril.WIND_HAIL) {
    recommendations.push('Document functional damage to metal components (water intrusion or actual holes) before including in scope');
    recommendations.push('Take close-up photos of any metal damage showing penetration, not just cosmetic dents');
  }

  // O&L recommendations
  if (context.insights.hasOandLCoverage) {
    recommendations.push(`O&L coverage available ($${context.insights.oandLLimit?.toLocaleString() || 'check limit'}) - note any code violations or required upgrades`);
  }

  // Personal property recommendations
  if (!context.insights.hasPersonalPropertyRCV) {
    recommendations.push('Personal property is on ACV - document age and condition of contents for depreciation');
  }

  // Endorsement-specific recommendations
  const inspectionReqs = getEndorsementInspectionRequirements(context);
  for (const req of inspectionReqs) {
    for (const r of req.requirements.slice(0, 2)) { // Top 2 per endorsement
      recommendations.push(`[${req.formCode}] ${r}`);
    }
  }

  // Special limit recommendations
  if (context.insights.specialLimitsToWatch.length > 0) {
    recommendations.push(`Watch for special limits: ${context.insights.specialLimitsToWatch.join(', ')}`);
  }

  return recommendations;
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

/**
 * Perform comprehensive coverage analysis for a claim
 */
export async function analyzeCoverage(
  claimId: string,
  organizationId: string
): Promise<CoverageAnalysisResult | null> {
  // Build unified context
  const context = await buildUnifiedClaimContext(claimId, organizationId);
  if (!context) {
    console.error(`[CoverageAnalysis] Could not build context for claim ${claimId}`);
    return null;
  }

  // Calculate roof depreciation
  const depreciation = context.lossSettlement.roofing.isScheduled
    ? calculateRoofDepreciation(context)
    : undefined;

  // Analyze coverage gaps
  const gapAlerts = analyzeCoverageGaps(context);

  // Combine with context alerts
  const allAlerts = [...context.alerts, ...gapAlerts];

  // Deduplicate alerts by title
  const uniqueAlerts = allAlerts.reduce((acc, alert) => {
    if (!acc.some(a => a.title === alert.title)) {
      acc.push(alert);
    }
    return acc;
  }, [] as CoverageAlert[]);

  // Sort by severity
  uniqueAlerts.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Estimate payments
  const estimatedPayments = estimateMaxPayments(context, depreciation);

  // Generate recommendations
  const recommendations = generateRecommendations(context, depreciation);

  const result: CoverageAnalysisResult = {
    claimId,
    analyzedAt: new Date().toISOString(),
    alerts: uniqueAlerts,
    endorsementImpacts: context.endorsements.extracted,
    depreciation,
    estimatedMaxPayments: estimatedPayments,
    recommendations,
  };

  console.log(`[CoverageAnalysis] Completed analysis for claim ${claimId}: ${uniqueAlerts.length} alerts, ${recommendations.length} recommendations`);

  return result;
}

/**
 * Get a summary of coverage analysis for UI display
 */
export async function getCoverageAnalysisSummary(
  claimId: string,
  organizationId: string
): Promise<{
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  roofPaymentPct?: number;
  applicableDeductible: string;
  topRecommendations: string[];
} | null> {
  const analysis = await analyzeCoverage(claimId, organizationId);
  if (!analysis) return null;

  const criticalAlerts = analysis.alerts.filter(a => a.severity === 'critical').length;
  const warningAlerts = analysis.alerts.filter(a => a.severity === 'warning').length;
  const infoAlerts = analysis.alerts.filter(a => a.severity === 'info').length;

  const context = await buildUnifiedClaimContext(claimId, organizationId);

  return {
    criticalAlerts,
    warningAlerts,
    infoAlerts,
    roofPaymentPct: analysis.depreciation?.paymentPercentage,
    applicableDeductible: context?.deductibles.applicableForPeril.formatted || 'Unknown',
    topRecommendations: analysis.recommendations.slice(0, 5),
  };
}

/**
 * Get endorsement impacts formatted for display
 */
export function formatEndorsementImpacts(
  impacts: EndorsementImpact[]
): Array<{
  formCode: string;
  title: string;
  category: string;
  summary: string;
  inspectionItems: string[];
}> {
  return impacts.map(impact => ({
    formCode: impact.formCode,
    title: impact.title,
    category: impact.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    summary: impact.impacts.slice(0, 2).join('; ') || 'No specific impact identified',
    inspectionItems: impact.inspectionRequirements,
  }));
}
