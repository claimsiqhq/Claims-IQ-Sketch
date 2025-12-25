/**
 * Photo Capture Component
 *
 * Mobile-first photo capture with:
 * - Native camera integration
 * - Multiple photo capture
 * - Photo preview and deletion
 * - Annotation support (planned)
 * - Compression for upload efficiency
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Camera,
  ImagePlus,
  X,
  Trash2,
  Check,
  RotateCcw,
  ZoomIn,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  file?: File;
  timestamp: Date;
  label?: string;
}

interface PhotoCaptureProps {
  label?: string;
  description?: string;
  required?: boolean;
  minCount?: number;
  maxCount?: number;
  photos: CapturedPhoto[];
  onPhotosChange: (photos: CapturedPhoto[]) => void;
  className?: string;
  disabled?: boolean;
}

export function PhotoCapture({
  label = "Photos",
  description,
  required = false,
  minCount = 0,
  maxCount = 10,
  photos,
  onPhotosChange,
  className,
  disabled = false,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate unique ID
  const generateId = () => `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Compress image
  const compressImage = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Calculate new dimensions (max 1920px on longest side)
          const maxDimension = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDimension) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }

          canvas.width = width;
          canvas.height = height;

          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setIsCapturing(true);

    try {
      const newPhotos: CapturedPhoto[] = [];

      for (let i = 0; i < files.length; i++) {
        if (photos.length + newPhotos.length >= maxCount) {
          setError(`Maximum ${maxCount} photos allowed`);
          break;
        }

        const file = files[i];
        if (!file.type.startsWith('image/')) {
          continue;
        }

        const dataUrl = await compressImage(file);
        newPhotos.push({
          id: generateId(),
          dataUrl,
          file,
          timestamp: new Date(),
        });
      }

      if (newPhotos.length > 0) {
        onPhotosChange([...photos, ...newPhotos]);
      }
    } catch (err) {
      setError('Failed to process photos');
      console.error('Photo capture error:', err);
    } finally {
      setIsCapturing(false);
      // Reset input for re-selection
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [photos, maxCount, onPhotosChange, compressImage]);

  // Open camera
  const openCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Delete photo
  const deletePhoto = useCallback((photoId: string) => {
    onPhotosChange(photos.filter(p => p.id !== photoId));
    if (previewPhoto?.id === photoId) {
      setPreviewPhoto(null);
    }
  }, [photos, previewPhoto, onPhotosChange]);

  // Check if requirements met
  const isSatisfied = photos.length >= minCount;
  const canAddMore = photos.length < maxCount;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          {required && <Badge variant="destructive" className="text-xs">Required</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {minCount > 0 && (
            <Badge
              variant={isSatisfied ? "secondary" : "outline"}
              className={cn("text-xs", !isSatisfied && "border-amber-500 text-amber-600")}
            >
              {photos.length}/{minCount} min
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {photos.length}/{maxCount}
          </Badge>
        </div>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || !canAddMore}
      />

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden border bg-muted group"
            >
              <img
                src={photo.dataUrl}
                alt="Captured"
                className="w-full h-full object-cover"
                onClick={() => setPreviewPhoto(photo)}
              />
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePhoto(photo.id);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
              {/* Zoom hint */}
              <div className="absolute bottom-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="h-3 w-3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Capture Buttons */}
      <div className="flex gap-2">
        <Button
          variant={photos.length === 0 ? "default" : "outline"}
          className="flex-1"
          onClick={openCamera}
          disabled={disabled || !canAddMore || isCapturing}
        >
          {isCapturing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              {photos.length === 0 ? "Take Photo" : "Add More"}
            </>
          )}
        </Button>

        {/* Gallery picker for additional photos */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (fileInputRef.current) {
              // Remove capture attribute for gallery access
              fileInputRef.current.removeAttribute('capture');
              fileInputRef.current.click();
              // Re-add capture attribute
              setTimeout(() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute('capture', 'environment');
                }
              }, 100);
            }
          }}
          disabled={disabled || !canAddMore || isCapturing}
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Warning if below minimum */}
      {!isSatisfied && minCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <AlertCircle className="h-3 w-3" />
          At least {minCount} photo{minCount > 1 ? 's' : ''} required
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={previewPhoto.dataUrl}
              alt="Preview"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewPhoto(null);
                }}
              >
                <Check className="h-4 w-4 mr-1" />
                Done
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePhoto(previewPhoto.id);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
          <button
            onClick={() => setPreviewPhoto(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact photo capture for inline use in step cards
 */
interface CompactPhotoCaptureProps {
  photos: CapturedPhoto[];
  onPhotosChange: (photos: CapturedPhoto[]) => void;
  minCount?: number;
  maxCount?: number;
  disabled?: boolean;
}

export function CompactPhotoCapture({
  photos,
  onPhotosChange,
  minCount = 1,
  maxCount = 5,
  disabled = false,
}: CompactPhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const generateId = () => `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsCapturing(true);

    try {
      const file = files[0];
      if (!file.type.startsWith('image/')) return;

      // Simple read without compression for speed
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      if (photos.length < maxCount) {
        onPhotosChange([...photos, {
          id: generateId(),
          dataUrl,
          file,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      setIsCapturing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const deletePhoto = (id: string) => {
    onPhotosChange(photos.filter(p => p.id !== id));
  };

  const isSatisfied = photos.length >= minCount;
  const canAddMore = photos.length < maxCount;

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
        disabled={disabled || !canAddMore}
      />

      {/* Inline photo strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border"
          >
            <img
              src={photo.dataUrl}
              alt="Captured"
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => deletePhoto(photo.id)}
              className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white"
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add button */}
        {canAddMore && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isCapturing}
            className={cn(
              "flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center",
              "hover:border-primary hover:bg-primary/5 transition-colors",
              !isSatisfied && "border-amber-400 bg-amber-50 dark:bg-amber-950",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {isCapturing ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Camera className={cn("h-5 w-5", !isSatisfied ? "text-amber-500" : "text-muted-foreground")} />
            )}
          </button>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          "flex items-center gap-1",
          isSatisfied ? "text-green-600" : "text-amber-600"
        )}>
          {isSatisfied ? (
            <>
              <Check className="h-3 w-3" />
              {photos.length} photo{photos.length !== 1 ? 's' : ''} captured
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" />
              {minCount - photos.length} more needed
            </>
          )}
        </span>
        <span className="text-muted-foreground">
          {photos.length}/{maxCount}
        </span>
      </div>
    </div>
  );
}

export default PhotoCapture;
