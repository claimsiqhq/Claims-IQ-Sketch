// Voice Sketch Page
// Full page component for voice-driven room sketching
// Works standalone or attached to a specific claim

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Mic, AlertCircle, Loader2, FileText } from 'lucide-react';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VoiceSketchController } from './components/VoiceSketchController';
import { useGeometryEngine, geometryEngine } from './services/geometry-engine';
import { getClaim, getClaims, saveClaimHierarchy, getClaimRooms, getClaimPhotos } from '@/lib/api';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RoomGeometry, Structure } from './types/geometry';
import type { ClaimRoom, ClaimDamageZone, ClaimStructure, Claim } from '@/lib/api';

export default function VoiceSketchPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const claimId = params.claimId;
  const authUser = useStore((state) => state.authUser);

  const { rooms, currentRoom, structures, resetSession } = useGeometryEngine();
  const [isSaving, setIsSaving] = useState(false);
  const [isClaimSelectorOpen, setIsClaimSelectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');

  // Fetch the real claim from the database (only if claimId provided)
  const { data: claim, isLoading, error } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => getClaim(claimId!),
    enabled: !!claimId,
    staleTime: 30000,
  });

  // Fetch available claims for the claim selector (when no claim is attached)
  const { data: claimsData } = useQuery({
    queryKey: ['claims-for-sketch'],
    queryFn: () => getClaims({ limit: 100 }),
    enabled: !claimId,
    staleTime: 60000,
  });

  const availableClaims = claimsData?.claims || [];

  // Track if we've already loaded this claim's rooms to prevent re-loading
  const loadedClaimIdRef = useRef<string | null>(null);

  // Load existing rooms from claim when claim data is available
  useEffect(() => {
    if (!claimId || !claim || loadedClaimIdRef.current === claimId) {
      return;
    }

    const loadExistingRooms = async () => {
      try {
        const { rooms: claimRooms } = await getClaimRooms(claimId);

        if (claimRooms && claimRooms.length > 0) {
          // Group rooms by structure and convert to geometry engine format
          const structureMap = new Map<string, Structure>();
          const convertedRooms: RoomGeometry[] = [];

          claimRooms.forEach((cr) => {
            // Convert ClaimRoom to RoomGeometry
            const room: RoomGeometry = {
              id: cr.id,
              name: cr.name,
              shape: (cr.shape as RoomGeometry['shape']) || 'rectangle',
              width_ft: cr.width,
              length_ft: cr.length,
              ceiling_height_ft: cr.ceilingHeight || 8,
              area_sqft: cr.area || cr.width * cr.length,
              openings: cr.openings?.map((o) => ({
                id: o.id || `opening-${Date.now()}`,
                type: (o.type as RoomGeometry['openings'][0]['type']) || 'door',
                wall: (o.wall as 'north' | 'south' | 'east' | 'west') || 'north',
                width_ft: o.width || 3,
                height_ft: o.height || 6.67,
                position_ft: o.position || 0,
                sill_height_ft: o.sillHeight,
              })) || [],
              features: cr.features?.map((f) => ({
                id: f.id || `feature-${Date.now()}`,
                type: (f.type as RoomGeometry['features'][0]['type']) || 'closet',
                wall: (f.wall as 'north' | 'south' | 'east' | 'west' | 'freestanding') || 'north',
                width_ft: f.width || 2,
                depth_ft: f.depth || 2,
                position_ft: f.position,
              })) || [],
              damageZones: cr.damageZones?.map((dz) => ({
                id: dz.id || `damage-${Date.now()}`,
                type: (dz.type as RoomGeometry['damageZones'][0]['type']) || 'water',
                category: dz.category as '1' | '2' | '3' | undefined,
                affected_walls: (dz.affected_walls as ('north' | 'south' | 'east' | 'west')[]) || [],
                floor_affected: dz.floor_affected ?? true,
                ceiling_affected: dz.ceiling_affected ?? false,
                extent_ft: dz.extent_ft || 2,
                source: dz.source,
                polygon: dz.polygon,
              })) || [],
              notes: cr.notes || [],
              structureId: cr.structureId,
              hierarchyLevel: (cr.hierarchyLevel as 'structure' | 'room' | 'subroom') || 'room',
              created_at: cr.createdAt || new Date().toISOString(),
              updated_at: cr.updatedAt || new Date().toISOString(),
            };
            convertedRooms.push(room);

            // Create structure if room has one
            if (cr.structureId && cr.structureName && !structureMap.has(cr.structureId)) {
              structureMap.set(cr.structureId, {
                id: cr.structureId,
                name: cr.structureName,
                type: 'single_family',
                rooms: [],
                photos: [],
                notes: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          });

          // Add rooms to their structures
          const structures = Array.from(structureMap.values());
          structures.forEach((s) => {
            s.rooms = convertedRooms.filter((r) => r.structureId === s.id);
          });

          // Load into geometry engine
          geometryEngine.loadFromClaimData(structures, convertedRooms);
          loadedClaimIdRef.current = claimId;

          // Also load photos for this claim
          try {
            const claimPhotos = await getClaimPhotos(claimId);
            if (claimPhotos && claimPhotos.length > 0) {
              const { addPhoto } = useGeometryEngine.getState();
              claimPhotos.forEach((photo) => {
                addPhoto({
                  id: photo.id,
                  storageUrl: photo.storageUrl || undefined,
                  localUri: photo.storageUrl || undefined,
                  label: photo.label || 'Photo',
                  hierarchyPath: photo.hierarchyPath || 'Exterior',
                  structureId: photo.structureId || undefined,
                  roomId: photo.roomId || undefined,
                  subRoomId: photo.subRoomId || undefined,
                  capturedAt: photo.capturedAt || new Date().toISOString(),
                  uploadedAt: photo.uploadedAt || undefined,
                  latitude: photo.latitude || undefined,
                  longitude: photo.longitude || undefined,
                  geoAddress: photo.geoAddress || undefined,
                  aiAnalysis: photo.analysis as import('./types/geometry').PhotoAIAnalysis | undefined,
                  analysisStatus: (photo.analysisStatus as 'pending' | 'analyzing' | 'completed' | 'failed' | 'concerns') || 'completed',
                });
              });
              toast.success('Sketch loaded', {
                description: `Loaded ${convertedRooms.length} room(s) and ${claimPhotos.length} photo(s) from this claim`,
              });
            } else {
              toast.success('Sketch loaded', {
                description: `Loaded ${convertedRooms.length} room(s) from this claim`,
              });
            }
          } catch (photoErr) {
            console.error('Failed to load photos:', photoErr);
            toast.success('Sketch loaded', {
              description: `Loaded ${convertedRooms.length} room(s) from this claim`,
            });
          }
        } else {
          // No rooms, but still try to load photos
          try {
            const claimPhotos = await getClaimPhotos(claimId);
            if (claimPhotos && claimPhotos.length > 0) {
              const { addPhoto } = useGeometryEngine.getState();
              claimPhotos.forEach((photo) => {
                addPhoto({
                  id: photo.id,
                  storageUrl: photo.storageUrl || undefined,
                  localUri: photo.storageUrl || undefined,
                  label: photo.label || 'Photo',
                  hierarchyPath: photo.hierarchyPath || 'Exterior',
                  structureId: photo.structureId || undefined,
                  roomId: photo.roomId || undefined,
                  subRoomId: photo.subRoomId || undefined,
                  capturedAt: photo.capturedAt || new Date().toISOString(),
                  uploadedAt: photo.uploadedAt || undefined,
                  latitude: photo.latitude || undefined,
                  longitude: photo.longitude || undefined,
                  geoAddress: photo.geoAddress || undefined,
                  aiAnalysis: photo.analysis as import('./types/geometry').PhotoAIAnalysis | undefined,
                  analysisStatus: (photo.analysisStatus as 'pending' | 'analyzing' | 'completed' | 'failed' | 'concerns') || 'completed',
                });
              });
              loadedClaimIdRef.current = claimId;
              toast.success('Photos loaded', {
                description: `Loaded ${claimPhotos.length} photo(s) from this claim`,
              });
            }
          } catch (photoErr) {
            console.error('Failed to load photos:', photoErr);
          }
        }
      } catch (err) {
        console.error('Failed to load existing rooms:', err);
        // Don't show error toast - it's ok if there are no existing rooms
      }
    };

    loadExistingRooms();
  }, [claimId, claim]);

  const handleRoomConfirmed = useCallback(
    (roomData: unknown) => {
      const voiceRoom = roomData as RoomGeometry;
      toast.success(`${voiceRoom.name.replace(/_/g, ' ')} confirmed!`, {
        description: `${voiceRoom.width_ft}' × ${voiceRoom.length_ft}' with ${voiceRoom.openings.length} openings`,
      });
    },
    []
  );

  const saveRoomsToClaim = useCallback(async (targetClaimId: string) => {
    const confirmedRooms = useGeometryEngine.getState().rooms;
    const currentRoomState = useGeometryEngine.getState().currentRoom;
    const allStructures = useGeometryEngine.getState().structures;
    
    if (confirmedRooms.length === 0 && !currentRoomState && allStructures.length === 0) {
      toast.error('No rooms to save', {
        description: 'Create and confirm at least one room first.',
      });
      return false;
    }

    const roomsToSave = currentRoomState
      ? [...confirmedRooms, currentRoomState]
      : confirmedRooms;

    // Convert structures to API format
    const claimStructures: ClaimStructure[] = allStructures.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      description: s.description,
      address: s.address,
      stories: s.stories,
      yearBuilt: s.yearBuilt,
      constructionType: s.constructionType,
      roofType: s.roofType,
      photos: s.photos || [],
      notes: s.notes || [],
    }));

    const claimRooms: ClaimRoom[] = [];
    const claimDamageZones: ClaimDamageZone[] = [];

    roomsToSave.forEach((voiceRoom) => {
      const claimRoom: ClaimRoom = {
        id: voiceRoom.id,
        name: voiceRoom.name.replace(/_/g, ' '),
        type: inferRoomType(voiceRoom.name),
        width: voiceRoom.width_ft,
        height: voiceRoom.length_ft,
        x: voiceRoom.origin_x_ft || 0,
        y: voiceRoom.origin_y_ft || 0,
        ceilingHeight: voiceRoom.ceiling_height_ft,
        structureId: voiceRoom.structureId,
      };
      claimRooms.push(claimRoom);

      voiceRoom.damageZones.forEach((vDamage) => {
        const claimDamage: ClaimDamageZone = {
          id: vDamage.id,
          roomId: voiceRoom.id,
          type: mapDamageType(vDamage.type),
          severity: mapDamageSeverity(vDamage.category),
          affectedSurfaces: [
            ...vDamage.affected_walls.map((w) => `Wall ${w.charAt(0).toUpperCase() + w.slice(1)}`),
            ...(vDamage.floor_affected ? ['Floor'] : []),
            ...(vDamage.ceiling_affected ? ['Ceiling'] : []),
          ],
          affectedArea: calculateDamageArea(vDamage, voiceRoom),
          notes: vDamage.source || '',
          photos: [],
        };
        claimDamageZones.push(claimDamage);
      });
    });

    try {
      setIsSaving(true);
      const result = await saveClaimHierarchy(targetClaimId, claimStructures, claimRooms, claimDamageZones);
      
      const parts = [];
      if (result.structuresSaved > 0) parts.push(`${result.structuresSaved} structure(s)`);
      if (result.roomsSaved > 0) parts.push(`${result.roomsSaved} room(s)`);
      if (result.damageZonesSaved > 0) parts.push(`${result.damageZonesSaved} damage zone(s)`);
      
      toast.success('Sketch saved to claim!', {
        description: `Saved ${parts.join(', ')}.`,
      });

      // Invalidate claim query to refresh data
      queryClient.invalidateQueries({ queryKey: ['claim', targetClaimId] });
      queryClient.invalidateQueries({ queryKey: ['claim-rooms', targetClaimId] });

      resetSession();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save sketch';
      toast.error('Failed to save sketch', { description: message });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [resetSession, queryClient]);

  const handleSaveToClaimClick = useCallback(async () => {
    if (claimId) {
      // If we're already in a claim context, save directly
      const success = await saveRoomsToClaim(claimId);
      if (success) {
        setLocation(`/claim/${claimId}`);
      }
    } else {
      // Reset selection and open claim selector dialog
      setSelectedClaimId('');
      setIsClaimSelectorOpen(true);
    }
  }, [claimId, saveRoomsToClaim, setLocation]);

  const handleSaveToSelectedClaim = useCallback(async () => {
    if (!selectedClaimId) {
      toast.error('Please select a claim');
      return;
    }
    
    const success = await saveRoomsToClaim(selectedClaimId);
    if (success) {
      setIsClaimSelectorOpen(false);
      setSelectedClaimId('');
      setLocation(`/claim/${selectedClaimId}`);
    }
  }, [selectedClaimId, saveRoomsToClaim, setLocation]);

  const handleCloseDialog = useCallback(() => {
    setIsClaimSelectorOpen(false);
    setSelectedClaimId('');
  }, []);

  const hasRooms = rooms.length > 0 || currentRoom;
  const roomCount = rooms.length + (currentRoom ? 1 : 0);

  // Loading state (only when loading a specific claim)
  if (claimId && isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading claim...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state (only when we tried to load a claim but it failed)
  if (claimId && (error || !claim)) {
    return (
      <Layout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Claim not found</AlertTitle>
            <AlertDescription>
              The claim could not be loaded. Please select a valid claim from the claims list.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Link href="/claims">
              <Button data-testid="button-back-to-claims">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Claims
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  // Main render - works with or without a claim
  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {claim ? (
              <Link href={`/claim/${claimId}`}>
                <Button variant="ghost" size="sm" data-testid="button-back-to-claim">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Claim
                </Button>
              </Link>
            ) : (
              <Link href="/claims">
                <Button variant="ghost" size="sm" data-testid="button-back-to-claims">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Claims
                </Button>
              </Link>
            )}
            <div>
              <h1 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Voice Room Sketching
              </h1>
              {claim ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Claim: {claim.policyholder || 'Unknown'} - {claim.riskLocation || 'No address'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {claim.claimId} | {claim.causeOfLoss || 'Unknown loss type'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Create your sketch, then save it to a claim when ready
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasRooms && (
              <Button 
                onClick={handleSaveToClaimClick} 
                disabled={isSaving}
                data-testid="button-save-to-claim"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? 'Saving...' : claim ? `Save to Claim (${roomCount})` : `Save Sketch (${roomCount})`}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <VoiceSketchController
            userName={authUser?.username}
            onRoomConfirmed={handleRoomConfirmed}
            className="min-h-full"
          />
        </div>
      </div>

      {/* Claim Selector Dialog */}
      <Dialog open={isClaimSelectorOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Sketch to Claim</DialogTitle>
            <DialogDescription>
              Select the claim you want to attach this sketch to.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
              <SelectTrigger data-testid="select-claim-for-sketch">
                <SelectValue placeholder="Select a claim..." />
              </SelectTrigger>
              <SelectContent>
                {availableClaims.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No claims available. Create a claim first.
                  </div>
                ) : (
                  availableClaims.map((c: Claim) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{c.policyholder || 'Unknown'}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {c.riskLocation || c.claimId}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveToSelectedClaim} 
              disabled={!selectedClaimId || isSaving}
              data-testid="button-confirm-save-to-claim"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save to Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// Helper functions

function inferRoomType(name: string): string {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('bedroom') || nameLower.includes('master')) return 'Bedroom';
  if (nameLower.includes('bathroom') || nameLower.includes('bath')) return 'Bathroom';
  if (nameLower.includes('kitchen')) return 'Kitchen';
  if (nameLower.includes('living') || nameLower.includes('family')) return 'Living Room';
  if (nameLower.includes('dining')) return 'Dining Room';
  if (nameLower.includes('office') || nameLower.includes('study')) return 'Office';
  if (nameLower.includes('garage')) return 'Garage';
  if (nameLower.includes('basement')) return 'Basement';
  if (nameLower.includes('laundry')) return 'Laundry';
  if (nameLower.includes('closet')) return 'Closet';
  if (nameLower.includes('hall')) return 'Hallway';
  return 'Room';
}

function mapDamageType(
  type: string
): 'Water' | 'Fire' | 'Smoke' | 'Mold' | 'Impact' | 'Wind' | 'Other' {
  const typeMap: Record<string, 'Water' | 'Fire' | 'Smoke' | 'Mold' | 'Impact' | 'Wind' | 'Other'> = {
    water: 'Water',
    fire: 'Fire',
    smoke: 'Smoke',
    mold: 'Mold',
    wind: 'Wind',
    impact: 'Impact',
  };
  return typeMap[type.toLowerCase()] || 'Other';
}

function mapDamageSeverity(
  category: string | undefined
): 'Low' | 'Medium' | 'High' | 'Total' {
  if (!category) return 'Medium';
  switch (category) {
    case '1':
      return 'Low';
    case '2':
      return 'Medium';
    case '3':
      return 'High';
    default:
      return 'Medium';
  }
}

function calculateDamageArea(
  damage: { extent_ft: number; affected_walls: string[] },
  room: RoomGeometry
): number {
  const perimeter = 2 * (room.width_ft + room.length_ft);
  const wallLength = perimeter / 4;
  const affectedWallCount = damage.affected_walls.length;
  return damage.extent_ft * wallLength * affectedWallCount;
}
