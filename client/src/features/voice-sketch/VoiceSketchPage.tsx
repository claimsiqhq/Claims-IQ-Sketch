// Voice Sketch Page
// Full page component for voice-driven room sketching
// Works standalone or attached to a specific claim

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Mic, AlertCircle, Loader2, FileText, Pencil, Trash2, Home, Clock, FolderOpen, ChevronDown } from 'lucide-react';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { VoiceSketchController } from './components/VoiceSketchController';
import { SketchToolbar } from './components/SketchToolbar';
import { useGeometryEngine, geometryEngine } from './services/geometry-engine';
import { getClaim, getClaims, saveClaimHierarchy, getClaimRooms, getClaimPhotos, deleteClaimRooms } from '@/lib/api';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RoomGeometry, Structure, VoiceDamageZone } from './types/geometry';
import type { ClaimRoom, ClaimDamageZone, ClaimStructure, Claim } from '@/lib/api';
import { generatePolygon } from './utils/polygon-math';

export default function VoiceSketchPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const claimId = params.claimId;
  const authUser = useStore((state) => state.authUser);

  const { rooms, currentRoom, structures, resetSession, loadRooms, resetAndLoadForClaim, loadedForClaimId } = useGeometryEngine();
  const [isSaving, setIsSaving] = useState(false);
  const [isClaimSelectorOpen, setIsClaimSelectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [deleteConfirmClaimId, setDeleteConfirmClaimId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavedSketchesOpen, setIsSavedSketchesOpen] = useState(false);

  // Fetch the real claim from the database (only if claimId provided)
  const { data: claim, isLoading, error } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => getClaim(claimId!),
    enabled: !!claimId,
    staleTime: 30000,
  });
  
  // Fetch existing rooms for this claim
  const { data: existingRoomsData } = useQuery({
    queryKey: ['claim-rooms', claimId],
    queryFn: () => getClaimRooms(claimId!),
    enabled: !!claimId,
    staleTime: 30000,
  });
  
  // Load existing rooms into geometry engine when data is available
  // Uses store-level loadedForClaimId tracking to persist across component remounts
  useEffect(() => {
    // Skip if no claimId or rooms data hasn't loaded yet
    if (!claimId || !existingRoomsData) {
      return;
    }
    
    // Check if we've already loaded rooms for this specific claim (tracked in store)
    if (loadedForClaimId === claimId) {
      // Already loaded for this claim - skip
      return;
    }
    
    // Convert ClaimRoom to RoomGeometry (API response uses camelCase from database)
    const convertedRooms: RoomGeometry[] = existingRoomsData.rooms.map((roomData) => {
        const room = roomData as any; // API response matches database schema
        const width = parseFloat(room.widthFt || room.width || '10');
        const length = parseFloat(room.lengthFt || room.height || '10');
        const ceilingHeight = parseFloat(room.ceilingHeightFt || room.ceilingHeight || '8');
        
        // Map database shape values to RoomShape type
        const shapeMap: Record<string, 'rectangle' | 'l_shape' | 't_shape' | 'irregular'> = {
          'rectangular': 'rectangle',
          'rectangle': 'rectangle',
          'l_shaped': 'l_shape',
          'l_shape': 'l_shape',
          't_shaped': 't_shape',
          't_shape': 't_shape',
          'polygon': 'irregular',
          'irregular': 'irregular',
        };
        const roomShape = shapeMap[room.shape] || 'rectangle';
        
        // Find damage zones for this room
        const roomDamageZones = (existingRoomsData.damageZones || [])
          .filter((dz) => dz.roomId === room.id)
          .map((dzData): VoiceDamageZone => {
            const dz = dzData as any;
            return {
              id: dz.id,
              type: dz.damageType || dz.type || 'water',
              category: dz.severity || 'moderate',
              affected_walls: Array.isArray(dz.affectedWalls) ? dz.affectedWalls.map((w: string) => w.toLowerCase()) : [],
              floor_affected: dz.floorAffected || false,
              ceiling_affected: dz.ceilingAffected || false,
              extent_ft: parseFloat(dz.extentFt || '0'),
              polygon: [],
              is_freeform: dz.isFreeform || false,
              source: dz.source || '',
            };
          });
        
        return {
          id: room.id,
          name: room.name.replace(/ /g, '_'),
          shape: roomShape,
          width_ft: width,
          length_ft: length,
          ceiling_height_ft: ceilingHeight,
          polygon: generatePolygon(roomShape, width, length),
          openings: Array.isArray(room.openings) ? room.openings : [],
          features: Array.isArray(room.features) ? room.features : [],
          damageZones: roomDamageZones,
          notes: Array.isArray(room.notes) ? room.notes : [],
          origin_x_ft: parseFloat(room.originXFt || '0'),
          origin_y_ft: parseFloat(room.originYFt || '0'),
          structureId: room.structureId || undefined,
          created_at: room.createdAt?.toString() || new Date().toISOString(),
          updated_at: room.updatedAt?.toString() || new Date().toISOString(),
          hierarchyLevel: room.hierarchyLevel ?? 1,
          subRooms: room.subRooms || [],
          objects: room.objects || [],
          photos: room.photos || [],
        };
      });
      
    // Use resetAndLoadForClaim which resets all state AND sets the loadedForClaimId
    // This ensures proper cleanup when switching between claims
    resetAndLoadForClaim(claimId, convertedRooms);
    
    if (convertedRooms.length > 0) {
      toast.info(`Loaded ${convertedRooms.length} saved room(s)`, {
        description: 'You can continue editing or add more rooms.',
      });
    }
  }, [existingRoomsData, claimId, loadedForClaimId, resetAndLoadForClaim]);

  // Fetch available claims for the claim selector (when no claim is attached)
  const { data: claimsData, isLoading: isLoadingClaims } = useQuery({
    queryKey: ['claims-for-sketch'],
    queryFn: () => getClaims({ limit: 100 }),
    enabled: !claimId,
    staleTime: 60000,
  });

  const availableClaims = claimsData?.claims || [];

  // Fetch saved sketches (claims that have rooms) for the saved sketches section
  const { data: savedSketchesData, isLoading: isLoadingSavedSketches } = useQuery({
    queryKey: ['saved-sketches'],
    queryFn: async () => {
      const claims = await getClaims({ limit: 100 });
      // For each claim, fetch room count
      const claimsWithRooms = await Promise.all(
        (claims.claims || []).map(async (c) => {
          try {
            const roomsData = await getClaimRooms(c.id);
            return {
              ...c,
              roomCount: roomsData.rooms?.length || 0,
              structureCount: new Set(roomsData.rooms?.map((r) => r.structureId).filter(Boolean)).size || 0,
            };
          } catch {
            return { ...c, roomCount: 0, structureCount: 0 };
          }
        })
      );
      // Only return claims that have saved rooms
      return claimsWithRooms.filter((c) => c.roomCount > 0);
    },
    enabled: !claimId,
    staleTime: 60000,
  });

  const savedSketches = savedSketchesData || [];

  // Handle delete sketch
  const handleDeleteSketch = async (targetClaimId: string) => {
    setIsDeleting(true);
    try {
      await deleteClaimRooms(targetClaimId);
      toast.success('Sketch deleted', {
        description: 'All rooms and structures have been removed from this claim.',
      });
      queryClient.invalidateQueries({ queryKey: ['saved-sketches'] });
      queryClient.invalidateQueries({ queryKey: ['claim-rooms', targetClaimId] });
      setDeleteConfirmClaimId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete sketch';
      toast.error('Delete failed', { description: message });
    } finally {
      setIsDeleting(false);
    }
  };

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

  // Handler for SketchToolbar room updates
  const handleRoomsChange = useCallback((updatedRooms: RoomGeometry[]) => {
    // Update the geometry engine store with the new rooms
    useGeometryEngine.setState({ rooms: updatedRooms });
  }, []);

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
        roomType: inferRoomType(voiceRoom.name),
        widthFt: String(voiceRoom.width_ft),
        lengthFt: String(voiceRoom.length_ft),
        ceilingHeightFt: String(voiceRoom.ceiling_height_ft),
        originXFt: String(voiceRoom.origin_x_ft || 0),
        originYFt: String(voiceRoom.origin_y_ft || 0),
        shape: 'rectangular',
        structureId: voiceRoom.structureId,
      };
      claimRooms.push(claimRoom);

      voiceRoom.damageZones.forEach((vDamage) => {
        const claimDamage: ClaimDamageZone = {
          id: vDamage.id,
          roomId: voiceRoom.id,
          damageType: vDamage.type,
          severity: vDamage.category || 'medium',
          affectedWalls: vDamage.affected_walls,
          floorAffected: vDamage.floor_affected,
          ceilingAffected: vDamage.ceiling_affected,
          extentFt: String(vDamage.extent_ft),
          source: vDamage.source || '',
          notes: vDamage.notes || '',
          isFreeform: vDamage.is_freeform || false,
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
        <div className="bg-white border-b border-border px-3 py-3 md:px-6 md:py-4">
          {/* Mobile Layout: Stacked */}
          <div className="flex flex-col gap-3 md:hidden">
            {/* Top row: Back button + Title + Actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {claim ? (
                  <Link href={`/claim/${claimId}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid="button-back-to-claim-mobile">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Link href="/claims">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid="button-back-to-claims-mobile">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Mic className="h-4 w-4 text-primary shrink-0" />
                  <h1 className="text-base font-display font-bold text-slate-900 truncate">
                    Voice Sketch
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!claimId && (
                  <Popover open={isSavedSketchesOpen} onOpenChange={setIsSavedSketchesOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8" data-testid="button-saved-sketches-mobile">
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b border-border">
                        <h3 className="font-semibold text-sm">Saved Sketches</h3>
                        <p className="text-xs text-muted-foreground">Edit or delete saved sketches</p>
                      </div>
                      <ScrollArea className="max-h-64">
                        <div className="p-2 space-y-1">
                          {isLoadingSavedSketches ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : savedSketches.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                              <Home className="h-6 w-6 mx-auto mb-2 opacity-50" />
                              <p>No saved sketches yet</p>
                            </div>
                          ) : (
                            savedSketches.map((sketch: any) => (
                              <div
                                key={sketch.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {sketch.policyholder || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {sketch.roomCount} room{sketch.roomCount !== 1 ? 's' : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setIsSavedSketchesOpen(false);
                                      setLocation(`/voice-sketch/${sketch.id}`);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setIsSavedSketchesOpen(false);
                                      setDeleteConfirmClaimId(sketch.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                )}
                {hasRooms && (
                  <Button 
                    onClick={handleSaveToClaimClick} 
                    disabled={isSaving}
                    size="sm"
                    className="h-8"
                    data-testid="button-save-to-claim-mobile"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">{roomCount}</span>
                  </Button>
                )}
              </div>
            </div>
            {/* Description row - only on mobile when there's context */}
            {claim && (
              <p className="text-xs text-muted-foreground truncate pl-10">
                {claim.policyholder || 'Unknown'} - {claim.causeOfLoss || 'Unknown loss'}
              </p>
            )}
          </div>

          {/* Desktop Layout: Horizontal */}
          <div className="hidden md:flex md:items-center md:justify-between">
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
                      Claim: {claim.policyholder || 'Unknown'} - {claim.propertyAddress || claim.riskLocation || 'No address'}
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
            {/* Saved Sketches dropdown - only shown when no claim is attached */}
            {!claimId && (
              <Popover open={isSavedSketchesOpen} onOpenChange={setIsSavedSketchesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-saved-sketches">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Saved Sketches
                    {savedSketches.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {savedSketches.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b border-border">
                    <h3 className="font-semibold text-sm">Saved Sketches</h3>
                    <p className="text-xs text-muted-foreground">Edit or delete previously saved sketches</p>
                  </div>
                  <ScrollArea className="max-h-72">
                    <div className="p-2 space-y-1">
                      {isLoadingSavedSketches ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : savedSketches.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                          <Home className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p>No saved sketches yet</p>
                        </div>
                      ) : (
                        savedSketches.map((sketch: any) => (
                          <div
                            key={sketch.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {sketch.policyholder || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {sketch.roomCount} room{sketch.roomCount !== 1 ? 's' : ''}
                                {sketch.structureCount > 0 && ` | ${sketch.structureCount} structure${sketch.structureCount !== 1 ? 's' : ''}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setIsSavedSketchesOpen(false);
                                  setLocation(`/voice-sketch/${sketch.id}`);
                                }}
                                title="Edit sketch"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setIsSavedSketchesOpen(false);
                                  setDeleteConfirmClaimId(sketch.id);
                                }}
                                title="Delete sketch"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
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
        </div>

        {/* Sketch Editing Toolbar */}
        <div className="border-b bg-background px-4 py-2">
          <SketchToolbar
            rooms={rooms}
            onRoomsChange={handleRoomsChange}
          />
        </div>

        <div className="flex-1 overflow-hidden">
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmClaimId} onOpenChange={(open) => !open && setDeleteConfirmClaimId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sketch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sketch? This will remove all rooms, structures, and damage zones saved to this claim. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmClaimId(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmClaimId && handleDeleteSketch(deleteConfirmClaimId)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Sketch
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
  // Exterior zones - Roof
  if (nameLower.includes('roof')) return 'Roof';
  // Exterior zones - Elevations
  if (nameLower.includes('elevation')) return 'Elevation';
  // Exterior zones - Other
  if (nameLower.includes('siding')) return 'Siding';
  if (nameLower.includes('gutter')) return 'Gutters';
  if (nameLower.includes('deck')) return 'Deck';
  if (nameLower.includes('patio')) return 'Patio';
  if (nameLower.includes('fence')) return 'Fence';
  if (nameLower.includes('driveway')) return 'Driveway';
  // Interior rooms
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
