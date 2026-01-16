/**
 * Voice Inspection Service
 * 
 * Manages voice-guided inspection sessions, bridging flow state with voice commands.
 * Handles TTS guidance, voice command processing, and movement navigation.
 */

import { 
  getFlowInstance, 
  getCurrentMovement, 
  getCurrentPhase,
  peekNextMovement,
  getPreviousMovement,
  goToMovement,
  completeMovement,
  skipMovement
} from './flowEngineService';
import { getPromptWithFallback } from './promptService';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { FlowJsonMovement } from '@shared/schema';

interface VoiceSession {
  sessionId: string;
  flowInstanceId: string;
  userId: string;
  currentMovementId: string;
  isActive: boolean;
  createdAt: Date;
}

interface CommandResult {
  action: string;
  response: string;
  data?: any;
}

// In-memory session store (replace with Redis for production)
const activeSessions = new Map<string, VoiceSession>();

export const voiceInspectionService = {
  
  /**
   * Start a voice-guided session for a flow
   */
  async startSession(flowInstanceId: string, userId: string): Promise<VoiceSession> {
    // Get current flow state
    const flowState = await getFlowInstance(flowInstanceId);
    if (!flowState) {
      throw new Error(`Flow instance not found: ${flowInstanceId}`);
    }
    
    const currentMovement = await getCurrentMovement(flowInstanceId);
    
    // Create session record
    const sessionId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session: VoiceSession = {
      sessionId,
      flowInstanceId,
      userId,
      currentMovementId: currentMovement.id,
      isActive: true,
      createdAt: new Date()
    };
    
    // Store in memory
    activeSessions.set(sessionId, session);
    
    return session;
  },
  
  /**
   * Build system prompt for OpenAI Realtime with flow context
   */
  async buildSessionContext(sessionId: string): Promise<string> {
    const session = activeSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const flowInstance = await getFlowInstance(session.flowInstanceId);
    if (!flowInstance) throw new Error('Flow instance not found');
    
    const currentMovement = await getCurrentMovement(session.flowInstanceId);
    const phase = await getCurrentPhase(session.flowInstanceId);
    
    // Get TTS-optimized guidance prompt (fallback if not found)
    const guidancePrompt = await getPromptWithFallback('flow.movement_guidance_tts', {
      systemPrompt: 'You are a helpful voice assistant guiding an insurance adjuster through an inspection.',
      userPromptTemplate: 'Provide clear, concise guidance for the current inspection step.'
    });
    
    const evidenceRequirements = currentMovement.validationRequirements || [];
    const evidenceTypes = evidenceRequirements.map((req: any) => req.type || req.evidence_type).join(', ') || 'None specified';
    
    return `
${guidancePrompt.systemPrompt || 'You are a helpful voice assistant guiding an insurance adjuster through an inspection.'}

CURRENT INSPECTION STATE:
- Phase: ${phase.name} (${phase.id})
- Movement: ${currentMovement.name}
- Instructions: ${currentMovement.description || 'Complete this step'}
- Required: ${currentMovement.isRequired ? 'Yes' : 'No'}
- Evidence needed: ${evidenceTypes}

VOICE COMMANDS AVAILABLE:
- "complete" or "done" - Mark current movement as complete
- "skip" - Skip this movement (if not required)
- "go back" - Return to previous movement
- "repeat" - Hear the current instructions again
- "what's next" - Preview the next movement
- "help" - List all available commands
- "take photo" - Trigger photo capture
- "add note [your observation]" - Record an observation

RESPONSE STYLE:
- Keep responses brief and clear
- Speak naturally, as if guiding someone in the field
- Confirm actions before executing
- Alert if trying to skip a required movement
`;
  },
  
  /**
   * Process voice command and return action
   */
  async processCommand(sessionId: string, command: string): Promise<CommandResult> {
    const session = activeSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const normalizedCommand = command.toLowerCase().trim();
    
    // Command matching
    if (normalizedCommand.match(/^(complete|done|finished|mark complete)$/)) {
      return await this.handleComplete(session);
    }
    
    if (normalizedCommand.match(/^(skip|pass|skip this)$/)) {
      return await this.handleSkip(session);
    }
    
    if (normalizedCommand.match(/^(go back|previous|back)$/)) {
      return await this.handlePrevious(session);
    }
    
    if (normalizedCommand.match(/^(repeat|say again|what was that)$/)) {
      return await this.handleRepeat(session);
    }
    
    if (normalizedCommand.match(/^(what'?s next|next step|preview)$/)) {
      return await this.handlePreviewNext(session);
    }
    
    if (normalizedCommand.match(/^(help|commands|what can i say)$/)) {
      return await this.handleHelp(session);
    }
    
    if (normalizedCommand.match(/^(take photo|capture photo|photo)$/)) {
      return await this.handlePhotoTrigger(session);
    }
    
    if (normalizedCommand.startsWith('add note ') || normalizedCommand.startsWith('note ')) {
      const noteText = command.replace(/^(add note |note )/i, '');
      return await this.handleAddNote(session, noteText);
    }
    
    // Observation capture (anything else spoken is treated as an observation)
    return await this.handleObservation(session, command);
  },
  
  /**
   * Handle "complete" command
   */
  async handleComplete(session: VoiceSession): Promise<CommandResult> {
    const movement = await getCurrentMovement(session.flowInstanceId);
    
    // Complete the movement
    await completeMovement(session.flowInstanceId, movement.id, {
      userId: session.userId,
      notes: 'Completed via voice command'
    });
    
    // Get next movement
    const next = await peekNextMovement(session.flowInstanceId);
    
    if (!next) {
      return {
        action: 'flow_complete',
        response: `Great work! You've completed the ${movement.name} step, and that was the final step. The inspection flow is now complete.`
      };
    }
    
    // Update session
    session.currentMovementId = next.id;
    
    return {
      action: 'movement_complete',
      response: `Got it, ${movement.name} is complete. Moving on to: ${next.name}. ${next.description || ''}`,
      data: { nextMovement: next }
    };
  },
  
  /**
   * Handle "skip" command
   */
  async handleSkip(session: VoiceSession): Promise<CommandResult> {
    const movement = await getCurrentMovement(session.flowInstanceId);
    
    if (movement.isRequired) {
      return {
        action: 'skip_denied',
        response: `I can't skip ${movement.name} because it's a required step. Please complete it or let me know if you need help.`
      };
    }
    
    await skipMovement(session.flowInstanceId, movement.id, 'Skipped via voice command', session.userId);
    
    const next = await peekNextMovement(session.flowInstanceId);
    if (!next) {
      return {
        action: 'flow_complete',
        response: `Skipped ${movement.name}. The inspection flow is now complete.`
      };
    }
    
    session.currentMovementId = next.id;
    
    return {
      action: 'movement_skipped',
      response: `Skipped ${movement.name}. Now on: ${next.name}. ${next.description || ''}`,
      data: { nextMovement: next }
    };
  },
  
  /**
   * Handle "go back" command
   */
  async handlePrevious(session: VoiceSession): Promise<CommandResult> {
    const previous = await getPreviousMovement(session.flowInstanceId);
    
    if (!previous) {
      return {
        action: 'no_previous',
        response: `You're at the first movement. There's nothing to go back to.`
      };
    }
    
    await goToMovement(session.flowInstanceId, previous.id);
    session.currentMovementId = previous.id;
    
    return {
      action: 'moved_back',
      response: `Going back to: ${previous.name}. ${previous.description || ''}`,
      data: { movement: previous }
    };
  },
  
  /**
   * Handle "repeat" command
   */
  async handleRepeat(session: VoiceSession): Promise<CommandResult> {
    const movement = await getCurrentMovement(session.flowInstanceId);
    
    return {
      action: 'repeat',
      response: `Current step: ${movement.name}. ${movement.description || 'Complete this step when ready.'}`,
      data: { movement }
    };
  },
  
  /**
   * Handle "what's next" command
   */
  async handlePreviewNext(session: VoiceSession): Promise<CommandResult> {
    const next = await peekNextMovement(session.flowInstanceId);
    
    if (!next) {
      return {
        action: 'no_next',
        response: `This is the last movement. After completing it, the inspection will be done.`
      };
    }
    
    return {
      action: 'preview',
      response: `After this, you'll move to: ${next.name}. ${next.description || ''}`,
      data: { nextMovement: next }
    };
  },
  
  /**
   * Handle "help" command
   */
  async handleHelp(session: VoiceSession): Promise<CommandResult> {
    return {
      action: 'help',
      response: `Available commands: Say "complete" when done with a step. Say "skip" to skip optional steps. Say "go back" to return to the previous step. Say "repeat" to hear instructions again. Say "what's next" to preview the next step. Say "take photo" to capture a photo. Or just speak your observations and I'll record them.`
    };
  },
  
  /**
   * Handle photo trigger
   */
  async handlePhotoTrigger(session: VoiceSession): Promise<CommandResult> {
    return {
      action: 'trigger_photo',
      response: `Ready to capture. Take your photo now.`,
      data: { 
        flowInstanceId: session.flowInstanceId,
        movementId: session.currentMovementId 
      }
    };
  },
  
  /**
   * Handle explicit note
   */
  async handleAddNote(session: VoiceSession, noteText: string): Promise<CommandResult> {
    // Store as evidence linked to current movement
    const flowInstance = await getFlowInstance(session.flowInstanceId);
    if (!flowInstance) {
      throw new Error('Flow instance not found');
    }
    
    await supabaseAdmin.from('movement_evidence').insert({
      flow_instance_id: session.flowInstanceId,
      movement_id: `${(await getCurrentPhase(session.flowInstanceId)).id}:${session.currentMovementId}`,
      evidence_type: 'note',
      evidence_data: { text: noteText },
      created_by: session.userId
    });
    
    return {
      action: 'note_added',
      response: `Note recorded: "${noteText.substring(0, 50)}${noteText.length > 50 ? '...' : ''}"`,
      data: { note: noteText }
    };
  },
  
  /**
   * Handle general observation (ambient capture)
   */
  async handleObservation(session: VoiceSession, observation: string): Promise<CommandResult> {
    // Store observation linked to current movement
    const flowInstance = await getFlowInstance(session.flowInstanceId);
    if (!flowInstance) {
      throw new Error('Flow instance not found');
    }
    
    await supabaseAdmin.from('movement_evidence').insert({
      flow_instance_id: session.flowInstanceId,
      movement_id: `${(await getCurrentPhase(session.flowInstanceId)).id}:${session.currentMovementId}`,
      evidence_type: 'note',
      evidence_data: { text: observation, source: 'ambient' },
      created_by: session.userId
    });
    
    return {
      action: 'observation_recorded',
      response: `Noted.`, // Keep confirmation brief for ambient capture
      data: { observation }
    };
  },
  
  /**
   * End session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      activeSessions.delete(sessionId);
    }
  }
};
