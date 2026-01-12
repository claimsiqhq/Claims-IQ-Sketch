// Voice Scope Controller Component
// Compact controller for voice-driven estimate building
// Uses shared voice components for consistency with VoiceSketchController

import React, { useState, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceControlToolbar } from '@/components/voice/VoiceControlToolbar';
import { VoiceStatusIndicator, deriveVoiceStatus } from '@/components/voice/VoiceStatusIndicator';
import { useVoiceScopeSession } from '../hooks/useVoiceScopeSession';
import { useScopeEngine } from '../services/scope-engine';
import { cn } from '@/lib/utils';

interface VoiceScopeControllerProps {
  claimId?: string; // Claim ID for context-aware scope generation
  onLineItemAdded?: (item: { code: string; description: string; quantity: number; unit: string }) => void;
  onClose?: () => void;
  className?: string;
}

export function VoiceScopeController({
  claimId,
  onLineItemAdded,
  onClose,
  className,
}: VoiceScopeControllerProps) {
  const [lastToolCall, setLastToolCall] = useState<{
    name: string;
    result: string;
  } | null>(null);

  const { lineItems, pendingItems, transcript, resetSession } = useScopeEngine();

  const handleToolCall = useCallback(
    (toolName: string, _args: unknown, result: string) => {
      setLastToolCall({ name: toolName, result });
    },
    []
  );

  const handleLineItemAdded = useCallback(
    (item: { code: string; description: string; quantity: number }) => {
      onLineItemAdded?.({ ...item, unit: 'EA' }); // Default unit if not provided
    },
    [onLineItemAdded]
  );

  const handleError = useCallback((error: Error) => {
    // Error handled by useVoiceScopeSession hook
  }, []);

  const {
    isConnected,
    isListening,
    isSpeaking,
    error,
    startSession,
    stopSession,
    interruptAgent,
  } = useVoiceScopeSession({
    claimId,
    onToolCall: handleToolCall,
    onError: handleError,
    onLineItemAdded: handleLineItemAdded,
  });

  const handleReset = () => {
    resetSession();
    setLastToolCall(null);
  };

  const status = deriveVoiceStatus(isConnected, isListening, isSpeaking);

  return (
    <div className={cn('flex flex-col bg-background border rounded-lg shadow-lg', className)}>
      {/* Header with shared voice controls */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Voice Scope Builder</h3>
          {isConnected && (
            <VoiceStatusIndicator
              status={status}
              size="sm"
              showLabel={true}
            />
          )}
        </div>

        <VoiceControlToolbar
          isConnected={isConnected}
          isListening={isListening}
          isSpeaking={isSpeaking}
          onStart={startSession}
          onStop={stopSession}
          onInterrupt={interruptAgent}
          onReset={handleReset}
          onClose={onClose}
          variant="inline"
          showWaveform={false}
          showReset={true}
          showClose={!!onClose}
          startLabel="Start"
        />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="m-2 py-2">
          <AlertCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Transcript */}
        <ScrollArea className="flex-1 p-3 max-h-[200px]">
          {transcript.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">
              {isConnected
                ? 'Start speaking to add line items...'
                : 'Click "Start" to begin voice input'}
            </div>
          ) : (
            <div className="space-y-2">
              {transcript.slice(-10).map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'text-xs p-2 rounded',
                    entry.role === 'user'
                      ? 'bg-primary/10 text-primary ml-4'
                      : 'bg-muted mr-4'
                  )}
                >
                  {entry.content}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Last Tool Call Feedback */}
        {lastToolCall && (
          <div className="mx-3 mb-2 bg-secondary/50 rounded p-2 text-xs">
            <span className="font-medium text-secondary-foreground">
              {lastToolCall.name}:
            </span>{' '}
            <span className="text-muted-foreground">{lastToolCall.result}</span>
          </div>
        )}

        {/* Pending Suggestions */}
        {pendingItems.length > 0 && (
          <div className="mx-3 mb-2 bg-amber-50 border border-amber-200 rounded p-2">
            <p className="text-xs font-medium text-amber-800 mb-1">
              Pending suggestions ({pendingItems.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {pendingItems.map((item) => (
                <Badge key={item.id} variant="outline" className="text-xs">
                  {item.description}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Added Items Summary */}
        {lineItems.length > 0 && (
          <div className="border-t p-3 bg-muted/30">
            <p className="text-xs font-medium mb-2">
              Added via voice ({lineItems.length} items):
            </p>
            <div className="flex flex-wrap gap-1">
              {lineItems.slice(-5).map((item) => (
                <Badge key={item.id} variant="secondary" className="text-xs">
                  {item.quantity} {item.unit} {item.description.slice(0, 20)}...
                </Badge>
              ))}
              {lineItems.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{lineItems.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {!isConnected && !error && (
        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Try saying:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>"Add drywall demo, 200 square feet"</li>
            <li>"Water extraction for the bedroom, 150 SF"</li>
            <li>"Remove the last item"</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default VoiceScopeController;
