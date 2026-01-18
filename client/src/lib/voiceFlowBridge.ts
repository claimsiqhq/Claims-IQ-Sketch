/**
 * Voice-Flow Bridge
 *
 * Client-side service that bridges voice commands with the flow engine.
 * Provides context injection for voice sessions and command handling.
 */

import * as api from './api';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface VoiceFlowSession {
  sessionId: string;
  flowInstanceId: string;
  currentMovementId: string;
  systemContext: string;
  wsEndpoint: string;
}

export interface VoiceCommandResult {
  action: string;
  response: string;
  data?: {
    nextMovement?: FlowMovement;
    movement?: FlowMovement;
    note?: string;
    observation?: string;
    flowInstanceId?: string;
    movementId?: string;
    awaitingZoneName?: boolean;
    awaitingDamageType?: boolean;
  };
}

export interface FlowMovement {
  id: string;
  name: string;
  description?: string;
  isRequired?: boolean;
}

export type VoiceActionHandler = (action: string, data?: VoiceCommandResult['data']) => void;

// ============================================
// VOICE FLOW BRIDGE CLASS
// ============================================

export class VoiceFlowBridge {
  private session: VoiceFlowSession | null = null;
  private actionHandlers: Map<string, VoiceActionHandler[]> = new Map();

  /**
   * Start a voice-guided session for a flow instance
   */
  async startSession(flowInstanceId: string): Promise<VoiceFlowSession> {
    const response = await fetch('/api/voice-inspection/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ flowInstanceId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start voice session');
    }

    const data = await response.json();
    this.session = {
      sessionId: data.sessionId,
      flowInstanceId,
      currentMovementId: data.currentMovement,
      systemContext: data.systemContext,
      wsEndpoint: data.wsEndpoint,
    };

    return this.session;
  }

  /**
   * Process a voice command and get the result
   */
  async processCommand(command: string): Promise<VoiceCommandResult> {
    if (!this.session) {
      throw new Error('No active voice session');
    }

    const response = await fetch('/api/voice-inspection/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        sessionId: this.session.sessionId,
        command,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process command');
    }

    const result: VoiceCommandResult = await response.json();

    // Update current movement if changed
    if (result.data?.nextMovement) {
      this.session.currentMovementId = result.data.nextMovement.id;
    } else if (result.data?.movement) {
      this.session.currentMovementId = result.data.movement.id;
    }

    // Notify action handlers
    this.notifyHandlers(result.action, result.data);

    return result;
  }

  /**
   * End the current voice session
   */
  async endSession(): Promise<void> {
    if (!this.session) return;

    try {
      await fetch('/api/voice-inspection/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: this.session.sessionId }),
      });
    } finally {
      this.session = null;
    }
  }

  /**
   * Get the current session
   */
  getSession(): VoiceFlowSession | null {
    return this.session;
  }

  /**
   * Get the system context for OpenAI Realtime
   */
  getSystemContext(): string {
    return this.session?.systemContext || '';
  }

  /**
   * Check if a session is active
   */
  isActive(): boolean {
    return this.session !== null;
  }

  /**
   * Register a handler for voice actions
   */
  onAction(action: string, handler: VoiceActionHandler): () => void {
    if (!this.actionHandlers.has(action)) {
      this.actionHandlers.set(action, []);
    }
    this.actionHandlers.get(action)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.actionHandlers.get(action);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Register a handler for all actions
   */
  onAnyAction(handler: VoiceActionHandler): () => void {
    return this.onAction('*', handler);
  }

  /**
   * Notify handlers of an action
   */
  private notifyHandlers(action: string, data?: VoiceCommandResult['data']): void {
    // Notify specific handlers
    const handlers = this.actionHandlers.get(action);
    if (handlers) {
      handlers.forEach((h) => h(action, data));
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.actionHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((h) => h(action, data));
    }
  }
}

// ============================================
// VOICE COMMAND UTILITIES
// ============================================

/**
 * List of recognized voice commands
 */
export const VOICE_COMMANDS = {
  COMPLETE: ['complete', 'done', 'finished', 'mark complete'],
  SKIP: ['skip', 'pass', 'skip this'],
  GO_BACK: ['go back', 'previous', 'back'],
  REPEAT: ['repeat', 'say again', 'what was that'],
  WHATS_NEXT: ["what's next", 'next step', 'preview'],
  HELP: ['help', 'commands', 'what can i say'],
  TAKE_PHOTO: ['take photo', 'capture photo', 'photo'],
  OPEN_SKETCH: ['open sketch', 'start sketch', 'draw', 'sketch'],
  ADD_ZONE: ['add zone', 'new zone', 'create zone'],
  ADD_DAMAGE: ['add damage', 'mark damage', 'damage here'],
  ADD_NOTE: ['add note', 'note'],
};

/**
 * Check if text matches a voice command category
 */
export function matchesCommand(text: string, commandKey: keyof typeof VOICE_COMMANDS): boolean {
  const normalized = text.toLowerCase().trim();
  const patterns = VOICE_COMMANDS[commandKey];
  return patterns.some((p) => normalized.startsWith(p) || normalized === p);
}

/**
 * Extract note text from an "add note" command
 */
export function extractNoteText(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  if (normalized.startsWith('add note ')) {
    return text.substring(9).trim();
  }
  if (normalized.startsWith('note ')) {
    return text.substring(5).trim();
  }
  return null;
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const voiceFlowBridge = new VoiceFlowBridge();
