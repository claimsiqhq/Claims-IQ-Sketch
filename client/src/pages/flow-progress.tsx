/**
 * Flow Progress View Page
 *
 * Shows all phases and movements for a flow instance.
 * Allows navigation to current/next movement.
 */

import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  PlayCircle,
  Pause,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
  Home,
  RefreshCw,
  Mic
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFlowInstance,
  getFlowPhases,
  getPhaseMovements,
  getNextMovement,
  type FlowInstance,
  type FlowPhaseStatus,
  type FlowMovement,
} from "@/lib/api";
import {
  FlowProgressBar,
  PhaseCard,
  LoadingButton,
  StatusBadge,
  ErrorBanner,
  EmptyState,
} from "@/components/flow";
import { VoiceGuidedInspection } from "@/components/flow/VoiceGuidedInspection";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { offlineStorage } from "@/services/offlineStorage";
import { toast } from "sonner";

export default function FlowProgressPage() {
  const [, params] = useRoute("/flows/:flowId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const flowId = params?.flowId;

  // State for expanded phases
  const [phaseMovements, setPhaseMovements] = useState<Record<string, FlowMovement[]>>({});
  const [loadingPhases, setLoadingPhases] = useState<Set<string>>(new Set());
  const [voiceMode, setVoiceMode] = useState(false);

  // Fetch flow instance
  const {
    data: flowInstance,
    isLoading: isLoadingFlow,
    error: flowError,
    refetch: refetchFlow,
  } = useQuery({
    queryKey: ['flowInstance', flowId],
    queryFn: async () => {
      try {
        const flowData = await getFlowInstance(flowId!);
        // Cache for offline access
        await offlineStorage.cacheFlow(flowData);
        return flowData;
      } catch (error) {
        // Try to load from cache if online fetch fails
        const cached = await offlineStorage.getCachedFlow(flowId!);
        if (cached) {
          return cached;
        }
        throw error;
      }
    },
    enabled: !!flowId,
    staleTime: 30000,
  });

  // Fetch phases
  const {
    data: phases,
    isLoading: isLoadingPhases,
    error: phasesError,
  } = useQuery({
    queryKey: ['flowPhases', flowId],
    queryFn: () => getFlowPhases(flowId!),
    enabled: !!flowId,
    staleTime: 30000,
  });

  // Fetch next movement
  const {
    data: nextMovement,
    isLoading: isLoadingNext,
  } = useQuery({
    queryKey: ['nextMovement', flowId],
    queryFn: () => getNextMovement(flowId!),
    enabled: !!flowId,
    staleTime: 10000,
  });

  // Load movements for a phase
  const loadPhaseMovements = async (phaseId: string) => {
    if (phaseMovements[phaseId] || loadingPhases.has(phaseId)) return;

    setLoadingPhases(prev => new Set(prev).add(phaseId));
    try {
      const movements = await getPhaseMovements(flowId!, phaseId);
      setPhaseMovements(prev => ({ ...prev, [phaseId]: movements }));
    } catch (err) {
      console.error('Failed to load phase movements:', err);
      toast.error('Failed to load movements');
    } finally {
      setLoadingPhases(prev => {
        const next = new Set(prev);
        next.delete(phaseId);
        return next;
      });
    }
  };

  // Auto-load movements for current phase
  useEffect(() => {
    if (flowInstance?.currentPhaseId && phases) {
      loadPhaseMovements(flowInstance.currentPhaseId);
    }
  }, [flowInstance?.currentPhaseId, phases]);

  // Calculate progress
  const progress = useMemo(() => {
    if (!phases) return { total: 0, completed: 0, percentComplete: 0 };
    const total = phases.reduce((sum, p) => sum + p.movementCount, 0);
    const completed = phases.reduce((sum, p) => sum + p.completedMovementCount, 0);
    return {
      total,
      completed,
      percentComplete: total > 0 ? (completed / total) * 100 : 0,
    };
  }, [phases]);

  // Navigate to movement execution
  const handleMovementClick = (movement: FlowMovement) => {
    setLocation(`/flows/${flowId}/movements/${movement.id}`);
  };

  // Navigate to next/continue
  const handleContinue = () => {
    if (nextMovement?.type === 'movement' && nextMovement.movement) {
      setLocation(`/flows/${flowId}/movements/${nextMovement.movement.id}`);
    } else if (nextMovement?.type === 'gate') {
      // Handle gate - maybe show a dialog or navigate to gate evaluation
      // For now, just refetch to check if gate passed
      refetchFlow();
    } else if (nextMovement?.type === 'complete') {
      toast.success('All movements complete!');
    }
  };

  const handleRefetch = () => {
    refetchFlow();
    queryClient.invalidateQueries({ queryKey: ['flowPhases', flowId] });
    queryClient.invalidateQueries({ queryKey: ['nextMovement', flowId] });
    toast.success('Refreshed');
  };

  // Loading state
  if (isLoadingFlow || isLoadingPhases) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  // Error state
  if (flowError || phasesError || !flowInstance) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <ErrorBanner
            message={flowError instanceof Error ? flowError.message : phasesError instanceof Error ? phasesError.message : 'Failed to load flow'}
          />
          <EmptyState
            icon="⚠️"
            title="Unable to load flow"
            description="The flow instance could not be loaded. Please try again or return to your claims."
            action={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    refetchFlow();
                    queryClient.invalidateQueries({ queryKey: ['flowPhases', flowId] });
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation('/')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Claims
                </Button>
              </div>
            }
          />
        </div>
      </Layout>
    );
  }

  const isCompleted = flowInstance.status === 'completed';
  const isPaused = flowInstance.status === 'paused';
  const isCancelled = flowInstance.status === 'cancelled';

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <div className="p-4 space-y-4">
            {/* Back and Title */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation(`/claim/${flowInstance.claimId}`)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-xl font-semibold">
                  {flowInstance.flowName || 'Inspection Flow'}
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge
                    variant={isCompleted ? 'default' : isPaused ? 'secondary' : 'outline'}
                    className={cn(
                      isCompleted && "bg-green-500",
                      isCancelled && "bg-red-500"
                    )}
                  >
                    {flowInstance.status}
                  </Badge>
                  {flowInstance.startedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Started {formatDistanceToNow(new Date(flowInstance.startedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isCompleted && !isCancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVoiceMode(true)}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Voice Mode
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefetch}
                  disabled={isLoadingPhases || isLoadingNext}
                  aria-label="Refresh flow data"
                >
                  <RefreshCw className={cn("h-4 w-4", (isLoadingPhases || isLoadingNext) && "animate-spin")} />
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            <FlowProgressBar
              progress={progress}
              phases={phases}
              currentPhaseId={flowInstance.currentPhaseId}
              showPhaseIndicators={phases && phases.length <= 6}
            />
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Current Phase Info */}
            {flowInstance.currentPhaseName && !isCompleted && (
              <Card className="border-primary">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">
                        Current Phase
                      </div>
                      <div className="font-medium text-lg">
                        {flowInstance.currentPhaseName}
                      </div>
                      {flowInstance.currentPhaseDescription && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {flowInstance.currentPhaseDescription}
                        </p>
                      )}
                    </div>
                    {nextMovement?.type === 'movement' && nextMovement.movement && (
                      <Button onClick={handleContinue}>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Continue
                      </Button>
                    )}
                  </div>

                  {/* Next Movement Preview */}
                  {nextMovement?.type === 'movement' && nextMovement.movement && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-blue-50/50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                        <PlayCircle className="h-3 w-3" />
                        Next Up
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-base">{nextMovement.movement.name}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        {nextMovement.movement.description && (
                          <p className="text-sm text-muted-foreground">{nextMovement.movement.description}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Gate Pending */}
                  {nextMovement?.type === 'gate' && nextMovement.gate && (
                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <span className="font-medium">Gate: {nextMovement.gate.name}</span>
                        <p className="text-sm mt-1">{nextMovement.gate.description}</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Flow Complete */}
                  {nextMovement?.type === 'complete' && (
                    <Alert className="mt-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-700 dark:text-green-300">
                        All movements in this phase are complete!
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Completed Message */}
            {isCompleted && (
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CardContent className="pt-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">
                    Inspection Complete
                  </h3>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    All phases and movements have been completed.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setLocation(`/claim/${flowInstance.claimId}`)}
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Back to Claim
                  </Button>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Phases List */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Phases</h2>
              {phases && phases.length > 0 ? (
                phases.map((phase) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    movements={phaseMovements[phase.id]}
                    isCurrentPhase={phase.id === flowInstance.currentPhaseId}
                    onMovementClick={handleMovementClick}
                  />
                ))
              ) : (
                <EmptyState
                  icon="📋"
                  title="No phases found"
                  description="This flow doesn't have any phases defined yet."
                />
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Bottom Action Bar */}
        {!isCompleted && !isCancelled && (
          <div className="border-t p-4 bg-background">
            <LoadingButton
              className="w-full"
              size="lg"
              onClick={handleContinue}
              loading={isLoadingNext}
              loadingText="Loading next movement..."
              disabled={nextMovement?.type === 'complete'}
            >
              {nextMovement?.type === 'complete' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Phase Complete
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5 mr-2" />
                  Continue Inspection
                </>
              )}
            </LoadingButton>
          </div>
        )}
      </div>
    </Layout>
  );
}
