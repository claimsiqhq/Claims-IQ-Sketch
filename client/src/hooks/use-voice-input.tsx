/**
 * useVoiceInput Hook
 *
 * Voice-to-text input using Web Speech API.
 * Provides hands-free data entry for field adjusters.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface VoiceInputConfig {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface VoiceInputState {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

interface VoiceInputControls {
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

// Extend window for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useVoiceInput({
  continuous = false,
  interimResults = true,
  language = "en-US",
  onResult,
  onError,
}: VoiceInputConfig = {}): [VoiceInputState, VoiceInputControls] {
  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    isSupported: false,
    transcript: "",
    interimTranscript: "",
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    setState(prev => ({ ...prev, isSupported }));

    if (isSupported) {
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = language;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        setState(prev => ({
          ...prev,
          transcript: prev.transcript + finalTranscript,
          interimTranscript,
        }));

        if (finalTranscript && onResult) {
          onResult(finalTranscript, true);
        } else if (interimTranscript && onResult) {
          onResult(interimTranscript, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errorMessage = getErrorMessage(event.error);
        setState(prev => ({
          ...prev,
          error: errorMessage,
          isListening: false,
        }));
        if (onError) {
          onError(errorMessage);
        }
      };

      recognition.onend = () => {
        setState(prev => ({
          ...prev,
          isListening: false,
          interimTranscript: "",
        }));
      };

      recognition.onstart = () => {
        setState(prev => ({
          ...prev,
          isListening: true,
          error: null,
        }));
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [continuous, interimResults, language, onResult, onError]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !state.isListening) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        // Already started
        console.warn("Recognition already started");
      }
    }
  }, [state.isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && state.isListening) {
      recognitionRef.current.stop();
    }
  }, [state.isListening]);

  const resetTranscript = useCallback(() => {
    setState(prev => ({
      ...prev,
      transcript: "",
      interimTranscript: "",
    }));
  }, []);

  return [
    state,
    {
      startListening,
      stopListening,
      resetTranscript,
    },
  ];
}

function getErrorMessage(error: string): string {
  switch (error) {
    case "no-speech":
      return "No speech detected. Please try again.";
    case "audio-capture":
      return "No microphone detected. Please check your device.";
    case "not-allowed":
      return "Microphone access denied. Please allow microphone access.";
    case "network":
      return "Network error. Please check your connection.";
    case "aborted":
      return "Speech recognition was stopped.";
    case "service-not-allowed":
      return "Speech recognition service not available.";
    default:
      return `Speech recognition error: ${error}`;
  }
}

export default useVoiceInput;
