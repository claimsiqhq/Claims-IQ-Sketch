// Voice Sketch Page
// Full page component for voice-driven room sketching

import React, { useState, useCallback } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowLeft, Save, Mic } from 'lucide-react';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { VoiceSketchController } from './components/VoiceSketchController';
import { useGeometryEngine } from './services/geometry-engine';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import type { RoomGeometry } from './types/geometry';
import type { Room, DamageZone } from '@/lib/types';

interface VoiceSketchPageProps {
  claimId?: string;
}

export default function VoiceSketchPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const claimId = params.claimId;

  const { rooms, currentRoom, resetSession } = useGeometryEngine();
  const { addRoom, addDamageZone, activeClaim, setActiveClaim } = useStore();

  // Set active claim if claimId is provided
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

  const handleSaveToClaimClick = useCallback(() => {
    if (!claimId) {
      toast.error('No claim selected', {
        description: 'Please open this page from a claim detail view.',
      });
      return;
    }

    const confirmedRooms = useGeometryEngine.getState().rooms;
    if (confirmedRooms.length === 0 && !currentRoom) {
      toast.error('No rooms to save', {
        description: 'Create and confirm at least one room first.',
      });
      return;
    }

    // Convert voice rooms to claim rooms
    const roomsToSave = currentRoom
      ? [...confirmedRooms, currentRoom]
      : confirmedRooms;

    let roomsAdded = 0;
    let damageZonesAdded = 0;

    roomsToSave.forEach((voiceRoom) => {
      // Convert to claim Room format
      const claimRoom: Room = {
        id: voiceRoom.id,
        name: voiceRoom.name.replace(/_/g, ' '),
        type: inferRoomType(voiceRoom.name),
        width: voiceRoom.width_ft,
        height: voiceRoom.length_ft,
        x: 0, // Will be positioned on sketch canvas
        y: 0,
        ceilingHeight: voiceRoom.ceiling_height_ft,
      };

      addRoom(claimId, claimRoom);
      roomsAdded++;

      // Convert damage zones
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

        addDamageZone(claimId, claimDamage);
        damageZonesAdded++;
      });
    });

    toast.success('Rooms saved to claim!', {
      description: `Added ${roomsAdded} room(s) and ${damageZonesAdded} damage zone(s).`,
    });

    // Reset voice session
    resetSession();

    // Navigate back to claim detail
    setLocation(`/claim/${claimId}`);
  }, [claimId, currentRoom, addRoom, addDamageZone, resetSession, setLocation]);

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Page Header */}
        <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {claimId ? (
              <Link href={`/claim/${claimId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Claim
                </Button>
              </Link>
            ) : (
              <Link href="/">
                <Button variant="ghost" size="sm">
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
            {(rooms.length > 0 || currentRoom) && claimId && (
              <Button onClick={handleSaveToClaimClick}>
                <Save className="h-4 w-4 mr-2" />
                Save to Claim ({rooms.length + (currentRoom ? 1 : 0)} rooms)
              </Button>
            )}
          </div>
        </div>

        {/* Voice Sketch Controller */}
        <div className="flex-1 overflow-hidden">
          <VoiceSketchController
            onRoomConfirmed={handleRoomConfirmed}
            className="h-full"
          />
        </div>
      </div>
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
  // Rough estimation based on extent and affected walls
  const perimeter = 2 * (room.width_ft + room.length_ft);
  const wallLength = perimeter / 4; // Average wall length
  const affectedWallCount = damage.affected_walls.length;

  // Area = extent × affected wall length
  return damage.extent_ft * wallLength * affectedWallCount;
}
