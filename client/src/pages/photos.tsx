import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Filter, FolderOpen, Building2, Home, Loader2 } from 'lucide-react';
import Layout from '@/components/layout';
import { PhotoAlbum } from '@/features/voice-sketch/components/PhotoAlbum';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClaims } from '@/lib/api';
import { useGeometryEngine } from '@/features/voice-sketch/services/geometry-engine';
import type { SketchPhoto } from '@/features/voice-sketch/types/geometry';

type FilterMode = 'all' | 'by-claim' | 'by-structure';

export default function PhotosPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  
  const { photos } = useGeometryEngine();
  
  const { data: claimsData, isLoading: loadingClaims } = useQuery({
    queryKey: ['claims-for-photos'],
    queryFn: () => getClaims({ limit: 100 }),
    staleTime: 60000,
  });

  const claims = claimsData?.claims || [];

  const filteredPhotos = useMemo(() => {
    if (filterMode === 'all') {
      return photos;
    }
    if (filterMode === 'by-claim' && selectedClaimId) {
      return photos.filter((p) => p.hierarchyPath?.includes(selectedClaimId));
    }
    return photos;
  }, [photos, filterMode, selectedClaimId]);

  const groupedByStructure = useMemo(() => {
    const groups: Record<string, SketchPhoto[]> = {};
    for (const photo of filteredPhotos) {
      const path = photo.hierarchyPath || 'Unassigned';
      const structure = path.split(' > ')[0] || 'Exterior';
      if (!groups[structure]) {
        groups[structure] = [];
      }
      groups[structure].push(photo);
    }
    return groups;
  }, [filteredPhotos]);

  const stats = useMemo(() => {
    const withDamage = photos.filter((p) => p.aiAnalysis?.content?.damageDetected).length;
    const avgQuality = photos.length > 0
      ? Math.round(photos.reduce((sum, p) => sum + (p.aiAnalysis?.quality?.score ?? 5), 0) / photos.length)
      : 0;
    return { total: photos.length, withDamage, avgQuality };
  }, [photos]);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Camera className="h-6 w-6" />
              Photo Album
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              All inspection photos captured during voice sketches
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-mode">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Photos</SelectItem>
                <SelectItem value="by-claim">By Claim</SelectItem>
                <SelectItem value="by-structure">By Structure</SelectItem>
              </SelectContent>
            </Select>
            
            {filterMode === 'by-claim' && (
              <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
                <SelectTrigger className="w-[180px]" data-testid="select-claim">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Select claim" />
                </SelectTrigger>
                <SelectContent>
                  {loadingClaims ? (
                    <div className="flex items-center justify-center p-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : claims.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No claims found</div>
                  ) : (
                    claims.map((claim) => (
                      <SelectItem key={claim.id} value={claim.id.toString()}>
                        {claim.claimNumber}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">With Damage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.withDamage}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgQuality}/10</div>
            </CardContent>
          </Card>
        </div>

        {filterMode === 'by-structure' ? (
          <div className="space-y-6">
            {Object.entries(groupedByStructure).map(([structure, structurePhotos]) => (
              <Card key={structure}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {structure === 'Exterior' ? (
                      <Home className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    {structure}
                    <span className="text-sm font-normal text-muted-foreground ml-auto">
                      {structurePhotos.length} photo(s)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PhotoAlbum photos={structurePhotos} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <PhotoAlbum photos={filteredPhotos} />
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
