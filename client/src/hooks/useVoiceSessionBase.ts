// Base Voice Session Hook
// Shared foundation for voice session management used by both sketch and scope
// Encapsulates common WebRTC connection logic, state management, and event handling

import { useState, useRef, useCallback, useEffect } from 'react';
import { RealtimeSession } from '@openai/agents/realtime';
import type { RealtimeItem } from '@openai/agents/realtime';
import type { Agent } from '@openai/agents';
import { logger } from '@/lib/logger';

// Common options shared by all voice session hooks
export interface VoiceSessionBaseOptions {
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (toolName: string, args: unknown, result: string) => void;
  onError?: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

// Return type for the base hook
export interface VoiceSessionBaseReturn {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isConnecting: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  stopSession: () => void;
  interruptAgent: () => void;
  retryConnection: () => Promise<void>;
  sessionRef: React.MutableRefObject<RealtimeSession | null>;
}

// Configuration for the base session
export interface VoiceSessionConfig {
  maxRetries?: number;
  sessionEndpoint?: string;
  logPrefix?: string;
}

const DEFAULT_CONFIG: VoiceSessionConfig = {
  maxRetries: 3,
  sessionEndpoint: '/api/voice/session',
  logPrefix: '[VoiceSession]',
};

/**
 * Base hook for voice session management
 * Provides common functionality for connecting to OpenAI Realtime API
 *
 * @param createAgent - Function that creates the agent for the session
 * @param options - Session options including callbacks
 * @param config - Session configuration
 * @param transcriptHandler - Function to handle transcript entries
 * @returns Voice session state and controls
 */
export function useVoiceSessionBase(
  createAgent: () => Promise<Agent>,
  options: VoiceSessionBaseOptions = {},
  config: VoiceSessionConfig = {},
  transcriptHandler?: (entry: { role: 'user' | 'assistant'; text: string }) => void
): VoiceSessionBaseReturn {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const isCleaningUpRef = useRef(false);
  const retryCountRef = useRef(0);

  /**
   * Request microphone permission
   * Returns true if permission granted, throws error otherwise
   */
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed to trigger the permission prompt
      stream.getTracks().forEach(track => track.stop());
      logger.debug(`${mergedConfig.logPrefix} Microphone permission granted`);
      return true;
    } catch (micError) {
      logger.error(`${mergedConfig.logPrefix} Microphone permission denied:`, micError);
      const micErrorMessage = micError instanceof Error ? micError.message : 'Unknown error';

      if (micErrorMessage.includes('not allowed') || micErrorMessage.includes('denied') || micErrorMessage.includes('Permission denied')) {
        throw new Error('Microphone access denied. Please allow microphone access in your browser settings and try again.');
      } else if (micErrorMessage.includes('not found') || micErrorMessage.includes('NotFoundError')) {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else {
        throw new Error(`Microphone error: ${micErrorMessage}`);
      }
    }
  }, [mergedConfig.logPrefix]);

  /**
   * Fetch ephemeral session key from backend
   */
  const fetchEphemeralKey = useCallback(async (): Promise<string> => {
    const response = await fetch(mergedConfig.sessionEndpoint!, { method: 'POST' });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create voice session');
    }
    const { ephemeral_key } = await response.json();
    return ephemeral_key;
  }, [mergedConfig.sessionEndpoint]);

  /**
   * Set up event listeners on the session
   */
  const setupEventListeners = useCallback((session: RealtimeSession) => {
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
      logger.debug(`${mergedConfig.logPrefix} Tool call started:`, tool.name, details);
    });

    session.on('agent_tool_end', (_context, _agent, tool, result, details) => {
      logger.debug(`${mergedConfig.logPrefix} Tool call completed:`, tool.name, result);
      const toolCall = details?.toolCall;
      const args = toolCall && 'arguments' in toolCall ? toolCall.arguments : undefined;
      options.onToolCall?.(tool.name, args, result);
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
            transcriptHandler?.({ role, text });
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
            transcriptHandler?.({ role, text });
            options.onTranscript?.(text, role);
          }
        }
      }
    });

    // Error handling
    session.on('error', (err) => {
      logger.error(`${mergedConfig.logPrefix} Session error:`, err);
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
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = JSON.stringify(err);
      }

      setError(errorMessage);
      options.onError?.(new Error(errorMessage));
    });
  }, [mergedConfig.logPrefix, options, transcriptHandler]);

  /**
   * Start a voice session
   */
  const startSession = useCallback(async () => {
    try {
      setError(null);
      setIsConnecting(true);
      logger.debug(`${mergedConfig.logPrefix} Starting new session`);

      // 1. Request microphone permission
      await requestMicrophonePermission();

      // 2. Get ephemeral key from backend
      const ephemeralKey = await fetchEphemeralKey();

      // 3. Create the agent
      const agent = await createAgent();

      // 4. Create RealtimeSession with the agent
      const session = new RealtimeSession(agent, {
        transport: 'webrtc',
        config: {
          inputAudioTranscription: { model: 'gpt-4o-mini-transcribe' },
          turnDetection: {
            type: 'semantic_vad',
          },
        },
      });

      // 5. Set up event listeners
      setupEventListeners(session);

      // 6. Connect
      await session.connect({ apiKey: ephemeralKey });

      sessionRef.current = session;
      setIsConnected(true);
      setIsListening(true);
      setIsConnecting(false);
      retryCountRef.current = 0;

      // Notify callback
      options.onSessionStart?.();
      logger.debug(`${mergedConfig.logPrefix} Session connected successfully`);

    } catch (err) {
      logger.error(`${mergedConfig.logPrefix} Failed to start session:`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsConnecting(false);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [createAgent, fetchEphemeralKey, mergedConfig.logPrefix, options, requestMicrophonePermission, setupEventListeners]);

  /**
   * Stop the voice session
   */
  const stopSession = useCallback(() => {
    // Prevent multiple cleanup calls
    if (isCleaningUpRef.current) {
      return;
    }
    isCleaningUpRef.current = true;

    logger.debug(`${mergedConfig.logPrefix} Stopping session and cleaning up resources`);

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        logger.error(`${mergedConfig.logPrefix} Error closing session:`, err);
      }
      sessionRef.current = null;
    }

    // Reset all state
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsConnecting(false);
    setError(null);

    // Reset retry counter
    retryCountRef.current = 0;

    // Notify callback
    options.onSessionEnd?.();

    // Allow cleanup to run again
    isCleaningUpRef.current = false;

    logger.debug(`${mergedConfig.logPrefix} Session stopped and resources cleaned up`);
  }, [mergedConfig.logPrefix, options]);

  /**
   * Interrupt the agent's speech
   */
  const interruptAgent = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.interrupt();
    }
  }, []);

  /**
   * Retry connection after an error
   * Implements exponential backoff
   */
  const retryConnection = useCallback(async () => {
    if (retryCountRef.current >= mergedConfig.maxRetries!) {
      setError(`Connection failed after ${mergedConfig.maxRetries} attempts. Please check your network and try again.`);
      return;
    }

    retryCountRef.current += 1;
    const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 8000);

    logger.debug(`${mergedConfig.logPrefix} Retrying connection (attempt ${retryCountRef.current}/${mergedConfig.maxRetries}) in ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));
    await startSession();
  }, [mergedConfig.logPrefix, mergedConfig.maxRetries, startSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.debug(`${mergedConfig.logPrefix} Component unmounting, cleaning up`);

      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch (err) {
          logger.error(`${mergedConfig.logPrefix} Error closing session on unmount:`, err);
        }
        sessionRef.current = null;
      }
    };
  }, [mergedConfig.logPrefix]);

  return {
    isConnected,
    isListening,
    isSpeaking,
    isConnecting,
    error,
    startSession,
    stopSession,
    interruptAgent,
    retryConnection,
    sessionRef,
  };
}
