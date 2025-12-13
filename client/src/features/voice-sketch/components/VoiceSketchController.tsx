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
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">Voice Sketch</h2>
          {isConnected && (
            <div className="flex items-center gap-2">
              {isListening && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  Listening
                </span>
              )}
              {isSpeaking && (
                <span className="flex items-center gap-1 text-sm text-blue-600">
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  Speaking
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isConnected ? (
            <Button onClick={handleStartSession} variant="default" size="sm">
              <Mic className="h-4 w-4 mr-2" />
              Start Voice Sketching
            </Button>
          ) : (
            <>
              <Button
                onClick={interruptAgent}
                variant="outline"
                size="sm"
                disabled={!isSpeaking}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Speaking
              </Button>
              <Button onClick={handleStopSession} variant="destructive" size="sm">
                <MicOff className="h-4 w-4 mr-2" />
                End Session
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

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Left Column: Room Preview */}
        <div className="flex flex-col gap-4 min-h-0">
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
