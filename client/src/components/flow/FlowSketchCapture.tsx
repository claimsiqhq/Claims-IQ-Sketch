/**
 * Flow-Aware Sketch Capture Component
 * 
 * Wraps the existing sketch functionality but automatically links
 * created rooms and damage zones to the current flow movement.
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Square, AlertTriangle } from 'lucide-react';
import { getMovementSketchEvidence, saveClaimRooms, type ClaimRoom, type ClaimDamageZone } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FlowSketchCaptureProps {
  flowInstanceId: string;
  movementId: string;
  claimId: string;
  movementName: string;
  onZoneCreated?: (zone: ClaimRoom) => void;
  onDamageAdded?: (marker: ClaimDamageZone) => void;
  onClose?: () => void;
}

export function FlowSketchCapture({
  flowInstanceId,
  movementId,
  claimId,
  movementName,
  onZoneCreated,
  onDamageAdded,
  onClose
}: FlowSketchCaptureProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [existingEvidence, setExistingEvidence] = useState<{ zones: ClaimRoom[]; damageMarkers: ClaimDamageZone[] }>({ 
    zones: [], 
    damageMarkers: [] 
  });
  
  // Load existing sketch evidence for this movement
  const {
    data: sketchEvidence,
    isLoading: isLoadingEvidence,
    refetch: refetchEvidence
  } = useQuery({
    queryKey: ['movementSketchEvidence', flowInstanceId, movementId],
    queryFn: () => getMovementSketchEvidence(flowInstanceId, movementId),
    enabled: !!flowInstanceId && !!movementId,
  });
  
  useEffect(() => {
    if (sketchEvidence) {
      setExistingEvidence(sketchEvidence);
    }
  }, [sketchEvidence]);
  
  // Navigate to voice sketch page with flow context
  const handleOpenSketch = () => {
    // Navigate to voice sketch page with flow context in URL params
    setLocation(`/voice-sketch/${claimId}?flowInstanceId=${flowInstanceId}&movementId=${encodeURIComponent(movementId)}`);
  };
  
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sketch Documentation</h2>
          <p className="text-sm text-muted-foreground">For: {movementName}</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Instructions */}
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Create rooms and mark damage areas. All sketch items will be automatically linked to this movement.
            </p>
            <Button onClick={handleOpenSketch} className="w-full">
              <Square className="h-4 w-4 mr-2" />
              Open Sketch Canvas
            </Button>
          </CardContent>
        </Card>
        
        {/* Evidence Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Evidence for this movement</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingEvidence ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-2">
                {existingEvidence.zones.length === 0 && existingEvidence.damageMarkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sketch evidence yet</p>
                ) : (
                  <>
                    {existingEvidence.zones.map(zone => (
                      <div key={zone.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                        <Square className="h-4 w-4 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{zone.name}</p>
                          {zone.roomType && (
                            <p className="text-xs text-muted-foreground">{zone.roomType}</p>
                          )}
                        </div>
                        {zone.widthFt && zone.lengthFt && (
                          <Badge variant="outline" className="text-xs">
                            {zone.widthFt}' × {zone.lengthFt}'
                          </Badge>
                        )}
                      </div>
                    ))}
                    {existingEvidence.damageMarkers.map(marker => (
                      <div key={marker.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{marker.damageType}</p>
                          {marker.severity && (
                            <p className="text-xs text-muted-foreground">Severity: {marker.severity}</p>
                          )}
                        </div>
                        {marker.severity && (
                          <Badge variant="outline" className="text-xs">
                            {marker.severity}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
