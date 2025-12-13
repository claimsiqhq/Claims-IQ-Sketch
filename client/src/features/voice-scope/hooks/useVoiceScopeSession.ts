// Voice Scope Session Hook
// Custom hook wrapping OpenAI RealtimeSession for voice-driven estimate building

import { useState, useRef, useCallback, useEffect } from 'react';
import { RealtimeSession } from '@openai/agents/realtime';
import type { RealtimeItem } from '@openai/agents/realtime';
import { scopeAgent } from '../agents/scope-agent';
import { useScopeEngine } from '../services/scope-engine';

interface UseVoiceScopeSessionOptions {
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (toolName: string, args: unknown, result: string) => void;
  onError?: (error: Error) => void;
  onLineItemAdded?: (item: { code: string; description: string; quantity: number }) => void;
}

interface UseVoiceScopeSessionReturn {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  stopSession: () => void;
  interruptAgent: () => void;
}

export function useVoiceScopeSession(options: UseVoiceScopeSessionOptions = {}): UseVoiceScopeSessionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const { setSessionState, addTranscript } = useScopeEngine();

  // Sync state with scope engine
  useEffect(() => {
    const state = isConnected ? (isSpeaking ? 'connected' : 'connected') : 'idle';
    setSessionState(state);
  }, [isConnected, isSpeaking, setSessionState]);

  // Handle special tool actions that need API calls
  const handleToolAction = useCallback(async (toolName: string, args: unknown, result: string) => {
    // Check if the result is a JSON action that needs backend processing
    try {
      const parsed = JSON.parse(result);

      if (parsed.action === 'search') {
        // Search for line items via API
        const searchParams = new URLSearchParams({ q: parsed.query });
        if (parsed.category) {
          searchParams.append('category', parsed.category);
        }

        const response = await fetch(`/api/ai/search-line-items?${searchParams}`);
        if (response.ok) {
          const { results } = await response.json();
          console.log('Search results:', results);
          // The results would be used by the agent in its next response
        }
      } else if (parsed.action === 'suggest') {
        // Get AI suggestions
        const response = await fetch('/api/ai/quick-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: parsed.basedOn,
            roomName: useScopeEngine.getState().currentRoom || 'general',
            damageType: useScopeEngine.getState().currentDamageType || 'water',
          }),
        });

        if (response.ok) {
          const { suggestions } = await response.json();
          console.log('AI suggestions:', suggestions);
          // Add suggestions as pending items
          if (suggestions && suggestions.length > 0) {
            useScopeEngine.getState().suggestItems({ items: suggestions });
          }
        }
      }
    } catch {
      // Not a JSON action, just a regular result - that's fine
    }

    // Notify callback
    options.onToolCall?.(toolName, args, result);

    // Check if a line item was added
    if (toolName === 'add_line_item' && args && typeof args === 'object') {
      const item = args as { code: string; description: string; quantity: number };
      options.onLineItemAdded?.(item);
    }
  }, [options]);

  const startSession = useCallback(async () => {
    try {
      setError(null);

      // 1. Get ephemeral key from backend
      const response = await fetch('/api/voice/session', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create voice session');
      }
      const { ephemeral_key } = await response.json();

      // 2. Create RealtimeSession with the scope agent
      const session = new RealtimeSession(scopeAgent, {
        transport: 'webrtc',
        config: {
          inputAudioTranscription: { model: 'gpt-4o-mini-transcribe' },
          turnDetection: {
            type: 'semantic_vad',
          },
        },
      });

      // 3. Set up event listeners

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
        console.log('Scope tool call started:', tool.name, details);
      });

      session.on('agent_tool_end', (_context, _agent, tool, result, details) => {
        console.log('Scope tool call completed:', tool.name, result);
        const toolCall = details?.toolCall;
        const args = toolCall && 'arguments' in toolCall ? toolCall.arguments : undefined;
        handleToolAction(tool.name, args, result);
      });

      // History events for transcript
      session.on('history_added', (item: RealtimeItem) => {
        if (item.type === 'message') {
          const role = item.role === 'user' ? 'user' : 'assistant';

          // Extract text content
          const textContent = item.content?.find(
            (c: { type: string }) => c.type === 'text' || c.type === 'input_text'
          );
          if (textContent && 'text' in textContent) {
            const text = textContent.text;
            if (text?.trim()) {
              addTranscript(role, text);
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
              addTranscript(role, text);
              options.onTranscript?.(text, role);
            }
          }
        }
      });

      // Error handling
      session.on('error', (err) => {
        console.error('Scope session error:', err);
        let errorMessage = 'Unknown session error';
        if (err?.error instanceof Error) {
          errorMessage = err.error.message;
        } else if (typeof err?.error === 'string') {
          errorMessage = err.error;
        } else if (typeof err?.error === 'object' && err?.error !== null) {
          const errObj = err.error as Record<string, unknown>;
          if (typeof errObj.message === 'string') {
            errorMessage = errObj.message;
          } else if (typeof errObj.code === 'string') {
            errorMessage = `Error code: ${errObj.code}`;
          } else {
            errorMessage = JSON.stringify(err.error);
          }
        }
        setError(errorMessage);
        setSessionState('error');
        options.onError?.(new Error(errorMessage));
      });

      // 4. Connect
      await session.connect({ apiKey: ephemeral_key });

      sessionRef.current = session;
      setIsConnected(true);
      setIsListening(true);
      setSessionState('connected');

    } catch (err) {
      console.error('Failed to start scope session:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setSessionState('error');
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [addTranscript, handleToolAction, options, setSessionState]);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.error('Error closing scope session:', err);
      }
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setSessionState('idle');
  }, [setSessionState]);

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
          console.error('Error closing scope session on unmount:', err);
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
