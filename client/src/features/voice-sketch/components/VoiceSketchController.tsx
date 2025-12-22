// Voice Sketch Controller Component
// Main container for voice-driven room sketching using RealtimeSession
// Hierarchy: Structure > Room > Sub-room > Object

import React, { useState, useCallback } from 'react';
import { Mic, MicOff, Square, Volume2, AlertCircle, RotateCcw, Plus, Home, Building2, Save, Loader2, ChevronRight, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useGeometryEngine } from '../services/geometry-engine';
import { VoiceWaveform } from './VoiceWaveform';
import { RoomPreview } from './RoomPreview';
import { CommandHistory } from './CommandHistory';
import { FieldCameraButton } from './FieldCameraButton';
import { cn } from '@/lib/utils';
import { uploadPhoto } from '@/lib/api';
import { toast } from 'sonner';
import type { StructureType } from '../types/geometry';

interface VoiceSketchControllerProps {
  userName?: string;
  onRoomConfirmed?: (roomData: unknown) => void;
  className?: string;
  claimId?: string;
  onSave?: () => Promise<void>;
}

export function VoiceSketchController({
  userName,
  onRoomConfirmed,
  className,
  claimId,
  onSave,
}: VoiceSketchControllerProps) {
  const [lastToolCall, setLastToolCall] = useState<{
    name: string;
    result: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { 
    currentRoom, 
    rooms, 
    structures,
    currentStructure,
    photos,
    resetSession, 
    createRoom, 
    confirmRoom,
    createStructure,
    selectStructure,
    getCurrentHierarchyPath,
    addPhoto,
  } = useGeometryEngine();

  // Get current hierarchy path for display
  const hierarchyPath = getCurrentHierarchyPath();

  // Manual room creation handler
  const handleAddRoom = useCallback((roomType: string) => {
    if (!currentStructure) {
      console.warn('Please create a structure first before adding rooms');
      return;
    }
    
    const roomDefaults: Record<string, { width: number; length: number; name: string }> = {
      bedroom: { width: 12, length: 14, name: 'Bedroom' },
      bathroom: { width: 8, length: 10, name: 'Bathroom' },
      kitchen: { width: 12, length: 14, name: 'Kitchen' },
      living_room: { width: 16, length: 20, name: 'Living Room' },
      dining_room: { width: 12, length: 14, name: 'Dining Room' },
      office: { width: 10, length: 12, name: 'Office' },
      laundry: { width: 6, length: 8, name: 'Laundry Room' },
      hallway: { width: 4, length: 12, name: 'Hallway' },
      closet: { width: 4, length: 6, name: 'Closet' },
      custom: { width: 12, length: 12, name: 'Room' },
    };
    const defaults = roomDefaults[roomType] || roomDefaults.custom;
    createRoom({
      name: defaults.name,
      shape: 'rectangle',
      width_ft: defaults.width,
      length_ft: defaults.length,
      ceiling_height_ft: 8,
      structure_id: currentStructure.id,
    });
  }, [createRoom, currentStructure]);

  // Structure creation handler - uses proper Structure type
  const handleAddStructure = useCallback((structureType: string) => {
    const structureTypeMap: Record<string, StructureType> = {
      main_dwelling: 'main_dwelling',
      detached_garage: 'detached_garage',
      attached_garage: 'attached_garage',
      shed: 'shed',
      pool_house: 'pool_house',
      guest_house: 'guest_house',
      barn: 'barn',
      other: 'other',
    };
    
    const structureNames: Record<string, string> = {
      main_dwelling: 'Main House',
      detached_garage: 'Detached Garage',
      attached_garage: 'Attached Garage',
      shed: 'Shed',
      pool_house: 'Pool House',
      guest_house: 'Guest House',
      barn: 'Barn',
      other: 'Structure',
    };
    
    const type = structureTypeMap[structureType] || 'other';
    const name = structureNames[structureType] || 'Structure';
    
    createStructure({
      name,
      type,
    });
  }, [createStructure]);

  const handleToolCall = useCallback(
    (toolName: string, _args: unknown, result: string) => {
      setLastToolCall({ name: toolName, result });

      // If room was confirmed, notify parent
      if (toolName === 'confirm_room' && onRoomConfirmed) {
        const confirmedRooms = useGeometryEngine.getState().rooms;
        const latestRoom = confirmedRooms[confirmedRooms.length - 1];
        if (latestRoom) {
          onRoomConfirmed(latestRoom);
        }
      }
    },
    [onRoomConfirmed]
  );

  const handleError = useCallback((error: Error) => {
    console.error('Voice session error:', error);
  }, []);

  const {
    isConnected,
    isListening,
    isSpeaking,
    error,
    startSession,
    stopSession,
    interruptAgent,
  } = useVoiceSession({
    userName,
    onToolCall: handleToolCall,
    onError: handleError,
  });

  const handleStartSession = async () => {
    await startSession();
  };

  const handleStopSession = async () => {
    await stopSession();
  };

  const handleReset = () => {
    resetSession();
    setLastToolCall(null);
  };

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  const hasRooms = rooms.length > 0 || currentRoom;

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  const handlePhotoCaptured = useCallback(async (file: File) => {
    console.log('Photo captured in VoiceSketchController:', {
      name: file.name,
      size: file.size,
      type: file.type,
    });
    
    setIsUploadingPhoto(true);
    const loadingToast = toast.loading('Uploading photo and analyzing...');
    
    try {
      const hierarchyContext = hierarchyPath || 'Exterior';
      const uploadedPhoto = await uploadPhoto({
        file,
        claimId,
        structureId: currentStructure?.id,
        roomId: currentRoom?.id,
        hierarchyPath: hierarchyContext,
      });
      
      toast.dismiss(loadingToast);
      
      if (uploadedPhoto.analysis?.quality) {
        const qualityScore = uploadedPhoto.analysis.quality.score;
        const damageDetected = uploadedPhoto.analysis.content.damageDetected;
        
        if (qualityScore >= 7) {
          toast.success(`Great photo! ${damageDetected ? 'Damage detected.' : ''} ${uploadedPhoto.analysis.content.description}`, {
            duration: 4000,
          });
        } else if (qualityScore >= 5) {
          toast.info(`Photo captured. ${uploadedPhoto.analysis.quality.suggestions[0] || ''}`, {
            duration: 4000,
          });
        } else {
          toast.warning(`Photo quality is low. ${uploadedPhoto.analysis.quality.suggestions.join(' ')}`, {
            duration: 5000,
          });
        }
      } else {
        toast.success(`Photo captured: ${uploadedPhoto.label}`);
      }
      
      addPhoto({
        id: uploadedPhoto.id,
        storageUrl: uploadedPhoto.url,
        label: uploadedPhoto.label,
        hierarchyPath: uploadedPhoto.hierarchyPath,
        structureId: uploadedPhoto.structureId,
        roomId: uploadedPhoto.roomId,
        subRoomId: uploadedPhoto.subRoomId,
        objectId: uploadedPhoto.objectId,
        capturedAt: uploadedPhoto.capturedAt,
        uploadedAt: uploadedPhoto.analyzedAt,
        aiAnalysis: uploadedPhoto.analysis ?? undefined,
      });
      
      console.log('Photo uploaded and analyzed:', uploadedPhoto);
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Photo upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload photo');
      
      addPhoto({
        id: Date.now().toString(),
        label: 'Photo (local)',
        hierarchyPath: hierarchyPath || 'Exterior',
        structureId: currentStructure?.id,
        roomId: currentRoom?.id,
        capturedAt: new Date().toISOString(),
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [addPhoto, claimId, currentStructure, currentRoom, hierarchyPath]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Hierarchy Breadcrumb */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex items-center gap-1 overflow-x-auto">
          {structures.length === 0 ? (
            <span className="text-muted-foreground italic">No structure selected</span>
          ) : (
            <>
              {/* Structure selector dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 font-medium">
                    {currentStructure?.name || 'Select Structure'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Structures</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {structures.map((s) => (
                    <DropdownMenuItem 
                      key={s.id} 
                      onClick={() => selectStructure({ structure_id: s.id })}
                      className={s.id === currentStructure?.id ? 'bg-accent' : ''}
                    >
                      <Home className="h-4 w-4 mr-2" />
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {currentRoom && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{currentRoom.name}</span>
                </>
              )}
            </>
          )}
        </div>
        
        {/* Quick add buttons */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {/* Add Structure dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2">
                <Plus className="h-3 w-3 mr-1" />
                <Building2 className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Add Structure</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddStructure('main_dwelling')}>
                <Home className="h-4 w-4 mr-2" />
                Main House
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('detached_garage')}>
                <Building2 className="h-4 w-4 mr-2" />
                Detached Garage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('attached_garage')}>
                <Building2 className="h-4 w-4 mr-2" />
                Attached Garage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('shed')}>
                <Building2 className="h-4 w-4 mr-2" />
                Shed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('pool_house')}>
                <Building2 className="h-4 w-4 mr-2" />
                Pool House
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('guest_house')}>
                <Home className="h-4 w-4 mr-2" />
                Guest House
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddStructure('barn')}>
                <Building2 className="h-4 w-4 mr-2" />
                Barn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Add Room dropdown - only enabled when a structure is selected */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 px-2"
                disabled={!currentStructure}
                title={!currentStructure ? 'Add a structure first' : 'Add room'}
              >
                <Plus className="h-3 w-3 mr-1" />
                <Home className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Add Room to {currentStructure?.name || 'Structure'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddRoom('bedroom')}>Bedroom</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('bathroom')}>Bathroom</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('kitchen')}>Kitchen</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('living_room')}>Living Room</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('dining_room')}>Dining Room</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('office')}>Office</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('laundry')}>Laundry Room</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('hallway')}>Hallway</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddRoom('closet')}>Closet (Sub-room)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Compact Header with Voice Controls and Waveform - combined for desktop */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background">
        {/* Voice controls - left side */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isConnected ? (
            <Button 
              onClick={handleStartSession} 
              variant="default" 
              size="sm" 
              className="h-7"
              disabled={!userName}
              title={!userName ? "Loading user..." : "Start voice sketching"}
            >
              <Mic className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">Start</span>
            </Button>
          ) : (
            <>
              <Button
                onClick={interruptAgent}
                variant="outline"
                size="sm"
                className="h-7"
                disabled={!isSpeaking}
                title="Stop speaking"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={handleStopSession} variant="destructive" size="sm" className="h-7" title="End session">
                <MicOff className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button onClick={handleReset} variant="ghost" size="sm" className="h-7 w-7 p-0" title="Reset session">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Waveform - center, grows to fill space */}
        <VoiceWaveform
          isConnected={isConnected}
          isListening={isListening}
          isSpeaking={isSpeaking}
          className="flex-1 h-7"
          compact
        />

        {/* Status and actions - right side */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {photos.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <Camera className="h-3 w-3" />
              {photos.length}
            </span>
          )}
          {onSave && hasRooms && (
            <Button 
              onClick={handleSave} 
              variant="default" 
              size="sm"
              className="h-7"
              disabled={isSaving}
              data-testid="button-save-sketch"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              <span className="text-xs">{isSaving ? 'Saving...' : 'Save'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Floating Camera Button - positioned bottom-right on mobile */}
      <div className="fixed bottom-24 right-4 z-40 sm:hidden">
        <FieldCameraButton
          onPhotoCaptured={handlePhotoCaptured}
          disabled={isUploadingPhoto}
        />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mx-3 my-1">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 min-h-0">
        {/* Left Column: Room Preview - takes 2/3 of space */}
        <div className="lg:col-span-2 flex flex-col min-h-[300px] lg:min-h-0">
          <RoomPreview room={currentRoom} className="flex-1" />
          {lastToolCall && (
            <div className="bg-secondary/50 rounded-lg p-2 text-sm mt-2">
              <span className="font-medium text-secondary-foreground">
                {lastToolCall.name}:
              </span>{' '}
              <span className="text-muted-foreground">{lastToolCall.result}</span>
            </div>
          )}
        </div>

        {/* Right Column: Command History & Hierarchy Summary */}
        <div className="flex flex-col min-h-[200px] lg:min-h-0 gap-2">
          <CommandHistory className="flex-1" />
          
          {/* Structures & Rooms Summary */}
          {structures.length > 0 && (
            <div className="bg-muted rounded-lg p-3">
              <h3 className="font-medium text-xs mb-2 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Structures ({structures.length})
              </h3>
              <div className="space-y-2">
                {structures.map((structure) => (
                  <div key={structure.id} className="space-y-0.5">
                    <div 
                      className={cn(
                        "text-xs font-medium flex items-center gap-1 cursor-pointer hover:text-primary",
                        structure.id === currentStructure?.id && "text-primary"
                      )}
                      onClick={() => selectStructure({ structure_id: structure.id })}
                    >
                      <Home className="h-3 w-3" />
                      {structure.name}
                      <span className="text-muted-foreground font-normal">
                        ({structure.rooms.length} rooms)
                      </span>
                    </div>
                    {/* Show rooms in this structure */}
                    {structure.rooms.length > 0 && structure.id === currentStructure?.id && (
                      <div className="pl-4 space-y-0.5">
                        {structure.rooms.map((room) => (
                          <div
                            key={room.id}
                            className="text-xs text-muted-foreground flex justify-between"
                          >
                            <span className="capitalize truncate">
                              {room.name.replace(/_/g, ' ')}
                            </span>
                            <span className="flex-shrink-0 ml-2">
                              {room.width_ft}' × {room.length_ft}'
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Standalone rooms (legacy/backward compatibility) */}
          {rooms.length > 0 && structures.length === 0 && (
            <div className="bg-muted rounded-lg p-3">
              <h3 className="font-medium text-xs mb-1">
                Rooms ({rooms.length})
              </h3>
              <div className="space-y-0.5">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="text-xs text-muted-foreground flex justify-between"
                  >
                    <span className="capitalize truncate">
                      {room.name.replace(/_/g, ' ')}
                    </span>
                    <span className="flex-shrink-0 ml-2">
                      {room.width_ft}' × {room.length_ft}'
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
