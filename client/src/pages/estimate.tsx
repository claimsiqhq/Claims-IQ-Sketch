import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout';
import { EstimateBuilder } from '@/components/estimate-builder';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertCircle, FileText, ExternalLink } from 'lucide-react';

interface EstimateInfo {
  id: string;
  claimId: string;
  estimateNumber: string;
  status: string;
  version: number;
  createdAt: string;
  claim?: {
    id: string;
    claimNumber: string;
    insuredName: string;
    propertyAddress: string;
  };
}

export default function EstimatePage() {
  const [, params] = useRoute('/estimate/:id');
  const estimateId = params?.id;

  // Fetch estimate info
  const { data: estimate, isLoading, error } = useQuery<EstimateInfo>({
    queryKey: ['estimate', estimateId],
    queryFn: async () => {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) {
        throw new Error('Failed to load estimate');
      }
      return response.json();
    },
    enabled: !!estimateId,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b bg-white flex items-center gap-4">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !estimate) {
    return (
      <Layout>
        <div className="h-full flex items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="mb-4">
                {error instanceof Error ? error.message : 'Failed to load estimate'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Claims
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full flex flex-col">
        {/* Header with breadcrumb */}
        <div className="px-4 py-3 border-b bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href={estimate.claimId ? `/claim/${estimate.claimId}` : '/'}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h1 className="font-semibold">
                  Estimate #{estimate.estimateNumber || estimate.id.slice(0, 8)}
                </h1>
                {estimate.claim && (
                  <p className="text-xs text-muted-foreground">
                    {estimate.claim.insuredName} • {estimate.claim.propertyAddress}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {estimate.claimId && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/claim/${estimate.claimId}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Claim
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Estimate Builder */}
        <div className="flex-1 overflow-hidden">
          {estimateId && (
            <EstimateBuilder
              estimateId={estimateId}
              className="h-full"
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
