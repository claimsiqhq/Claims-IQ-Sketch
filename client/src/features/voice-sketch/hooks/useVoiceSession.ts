// Voice Session Hook
// Custom hook wrapping OpenAI RealtimeSession for voice-driven room sketching

import { useState, useRef, useCallback, useEffect } from 'react';
import { RealtimeSession } from '@openai/agents/realtime';
import type { RealtimeItem } from '@openai/agents/realtime';
import { createRoomSketchAgentAsync } from '../agents/room-sketch-agent';
import { useGeometryEngine } from '../services/geometry-engine';

interface UseVoiceSessionOptions {
  userName?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (toolName: string, args: unknown, result: string) => void;
  onError?: (error: Error) => void;
}

interface UseVoiceSessionReturn {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  stopSession: () => void;
  interruptAgent: () => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSessionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const { setSessionState, addTranscriptEntry } = useGeometryEngine();

  // Sync state with geometry engine
  useEffect(() => {
    setSessionState({
      isConnected,
      isListening,
      isSpeaking,
      error,
    });
  }, [isConnected, isListening, isSpeaking, error, setSessionState]);

  const startSession = useCallback(async () => {
    try {
      setError(null);

      // 0. Explicitly request microphone permission first
      // This ensures the browser prompts for mic access before WebRTC tries to use it
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed to trigger the permission prompt
        stream.getTracks().forEach(track => track.stop());
        console.log('Microphone permission granted');
      } catch (micError) {
        console.error('Microphone permission denied:', micError);
        const micErrorMessage = micError instanceof Error ? micError.message : 'Unknown error';
        if (micErrorMessage.includes('not allowed') || micErrorMessage.includes('denied') || micErrorMessage.includes('Permission denied')) {
          throw new Error('Microphone access denied. Please allow microphone access in your browser settings and try again.');
        } else if (micErrorMessage.includes('not found') || micErrorMessage.includes('NotFoundError')) {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else {
          throw new Error(`Microphone error: ${micErrorMessage}`);
        }
      }

      // 1. Get ephemeral key from backend
      const response = await fetch('/api/voice/session', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create voice session');
      }
      const { ephemeral_key } = await response.json();

      // 2. Create room sketch agent with instructions from database
      const roomSketchAgent = await createRoomSketchAgentAsync(options.userName);

      // 3. Create RealtimeSession with the agent
      const session = new RealtimeSession(roomSketchAgent, {
        transport: 'webrtc',
        config: {
          inputAudioTranscription: { model: 'gpt-4o-mini-transcribe' },
          turnDetection: {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 200,
            silence_duration_ms: 800,
          },
        },
      });

      // 4. Set up event listeners

      // Audio events
      session.on('audio_start', () => {
        setIsSpeaking(true);
        setIsListening(false);
      });

      session.on('audio_stopped', () => {
        setIsSpeaking(false);
        setIsListening(true);
      });

      session.on('audio_interrupted', () => {
        setIsSpeaking(false);
        setIsListening(true);
      });

      // Tool call events
      session.on('agent_tool_start', (_context, _agent, tool, details) => {
        console.log('Tool call started:', tool.name, details);
      });

      session.on('agent_tool_end', (_context, _agent, tool, result, details) => {
        console.log('Tool call completed:', tool.name, result);
        // Extract arguments from toolCall if it's a function call type
        const toolCall = details?.toolCall;
        const args = toolCall && 'arguments' in toolCall ? toolCall.arguments : undefined;
        options.onToolCall?.(tool.name, args, result);
      });

      // History events for transcript
      session.on('history_added', (item: RealtimeItem) => {
        // Handle different item types
        if (item.type === 'message') {
          const role = item.role === 'user' ? 'user' : 'assistant';
          // Extract text content from the message
          const textContent = item.content?.find(
            (c: { type: string }) => c.type === 'text' || c.type === 'input_text'
          );
          if (textContent && 'text' in textContent) {
            const text = textContent.text;
            if (text?.trim()) {
              addTranscriptEntry({ role, text });
              options.onTranscript?.(text, role);
            }
          }
          // Handle audio transcripts
          const audioContent = item.content?.find(
            (c: { type: string }) => c.type === 'input_audio' || c.type === 'audio'
          );
          if (audioContent && 'transcript' in audioContent && audioContent.transcript) {
            const text = audioContent.transcript;
            if (text?.trim()) {
              addTranscriptEntry({ role, text });
              options.onTranscript?.(text, role);
            }
          }
        }
      });

      // Error handling
      session.on('error', (err) => {
        console.error('Session error (full):', JSON.stringify(err, null, 2));
        console.error('Session error object:', err);
        let errorMessage = 'Unknown session error';
        if (err?.error instanceof Error) {
          errorMessage = err.error.message;
        } else if (typeof err?.error === 'string') {
          errorMessage = err.error;
        } else if (typeof err?.error === 'object' && err?.error !== null) {
          // Try to extract message from error object
          const errObj = err.error as Record<string, unknown>;
          if (typeof errObj.message === 'string') {
            errorMessage = errObj.message;
          } else if (typeof errObj.code === 'string') {
            errorMessage = `Error code: ${errObj.code}`;
          } else {
            errorMessage = JSON.stringify(err.error);
          }
        } else if (typeof err === 'object' && err !== null) {
          errorMessage = JSON.stringify(err);
        }
        setError(errorMessage);
        options.onError?.(new Error(errorMessage));
      });

      // 5. Connect - WebRTC in browser automatically handles mic/speaker
      await session.connect({ apiKey: ephemeral_key });

      sessionRef.current = session;
      setIsConnected(true);
      setIsListening(true);

    } catch (err) {
      console.error('Failed to start session:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [addTranscriptEntry, options]);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.error('Error closing session:', err);
      }
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const interruptAgent = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.interrupt();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch (err) {
          console.error('Error closing session on unmount:', err);
        }
      }
    };
  }, []);

  return {
    isConnected,
    isListening,
    isSpeaking,
    error,
    startSession,
    stopSession,
    interruptAgent,
  };
}
