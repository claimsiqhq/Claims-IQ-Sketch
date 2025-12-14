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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 border-b bg-background">
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

      {/* Voice Waveform - compact bar */}
      <VoiceWaveform
        isConnected={isConnected}
        isListening={isListening}
        isSpeaking={isSpeaking}
        className="mx-4 mt-2"
      />

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

        {/* Right Column: Command History */}
        <div className="flex flex-col min-h-[200px] lg:min-h-0">
          <CommandHistory className="flex-1" />
          {rooms.length > 0 && (
            <div className="bg-muted rounded-lg p-3 mt-2">
              <h3 className="font-medium text-xs mb-1">
                Confirmed ({rooms.length})
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
