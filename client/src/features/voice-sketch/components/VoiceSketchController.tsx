// Voice Sketch Controller Component
// Main container for voice-driven room sketching using RealtimeSession
// Hierarchy: Structure > Room > Sub-room > Object

import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle, RotateCcw, Plus, Home, Building2, Save, Loader2, ChevronRight, Camera, Layers, Triangle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useGeometryEngine, type PhotoCaptureConfig } from '../services/geometry-engine';
import { VoiceControlToolbar } from '@/components/voice/VoiceControlToolbar';
import { RoomPreview } from './RoomPreview';
import { CommandHistory } from './CommandHistory';
import { FieldCameraButton } from './FieldCameraButton';
import { VoicePhotoCapture, type PhotoCaptureResult } from './VoicePhotoCapture';
import { cn } from '@/lib/utils';
import { uploadPhoto } from '@/lib/api';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Initialize geometry engine with claimId when claimId changes
  useEffect(() => {
    if (claimId) {
      useGeometryEngine.getState().setClaimId(claimId);
    }
  }, [claimId]);

  const {
    currentRoom,
    rooms,
    structures,
    currentStructure,
    photos,
    pendingPhotoCapture,
    undoStack,
    resetSession,
    createRoom,
    confirmRoom,
    createStructure,
    selectStructure,
    getCurrentHierarchyPath,
    addPhoto,
    clearPendingPhotoCapture,
    setLastCapturedPhotoId,
    undo,
  } = useGeometryEngine();

  // Get current hierarchy path for display
  const hierarchyPath = getCurrentHierarchyPath();

  // Helper to get total room count for a structure including current room being edited
  const getStructureRoomCount = useCallback((structure: typeof structures[0]) => {
    let count = structure.rooms.length;
    // Add 1 if currentRoom belongs to this structure but hasn't been confirmed yet
    if (currentRoom && currentRoom.structureId === structure.id) {
      const alreadyInStructure = structure.rooms.some(r => r.id === currentRoom.id);
      if (!alreadyInStructure) {
        count += 1;
      }
    }
    return count;
  }, [currentRoom]);

  // Manual room creation handler
  const handleAddRoom = useCallback((roomType: string) => {
    if (!currentStructure) {
      // Structure required - user will see UI feedback
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

  // Exterior zone creation handler (Roof, Elevations, Deck)
  const handleAddExteriorZone = useCallback((zoneType: string) => {
    if (!currentStructure) {
      // Structure required - user will see UI feedback
      return;
    }

    // Exterior zones with typical dimensions for estimating
    const exteriorDefaults: Record<string, { width: number; length: number; name: string; ceilingHeight?: number }> = {
      // Roof zones - width/length represent footprint, ceiling height not applicable
      roof_main: { width: 40, length: 30, name: 'Roof - Main', ceilingHeight: 0 },
      roof_garage: { width: 24, length: 24, name: 'Roof - Garage', ceilingHeight: 0 },
      roof_porch: { width: 12, length: 8, name: 'Roof - Porch', ceilingHeight: 0 },
      // Elevation zones - width is wall length, length is wall height
      elevation_front: { width: 40, length: 10, name: 'Elevation - Front', ceilingHeight: 0 },
      elevation_back: { width: 40, length: 10, name: 'Elevation - Back', ceilingHeight: 0 },
      elevation_left: { width: 30, length: 10, name: 'Elevation - Left Side', ceilingHeight: 0 },
      elevation_right: { width: 30, length: 10, name: 'Elevation - Right Side', ceilingHeight: 0 },
      // Other exterior zones
      deck: { width: 16, length: 12, name: 'Deck', ceilingHeight: 0 },
      patio: { width: 16, length: 12, name: 'Patio', ceilingHeight: 0 },
      fence: { width: 100, length: 6, name: 'Fence', ceilingHeight: 0 },
      driveway: { width: 20, length: 40, name: 'Driveway', ceilingHeight: 0 },
      siding: { width: 40, length: 10, name: 'Siding Section', ceilingHeight: 0 },
      gutters: { width: 100, length: 1, name: 'Gutters', ceilingHeight: 0 },
    };

    const defaults = exteriorDefaults[zoneType] || { width: 20, length: 20, name: 'Exterior Zone', ceilingHeight: 0 };
    createRoom({
      name: defaults.name,
      shape: 'rectangle',
      width_ft: defaults.width,
      length_ft: defaults.length,
      ceiling_height_ft: defaults.ceilingHeight ?? 0,
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

  // Map of tool names to user-friendly action names and toast types
  const getToolFeedback = useCallback((toolName: string, result: string): { message: string; type: 'success' | 'info' | 'warning' } => {
    const isError = result.toLowerCase().startsWith('error');
    if (isError) {
      return { message: result, type: 'warning' };
    }

    // Tool-specific feedback
    const feedbackMap: Record<string, { prefix: string; type: 'success' | 'info' }> = {
      create_room: { prefix: '🏠', type: 'success' },
      edit_room: { prefix: '✏️', type: 'success' },
      delete_room: { prefix: '🗑️', type: 'info' },
      confirm_room: { prefix: '✅', type: 'success' },
      add_opening: { prefix: '🚪', type: 'success' },
      delete_opening: { prefix: '🗑️', type: 'info' },
      add_feature: { prefix: '📦', type: 'success' },
      delete_feature: { prefix: '🗑️', type: 'info' },
      mark_damage: { prefix: '⚠️', type: 'success' },
      edit_damage_zone: { prefix: '✏️', type: 'success' },
      delete_damage_zone: { prefix: '🗑️', type: 'info' },
      create_structure: { prefix: '🏗️', type: 'success' },
      select_structure: { prefix: '🔄', type: 'info' },
      select_wall: { prefix: '📍', type: 'info' },
      move_wall: { prefix: '↔️', type: 'success' },
      update_wall_properties: { prefix: '✏️', type: 'success' },
      modify_dimension: { prefix: '📏', type: 'success' },
      add_note: { prefix: '📝', type: 'success' },
      undo: { prefix: '↩️', type: 'info' },
      capture_photo: { prefix: '📷', type: 'info' },
    };

    const feedback = feedbackMap[toolName] || { prefix: '✓', type: 'info' as const };
    return { message: `${feedback.prefix} ${result}`, type: feedback.type };
  }, []);

  const handleToolCall = useCallback(
    (toolName: string, _args: unknown, result: string) => {
      setLastToolCall({ name: toolName, result });

      // Show toast notification for voice command feedback
      const feedback = getToolFeedback(toolName, result);
      if (feedback.type === 'success') {
        toast.success(feedback.message, { duration: 3000 });
      } else if (feedback.type === 'warning') {
        toast.warning(feedback.message, { duration: 4000 });
      } else {
        toast.info(feedback.message, { duration: 2500 });
      }

      // If room was confirmed, notify parent
      if (toolName === 'confirm_room' && onRoomConfirmed) {
        const confirmedRooms = useGeometryEngine.getState().rooms;
        const latestRoom = confirmedRooms[confirmedRooms.length - 1];
        if (latestRoom) {
          onRoomConfirmed(latestRoom);
        }
      }
    },
    [onRoomConfirmed, getToolFeedback]
  );

  const handleError = useCallback((error: Error) => {
    // Show error toast for voice session errors
    toast.error(`Voice session error: ${error.message}`, { duration: 5000 });
  }, []);

  const handleSessionStart = useCallback(() => {
    toast.success('Voice session started. You can speak now.', { duration: 2000 });
  }, []);

  const handleSessionEnd = useCallback(() => {
    toast.info('Voice session ended', { duration: 2000 });
  }, []);

  const {
    isConnected,
    isListening,
    isSpeaking,
    error,
    startSession,
    stopSession,
    interruptAgent,
    retryConnection,
  } = useVoiceSession({
    userName,
    claimId, // Pass claimId for prerequisite checks (briefing + workflow required)
    onToolCall: handleToolCall,
    onError: handleError,
    onSessionStart: handleSessionStart,
    onSessionEnd: handleSessionEnd,
  });

  const handleStartSession = async () => {
    await startSession();
  };

  const handleStopSession = async () => {
    await stopSession();
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    resetSession();
    setLastToolCall(null);
    setShowResetConfirm(false);
    toast.info('Sketch session reset', {
      description: 'All unsaved changes have been cleared.',
    });
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
    logger.debug('Photo captured in VoiceSketchController', { name: file.name, size: file.size, type: file.type });
    
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
      
      logger.debug('Photo uploaded and analyzed', { photoId: uploadedPhoto.id });
    } catch (error) {
      toast.dismiss(loadingToast);
      logger.error('Photo upload error', error);
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

  // Handler for voice-triggered photo capture
  const handleVoicePhotoCapture = useCallback(
    async (data: { blob: Blob; timestamp: Date }): Promise<PhotoCaptureResult> => {
      try {
        const hierarchyContext = hierarchyPath || 'Exterior';
        const uploadedPhoto = await uploadPhoto({
          file: new File([data.blob], `voice-capture-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          }),
          claimId,
          structureId: currentStructure?.id,
          roomId: pendingPhotoCapture?.roomId || currentRoom?.id,
          hierarchyPath: hierarchyContext,
        });

        // Track the last captured photo ID
        setLastCapturedPhotoId(uploadedPhoto.id);

        // Add to photo album
        addPhoto({
          id: uploadedPhoto.id,
          storageUrl: uploadedPhoto.url,
          label: pendingPhotoCapture?.suggestedLabel || uploadedPhoto.label,
          hierarchyPath: uploadedPhoto.hierarchyPath,
          structureId: uploadedPhoto.structureId,
          roomId: uploadedPhoto.roomId || pendingPhotoCapture?.roomId,
          subRoomId: uploadedPhoto.subRoomId,
          objectId: uploadedPhoto.objectId,
          capturedAt: uploadedPhoto.capturedAt,
          uploadedAt: uploadedPhoto.analyzedAt,
          aiAnalysis: uploadedPhoto.analysis ?? undefined,
        });

        // Determine quality assessment from score
        const qualityScore = uploadedPhoto.analysis?.quality?.score || 5;
        let qualityAssessment: 'good' | 'fair' | 'poor' = 'fair';
        if (qualityScore >= 7) qualityAssessment = 'good';
        else if (qualityScore < 5) qualityAssessment = 'poor';

        return {
          status: 'captured',
          photo_id: uploadedPhoto.id,
          ai_analysis: {
            description: uploadedPhoto.analysis?.content?.description,
            damage_detected: uploadedPhoto.analysis?.content?.damageDetected,
            damage_types: uploadedPhoto.analysis?.content?.damageTypes,
            quality_issues: uploadedPhoto.analysis?.quality?.issues,
            quality_score: qualityScore,
          },
          quality_assessment: qualityAssessment,
        };
      } catch (error) {
        logger.error('Voice photo capture error', error);
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to capture photo',
        };
      }
    },
    [
      addPhoto,
      claimId,
      currentRoom,
      currentStructure,
      hierarchyPath,
      pendingPhotoCapture,
      setLastCapturedPhotoId,
    ]
  );

  // Handler for voice photo capture cancel
  const handleVoicePhotoCaptureCancel = useCallback(() => {
    clearPendingPhotoCapture();
  }, [clearPendingPhotoCapture]);

  // Handler for voice photo capture complete
  const handleVoicePhotoCaptureComplete = useCallback(
    (result: PhotoCaptureResult) => {
      clearPendingPhotoCapture();

      // Show toast based on result
      if (result.status === 'captured') {
        if (result.quality_assessment === 'good') {
          toast.success('Photo captured successfully!');
        } else if (result.quality_assessment === 'poor') {
          toast.warning('Photo quality is low. Consider retaking.');
        } else {
          toast.info('Photo captured.');
        }
      } else if (result.status === 'error') {
        toast.error(result.error || 'Photo capture failed');
      }
    },
    [clearPendingPhotoCapture]
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Combined Hierarchy + Voice Controls Bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 border-b text-sm">
        {/* Left: Hierarchy breadcrumb */}
        <div className="flex items-center gap-1 min-w-0 flex-shrink-0">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {structures.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No structure</span>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs font-medium">
                        {currentStructure?.name || 'Select'}
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
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-medium">Select Structure</p>
                <p className="text-xs text-muted-foreground">Choose which structure to work on</p>
              </TooltipContent>
            </Tooltip>
              {currentRoom && (
                <>
                  <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium truncate max-w-[80px]">{currentRoom.name}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Center: Voice controls - using shared VoiceControlToolbar */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          <VoiceControlToolbar
            isConnected={isConnected}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isDisabled={!userName}
            disabledReason={!userName ? "Loading user..." : undefined}
            onStart={handleStartSession}
            onStop={handleStopSession}
            onInterrupt={interruptAgent}
            variant="compact"
            showWaveform={true}
            showReset={false}
            startLabel="Start"
          />
        </div>

        {/* Right: Add buttons + actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Add Structure */}
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Plus className="h-3 w-3" />
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
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Add Room</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddRoom('bedroom')} disabled={!currentStructure}>Bedroom</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('bathroom')} disabled={!currentStructure}>Bathroom</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('kitchen')} disabled={!currentStructure}>Kitchen</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('living_room')} disabled={!currentStructure}>Living Room</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('dining_room')} disabled={!currentStructure}>Dining Room</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddRoom('office')} disabled={!currentStructure}>Office</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Exterior Zones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAddExteriorZone('roof_main')} disabled={!currentStructure}>
                <Triangle className="h-4 w-4 mr-2" />
                Roof - Main
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddExteriorZone('elevation_front')} disabled={!currentStructure}>
                <Layers className="h-4 w-4 mr-2" />
                Front Elevation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddExteriorZone('deck')} disabled={!currentStructure}>Deck</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">Add Structure or Room</p>
              <p className="text-xs text-muted-foreground">Create a new structure, room, or exterior zone</p>
            </TooltipContent>
          </Tooltip>

          {/* Undo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => undo(1)}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={undoStack.length === 0}
              >
                <Undo2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">Undo</p>
              <p className="text-xs text-muted-foreground">Undo the last action</p>
            </TooltipContent>
          </Tooltip>
          {/* Reset */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleReset} variant="ghost" size="sm" className="h-6 w-6 p-0">
                <RotateCcw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">Reset Session</p>
              <p className="text-xs text-muted-foreground">Clear all rooms and start over</p>
            </TooltipContent>
          </Tooltip>
          {photos.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
              <Camera className="h-2.5 w-2.5" />
              {photos.length}
            </span>
          )}
          {onSave && hasRooms && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSave}
                  variant="default"
                  size="sm"
                  className="h-6 px-2"
                  disabled={isSaving}
                  data-testid="button-save-sketch"
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="font-medium">Save Sketch</p>
                <p className="text-xs text-muted-foreground">Save rooms and damage zones to claim</p>
              </TooltipContent>
            </Tooltip>
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

      {/* Error Alert with Retry option */}
      {error && (
        <Alert variant="destructive" className="mx-3 my-1">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-6 px-2 text-xs"
              onClick={retryConnection}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content - Resizable on desktop, stacked on mobile */}
      <div className="flex-1 min-h-0 lg:hidden flex flex-col gap-4 p-4">
        {/* Mobile: stacked layout */}
        <div className="flex flex-col min-h-[300px]">
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
        <div className="flex flex-col min-h-[200px] gap-2">
          <CommandHistory className="flex-1" />
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
                        ({getStructureRoomCount(structure)} room{getStructureRoomCount(structure) !== 1 ? 's' : ''})
                      </span>
                    </div>
                    {(structure.rooms.length > 0 || (currentRoom && currentRoom.structureId === structure.id)) && structure.id === currentStructure?.id && (
                      <div className="pl-4 space-y-0.5">
                        {structure.rooms.map((room) => (
                          <div key={room.id} className="text-xs text-muted-foreground flex justify-between">
                            <span className="capitalize truncate">{room.name.replace(/_/g, ' ')}</span>
                            <span className="flex-shrink-0 ml-2">{room.width_ft}' × {room.length_ft}'</span>
                          </div>
                        ))}
                        {currentRoom && currentRoom.structureId === structure.id && !structure.rooms.some(r => r.id === currentRoom.id) && (
                          <div className="text-xs text-primary flex justify-between italic">
                            <span className="capitalize truncate">{currentRoom.name.replace(/_/g, ' ')} (editing)</span>
                            <span className="flex-shrink-0 ml-2">{currentRoom.width_ft}' × {currentRoom.length_ft}'</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rooms.length > 0 && structures.length === 0 && (
            <div className="bg-muted rounded-lg p-3">
              <h3 className="font-medium text-xs mb-1">Rooms ({rooms.length})</h3>
              <div className="space-y-0.5">
                {rooms.map((room) => (
                  <div key={room.id} className="text-xs text-muted-foreground flex justify-between">
                    <span className="capitalize truncate">{room.name.replace(/_/g, ' ')}</span>
                    <span className="flex-shrink-0 ml-2">{room.width_ft}' × {room.length_ft}'</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop: Resizable panels */}
      <div className="flex-1 min-h-0 hidden lg:block p-2">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
          {/* Left Panel: Room Preview (resizable) */}
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="h-full flex flex-col p-3">
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
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel: Command History & Summary (resizable) */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <div className="h-full flex flex-col gap-2 p-3 overflow-y-auto">
              <CommandHistory className="flex-1 min-h-[150px]" />
              
              {structures.length > 0 && (
                <div className="bg-muted rounded-lg p-3 flex-shrink-0">
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
                            ({getStructureRoomCount(structure)} room{getStructureRoomCount(structure) !== 1 ? 's' : ''})
                          </span>
                        </div>
                        {(structure.rooms.length > 0 || (currentRoom && currentRoom.structureId === structure.id)) && structure.id === currentStructure?.id && (
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
                            {currentRoom && currentRoom.structureId === structure.id && !structure.rooms.some(r => r.id === currentRoom.id) && (
                              <div className="text-xs text-primary flex justify-between italic">
                                <span className="capitalize truncate">{currentRoom.name.replace(/_/g, ' ')} (editing)</span>
                                <span className="flex-shrink-0 ml-2">{currentRoom.width_ft}' × {currentRoom.length_ft}'</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {rooms.length > 0 && structures.length === 0 && (
                <div className="bg-muted rounded-lg p-3 flex-shrink-0">
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
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Voice-triggered photo capture overlay */}
      <VoicePhotoCapture
        isOpen={!!pendingPhotoCapture}
        config={pendingPhotoCapture}
        roomName={currentRoom?.name}
        onCapture={handleVoicePhotoCapture}
        onCancel={handleVoicePhotoCaptureCancel}
        onComplete={handleVoicePhotoCaptureComplete}
      />

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Sketch Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all rooms, structures, and unsaved changes in the current sketch session. 
              This action cannot be undone. Make sure you've saved your work if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowResetConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reset Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
