import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  FolderOpen,
  Link2,
  Unlink,
  Loader2,
  RefreshCw,
  AlertOctagon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SketchPhoto, PhotoAIAnalysis, AnalysisStatus } from '../types/geometry';
import { getPhoto, type ClaimPhoto } from '@/lib/api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Claim {
  id: string;
  claimNumber?: string | null;
}

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
    uploadedBy: cp.uploadedBy,
    claimId: cp.claimId,
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

interface PhotoAlbumProps {
  photos: ExtendedSketchPhoto[];
  className?: string;
  onDeletePhoto?: (photoId: string) => void;
  onUpdatePhoto?: (photoId: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null }) => void;
  onReanalyzePhoto?: (photoId: string) => void;
  isReanalyzing?: boolean;
  claims?: Claim[];
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

function getAnalysisStatusInfo(status: AnalysisStatus | null | undefined): {
  icon: React.ReactNode;
  label: string;
  className: string;
  isProcessing: boolean;
} {
  switch (status) {
    case 'pending':
    case 'analyzing':
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        label: status === 'pending' ? 'Waiting for analysis' : 'Analyzing photo...',
        className: 'bg-blue-500/90 text-white',
        isProcessing: true,
      };
    case 'failed':
      return {
        icon: <XCircle className="h-4 w-4" />,
        label: 'Analysis failed',
        className: 'bg-red-500/90 text-white',
        isProcessing: false,
      };
    case 'concerns':
      return {
        icon: <AlertOctagon className="h-4 w-4" />,
        label: 'Analysis flagged concerns',
        className: 'bg-orange-500/90 text-white',
        isProcessing: false,
      };
    case 'completed':
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        label: 'Analysis complete',
        className: 'bg-green-500/90 text-white',
        isProcessing: false,
      };
    default:
      return {
        icon: null,
        label: '',
        className: '',
        isProcessing: false,
      };
  }
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
  const statusInfo = getAnalysisStatusInfo(photo.analysisStatus);
  const showStatusBadge = photo.analysisStatus && photo.analysisStatus !== 'completed';

  return (
    <TooltipProvider>
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
              className={cn(
                "w-full h-full object-cover",
                statusInfo.isProcessing && "opacity-70"
              )}
            />
          </div>
        ) : (
          <div className="aspect-square bg-muted-foreground/10 flex items-center justify-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Processing overlay */}
        {statusInfo.isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="bg-white/90 dark:bg-gray-900/90 rounded-full p-3 shadow-lg">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-xs font-medium truncate">{photo.label}</p>
          {analysis && photo.analysisStatus === 'completed' && (
            <div className="flex items-center gap-1 mt-1">
              {getQualityIcon(qualityScore)}
              <span className={cn('text-xs', getQualityColor(qualityScore))}>
                {qualityScore}/10
              </span>
            </div>
          )}
          {statusInfo.isProcessing && (
            <p className="text-white/80 text-[10px] mt-1">Analyzing...</p>
          )}
        </div>

        {/* Analysis status badge (top-right) */}
        {showStatusBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute top-2 right-2 flex items-center gap-1 rounded-full px-2 py-1',
                  statusInfo.className
                )}
              >
                {statusInfo.icon}
                <span className="text-[10px] font-medium">
                  {photo.analysisStatus === 'pending' || photo.analysisStatus === 'analyzing'
                    ? 'Analyzing'
                    : photo.analysisStatus === 'concerns'
                    ? 'Review'
                    : 'Failed'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{statusInfo.label}</p>
              {photo.analysisError && (
                <p className="text-xs text-muted-foreground mt-1">{photo.analysisError}</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Damage badge - only show if completed and has damage */}
        {hasDamage && photo.analysisStatus === 'completed' && !showStatusBadge && (
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
            className="absolute top-2 left-2 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete photo: ${photo.label}`}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

interface PhotoDetailDialogProps {
  photo: ExtendedSketchPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (updates: { label?: string; hierarchyPath?: string; claimId?: string | null }) => void;
  onReanalyze?: (photoId: string) => void;
  isReanalyzing?: boolean;
  claims?: Claim[];
}

function PhotoDetailDialog({ photo, open, onOpenChange, onUpdate, onReanalyze, isReanalyzing, claims = [] }: PhotoDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editHierarchy, setEditHierarchy] = useState('');
  const [editClaimId, setEditClaimId] = useState<string | null>(null);

  // Fetch latest photo data when dialog opens
  const { data: latestPhoto, isLoading: isLoadingPhoto } = useQuery({
    queryKey: ['photo', photo?.id],
    queryFn: () => {
      if (!photo?.id) throw new Error('No photo ID');
      return getPhoto(photo.id);
    },
    enabled: open && !!photo?.id,
    refetchInterval: (query) => {
      // Stop polling after 5 minutes to prevent infinite polling
      const startTime = query.state.dataUpdatedAt || Date.now();
      const elapsed = Date.now() - startTime;
      if (elapsed > 5 * 60 * 1000) {
        return false;
      }
      // Poll every 2 seconds if analysis is pending or analyzing
      const photoData = query.state.data;
      if (photoData && (photoData.analysisStatus === 'pending' || photoData.analysisStatus === 'analyzing')) {
        return 2000;
      }
      return false;
    },
  });

  // Use latest photo data if available, otherwise fall back to passed photo
  const displayPhoto = latestPhoto ? claimPhotoToSketchPhoto(latestPhoto) : photo;

  React.useEffect(() => {
    if (displayPhoto) {
      setEditLabel(displayPhoto.label || '');
      setEditHierarchy(displayPhoto.hierarchyPath || '');
      setEditClaimId(displayPhoto.claimId || null);
    }
  }, [displayPhoto]);

  if (!photo || !displayPhoto) return null;

  const analysis = displayPhoto.aiAnalysis;
  const qualityScore = analysis?.quality?.score ?? 5;
  const photoUrl = displayPhoto.storageUrl || displayPhoto.localUri;
  const hasDamage = analysis?.content?.damageDetected;
  const currentClaim = claims.find(c => c.id === displayPhoto.claimId);
  const statusInfo = getAnalysisStatusInfo(displayPhoto.analysisStatus);
  const canReanalyze = displayPhoto.analysisStatus === 'failed' || displayPhoto.analysisStatus === 'concerns' || displayPhoto.analysisStatus === 'completed';

  const handleSave = () => {
    if (onUpdate) {
      const updates: { label?: string; hierarchyPath?: string; claimId?: string | null } = {
        label: editLabel,
        hierarchyPath: editHierarchy,
      };
      // Only include claimId if it changed
      if (editClaimId !== displayPhoto.claimId) {
        updates.claimId = editClaimId;
      }
      onUpdate(updates);
    }
    setIsEditing(false);
  };

  const handleAssignToClaim = (claimId: string | null) => {
    if (onUpdate) {
      onUpdate({ claimId });
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[calc(100vh-2rem)] overflow-y-auto">
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
                {displayPhoto.label}
                {onUpdate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-photo"
                    aria-label="Edit photo details"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                  </Button>
                )}
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4">
          {isLoadingPhoto && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading photo details...</span>
            </div>
          )}
          
          <div className="aspect-video bg-muted rounded-lg overflow-hidden max-h-[40vh] sm:max-h-[50vh]">
            {photoUrl ? (
              <img 
                src={photoUrl} 
                alt={displayPhoto.label} 
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
            <div className="space-y-2">
              {/* Photo Metadata Section */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-1.5">
                  <Camera className="h-4 w-4" />
                  Photo Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {/* Location in structure */}
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-muted-foreground">Location:</span>
                      <p className="font-medium">{displayPhoto.hierarchyPath || 'Not specified'}</p>
                    </div>
                  </div>

                  {/* Uploaded by */}
                  {displayPhoto.uploadedBy && (
                    <div className="flex items-start gap-2">
                      <svg className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <div>
                        <span className="text-muted-foreground">Uploaded by:</span>
                        <p className="font-medium" data-testid="text-uploaded-by">{displayPhoto.uploadedBy}</p>
                      </div>
                    </div>
                  )}

                  {/* GPS Coordinates */}
                  {(displayPhoto.latitude != null && displayPhoto.longitude != null) && (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted-foreground">GPS Coordinates:</span>
                        <p className="font-medium">
                          <a
                            href={`https://www.google.com/maps?q=${displayPhoto.latitude},${displayPhoto.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            data-testid="link-gps-coordinates"
                          >
                            {displayPhoto.latitude.toFixed(6)}, {displayPhoto.longitude.toFixed(6)}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Geo Address */}
                  {displayPhoto.geoAddress && (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Home className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted-foreground">Address:</span>
                        <p className="font-medium" data-testid="text-geo-address">{displayPhoto.geoAddress}</p>
                      </div>
                    </div>
                  )}

                  {/* Captured At */}
                  {displayPhoto.capturedAt && (
                    <div className="flex items-start gap-2">
                      <svg className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <span className="text-muted-foreground">Captured:</span>
                        <p className="font-medium">{new Date(displayPhoto.capturedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Claim Assignment Section */}
              {claims.length > 0 && onUpdate && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-sm text-muted-foreground font-medium">Claim:</span>
                  {currentClaim ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {currentClaim.claimNumber || currentClaim.id.slice(0, 8)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleAssignToClaim(null)}
                        data-testid="button-unassign-claim"
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        Unassign
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1 text-orange-500 border-orange-500">
                        <FolderOpen className="h-3 w-3" />
                        Uncategorized
                      </Badge>
                      <Select onValueChange={(value) => handleAssignToClaim(value)}>
                        <SelectTrigger className="h-7 w-[180px] text-xs" data-testid="select-assign-claim">
                          <SelectValue placeholder="Assign to claim..." />
                        </SelectTrigger>
                        <SelectContent>
                          {claims.map((claim) => (
                            <SelectItem key={claim.id} value={claim.id}>
                              {claim.claimNumber || claim.id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Status Section */}
              {displayPhoto.analysisStatus && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-medium">Analysis:</span>
                    <div className={cn(
                      'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      statusInfo.className
                    )}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </div>
                  </div>
                  {canReanalyze && onReanalyze && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReanalyze(displayPhoto.id)}
                      disabled={isReanalyzing}
                      data-testid="button-reanalyze-photo"
                    >
                      {isReanalyzing ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Re-analyze
                    </Button>
                  )}
                </div>
              )}

              {/* Analysis Error/Concerns */}
              {displayPhoto.analysisError && (displayPhoto.analysisStatus === 'failed' || displayPhoto.analysisStatus === 'concerns') && (
                <div className={cn(
                  'p-3 rounded-lg text-sm',
                  photo.analysisStatus === 'failed' ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800' : 'bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800'
                )}>
                  <div className="flex items-start gap-2">
                    {photo.analysisStatus === 'failed' ? (
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertOctagon className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={cn('font-medium', displayPhoto.analysisStatus === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300')}>
                        {displayPhoto.analysisStatus === 'failed' ? 'Analysis Failed' : 'Concerns Identified'}
                      </p>
                      <p className="text-muted-foreground mt-1">{displayPhoto.analysisError}</p>
                    </div>
                  </div>
                </div>
              )}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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

export function PhotoAlbum({ photos, className, onDeletePhoto, onUpdatePhoto, onReanalyzePhoto, isReanalyzing, claims = [] }: PhotoAlbumProps) {
  const queryClient = useQueryClient();
  const [selectedPhoto, setSelectedPhoto] = useState<ExtendedSketchPhoto | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const groupedPhotos = React.useMemo(() => {
    const groups: Record<string, ExtendedSketchPhoto[]> = {};
    
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
          // Refetch photo data after update
          queryClient.invalidateQueries({ queryKey: ['photo', selectedPhoto.id] });
          setSelectedPhoto(null);
        } : undefined}
        onReanalyze={onReanalyzePhoto}
        isReanalyzing={isReanalyzing}
        claims={claims}
      />
    </div>
  );
}
