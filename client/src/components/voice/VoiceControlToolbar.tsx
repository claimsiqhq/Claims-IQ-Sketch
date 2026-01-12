// Voice Control Toolbar Component
// Shared toolbar for voice session controls (start, stop, interrupt, reset)
// Used by both VoiceSketchController and VoiceScopeController

import React from 'react';
import { Mic, MicOff, Square, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VoiceStatusIndicator, deriveVoiceStatus } from './VoiceStatusIndicator';
import { VoiceWaveform } from './VoiceWaveform';

interface VoiceControlToolbarProps {
  // Session state
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isConnecting?: boolean;
  isDisabled?: boolean;
  disabledReason?: string;

  // Callbacks
  onStart: () => void;
  onStop: () => void;
  onInterrupt?: () => void;
  onReset?: () => void;
  onClose?: () => void;

  // Customization
  className?: string;
  variant?: 'compact' | 'full' | 'inline';
  showWaveform?: boolean;
  showReset?: boolean;
  showClose?: boolean;
  startLabel?: string;
}

export function VoiceControlToolbar({
  isConnected,
  isListening,
  isSpeaking,
  isConnecting = false,
  isDisabled = false,
  disabledReason,
  onStart,
  onStop,
  onInterrupt,
  onReset,
  onClose,
  className,
  variant = 'full',
  showWaveform = true,
  showReset = true,
  showClose = false,
  startLabel = 'Start',
}: VoiceControlToolbarProps) {
  const status = deriveVoiceStatus(isConnected, isListening, isSpeaking, isConnecting);

  // Compact variant - minimal inline controls
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {!isConnected ? (
          <Button
            onClick={onStart}
            variant="default"
            size="sm"
            className="h-6 px-2"
            disabled={isDisabled || isConnecting}
            title={disabledReason || `${startLabel} voice session`}
          >
            <Mic className="h-3 w-3 mr-1" />
            <span className="text-[10px]">{startLabel}</span>
          </Button>
        ) : (
          <>
            {onInterrupt && (
              <Button
                onClick={onInterrupt}
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={!isSpeaking}
                title="Stop speaking"
                aria-label="Stop assistant speaking"
              >
                <Square className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
            {showWaveform && (
              <VoiceWaveform
                isConnected={isConnected}
                isListening={isListening}
                isSpeaking={isSpeaking}
                className="flex-1 h-6 max-w-[100px]"
                compact
              />
            )}
            <Button
              onClick={onStop}
              variant="destructive"
              size="sm"
              className="h-6 w-6 p-0"
              title="End session"
              aria-label="End voice session"
            >
              <MicOff className="h-3 w-3" aria-hidden="true" />
            </Button>
          </>
        )}
        {showReset && onReset && (
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Reset"
            aria-label="Reset voice session"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  // Inline variant - horizontal controls with status indicator
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <VoiceStatusIndicator status={status} size="sm" showLabel={false} />

        {!isConnected ? (
          <Button
            onClick={onStart}
            variant="default"
            size="sm"
            disabled={isDisabled || isConnecting}
            title={disabledReason || `${startLabel} voice session`}
          >
            <Mic className="h-4 w-4 mr-1" />
            {startLabel}
          </Button>
        ) : (
          <>
            {onInterrupt && (
              <Button
                onClick={onInterrupt}
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={!isSpeaking}
                aria-label="Stop assistant speaking"
              >
                <Square className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
            <Button
              onClick={onStop}
              variant="destructive"
              size="sm"
              className="h-8 px-2"
              aria-label="End voice session"
            >
              <MicOff className="h-3 w-3" aria-hidden="true" />
            </Button>
          </>
        )}

        {showReset && onReset && (
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            title="Reset"
            aria-label="Reset voice session"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}

        {showClose && onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            aria-label="Close voice controls"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  // Full variant - complete controls with waveform
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <VoiceStatusIndicator status={status} size="md" />

      {!isConnected ? (
        <Button
          onClick={onStart}
          variant="default"
          size="default"
          disabled={isDisabled || isConnecting}
          title={disabledReason || `${startLabel} voice session`}
        >
          <Mic className="h-4 w-4 mr-2" />
          {startLabel}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          {onInterrupt && (
            <Button
              onClick={onInterrupt}
              variant="outline"
              size="sm"
              disabled={!isSpeaking}
              title="Interrupt assistant"
              aria-label="Stop assistant speaking"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          {showWaveform && (
            <VoiceWaveform
              isConnected={isConnected}
              isListening={isListening}
              isSpeaking={isSpeaking}
              className="w-32"
            />
          )}

          <Button
            onClick={onStop}
            variant="destructive"
            size="sm"
            title="End voice session"
          >
            <MicOff className="h-4 w-4 mr-1" />
            Stop
          </Button>
        </div>
      )}

      {showReset && onReset && (
        <Button
          onClick={onReset}
          variant="ghost"
          size="sm"
          title="Reset session"
          aria-label="Reset voice session"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}

      {showClose && onClose && (
        <Button onClick={onClose} variant="ghost" size="sm" aria-label="Close voice controls">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
