// Voice Sketch Page
// Full page component for voice-driven room sketching

import React, { useState, useCallback } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowLeft, Save, Mic, Plus, FileText, ChevronRight } from 'lucide-react';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceSketchController } from './components/VoiceSketchController';
import { useGeometryEngine } from './services/geometry-engine';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RoomGeometry } from './types/geometry';
import type { Room, DamageZone, Claim } from '@/lib/types';

export default function VoiceSketchPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const claimId = params.claimId;

  const { rooms, currentRoom, resetSession } = useGeometryEngine();
  const { claims, addRoom, addDamageZone, activeClaim, setActiveClaim, createClaim } = useStore();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveMode, setSaveMode] = useState<'select' | 'create'>('select');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const resetModalState = useCallback(() => {
    setSaveMode('select');
    setSelectedClaimId(null);
    setNewClaimForm({
      customerName: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      policyNumber: '',
      carrier: '',
      type: 'Water',
      description: '',
    });
  }, []);

  const handleModalOpenChange = useCallback((open: boolean) => {
    setShowSaveModal(open);
    if (!open) {
      resetModalState();
    }
  }, [resetModalState]);
  
  const [newClaimForm, setNewClaimForm] = useState({
    customerName: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    policyNumber: '',
    carrier: '',
    type: 'Water' as Claim['type'],
    description: '',
  });

  React.useEffect(() => {
    if (claimId) {
      setActiveClaim(claimId);
    }
  }, [claimId, setActiveClaim]);

  const handleRoomConfirmed = useCallback(
    (roomData: unknown) => {
      const voiceRoom = roomData as RoomGeometry;
      toast.success(`${voiceRoom.name.replace(/_/g, ' ')} confirmed!`, {
        description: `${voiceRoom.width_ft}' × ${voiceRoom.length_ft}' with ${voiceRoom.openings.length} openings`,
      });
    },
    []
  );

  const saveRoomsToClaim = useCallback((targetClaimId: string) => {
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

    let roomsAdded = 0;
    let damageZonesAdded = 0;

    roomsToSave.forEach((voiceRoom) => {
      const claimRoom: Room = {
        id: voiceRoom.id,
        name: voiceRoom.name.replace(/_/g, ' '),
        type: inferRoomType(voiceRoom.name),
        width: voiceRoom.width_ft,
        height: voiceRoom.length_ft,
        x: 0,
        y: 0,
        ceilingHeight: voiceRoom.ceiling_height_ft,
      };

      addRoom(targetClaimId, claimRoom);
      roomsAdded++;

      voiceRoom.damageZones.forEach((vDamage) => {
        const claimDamage: DamageZone = {
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

        addDamageZone(targetClaimId, claimDamage);
        damageZonesAdded++;
      });
    });

    toast.success('Rooms saved to claim!', {
      description: `Added ${roomsAdded} room(s) and ${damageZonesAdded} damage zone(s).`,
    });

    resetSession();
    return true;
  }, [addRoom, addDamageZone, resetSession]);

  const handleSaveToClaimClick = useCallback(() => {
    if (!claimId) {
      setShowSaveModal(true);
      return;
    }

    if (saveRoomsToClaim(claimId)) {
      setLocation(`/claim/${claimId}`);
    }
  }, [claimId, saveRoomsToClaim, setLocation]);

  const handleSaveToExistingClaim = useCallback(() => {
    if (!selectedClaimId) {
      toast.error('Please select a claim');
      return;
    }

    if (saveRoomsToClaim(selectedClaimId)) {
      setShowSaveModal(false);
      setLocation(`/claim/${selectedClaimId}`);
    }
  }, [selectedClaimId, saveRoomsToClaim, setLocation]);

  const handleCreateNewClaim = useCallback(() => {
    if (!newClaimForm.customerName.trim() || !newClaimForm.street.trim()) {
      toast.error('Please fill in customer name and street address');
      return;
    }

    const newClaim: Omit<Claim, 'id' | 'createdAt' | 'updatedAt'> = {
      customerName: newClaimForm.customerName,
      policyNumber: newClaimForm.policyNumber || 'TBD',
      carrier: newClaimForm.carrier || 'TBD',
      status: 'draft',
      address: {
        street: newClaimForm.street,
        city: newClaimForm.city,
        state: newClaimForm.state,
        zip: newClaimForm.zip,
      },
      dateOfLoss: new Date().toISOString().split('T')[0],
      type: newClaimForm.type,
      description: newClaimForm.description || 'Created from Voice Sketch',
      rooms: [],
      damageZones: [],
      lineItems: [],
    };

    createClaim(newClaim);
    
    const { claims: updatedClaims } = useStore.getState();
    const createdClaim = updatedClaims[0];

    if (createdClaim && saveRoomsToClaim(createdClaim.id)) {
      setShowSaveModal(false);
      setLocation(`/claim/${createdClaim.id}`);
    }
  }, [newClaimForm, createClaim, saveRoomsToClaim, setLocation]);

  const hasRooms = rooms.length > 0 || currentRoom;
  const roomCount = rooms.length + (currentRoom ? 1 : 0);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {claimId ? (
              <Link href={`/claim/${claimId}`}>
                <Button variant="ghost" size="sm" data-testid="button-back-to-claim">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Claim
                </Button>
              </Link>
            ) : (
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            )}
            <div>
              <h1 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Voice Room Sketching
              </h1>
              {activeClaim && (
                <p className="text-sm text-muted-foreground">
                  Claim: {activeClaim.customerName} - {activeClaim.address.street}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasRooms && (
              <Button onClick={handleSaveToClaimClick} data-testid="button-save-to-claim">
                <Save className="h-4 w-4 mr-2" />
                Save to Claim ({roomCount} room{roomCount !== 1 ? 's' : ''})
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <VoiceSketchController
            onRoomConfirmed={handleRoomConfirmed}
            className="min-h-full"
          />
        </div>
      </div>

      <Dialog open={showSaveModal} onOpenChange={handleModalOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save Rooms to Claim</DialogTitle>
            <DialogDescription>
              Choose where to save your {roomCount} sketched room{roomCount !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button
              variant={saveMode === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSaveMode('select')}
              className="flex-1"
              data-testid="button-mode-existing"
            >
              <FileText className="h-4 w-4 mr-2" />
              Existing Claim
            </Button>
            <Button
              variant={saveMode === 'create' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSaveMode('create')}
              className="flex-1"
              data-testid="button-mode-create"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Claim
            </Button>
          </div>

          {saveMode === 'select' ? (
            <div className="space-y-4">
              <Label>Select a claim</Label>
              {claims.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No claims available. Create a new claim instead.
                </p>
              ) : (
                <ScrollArea className="h-[240px] border rounded-md">
                  <div className="p-2 space-y-1">
                    {claims.map((claim) => (
                      <button
                        key={claim.id}
                        onClick={() => setSelectedClaimId(claim.id)}
                        className={`w-full text-left p-3 rounded-md transition-colors flex items-center justify-between ${
                          selectedClaimId === claim.id
                            ? 'bg-primary/10 border border-primary'
                            : 'hover:bg-muted border border-transparent'
                        }`}
                        data-testid={`claim-option-${claim.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{claim.customerName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {claim.address?.street || 'No address'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {claim.type} | {(claim.rooms?.length || 0)} room{(claim.rooms?.length || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <Button
                onClick={handleSaveToExistingClaim}
                disabled={!selectedClaimId}
                className="w-full"
                data-testid="button-confirm-save-existing"
              >
                <Save className="h-4 w-4 mr-2" />
                Save to Selected Claim
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={newClaimForm.customerName}
                    onChange={(e) => setNewClaimForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder="John Smith"
                    data-testid="input-customer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="street">Street Address *</Label>
                  <Input
                    id="street"
                    value={newClaimForm.street}
                    onChange={(e) => setNewClaimForm((f) => ({ ...f, street: e.target.value }))}
                    placeholder="123 Main St"
                    data-testid="input-street"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={newClaimForm.city}
                      onChange={(e) => setNewClaimForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="Dallas"
                      data-testid="input-city"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={newClaimForm.state}
                      onChange={(e) => setNewClaimForm((f) => ({ ...f, state: e.target.value }))}
                      placeholder="TX"
                      data-testid="input-state"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP</Label>
                    <Input
                      id="zip"
                      value={newClaimForm.zip}
                      onChange={(e) => setNewClaimForm((f) => ({ ...f, zip: e.target.value }))}
                      placeholder="75001"
                      data-testid="input-zip"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="type">Damage Type</Label>
                  <Select
                    value={newClaimForm.type}
                    onValueChange={(v) => setNewClaimForm((f) => ({ ...f, type: v as Claim['type'] }))}
                  >
                    <SelectTrigger data-testid="select-damage-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Water">Water</SelectItem>
                      <SelectItem value="Fire">Fire</SelectItem>
                      <SelectItem value="Wind/Hail">Wind/Hail</SelectItem>
                      <SelectItem value="Impact">Impact</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={handleCreateNewClaim}
                className="w-full"
                data-testid="button-create-claim-and-save"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Claim & Save Rooms
              </Button>
            </div>
          )}
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
