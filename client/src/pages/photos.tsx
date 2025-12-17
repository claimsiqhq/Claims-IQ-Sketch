import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearch } from 'wouter';
import { Camera, Filter, Building2, Home, Mic, ArrowRight, Loader2, RefreshCw, FolderOpen, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { getClaims, getClaimPhotos, getAllPhotos, deletePhoto, updatePhoto, uploadPhoto, reanalyzePhoto, type ClaimPhoto } from '@/lib/api';
import type { SketchPhoto } from '@/features/voice-sketch/types/geometry';
import { toast } from 'sonner';

type FilterMode = 'all' | 'by-structure' | 'damage-only' | 'uncategorized';

interface ExtendedSketchPhoto extends SketchPhoto {
  claimId?: string | null;
}

function claimPhotoToSketchPhoto(cp: ClaimPhoto): ExtendedSketchPhoto {
  return {
    id: cp.id,
    label: cp.label || 'Photo',
    hierarchyPath: cp.hierarchyPath || (cp.claimId ? 'Unassigned' : 'Uncategorized'),
    storageUrl: cp.publicUrl,
    localUri: cp.publicUrl,
    storagePath: cp.storagePath,
    latitude: cp.latitude,
    longitude: cp.longitude,
    geoAddress: cp.geoAddress,
    claimId: cp.claimId, // Include claimId for reassignment
    aiAnalysis: cp.aiAnalysis && Object.keys(cp.aiAnalysis).length > 0 ? {
      quality: cp.aiAnalysis.quality || { score: 5, issues: [], suggestions: [] },
      content: cp.aiAnalysis.content || { description: '', damageDetected: false, damageTypes: [], damageLocations: [], materials: [], recommendedLabel: '' },
      metadata: cp.aiAnalysis.metadata || { lighting: 'fair', focus: 'acceptable', angle: 'acceptable', coverage: 'partial' },
    } : null,
    capturedAt: cp.capturedAt || new Date().toISOString(),
    analyzedAt: cp.analyzedAt || undefined,
    structureId: cp.structureId || undefined,
    roomId: cp.roomId || undefined,
    subRoomId: cp.damageZoneId || undefined,
    analysisStatus: cp.analysisStatus || null,
    analysisError: cp.analysisError || null,
  };
}

export default function PhotosPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialClaimId = urlParams.get('claimId') || 'all';

  const [selectedClaimId, setSelectedClaimId] = useState(initialClaimId);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: claimsData, isLoading: claimsLoading } = useQuery({
    queryKey: ['claims'],
    queryFn: () => getClaims({ limit: 100 }),
  });

  const claims = claimsData?.claims || [];

  const { data: claimPhotos = [], isLoading: claimPhotosLoading, refetch: refetchClaimPhotos } = useQuery({
    queryKey: ['claimPhotos', selectedClaimId],
    queryFn: () => getClaimPhotos(selectedClaimId),
    enabled: selectedClaimId !== 'all' && !!selectedClaimId,
  });

  const { data: allPhotos = [], isLoading: allPhotosLoading, refetch: refetchAllPhotos } = useQuery({
    queryKey: ['allPhotos'],
    queryFn: getAllPhotos,
    enabled: selectedClaimId === 'all',
  });

  const photos = selectedClaimId === 'all' ? allPhotos : claimPhotos;
  const photosLoading = selectedClaimId === 'all' ? allPhotosLoading : claimPhotosLoading;

  const deleteMutation = useMutation({
    mutationFn: deletePhoto,
    onSuccess: () => {
      toast.success('Photo deleted');
      if (selectedClaimId === 'all') {
        queryClient.invalidateQueries({ queryKey: ['allPhotos'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['claimPhotos', selectedClaimId] });
      }
    },
    onError: (error) => {
      toast.error('Failed to delete photo: ' + (error as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { label?: string; hierarchyPath?: string; claimId?: string | null } }) =>
      updatePhoto(id, updates),
    onSuccess: () => {
      toast.success('Photo updated');
      queryClient.invalidateQueries({ queryKey: ['allPhotos'] });
      queryClient.invalidateQueries({ queryKey: ['claimPhotos'] });
    },
    onError: (error) => {
      toast.error('Failed to update photo: ' + (error as Error).message);
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: reanalyzePhoto,
    onSuccess: () => {
      toast.success('Photo re-analysis started');
      queryClient.invalidateQueries({ queryKey: ['allPhotos'] });
      queryClient.invalidateQueries({ queryKey: ['claimPhotos'] });
    },
    onError: (error) => {
      toast.error('Failed to re-analyze photo: ' + (error as Error).message);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Get GPS coordinates if available
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (e) {
        console.log('GPS not available:', e);
      }

      return uploadPhoto({
        file,
        claimId: selectedClaimId !== 'all' ? selectedClaimId : undefined,
        label: 'Photo',
        hierarchyPath: selectedClaimId !== 'all' ? 'Exterior' : 'Uncategorized',
        latitude,
        longitude,
      });
    },
    onSuccess: () => {
      toast.success('Photo uploaded - analysis in progress');
      queryClient.invalidateQueries({ queryKey: ['allPhotos'] });
      if (selectedClaimId !== 'all') {
        queryClient.invalidateQueries({ queryKey: ['claimPhotos', selectedClaimId] });
      }
    },
    onError: (error) => {
      toast.error('Failed to upload photo: ' + (error as Error).message);
    },
  });

  const sketchPhotos: ExtendedSketchPhoto[] = useMemo(() => {
    return photos.map(claimPhotoToSketchPhoto);
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    let result = sketchPhotos;

    if (filterMode === 'damage-only') {
      result = result.filter((p) => p.aiAnalysis?.content?.damageDetected);
    } else if (filterMode === 'uncategorized') {
      result = result.filter((p) => !p.claimId);
    }

    return result;
  }, [sketchPhotos, filterMode]);

  const uncategorizedCount = useMemo(() => {
    return sketchPhotos.filter((p) => !p.claimId).length;
  }, [sketchPhotos]);

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

  const groupedByClaim = useMemo(() => {
    if (selectedClaimId !== 'all') return {};
    const groups: Record<string, SketchPhoto[]> = {};
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const sketchPhoto = sketchPhotos[i];
      const claimId = photo.claimId;
      const claim = claims.find(c => c.id === claimId);
      const claimLabel = claimId ? (claim ? (claim.claimNumber || claimId.slice(0, 8)) : claimId.slice(0, 8)) : 'Uncategorized';
      if (!groups[claimLabel]) {
        groups[claimLabel] = [];
      }
      groups[claimLabel].push(sketchPhoto);
    }
    return groups;
  }, [selectedClaimId, photos, sketchPhotos, claims]);

  const stats = useMemo(() => {
    const withDamage = sketchPhotos.filter((p) => p.aiAnalysis?.content?.damageDetected).length;
    const avgQuality = sketchPhotos.length > 0
      ? Math.round(sketchPhotos.reduce((sum, p) => sum + (p.aiAnalysis?.quality?.score ?? 5), 0) / sketchPhotos.length)
      : 0;
    return { total: sketchPhotos.length, withDamage, avgQuality };
  }, [sketchPhotos]);

  // Auto-poll for photos that are pending or analyzing
  const hasProcessingPhotos = useMemo(() => {
    return sketchPhotos.some(p => p.analysisStatus === 'pending' || p.analysisStatus === 'analyzing');
  }, [sketchPhotos]);

  useEffect(() => {
    if (!hasProcessingPhotos) return;

    // Poll every 3 seconds when there are processing photos
    const interval = setInterval(() => {
      if (selectedClaimId === 'all') {
        refetchAllPhotos();
      } else {
        refetchClaimPhotos();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasProcessingPhotos, selectedClaimId, refetchAllPhotos, refetchClaimPhotos]);

  const handleDeletePhoto = (photoId: string) => {
    if (confirm('Are you sure you want to delete this photo?')) {
      deleteMutation.mutate(photoId);
    }
  };

  const handleUpdatePhoto = (photoId: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null }) => {
    updateMutation.mutate({ id: photoId, updates });
  };

  const handleReanalyzePhoto = (photoId: string) => {
    reanalyzeMutation.mutate(photoId);
  };

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const loadingToast = toast.loading('Uploading photo...');

    try {
      await uploadMutation.mutateAsync(file);
      toast.dismiss(loadingToast);
    } catch (error) {
      toast.dismiss(loadingToast);
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRefresh = () => {
    if (selectedClaimId === 'all') {
      refetchAllPhotos();
    } else {
      refetchClaimPhotos();
    }
  };

  const isLoading = claimsLoading || photosLoading;

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
              Photos captured and stored for your claims
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
              <SelectTrigger className="w-[200px]" data-testid="select-claim">
                <SelectValue placeholder="Select a claim" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Claims</SelectItem>
                {claims.map((claim) => (
                  <SelectItem key={claim.id} value={claim.id}>
                    {claim.claimNumber || claim.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-mode">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Photos</SelectItem>
                <SelectItem value="by-structure">By Structure</SelectItem>
                <SelectItem value="damage-only">Damage Only</SelectItem>
                <SelectItem value="uncategorized">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Uncategorized {uncategorizedCount > 0 && `(${uncategorizedCount})`}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={photosLoading}
              data-testid="button-refresh-photos"
            >
              <RefreshCw className={`h-4 w-4 ${photosLoading ? 'animate-spin' : ''}`} />
            </Button>

            {/* Hidden file input for photo capture */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
              aria-hidden="true"
            />

            {/* Camera button for direct photo capture */}
            <Button
              variant="default"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid="button-capture-photo"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {selectedClaimId === 'all' ? 'Take Photo' : 'Add Photo'}
            </Button>

            <Link href="/voice-sketch">
              <Button variant="outline" size="sm" data-testid="button-start-sketch">
                <Mic className="h-4 w-4 mr-2" />
                Start Sketch
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading photos...</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Photos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-photos">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">With Damage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive" data-testid="text-damage-photos">{stats.withDamage}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Uncategorized</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-500" data-testid="text-uncategorized-photos">{uncategorizedCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Quality</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-avg-quality">{stats.avgQuality}/10</div>
                </CardContent>
              </Card>
            </div>

            {filteredPhotos.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <Camera className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="font-medium text-lg mb-2">No Photos Yet</h3>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Take photos directly using the camera button above, or start a voice sketch session
                      for guided inspection. Photos are automatically analyzed by AI for damage detection and quality.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        data-testid="button-take-photo-empty"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Take Photo
                      </Button>
                      <Link href="/voice-sketch">
                        <Button variant="outline" data-testid="button-start-voice-sketch">
                          <Mic className="h-4 w-4 mr-2" />
                          Start Voice Sketch
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : selectedClaimId === 'all' && Object.keys(groupedByClaim).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedByClaim).map(([claimLabel, claimPhotos]) => (
                  <Card key={claimLabel}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        {claimLabel === 'Uncategorized' ? (
                          <FolderOpen className="h-4 w-4 text-orange-500" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
                        {claimLabel === 'Uncategorized' ? 'Uncategorized Photos' : `Claim: ${claimLabel}`}
                        <span className="text-sm font-normal text-muted-foreground ml-auto">
                          {claimPhotos.length} photo(s)
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PhotoAlbum
                        photos={claimPhotos}
                        onDeletePhoto={handleDeletePhoto}
                        onUpdatePhoto={handleUpdatePhoto}
                        onReanalyzePhoto={handleReanalyzePhoto}
                        isReanalyzing={reanalyzeMutation.isPending}
                        claims={claims}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filterMode === 'by-structure' ? (
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
                      <PhotoAlbum
                        photos={structurePhotos}
                        onDeletePhoto={handleDeletePhoto}
                        onUpdatePhoto={handleUpdatePhoto}
                        onReanalyzePhoto={handleReanalyzePhoto}
                        isReanalyzing={reanalyzeMutation.isPending}
                        claims={claims}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <PhotoAlbum
                    photos={filteredPhotos}
                    onDeletePhoto={handleDeletePhoto}
                    onUpdatePhoto={handleUpdatePhoto}
                    onReanalyzePhoto={handleReanalyzePhoto}
                    isReanalyzing={reanalyzeMutation.isPending}
                    claims={claims}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
