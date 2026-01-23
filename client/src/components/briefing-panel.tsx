/**
 * Claim Briefing Panel Component
 *
 * Displays AI-generated claim briefings with the following sections:
 * - Summary (peril, overview)
 * - Inspection Strategy (where to start, priorities, common misses)
 * - Peril-Specific Risks
 * - Endorsement Watchouts
 * - Photo Requirements
 * - Sketch Requirements
 * - Depreciation Considerations
 * - Open Questions for Adjuster
 *
 * All content is read-only. No coverage decisions are made.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  MapPin,
  AlertTriangle,
  Camera,
  Ruler,
  DollarSign,
  HelpCircle,
  Clock,
  CheckCircle2,
  Layers,
} from "lucide-react";
import {
  getClaimBriefing,
  generateClaimBriefing,
  getClaimBriefingStatus,
  type ClaimBriefingContent,
  type StoredBriefing,
  type BriefingStatusResponse,
} from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface BriefingPanelProps {
  claimId: string;
  className?: string;
}

export function BriefingPanel({ claimId, className }: BriefingPanelProps) {
  const [briefing, setBriefing] = useState<StoredBriefing | null>(null);
  const [status, setStatus] = useState<BriefingStatusResponse | null>(null);
  // Start with loading = true to prevent autostart race condition
  // The autostart effect checks !loading, so starting with true prevents
  // it from triggering before fetchBriefing completes
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapsible states - all expanded by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    summary: true,
    strategy: true,
    risks: true,
    endorsements: true,
    photos: true,
    sketches: true,
    depreciation: true,
    questions: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchBriefing = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    setError(null);

    try {
      const [briefingData, statusData] = await Promise.all([
        getClaimBriefing(claimId).catch(() => null),
        getClaimBriefingStatus(claimId).catch(() => null),
      ]);

      setBriefing(briefingData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  // Ref to track if autostart has been attempted
  const autoGenerateAttempted = useRef(false);

  const handleGenerate = async (force: boolean = false) => {
    if (!claimId) return;
    setGenerating(true);
    setError(null);

    try {
      const result = await generateClaimBriefing(claimId, force);
      // Use the timestamp from the API response (actual DB value) with fallback
      const timestamp = result.updatedAt || new Date().toISOString();
      setBriefing({
        id: result.briefingId,
        claimId,
        peril: result.briefing.claim_summary.primary_peril,
        sourceHash: result.sourceHash,
        briefingJson: result.briefing,
        status: 'generated',
        model: result.model || null,
        promptTokens: result.tokenUsage?.promptTokens || null,
        completionTokens: result.tokenUsage?.completionTokens || null,
        totalTokens: result.tokenUsage?.totalTokens || null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      setStatus({
        hasBriefing: true,
        isStale: false,
        lastUpdated: timestamp,
        model: result.model || null,
      });
      toast.success(result.cached ? 'Briefing loaded from cache' : 'Briefing generated successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate briefing';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  // Autostart: Generate briefing automatically if none exists
  useEffect(() => {
    // Only auto-generate once, when initial load completes with no briefing
    if (!loading && !briefing && !error && !generating && !autoGenerateAttempted.current) {
      autoGenerateAttempted.current = true;
      handleGenerate(false);
    }
  }, [loading, briefing, error, generating]);

  const rawContent = briefing?.briefingJson as any;
  
  // Normalize content to handle both API response formats
  // Some briefings have depreciation_considerations at top level
  // Others have it nested under coverage_considerations.depreciation_factors
  const content = rawContent ? {
    ...rawContent,
    depreciation_considerations: rawContent.depreciation_considerations || 
      rawContent.coverage_considerations?.depreciation_factors || 
      [],
    sketch_requirements: rawContent.sketch_requirements || [],
    open_questions_for_adjuster: rawContent.open_questions_for_adjuster || [],
  } : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold">AI Claim Briefing</h3>
          {status?.isStale && briefing && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Update Available
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {briefing && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(briefing.updatedAt), { addSuffix: true })}
            </span>
          )}
          <Button
            size="sm"
            variant={briefing ? "outline" : "default"}
            onClick={() => handleGenerate(briefing !== null)}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : briefing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Generate Briefing
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && !briefing && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* No briefing state */}
      {!loading && !briefing && !error && (
        <Card>
          <CardContent className="py-8 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              No briefing generated yet. Click "Generate Briefing" to create an AI-powered inspection guide.
            </p>
            <Button onClick={() => handleGenerate(false)} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Briefing
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Briefing content */}
      {content && !loading && (
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="space-y-4 pr-4">
            {/* Claim Summary */}
            <CollapsibleSection
              title="Claim Summary"
              icon={<FileText className="h-4 w-4" />}
              isOpen={openSections.summary}
              onToggle={() => toggleSection('summary')}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-sm">{content.claim_summary.primary_peril}</Badge>
                  {(content.claim_summary.secondary_perils || []).map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-sm">{p}</Badge>
                  ))}
                </div>
                <div className="space-y-2">
                  {(content.claim_summary.overview || []).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="text-primary mt-1.5 flex-shrink-0">•</span>
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>

            {/* Inspection Strategy */}
            <CollapsibleSection
              title="Inspection Strategy"
              icon={<MapPin className="h-4 w-4" />}
              isOpen={openSections.strategy}
              onToggle={() => toggleSection('strategy')}
            >
              <div className="space-y-4">
                {content.inspection_strategy?.where_to_start?.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                    <h5 className="text-sm font-semibold mb-2 text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Where to Start
                    </h5>
                    <div className="space-y-1.5 ml-4">
                      {content.inspection_strategy.where_to_start.map((item, i) => (
                        <p key={i} className="text-sm leading-relaxed text-blue-900 dark:text-blue-100">{item}</p>
                      ))}
                    </div>
                  </div>
                )}
                {content.inspection_strategy?.what_to_prioritize?.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-100 dark:border-green-900">
                    <h5 className="text-sm font-semibold mb-2 text-green-700 dark:text-green-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      What to Prioritize
                    </h5>
                    <div className="space-y-1.5 ml-4">
                      {content.inspection_strategy.what_to_prioritize.map((item, i) => (
                        <p key={i} className="text-sm leading-relaxed text-green-900 dark:text-green-100">{item}</p>
                      ))}
                    </div>
                  </div>
                )}
                {content.inspection_strategy?.common_misses?.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-100 dark:border-amber-900">
                    <h5 className="text-sm font-semibold mb-2 text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Common Misses
                    </h5>
                    <div className="space-y-1.5 ml-4">
                      {content.inspection_strategy.common_misses.map((item, i) => (
                        <p key={i} className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">{item}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* Peril-Specific Risks */}
            <CollapsibleSection
              title="Peril-Specific Risks"
              icon={<AlertTriangle className="h-4 w-4" />}
              isOpen={openSections.risks}
              onToggle={() => toggleSection('risks')}
              badgeCount={content.peril_specific_risks.length}
            >
              <div className="space-y-2">
                {content.peril_specific_risks.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">{risk}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Endorsement Watchouts */}
            {content.endorsement_watchouts.length > 0 && (
              <CollapsibleSection
                title="Endorsement Watchouts"
                icon={<Layers className="h-4 w-4" />}
                isOpen={openSections.endorsements}
                onToggle={() => toggleSection('endorsements')}
                badgeCount={content.endorsement_watchouts.length}
              >
                <div className="space-y-3">
                  {content.endorsement_watchouts.map((watchout: any, i) => {
                    const endorsementId = watchout.endorsement_id || watchout.endorsement || 'Unknown';
                    const impact = watchout.impact || watchout.description || '';
                    const implications = watchout.inspection_implications || [];
                    return (
                      <div key={i} className="border rounded p-3 bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {endorsementId}
                          </Badge>
                        </div>
                        {impact && <p className="text-sm font-medium mb-1">{impact}</p>}
                        {Array.isArray(implications) && implications.length > 0 && (
                          <ul className="list-disc list-inside text-sm text-muted-foreground">
                            {implications.map((impl: string, j: number) => (
                              <li key={j}>{impl}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {/* Photo Requirements */}
            <CollapsibleSection
              title="Photo Requirements"
              icon={<Camera className="h-4 w-4" />}
              isOpen={openSections.photos}
              onToggle={() => toggleSection('photos')}
            >
              <div className="space-y-3">
                {content.photo_requirements.map((req: any, i: number) => {
                  if (typeof req === 'string') {
                    return (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Camera className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{req}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="bg-muted/40 rounded-lg p-3">
                      <h5 className="text-sm font-semibold mb-2 text-foreground">{req.category}</h5>
                      {Array.isArray(req.items) && (
                        <div className="space-y-1.5 ml-2">
                          {req.items.map((item: string, j: number) => (
                            <div key={j} className="flex items-start gap-2 text-sm">
                              <span className="text-muted-foreground mt-1">○</span>
                              <span className="text-muted-foreground leading-relaxed">{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            {/* Sketch Requirements */}
            {content.sketch_requirements?.length > 0 && (
              <CollapsibleSection
                title="Sketch Requirements"
                icon={<Ruler className="h-4 w-4" />}
                isOpen={openSections.sketches}
                onToggle={() => toggleSection('sketches')}
              >
                <div className="space-y-2">
                  {content.sketch_requirements.map((req, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm p-2 bg-muted/40 rounded">
                      <Ruler className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed">{req}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Depreciation Considerations */}
            {content.depreciation_considerations?.length > 0 && (
              <CollapsibleSection
                title="Depreciation Considerations"
                icon={<DollarSign className="h-4 w-4" />}
                isOpen={openSections.depreciation}
                onToggle={() => toggleSection('depreciation')}
              >
                <div className="space-y-3">
                  {content.depreciation_considerations.map((consideration: any, i: number) => {
                    if (typeof consideration === 'string') {
                      return (
                        <div key={i} className="flex items-start gap-2 text-sm p-2 bg-muted/40 rounded">
                          <DollarSign className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="leading-relaxed">{consideration}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="bg-muted/40 rounded-lg p-3">
                        <p className="text-sm font-semibold text-foreground mb-2">{consideration.item}</p>
                        {consideration.factors && consideration.factors.length > 0 && (
                          <div className="space-y-1.5 ml-2">
                            {consideration.factors.map((factor: string, j: number) => (
                              <div key={j} className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground mt-1">→</span>
                                <span className="text-muted-foreground leading-relaxed">{factor}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {/* Open Questions */}
            {content.open_questions_for_adjuster?.length > 0 && (
              <CollapsibleSection
                title="Questions to Answer"
                icon={<HelpCircle className="h-4 w-4" />}
                isOpen={openSections.questions}
                onToggle={() => toggleSection('questions')}
                badgeCount={content.open_questions_for_adjuster?.length || 0}
                badgeVariant="destructive"
              >
                <div className="space-y-2">
                  {content.open_questions_for_adjuster?.map((question, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
                      <HelpCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm leading-relaxed text-red-800 dark:text-red-200">{question}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Model info */}
            {briefing?.model && (
              <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                Generated by {briefing.model}
                {briefing.totalTokens && ` (${briefing.totalTokens} tokens)`}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
  badgeCount,
  badgeVariant = "secondary",
}: {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badgeCount?: number;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                {icon}
                {title}
                {badgeCount !== undefined && badgeCount > 0 && (
                  <Badge variant={badgeVariant} className="ml-1">
                    {badgeCount}
                  </Badge>
                )}
              </span>
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default BriefingPanel;
