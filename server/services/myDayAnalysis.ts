// My Day AI Analysis Service
// Analyzes claim data, weather, and provides optimization insights

import OpenAI from 'openai';
import type { WeatherData, InspectionImpact } from './weatherService';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ClaimData {
  id: string;
  claimNumber: string;
  insuredName: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  lossType: string;
  lossDescription: string;
  status: string;
  dateOfLoss: string;
  createdAt: string;
  reserveAmount?: number;
  estimatedAmount?: number;
  policyLimits?: number;
  documentsCount?: number;
  photosCount?: number;
  hasEstimate?: boolean;
  metadata?: {
    lat?: number;
    lng?: number;
    completenessScore?: number;
    slaDeadline?: string;
  };
}

interface InspectionStop {
  id: string;
  claimId: string;
  claimNumber: string;
  insuredName: string;
  address: string;
  city: string;
  state: string;
  lossType?: string;
  lat?: number;
  lng?: number;
  estimatedDuration?: number;
  travelTimeFromPrevious?: number;
}

interface MyDayInsight {
  type: 'priority' | 'efficiency' | 'risk' | 'opportunity' | 'weather' | 'sla';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedClaims?: string[];
  actionable: boolean;
  suggestedAction?: string;
}

interface MyDayAnalysisResult {
  insights: MyDayInsight[];
  priorityOrder: string[]; // Claim IDs in recommended order
  riskScore: number; // 0-100
  efficiencyScore: number; // 0-100
  summary: string;
  weatherImpact: {
    affectedStops: number;
    recommendation: string;
  };
  slaStatus: {
    atRisk: number;
    breaching: number;
    safe: number;
  };
}

export async function analyzeMyDay(
  claims: ClaimData[],
  inspectionRoute: InspectionStop[],
  weatherData: WeatherData[]
): Promise<MyDayAnalysisResult> {
  try {
    const insights: MyDayInsight[] = [];
    
    // Create weather lookup by stop
    const weatherByStop = new Map<string, WeatherData>();
    for (const w of weatherData) {
      weatherByStop.set(w.stopId, w);
    }

    // 1. Analyze SLA status
    const slaStatus = analyzeSlaStatus(claims, inspectionRoute);
    insights.push(...slaStatus.insights);

    // 2. Analyze weather impacts
    const weatherAnalysis = analyzeWeatherImpacts(inspectionRoute, weatherByStop);
    insights.push(...weatherAnalysis.insights);

    // 3. Analyze claim completeness and documentation
    const completenessAnalysis = analyzeClaimCompleteness(claims);
    insights.push(...completenessAnalysis.insights);

    // 4. Analyze coverage and reserve issues
    const coverageAnalysis = analyzeCoverageIssues(claims);
    insights.push(...coverageAnalysis.insights);

    // 5. Calculate optimal priority order
    const priorityOrder = await calculateOptimalPriority(
      claims,
      inspectionRoute,
      weatherByStop,
      slaStatus,
      weatherAnalysis
    );

    // 6. Calculate overall scores
    const riskScore = calculateRiskScore(insights);
    const efficiencyScore = calculateEfficiencyScore(inspectionRoute, weatherAnalysis);

    // 7. Generate summary (has its own try-catch with fallback)
    const summary = await generateAiSummary(
      claims,
      inspectionRoute,
      insights,
      weatherAnalysis,
      slaStatus
    );

    return {
      insights,
      priorityOrder,
      riskScore,
      efficiencyScore,
      summary,
      weatherImpact: {
        affectedStops: weatherAnalysis.affectedStops,
        recommendation: weatherAnalysis.recommendation,
      },
      slaStatus: {
        atRisk: slaStatus.atRisk,
        breaching: slaStatus.breaching,
        safe: slaStatus.safe,
      },
    };
  } catch (error) {
    console.error('My Day analysis error:', error);
    
    // Return a minimal fallback result
    return {
      insights: [],
      priorityOrder: inspectionRoute.map(s => s.claimId),
      riskScore: 0,
      efficiencyScore: 100,
      summary: `${inspectionRoute.length} inspections scheduled today. Analysis temporarily unavailable.`,
      weatherImpact: {
        affectedStops: 0,
        recommendation: 'Weather data unavailable.',
      },
      slaStatus: {
        atRisk: 0,
        breaching: 0,
        safe: claims.length,
      },
    };
  }
}

function analyzeSlaStatus(claims: ClaimData[], route: InspectionStop[]) {
  const insights: MyDayInsight[] = [];
  let atRisk = 0;
  let breaching = 0;
  let safe = 0;

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  for (const claim of claims) {
    const slaDeadline = claim.metadata?.slaDeadline;
    if (!slaDeadline) {
      safe++;
      continue;
    }

    const deadline = new Date(slaDeadline);
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 0) {
      breaching++;
      insights.push({
        type: 'sla',
        severity: 'critical',
        title: `SLA Breached: ${claim.claimNumber}`,
        description: `This claim has exceeded its SLA deadline. Immediate attention required.`,
        affectedClaims: [claim.id],
        actionable: true,
        suggestedAction: 'Prioritize this inspection and document delay reasons',
      });
    } else if (hoursUntilDeadline < 24) {
      atRisk++;
      insights.push({
        type: 'sla',
        severity: 'warning',
        title: `SLA Due Today: ${claim.claimNumber}`,
        description: `SLA deadline is within 24 hours. Schedule this inspection first.`,
        affectedClaims: [claim.id],
        actionable: true,
        suggestedAction: 'Move to first position in route',
      });
    } else if (hoursUntilDeadline < 48) {
      atRisk++;
      insights.push({
        type: 'sla',
        severity: 'info',
        title: `SLA Approaching: ${claim.claimNumber}`,
        description: `SLA deadline is within 48 hours. Plan accordingly.`,
        affectedClaims: [claim.id],
        actionable: false,
      });
    } else {
      safe++;
    }
  }

  return { insights, atRisk, breaching, safe };
}

function analyzeWeatherImpacts(
  route: InspectionStop[],
  weatherByStop: Map<string, WeatherData>
) {
  const insights: MyDayInsight[] = [];
  let affectedStops = 0;
  let severeStops: string[] = [];
  let cautionStops: string[] = [];

  for (const stop of route) {
    const weather = weatherByStop.get(stop.claimId);
    if (!weather) continue;

    const impact = weather.inspectionImpact;
    
    if (impact.score === 'severe' || impact.score === 'warning') {
      affectedStops++;
      severeStops.push(stop.claimNumber);
      
      insights.push({
        type: 'weather',
        severity: impact.score === 'severe' ? 'critical' : 'warning',
        title: `Weather Alert: ${stop.claimNumber}`,
        description: impact.reasons.join('. '),
        affectedClaims: [stop.claimId],
        actionable: true,
        suggestedAction: impact.recommendations.join('. ') || 'Consider rescheduling',
      });
    } else if (impact.score === 'caution') {
      affectedStops++;
      cautionStops.push(stop.claimNumber);
    }
  }

  let recommendation = 'Good weather conditions for all inspections.';
  if (severeStops.length > 0) {
    recommendation = `Severe weather affecting ${severeStops.length} stop(s). Consider rescheduling ${severeStops.join(', ')}.`;
  } else if (cautionStops.length > 0) {
    recommendation = `Weather cautions for ${cautionStops.length} stop(s). Bring rain gear and allow extra time.`;
  }

  return { insights, affectedStops, recommendation };
}

function analyzeClaimCompleteness(claims: ClaimData[]) {
  const insights: MyDayInsight[] = [];

  for (const claim of claims) {
    const completeness = claim.metadata?.completenessScore || 0;
    const hasDocuments = (claim.documentsCount || 0) > 0;
    const hasPhotos = (claim.photosCount || 0) > 0;
    const hasEstimate = claim.hasEstimate;

    const issues: string[] = [];
    if (!hasDocuments) issues.push('No documents uploaded');
    if (!hasPhotos) issues.push('No photos attached');
    if (!hasEstimate) issues.push('No estimate created');

    if (issues.length >= 2) {
      insights.push({
        type: 'opportunity',
        severity: 'info',
        title: `Incomplete Claim: ${claim.claimNumber}`,
        description: issues.join(', '),
        affectedClaims: [claim.id],
        actionable: true,
        suggestedAction: 'Gather missing documentation during inspection',
      });
    }
  }

  return { insights };
}

function analyzeCoverageIssues(claims: ClaimData[]) {
  const insights: MyDayInsight[] = [];

  for (const claim of claims) {
    const reserve = claim.reserveAmount || 0;
    const estimate = claim.estimatedAmount || 0;
    const policyLimit = claim.policyLimits || Infinity;

    // Check if estimate exceeds reserve significantly
    if (estimate > 0 && reserve > 0 && estimate > reserve * 1.5) {
      insights.push({
        type: 'risk',
        severity: 'warning',
        title: `Reserve Gap: ${claim.claimNumber}`,
        description: `Estimate ($${estimate.toLocaleString()}) exceeds reserve ($${reserve.toLocaleString()}) by ${Math.round((estimate / reserve - 1) * 100)}%`,
        affectedClaims: [claim.id],
        actionable: true,
        suggestedAction: 'Request reserve increase before inspection',
      });
    }

    // Check if approaching policy limits
    if (estimate > 0 && policyLimit < Infinity && estimate > policyLimit * 0.8) {
      insights.push({
        type: 'risk',
        severity: 'critical',
        title: `Policy Limit Concern: ${claim.claimNumber}`,
        description: `Estimate is approaching policy limit. Excess claim possible.`,
        affectedClaims: [claim.id],
        actionable: true,
        suggestedAction: 'Review policy for additional coverages',
      });
    }
  }

  return { insights };
}

async function calculateOptimalPriority(
  claims: ClaimData[],
  route: InspectionStop[],
  weatherByStop: Map<string, WeatherData>,
  slaStatus: { insights: MyDayInsight[] },
  weatherAnalysis: { insights: MyDayInsight[] }
): Promise<string[]> {
  // Build priority scores for each claim
  const priorities = route.map(stop => {
    let score = 50; // Base score
    const claim = claims.find(c => c.id === stop.claimId);
    const weather = weatherByStop.get(stop.claimId);

    // SLA urgency (highest priority)
    const slaPriority = slaStatus.insights.find(i => 
      i.affectedClaims?.includes(stop.claimId)
    );
    if (slaPriority?.severity === 'critical') score += 40;
    else if (slaPriority?.severity === 'warning') score += 25;

    // Weather impact (avoid bad weather later in day)
    if (weather?.inspectionImpact.score === 'severe') score -= 20;
    else if (weather?.inspectionImpact.score === 'warning') score -= 10;

    // High value claims
    if (claim?.reserveAmount && claim.reserveAmount > 50000) score += 10;

    // FNOL status (time-sensitive)
    if (claim?.status === 'fnol') score += 15;

    return {
      claimId: stop.claimId,
      score,
    };
  });

  // Sort by score descending
  priorities.sort((a, b) => b.score - a.score);
  
  return priorities.map(p => p.claimId);
}

function calculateRiskScore(insights: MyDayInsight[]): number {
  let riskPoints = 0;
  
  for (const insight of insights) {
    if (insight.severity === 'critical') riskPoints += 30;
    else if (insight.severity === 'warning') riskPoints += 15;
    else riskPoints += 5;
  }

  // Normalize to 0-100
  return Math.min(100, riskPoints);
}

function calculateEfficiencyScore(
  route: InspectionStop[],
  weatherAnalysis: { affectedStops: number }
): number {
  let score = 100;

  // Deduct for weather impacts
  score -= weatherAnalysis.affectedStops * 10;

  // Deduct for long travel times
  const avgTravel = route.reduce((sum, s) => sum + (s.travelTimeFromPrevious || 0), 0) / route.length;
  if (avgTravel > 30) score -= 15;
  else if (avgTravel > 20) score -= 10;

  return Math.max(0, Math.min(100, score));
}

async function generateAiSummary(
  claims: ClaimData[],
  route: InspectionStop[],
  insights: MyDayInsight[],
  weatherAnalysis: { affectedStops: number; recommendation: string },
  slaStatus: { atRisk: number; breaching: number; safe: number }
): Promise<string> {
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  const warningInsights = insights.filter(i => i.severity === 'warning');

  const prompt = `You are an insurance claims assistant. Generate a brief, actionable summary for an adjuster's day.

Context:
- ${route.length} inspections scheduled
- ${claims.length} active claims
- ${criticalInsights.length} critical issues, ${warningInsights.length} warnings
- SLA status: ${slaStatus.breaching} breaching, ${slaStatus.atRisk} at risk, ${slaStatus.safe} safe
- Weather: ${weatherAnalysis.recommendation}

Key issues:
${criticalInsights.slice(0, 3).map(i => `- ${i.title}: ${i.description}`).join('\n')}
${warningInsights.slice(0, 3).map(i => `- ${i.title}: ${i.description}`).join('\n')}

Generate a 2-3 sentence summary that:
1. Highlights the most important priority
2. Mentions any weather or SLA concerns
3. Gives one actionable recommendation

Be concise and professional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 150,
    });

    return response.choices[0]?.message?.content || 'Unable to generate summary.';
  } catch (error) {
    console.error('AI summary generation failed:', error);
    
    // Fallback summary
    if (criticalInsights.length > 0) {
      return `You have ${criticalInsights.length} critical issue(s) requiring immediate attention. ${slaStatus.breaching > 0 ? `${slaStatus.breaching} SLA(s) are breaching.` : ''} ${weatherAnalysis.recommendation}`;
    }
    
    return `${route.length} inspections scheduled today. ${weatherAnalysis.recommendation}`;
  }
}

export type { 
  ClaimData, 
  InspectionStop, 
  MyDayInsight, 
  MyDayAnalysisResult 
};
