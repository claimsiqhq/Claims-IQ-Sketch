/**
 * Memoized Coverage Highlights Component
 *
 * Displays coverage analysis summary with memoization
 * to prevent unnecessary re-renders.
 */

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Shield, AlertTriangle } from 'lucide-react';
import type { CoverageAnalysisSummary, CoverageAlert } from '@/lib/api';

interface CoverageAlertsListProps {
  alerts: CoverageAlert[];
}

/**
 * Memoized coverage alerts list
 */
const CoverageAlertsList = memo(function CoverageAlertsList({
  alerts,
}: CoverageAlertsListProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => (
        <div
          key={idx}
          className={`p-2 rounded-lg border ${
            alert.severity === 'critical'
              ? 'bg-red-50 border-red-200'
              : alert.severity === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={`h-4 w-4 mt-0.5 ${
                alert.severity === 'critical'
                  ? 'text-red-600'
                  : alert.severity === 'warning'
                  ? 'text-amber-600'
                  : 'text-blue-600'
              }`}
            />
            <div>
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="text-xs text-muted-foreground">{alert.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

interface CoverageHighlightsProps {
  summary: CoverageAnalysisSummary;
}

/**
 * Memoized CoverageHighlights component
 * Displays a summary of coverage analysis for a claim
 */
export const CoverageHighlights = memo(function CoverageHighlights({
  summary,
}: CoverageHighlightsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Coverage Highlights
          {summary.riskLevel && (
            <Badge
              variant="outline"
              className={`ml-auto ${
                summary.riskLevel === 'high'
                  ? 'text-red-600 border-red-300'
                  : summary.riskLevel === 'medium'
                  ? 'text-amber-600 border-amber-300'
                  : 'text-green-600 border-green-300'
              }`}
            >
              {summary.riskLevel} risk
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summary.dwellingCoverage !== undefined && (
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                ${(summary.dwellingCoverage / 1000).toFixed(0)}K
              </p>
              <p className="text-xs text-muted-foreground">Dwelling Coverage</p>
            </div>
          )}
          {summary.deductible !== undefined && (
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-amber-600">
                ${summary.deductible.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Deductible</p>
            </div>
          )}
          {summary.windHailDeductiblePct !== undefined && (
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {summary.windHailDeductiblePct}%
              </p>
              <p className="text-xs text-muted-foreground">Wind/Hail Ded.</p>
            </div>
          )}
          {summary.roofPaymentPct !== undefined && (
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {summary.roofPaymentPct}%
              </p>
              <p className="text-xs text-muted-foreground">Roof Payment</p>
            </div>
          )}
        </div>

        {/* Applicable Deductible */}
        {summary.applicableDeductible && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800">
              Applicable Deductible: {summary.applicableDeductible}
            </p>
          </div>
        )}

        {/* Alerts */}
        <CoverageAlertsList alerts={summary.alerts || []} />

        {/* Top Recommendations */}
        {summary.topRecommendations && summary.topRecommendations.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Key Recommendations
            </p>
            <ul className="space-y-1">
              {summary.topRecommendations.slice(0, 3).map((rec, idx) => (
                <li
                  key={idx}
                  className="text-sm text-gray-700 flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
