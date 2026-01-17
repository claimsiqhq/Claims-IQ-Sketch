/**
 * Voice Input Component
 *
 * Microphone button with visual feedback for voice-to-text input.
 * Designed for hands-free operation in the field.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Loader2, AlertCircle } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function VoiceInput({
  onTranscript,
  placeholder = "Tap to speak",
  className,
  disabled = false,
}: VoiceInputProps) {
  const [state, { startListening, stopListening, resetTranscript }] = useVoiceInput({
    continuous: true,
    interimResults: true,
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        onTranscript(transcript);
      }
    },
  });

  const { isListening, isSupported, interimTranscript, error } = state;

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <MicOff className="h-4 w-4" />
        <span>Voice input not supported</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isListening ? "destructive" : "outline"}
          size="sm"
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            "relative",
            isListening && "animate-pulse"
          )}
        >
          {isListening ? (
            <>
              <Mic className="h-4 w-4 mr-1 animate-bounce" />
              Listening...
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-1" />
              {placeholder}
            </>
          )}
        </Button>

        {/* Recording indicator */}
        {isListening && (
          <div className="flex items-center gap-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs text-red-600">Recording</span>
          </div>
        )}
      </div>

      {/* Interim transcript preview */}
      {interimTranscript && (
        <div className="p-2 bg-muted rounded-lg border border-dashed">
          <p className="text-sm italic text-muted-foreground">
            "{interimTranscript}"
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Inline voice button for compact spaces
 */
interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceButton({
  onTranscript,
  disabled = false,
  className,
}: VoiceButtonProps) {
  const [state, { startListening, stopListening, resetTranscript }] = useVoiceInput({
    continuous: false,
    interimResults: true,
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        onTranscript(transcript);
        stopListening();
      }
    },
  });

  const { isListening, isSupported } = state;

  if (!isSupported) {
    return null;
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "relative",
        isListening && "text-red-600",
        className
      )}
      aria-label={isListening ? "Stop recording" : "Start voice input"}
      aria-pressed={isListening}
    >
      {isListening ? (
        <>
          <Mic className="h-4 w-4 animate-pulse" aria-hidden="true" />
          <span className="absolute -top-1 -right-1 flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        </>
      ) : (
        <Mic className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export default VoiceInput;
