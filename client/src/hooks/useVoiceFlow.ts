/**
 * useVoiceFlow Hook
 *
 * React hook for managing voice-guided flow navigation.
 * Integrates with the voice flow bridge to provide voice commands for flow control.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  voiceFlowBridge,
  VoiceFlowSession,
  VoiceCommandResult,
  VoiceActionHandler,
} from '../lib/voiceFlowBridge';

export interface UseVoiceFlowOptions {
  /** Auto-start session when flowInstanceId is provided */
  autoStart?: boolean;
  /** Callback when a photo capture is triggered */
  onPhotoCaptureRequested?: () => void;
  /** Callback when sketch mode is triggered */
  onSketchRequested?: () => void;
  /** Callback when a zone creation is requested */
  onZoneCreationRequested?: () => void;
  /** Callback when damage marking is requested */
  onDamageMarkingRequested?: () => void;
  /** Callback when flow completes */
  onFlowComplete?: () => void;
  /** Callback when movement changes */
  onMovementChange?: (movementId: string) => void;
  /** Callback for any voice action */
  onAction?: VoiceActionHandler;
}

export interface UseVoiceFlowResult {
  /** Current voice session */
  session: VoiceFlowSession | null;
  /** Whether voice session is active */
  isActive: boolean;
  /** Whether a command is being processed */
  isProcessing: boolean;
  /** Last command result */
  lastResult: VoiceCommandResult | null;
  /** Last response text (for TTS) */
  lastResponse: string;
  /** System context for OpenAI Realtime */
  systemContext: string;
  /** Error message if any */
  error: string | null;
  /** Start a voice session */
  startSession: (flowInstanceId: string) => Promise<void>;
  /** End the current session */
  endSession: () => Promise<void>;
  /** Process a voice command */
  processCommand: (command: string) => Promise<VoiceCommandResult | null>;
  /** Trigger completion of current movement */
  complete: () => Promise<VoiceCommandResult | null>;
  /** Trigger skip of current movement */
  skip: () => Promise<VoiceCommandResult | null>;
  /** Go to previous movement */
  goBack: () => Promise<VoiceCommandResult | null>;
  /** Repeat current instructions */
  repeat: () => Promise<VoiceCommandResult | null>;
  /** Preview next movement */
  previewNext: () => Promise<VoiceCommandResult | null>;
  /** Get help */
  getHelp: () => Promise<VoiceCommandResult | null>;
}

export function useVoiceFlow(
  flowInstanceId?: string,
  options: UseVoiceFlowOptions = {}
): UseVoiceFlowResult {
  const [session, setSession] = useState<VoiceFlowSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<VoiceCommandResult | null>(null);
  const [lastResponse, setLastResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Register action handlers
  useEffect(() => {
    const handlers: Array<() => void> = [];

    // Photo capture handler
    handlers.push(
      voiceFlowBridge.onAction('trigger_photo', () => {
        optionsRef.current.onPhotoCaptureRequested?.();
      })
    );

    // Sketch handler
    handlers.push(
      voiceFlowBridge.onAction('trigger_sketch', () => {
        optionsRef.current.onSketchRequested?.();
      })
    );

    // Zone creation handler
    handlers.push(
      voiceFlowBridge.onAction('trigger_zone_creation', () => {
        optionsRef.current.onZoneCreationRequested?.();
      })
    );

    // Damage marking handler
    handlers.push(
      voiceFlowBridge.onAction('trigger_damage_marker', () => {
        optionsRef.current.onDamageMarkingRequested?.();
      })
    );

    // Flow complete handler
    handlers.push(
      voiceFlowBridge.onAction('flow_complete', () => {
        optionsRef.current.onFlowComplete?.();
      })
    );

    // Movement change handler
    handlers.push(
      voiceFlowBridge.onAction('movement_complete', (action, data) => {
        if (data?.nextMovement) {
          optionsRef.current.onMovementChange?.(data.nextMovement.id);
        }
      })
    );

    handlers.push(
      voiceFlowBridge.onAction('movement_skipped', (action, data) => {
        if (data?.nextMovement) {
          optionsRef.current.onMovementChange?.(data.nextMovement.id);
        }
      })
    );

    handlers.push(
      voiceFlowBridge.onAction('moved_back', (action, data) => {
        if (data?.movement) {
          optionsRef.current.onMovementChange?.(data.movement.id);
        }
      })
    );

    // Generic action handler
    if (optionsRef.current.onAction) {
      handlers.push(voiceFlowBridge.onAnyAction(optionsRef.current.onAction));
    }

    return () => {
      handlers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // Auto-start session if flowInstanceId is provided and autoStart is true
  useEffect(() => {
    if (flowInstanceId && optionsRef.current.autoStart && !session) {
      startSession(flowInstanceId);
    }
  }, [flowInstanceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceFlowBridge.isActive()) {
        voiceFlowBridge.endSession().catch(console.error);
      }
    };
  }, []);

  const startSession = useCallback(async (instanceId: string) => {
    try {
      setError(null);
      setIsProcessing(true);
      const newSession = await voiceFlowBridge.startSession(instanceId);
      setSession(newSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice session';
      setError(message);
      console.error('[useVoiceFlow] Failed to start session:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const endSession = useCallback(async () => {
    try {
      await voiceFlowBridge.endSession();
      setSession(null);
      setLastResult(null);
      setLastResponse('');
    } catch (err) {
      console.error('[useVoiceFlow] Failed to end session:', err);
    }
  }, []);

  const processCommand = useCallback(async (command: string): Promise<VoiceCommandResult | null> => {
    if (!session) {
      setError('No active voice session');
      return null;
    }

    try {
      setError(null);
      setIsProcessing(true);
      const result = await voiceFlowBridge.processCommand(command);
      setLastResult(result);
      setLastResponse(result.response);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process command';
      setError(message);
      console.error('[useVoiceFlow] Failed to process command:', err);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [session]);

  // Convenience methods for common commands
  const complete = useCallback(() => processCommand('complete'), [processCommand]);
  const skip = useCallback(() => processCommand('skip'), [processCommand]);
  const goBack = useCallback(() => processCommand('go back'), [processCommand]);
  const repeat = useCallback(() => processCommand('repeat'), [processCommand]);
  const previewNext = useCallback(() => processCommand("what's next"), [processCommand]);
  const getHelp = useCallback(() => processCommand('help'), [processCommand]);

  return {
    session,
    isActive: session !== null,
    isProcessing,
    lastResult,
    lastResponse,
    systemContext: voiceFlowBridge.getSystemContext(),
    error,
    startSession,
    endSession,
    processCommand,
    complete,
    skip,
    goBack,
    repeat,
    previewNext,
    getHelp,
  };
}

/**
 * Simplified hook for voice command display
 */
export function useVoiceCommands() {
  return {
    commands: [
      { phrase: 'complete', description: 'Mark current step as complete' },
      { phrase: 'skip', description: 'Skip current step (if optional)' },
      { phrase: 'go back', description: 'Return to previous step' },
      { phrase: 'repeat', description: 'Hear instructions again' },
      { phrase: "what's next", description: 'Preview the next step' },
      { phrase: 'help', description: 'List all commands' },
      { phrase: 'take photo', description: 'Capture a photo' },
      { phrase: 'open sketch', description: 'Open sketch mode' },
      { phrase: 'add note [text]', description: 'Record an observation' },
    ],
  };
}
