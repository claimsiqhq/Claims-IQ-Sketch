// Voice Sketch Controller Component
// Main container for voice-driven room sketching using RealtimeSession

import React, { useState, useCallback } from 'react';
import { Mic, MicOff, Square, Volume2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useGeometryEngine } from '../services/geometry-engine';
import { VoiceWaveform } from './VoiceWaveform';
import { RoomPreview } from './RoomPreview';
import { CommandHistory } from './CommandHistory';
import { cn } from '@/lib/utils';

interface VoiceSketchControllerProps {
  onRoomConfirmed?: (roomData: unknown) => void;
  className?: string;
}

export function VoiceSketchController({
  onRoomConfirmed,
  className,
}: VoiceSketchControllerProps) {
  const [lastToolCall, setLastToolCall] = useState<{
    name: string;
    result: string;
  } | null>(null);

  const { currentRoom, rooms, resetSession } = useGeometryEngine();

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

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-base sm:text-lg font-semibold text-foreground">Voice Sketch</h2>
          {isConnected && (
            <div className="flex items-center gap-2">
              {isListening && (
                <span className="flex items-center gap-1 text-xs sm:text-sm text-green-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="hidden xs:inline">Listening</span>
                </span>
              )}
              {isSpeaking && (
                <span className="flex items-center gap-1 text-xs sm:text-sm text-blue-600">
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  <span className="hidden xs:inline">Speaking</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isConnected ? (
            <Button onClick={handleStartSession} variant="default" size="sm" className="flex-1 sm:flex-none">
              <Mic className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Start Voice Sketching</span>
              <span className="sm:hidden">Start</span>
            </Button>
          ) : (
            <>
              <Button
                onClick={interruptAgent}
                variant="outline"
                size="sm"
                disabled={!isSpeaking}
              >
                <Square className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Stop Speaking</span>
              </Button>
              <Button onClick={handleStopSession} variant="destructive" size="sm">
                <MicOff className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">End Session</span>
              </Button>
            </>
          )}
          <Button onClick={handleReset} variant="ghost" size="sm" title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content - scrollable on mobile */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-auto">
        {/* Left Column: Room Preview - takes 2/3 of space */}
        <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0 lg:col-span-2">
          {/* Voice Waveform */}
          <VoiceWaveform
            isConnected={isConnected}
            isListening={isListening}
            isSpeaking={isSpeaking}
          />

          {/* Room Preview Canvas */}
          <div className="flex-1 min-h-0">
            <RoomPreview room={currentRoom} />
          </div>

          {/* Last Tool Call Feedback */}
          {lastToolCall && (
            <div className="bg-secondary/50 rounded-lg p-3 text-sm">
              <span className="font-medium text-secondary-foreground">
                {lastToolCall.name}:
              </span>{' '}
              <span className="text-muted-foreground">{lastToolCall.result}</span>
            </div>
          )}
        </div>

        {/* Right Column: Command History & Room Summary */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Command History */}
          <div className="flex-1 min-h-0">
            <CommandHistory />
          </div>

          {/* Confirmed Rooms Summary */}
          {rooms.length > 0 && (
            <div className="bg-muted rounded-lg p-4">
              <h3 className="font-medium text-sm mb-2">
                Confirmed Rooms ({rooms.length})
              </h3>
              <div className="space-y-1">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="text-sm text-muted-foreground flex justify-between"
                  >
                    <span className="capitalize">
                      {room.name.replace(/_/g, ' ')}
                    </span>
                    <span>
                      {room.width_ft}' × {room.length_ft}'
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions for users */}
      {!isConnected && !error && (
        <div className="p-4 bg-muted/50 border-t">
          <h3 className="font-medium text-sm mb-2">How to use Voice Sketch</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Click "Start Voice Sketching" and allow microphone access</li>
            <li>
              Describe the room: "Kitchen, 12 by 15, standard ceiling"
            </li>
            <li>Add features: "Door on the south wall, window on the east wall"</li>
            <li>Mark damage: "Category 2 water damage from the sink, 4 feet out"</li>
            <li>Confirm: "That's it for this room"</li>
          </ol>
        </div>
      )}
    </div>
  );
}
