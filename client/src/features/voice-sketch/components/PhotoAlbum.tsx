import React, { useState } from 'react';
import { 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Building2,
  Home,
  ChevronDown,
  ChevronRight,
  Trash2,
  Pencil,
  Save,
  X,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { SketchPhoto, PhotoAIAnalysis } from '../types/geometry';

interface PhotoAlbumProps {
  photos: SketchPhoto[];
  className?: string;
  onDeletePhoto?: (photoId: string) => void;
  onUpdatePhoto?: (photoId: string, updates: { label?: string; hierarchyPath?: string }) => void;
}

function getQualityColor(score: number): string {
  if (score >= 7) return 'text-green-500';
  if (score >= 5) return 'text-yellow-500';
  return 'text-red-500';
}

function getQualityIcon(score: number) {
  if (score >= 7) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (score >= 5) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function getQualityLabel(score: number): string {
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Fair';
  return 'Poor';
}

interface PhotoCardProps {
  photo: SketchPhoto;
  onClick?: () => void;
  onDelete?: () => void;
}

function PhotoCard({ photo, onClick, onDelete }: PhotoCardProps) {
  const analysis = photo.aiAnalysis;
  const qualityScore = analysis?.quality?.score ?? 5;
  const photoUrl = photo.storageUrl || photo.localUri;
  const hasDamage = analysis?.content?.damageDetected;
  
  return (
    <div 
      className="relative group bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
      onClick={onClick}
      data-testid={`photo-card-${photo.id}`}
    >
      {photoUrl ? (
        <div className="aspect-square bg-muted-foreground/10 flex items-center justify-center">
          <img 
            src={photoUrl} 
            alt={photo.label} 
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-square bg-muted-foreground/10 flex items-center justify-center">
          <Camera className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-xs font-medium truncate">{photo.label}</p>
        {analysis && (
          <div className="flex items-center gap-1 mt-1">
            {getQualityIcon(qualityScore)}
            <span className={cn('text-xs', getQualityColor(qualityScore))}>
              {qualityScore}/10
            </span>
          </div>
        )}
      </div>
      
      {hasDamage && (
        <Badge 
          variant="destructive" 
          className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5"
        >
          Damage
        </Badge>
      )}
      
      {onDelete && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 left-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

interface PhotoDetailDialogProps {
  photo: SketchPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (updates: { label?: string; hierarchyPath?: string }) => void;
}

function PhotoDetailDialog({ photo, open, onOpenChange, onUpdate }: PhotoDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editHierarchy, setEditHierarchy] = useState('');

  React.useEffect(() => {
    if (photo) {
      setEditLabel(photo.label || '');
      setEditHierarchy(photo.hierarchyPath || '');
    }
  }, [photo]);

  if (!photo) return null;
  
  const analysis = photo.aiAnalysis;
  const qualityScore = analysis?.quality?.score ?? 5;
  const photoUrl = photo.storageUrl || photo.localUri;
  const hasDamage = analysis?.content?.damageDetected;

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({ label: editLabel, hierarchyPath: editHierarchy });
    }
    setIsEditing(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {isEditing ? (
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="h-8 text-lg font-semibold"
                placeholder="Photo label"
                data-testid="input-edit-label"
              />
            ) : (
              <>
                {photo.label}
                {onUpdate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-photo"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4">
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            {photoUrl ? (
              <img 
                src={photoUrl} 
                alt={photo.label} 
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          
          {isEditing ? (
            <div className="space-y-2">
              <Label htmlFor="hierarchy-path">Location in Structure</Label>
              <Input
                id="hierarchy-path"
                value={editHierarchy}
                onChange={(e) => setEditHierarchy(e.target.value)}
                placeholder="e.g., Main House > Living Room"
                data-testid="input-edit-hierarchy"
              />
              <p className="text-xs text-muted-foreground">
                Use " &gt; " to separate levels (Structure &gt; Room &gt; Area)
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Location:</span> {photo.hierarchyPath}
            </div>
          )}

          {isEditing && (
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} data-testid="button-save-photo">
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </Button>
            </div>
          )}
          
          {analysis && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {getQualityIcon(qualityScore)}
                  <span className={cn('font-medium', getQualityColor(qualityScore))}>
                    Quality: {getQualityLabel(qualityScore)} ({qualityScore}/10)
                  </span>
                </div>
                
                {hasDamage && (
                  <Badge variant="destructive">Damage Detected</Badge>
                )}
              </div>
              
              {analysis.content?.description && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{analysis.content.description}</p>
                </div>
              )}
              
              {analysis.content?.damageTypes && analysis.content.damageTypes.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Damage Types</h4>
                  <div className="flex flex-wrap gap-1">
                    {analysis.content.damageTypes.map((type: string, i: number) => (
                      <Badge key={i} variant="destructive">{type}</Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {analysis.content?.materials && analysis.content.materials.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Materials</h4>
                  <div className="flex flex-wrap gap-1">
                    {analysis.content.materials.map((material: string, i: number) => (
                      <Badge key={i} variant="outline">{material}</Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {analysis.quality?.issues && analysis.quality.issues.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Quality Issues</h4>
                  <div className="flex flex-wrap gap-1">
                    {analysis.quality.issues.map((issue: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-yellow-600">{issue}</Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {analysis.quality?.suggestions && analysis.quality.suggestions.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Suggestions</h4>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    {analysis.quality.suggestions.map((suggestion: string, i: number) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {analysis.metadata && (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-muted rounded">
                    <span className="text-muted-foreground">Lighting:</span>
                    <p className="font-medium capitalize">{analysis.metadata.lighting || 'N/A'}</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <span className="text-muted-foreground">Focus:</span>
                    <p className="font-medium capitalize">{analysis.metadata.focus || 'N/A'}</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <span className="text-muted-foreground">Angle:</span>
                    <p className="font-medium capitalize">{analysis.metadata.angle || 'N/A'}</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <span className="text-muted-foreground">Coverage:</span>
                    <p className="font-medium capitalize">{analysis.metadata.coverage || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PhotoAlbum({ photos, className, onDeletePhoto, onUpdatePhoto }: PhotoAlbumProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<SketchPhoto | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  const groupedPhotos = React.useMemo(() => {
    const groups: Record<string, SketchPhoto[]> = {};
    
    for (const photo of photos) {
      const key = photo.hierarchyPath || 'Exterior';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(photo);
    }
    
    return groups;
  }, [photos]);
  
  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };
  
  if (photos.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <Camera className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-1">No Photos Yet</h3>
        <p className="text-sm text-muted-foreground">
          Use the camera button to capture photos during your inspection
        </p>
      </div>
    );
  }
  
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Photo Album ({photos.length})
        </h3>
      </div>
      
      <div className="space-y-2">
        {Object.entries(groupedPhotos).map(([path, groupPhotos]) => {
          const isExpanded = expandedSections[path] !== false;
          const hasStructure = path.includes('>');
          
          return (
            <Collapsible
              key={path}
              open={isExpanded}
              onOpenChange={() => toggleSection(path)}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 h-auto py-2"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {hasStructure ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Home className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{path}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {groupPhotos.length}
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2">
                  {groupPhotos.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      onClick={() => setSelectedPhoto(photo)}
                      onDelete={onDeletePhoto ? () => onDeletePhoto(photo.id) : undefined}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
      
      <PhotoDetailDialog
        photo={selectedPhoto}
        open={!!selectedPhoto}
        onOpenChange={(open) => !open && setSelectedPhoto(null)}
        onUpdate={onUpdatePhoto && selectedPhoto ? (updates) => {
          onUpdatePhoto(selectedPhoto.id, updates);
          setSelectedPhoto(null);
        } : undefined}
      />
    </div>
  );
}
