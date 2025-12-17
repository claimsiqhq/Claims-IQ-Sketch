// Voice Sketch Page
// Full page component for voice-driven room sketching
// Works standalone or attached to a specific claim

import React, { useState, useCallback } from 'react';
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
import { useGeometryEngine } from './services/geometry-engine';
import { getClaim, getClaims, saveClaimRooms } from '@/lib/api';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RoomGeometry } from './types/geometry';
import type { ClaimRoom, ClaimDamageZone, Claim } from '@/lib/api';

export default function VoiceSketchPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const claimId = params.claimId;
  const authUser = useStore((state) => state.authUser);

  const { rooms, currentRoom, resetSession } = useGeometryEngine();
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
    
    if (confirmedRooms.length === 0 && !currentRoomState) {
      toast.error('No rooms to save', {
        description: 'Create and confirm at least one room first.',
      });
      return false;
    }

    const roomsToSave = currentRoomState
      ? [...confirmedRooms, currentRoomState]
      : confirmedRooms;

    const claimRooms: ClaimRoom[] = [];
    const claimDamageZones: ClaimDamageZone[] = [];

    roomsToSave.forEach((voiceRoom) => {
      const claimRoom: ClaimRoom = {
        id: voiceRoom.id,
        name: voiceRoom.name.replace(/_/g, ' '),
        type: inferRoomType(voiceRoom.name),
        width: voiceRoom.width_ft,
        height: voiceRoom.length_ft,
        x: 0,
        y: 0,
        ceilingHeight: voiceRoom.ceiling_height_ft,
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
      const result = await saveClaimRooms(targetClaimId, claimRooms, claimDamageZones);
      
      toast.success('Rooms saved to claim!', {
        description: `Saved ${result.roomsSaved} room(s) and ${result.damageZonesSaved} damage zone(s).`,
      });

      // Invalidate claim query to refresh data
      queryClient.invalidateQueries({ queryKey: ['claim', targetClaimId] });
      queryClient.invalidateQueries({ queryKey: ['claim-rooms', targetClaimId] });

      resetSession();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save rooms';
      toast.error('Failed to save rooms', { description: message });
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
      // Open claim selector dialog
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
      setLocation(`/claim/${selectedClaimId}`);
    }
  }, [selectedClaimId, saveRoomsToClaim, setLocation]);

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
      <Dialog open={isClaimSelectorOpen} onOpenChange={setIsClaimSelectorOpen}>
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
            <Button variant="outline" onClick={() => setIsClaimSelectorOpen(false)}>
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
