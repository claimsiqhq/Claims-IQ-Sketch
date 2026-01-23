/**
 * Structured Error Handler for Voice Agents
 * 
 * Provides consistent, voice-friendly error formatting for both Sketch and Scope agents.
 * Errors are formatted for TTS output (short sentences, clear diction) while maintaining
 * structured data for UI display and logging.
 * 
 * Uses OpenAI GPT-4.1 via Realtime API for voice agent (ensures latest model capabilities)
 */

export interface AgentError {
  error: true;
  message: string; // Voice-friendly message (short, clear)
  code: string; // Error code for programmatic handling
  details?: string; // Additional context (not spoken, for UI/logging)
  recoverable?: boolean; // Whether user can retry
}

export interface AgentSuccess {
  error: false;
  message: string;
  data?: unknown;
}

export type AgentResponse = AgentError | AgentSuccess;

/**
 * Create a voice-friendly error response
 * 
 * @param code - Error code (e.g., "VALIDATION_ERROR", "NOT_FOUND")
 * @param message - User-facing message (will be spoken via TTS)
 * @param details - Technical details (not spoken, for logging/UI)
 * @param recoverable - Whether the user can retry this action
 */
export function createAgentError(
  code: string,
  message: string,
  details?: string,
  recoverable = true
): AgentError {
  return {
    error: true,
    code,
    message: formatVoiceMessage(message),
    details,
    recoverable,
  };
}

/**
 * Create a success response
 */
export function createAgentSuccess(message: string, data?: unknown): AgentSuccess {
  return {
    error: false,
    message: formatVoiceMessage(message),
    data,
  };
}

/**
 * Format message for voice/TTS output
 * - Short sentences
 * - Clear diction
 * - Avoid technical jargon
 * - First person or passive polite
 */
function formatVoiceMessage(message: string): string {
  // Remove technical prefixes like "Error:" if present
  let formatted = message.replace(/^(Error|Warning|Info):\s*/i, '');
  
  // Ensure it starts with a polite phrase if needed
  if (!formatted.match(/^(Sorry|I can't|I couldn't|Unable|Please|Let me)/i)) {
    // For errors, add polite prefix
    if (formatted.toLowerCase().includes('error') || formatted.toLowerCase().includes('failed')) {
      formatted = `Sorry, ${formatted.toLowerCase()}`;
    }
  }
  
  return formatted;
}

/**
 * Wrap an async function with error handling
 * Returns structured error response on failure
 */
export function withAgentErrorHandling<T>(
  fn: () => Promise<T>,
  errorCode: string,
  defaultMessage: string
): Promise<AgentResponse> {
  return fn()
    .then((result) => {
      if (typeof result === 'string') {
        return createAgentSuccess(result);
      }
      return createAgentSuccess(defaultMessage, result);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : defaultMessage;
      console.error(`[AgentError] ${errorCode}:`, error);
      return createAgentError(errorCode, message, error instanceof Error ? error.stack : undefined);
    });
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  GEOMETRY_ERROR: 'GEOMETRY_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  PHOTO_ERROR: 'PHOTO_ERROR',
} as const;
