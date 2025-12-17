import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { Camera, Filter, Building2, Home, Mic, ArrowRight } from 'lucide-react';
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
import { useGeometryEngine } from '@/features/voice-sketch/services/geometry-engine';
import type { SketchPhoto } from '@/features/voice-sketch/types/geometry';

type FilterMode = 'all' | 'by-structure';

export default function PhotosPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  
  const { photos } = useGeometryEngine();

  const groupedByStructure = useMemo(() => {
    const groups: Record<string, SketchPhoto[]> = {};
    for (const photo of photos) {
      const path = photo.hierarchyPath || 'Unassigned';
      const structure = path.split(' > ')[0] || 'Exterior';
      if (!groups[structure]) {
        groups[structure] = [];
      }
      groups[structure].push(photo);
    }
    return groups;
  }, [photos]);

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
              Photos captured during your current inspection session
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-mode">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Photos</SelectItem>
                <SelectItem value="by-structure">By Structure</SelectItem>
              </SelectContent>
            </Select>
            
            <Link href="/voice-sketch">
              <Button variant="outline" size="sm" data-testid="button-start-sketch">
                <Mic className="h-4 w-4 mr-2" />
                Start Sketch
              </Button>
            </Link>
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

        {photos.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Camera className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">No Photos Yet</h3>
                <p className="text-muted-foreground mb-4 max-w-md">
                  Start a voice sketch session to capture photos during your inspection.
                  Photos are automatically analyzed by AI for damage detection and quality.
                </p>
                <Link href="/voice-sketch">
                  <Button data-testid="button-start-voice-sketch">
                    <Mic className="h-4 w-4 mr-2" />
                    Start Voice Sketch
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
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
                  <PhotoAlbum photos={structurePhotos} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <PhotoAlbum photos={photos} />
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
