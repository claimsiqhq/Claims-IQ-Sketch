/**
 * Evidence Grid Component
 *
 * Displays captured photos and voice notes in a grid layout.
 * Supports:
 * - Photo thumbnails with zoom preview
 * - Voice note indicators
 * - Evidence type badges
 * - Remove/delete functionality
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Camera,
  Mic,
  FileText,
  Ruler,
  Trash2,
  ZoomIn,
  X,
  Play,
  Pause,
  Download,
  Square,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MovementEvidence } from "@/lib/api";

interface EvidenceItem {
  id: string;
  type: 'photo' | 'audio' | 'measurement' | 'note' | 'sketch_zone' | 'damage_marker';
  url?: string;
  thumbnailUrl?: string;
  label?: string;
  data?: any;
  createdAt?: string;
}

interface EvidenceGridProps {
  items: EvidenceItem[];
  onRemove?: (id: string) => void;
  editable?: boolean;
  columns?: 2 | 3 | 4;
  className?: string;
}

const TYPE_ICONS = {
  photo: Camera,
  audio: Mic,
  measurement: Ruler,
  note: FileText,
  sketch_zone: Square,
  damage_marker: AlertTriangle,
};

const TYPE_COLORS = {
  photo: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  audio: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  measurement: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  note: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  sketch_zone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  damage_marker: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function EvidenceGrid({
  items,
  onRemove,
  editable = false,
  columns = 3,
  className,
}: EvidenceGridProps) {
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  if (items.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg",
        className
      )}>
        <Camera className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No evidence captured yet</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn(
        "grid gap-3",
        gridCols[columns],
        className
      )}>
        {items.map((item) => (
          <EvidenceCard
            key={item.id}
            item={item}
            onPreview={() => setPreviewItem(item)}
            onRemove={editable && onRemove ? () => onRemove(item.id) : undefined}
          />
        ))}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewItem && (
                <>
                  {TYPE_ICONS[previewItem.type] && (
                    <span className={cn("p-1 rounded", TYPE_COLORS[previewItem.type])}>
                      {(() => {
                        const Icon = TYPE_ICONS[previewItem.type];
                        return <Icon className="h-4 w-4" />;
                      })()}
                    </span>
                  )}
                  {previewItem.label || `${previewItem.type} Evidence`}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {previewItem?.type === 'photo' && previewItem.url && (
              <div className="relative">
                <img
                  src={previewItem.url}
                  alt={previewItem.label || "Evidence photo"}
                  className="w-full h-auto max-h-[60vh] object-contain rounded-lg"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-4 right-4"
                  onClick={() => window.open(previewItem.url, '_blank')}
                  aria-label="Download evidence photo"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}

            {previewItem?.type === 'audio' && previewItem.url && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-24 h-24 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                  <Mic className="h-12 w-12 text-purple-600 dark:text-purple-400" />
                </div>
                <audio controls className="w-full max-w-md">
                  <source src={previewItem.url} />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {previewItem?.type === 'measurement' && previewItem.data && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Value</div>
                      <div className="text-2xl font-bold">
                        {previewItem.data.value} {previewItem.data.unit}
                      </div>
                    </CardContent>
                  </Card>
                  {previewItem.data.location && (
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Location</div>
                        <div className="text-lg font-medium">
                          {previewItem.data.location}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {previewItem?.type === 'note' && previewItem.data && (
              <ScrollArea className="max-h-[400px]">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap">{previewItem.data.text || previewItem.data.content}</p>
                </div>
              </ScrollArea>
            )}

            {previewItem?.type === 'sketch_zone' && previewItem.data && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Room Name</div>
                      <div className="text-lg font-medium">
                        {previewItem.data.name || previewItem.label || 'Unnamed Room'}
                      </div>
                    </CardContent>
                  </Card>
                  {previewItem.data.roomType && (
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Room Type</div>
                        <div className="text-lg font-medium capitalize">
                          {previewItem.data.roomType}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
                {(previewItem.data.widthFt || previewItem.data.lengthFt) && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Dimensions</div>
                      <div className="text-xl font-bold">
                        {previewItem.data.widthFt}' × {previewItem.data.lengthFt}'
                      </div>
                    </CardContent>
                  </Card>
                )}
                {previewItem.data.polygon && Array.isArray(previewItem.data.polygon) && previewItem.data.polygon.length > 0 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Shape</div>
                      <div className="text-sm">
                        {previewItem.data.polygon.length} vertices (custom polygon)
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {previewItem?.type === 'damage_marker' && previewItem.data && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Damage Type</div>
                      <div className="text-lg font-medium capitalize">
                        {previewItem.data.damageType || 'Unknown'}
                      </div>
                    </CardContent>
                  </Card>
                  {previewItem.data.severity && (
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Severity</div>
                        <div className="text-lg font-medium capitalize">
                          {previewItem.data.severity}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
                {previewItem.data.category && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">IICRC Category</div>
                      <div className="text-xl font-bold">
                        Category {previewItem.data.category}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {previewItem.data.affectedWalls && Array.isArray(previewItem.data.affectedWalls) && previewItem.data.affectedWalls.length > 0 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Affected Walls</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {previewItem.data.affectedWalls.map((wall: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="capitalize">
                            {wall}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {previewItem.data.polygon && Array.isArray(previewItem.data.polygon) && previewItem.data.polygon.length > 0 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Shape</div>
                      <div className="text-sm">
                        {previewItem.data.polygon.length} vertices (custom polygon)
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface EvidenceCardProps {
  item: EvidenceItem;
  onPreview: () => void;
  onRemove?: () => void;
}

function getPhotoAnalysisBadge(status: string | undefined) {
  if (!status) return null;
  switch (status) {
    case 'pending':
    case 'analyzing':
      return { icon: Loader2, label: 'Analyzing', className: 'bg-blue-500/90 text-white animate-pulse' };
    case 'concerns':
      return { icon: AlertOctagon, label: 'Needs rework', className: 'bg-amber-500/90 text-white' };
    case 'failed':
      return { icon: XCircle, label: 'Analysis failed', className: 'bg-red-500/90 text-white' };
    case 'completed':
      return { icon: CheckCircle2, label: 'OK', className: 'bg-green-500/90 text-white' };
    default:
      return null;
  }
}

function EvidenceCard({ item, onPreview, onRemove }: EvidenceCardProps) {
  const Icon = TYPE_ICONS[item.type];
  const photoAnalysis = item.type === 'photo' ? getPhotoAnalysisBadge(item.data?.analysisStatus) : null;

  return (
    <Card className="overflow-hidden group relative">
      {/* Remove Button */}
      {onRemove && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}

      {/* Photo analysis status badge (workflow: "needs rework" visible without leaving step) */}
      {item.type === 'photo' && photoAnalysis && (
        <div
          className={cn(
            'absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            photoAnalysis.className
          )}
        >
          {photoAnalysis.label === 'Analyzing' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <photoAnalysis.icon className="h-3 w-3" />
          )}
          <span>{photoAnalysis.label}</span>
        </div>
      )}

      <div
        className="cursor-pointer"
        onClick={onPreview}
      >
        {item.type === 'photo' && (item.thumbnailUrl || item.url) ? (
          <div className="relative aspect-square">
            <img
              src={item.thumbnailUrl || item.url}
              alt={item.label || "Evidence photo"}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ) : (
          <div className={cn(
            "aspect-square flex flex-col items-center justify-center gap-2",
            TYPE_COLORS[item.type]
          )}>
            <Icon className="h-8 w-8" />
            <span className="text-xs font-medium capitalize">{item.type}</span>
          </div>
        )}

        {/* Label */}
        {item.label && (
          <CardContent className="p-2">
            <p className="text-xs text-muted-foreground truncate">{item.label}</p>
          </CardContent>
        )}
      </div>
    </Card>
  );
}

/**
 * Compact evidence indicator for showing count of evidence types
 */
interface EvidenceIndicatorProps {
  photos?: number;
  audio?: number;
  measurements?: number;
  notes?: number;
  className?: string;
}

export function EvidenceIndicator({
  photos = 0,
  audio = 0,
  measurements = 0,
  notes = 0,
  className,
}: EvidenceIndicatorProps) {
  const items = [
    { type: 'photo', count: photos, Icon: Camera },
    { type: 'audio', count: audio, Icon: Mic },
    { type: 'measurement', count: measurements, Icon: Ruler },
    { type: 'note', count: notes, Icon: FileText },
  ].filter(item => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {items.map(({ type, count, Icon }) => (
        <Badge
          key={type}
          variant="secondary"
          className={cn("text-xs", TYPE_COLORS[type as keyof typeof TYPE_COLORS])}
        >
          <Icon className="h-3 w-3 mr-1" />
          {count}
        </Badge>
      ))}
    </div>
  );
}

export default EvidenceGrid;
