/**
 * Claim Flow Section Component
 *
 * Section for displaying flow status on the claim detail page.
 * Shows either:
 * - Active flow status with continue button
 * - Start flow button if no active flow
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowStatusCard } from "./FlowStatusCard";
import { StartFlowButton } from "./StartFlowButton";
import { ClipboardCheck, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveFlowForClaim, cancelFlowForClaim } from "@/lib/api";
import { toast } from "sonner";

interface ClaimFlowSectionProps {
  claimId: string;
  perilType?: string | null;
  className?: string;
}

export function ClaimFlowSection({
  claimId,
  perilType,
  className,
}: ClaimFlowSectionProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Fetch active flow for claim
  const {
    data: activeFlow,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['activeFlow', claimId],
    queryFn: () => getActiveFlowForClaim(claimId),
    enabled: !!claimId,
    retry: 1,
    staleTime: 30000, // 30 seconds
  });

  // Cancel flow mutation
  const cancelMutation = useMutation({
    mutationFn: () => cancelFlowForClaim(claimId),
    onSuccess: () => {
      toast.success('Flow cancelled');
      queryClient.invalidateQueries({ queryKey: ['activeFlow', claimId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel flow');
    },
  });

  const handleFlowStarted = (flowId: string) => {
    toast.success('Inspection flow started');
    queryClient.invalidateQueries({ queryKey: ['activeFlow', claimId] });
    // Navigate to flow progress page
    setLocation(`/flows/${flowId}`);
  };

  const handleContinueFlow = () => {
    if (activeFlow?.id) {
      setLocation(`/flows/${activeFlow.id}`);
    }
  };

  const handleCancelFlow = () => {
    if (confirm('Are you sure you want to cancel this flow? All progress will be lost.')) {
      cancelMutation.mutate();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5" />
            Inspection Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state (but we still show start button)
  if (error && !activeFlow) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5" />
            Inspection Flow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Unable to load flow status. You can still start a new flow.
            </AlertDescription>
          </Alert>
          <StartFlowButton
            claimId={claimId}
            perilType={perilType}
            onStart={handleFlowStarted}
            variant="outline"
          />
        </CardContent>
      </Card>
    );
  }

  // Active flow exists
  if (activeFlow) {
    return (
      <FlowStatusCard
        flow={activeFlow}
        onContinue={handleContinueFlow}
        onCancel={handleCancelFlow}
        className={className}
        isLoading={cancelMutation.isPending}
      />
    );
  }

  // No active flow - show start button
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" />
          Inspection Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Start a guided inspection flow to systematically capture all required
          evidence for this claim. The flow will walk you through each phase and
          movement based on the peril type.
        </p>
        <StartFlowButton
          claimId={claimId}
          perilType={perilType}
          onStart={handleFlowStarted}
          className="w-full"
        />
      </CardContent>
    </Card>
  );
}

export default ClaimFlowSection;
