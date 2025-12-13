// Voice Session Service
// Generates ephemeral client keys for secure browser WebRTC connections

interface SessionConfig {
  model: string;
  voice?: string;
  modalities?: string[];
  turn_detection?: {
    type: string;
    interrupt_response?: boolean;
  };
}

interface EphemeralKeyResponse {
  value: string;
  expires_at?: string;
}

interface VoiceSessionResult {
  ephemeral_key: string;
  expires_at?: string;
}

export async function createVoiceSession(): Promise<VoiceSessionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not configured');
  }

  // Use the GA endpoint for client secrets
  const sessionConfig = {
    session: {
      type: 'realtime',
      model: 'gpt-realtime',
      audio: {
        output: {
          voice: 'ash'
        }
      }
    }
  };

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sessionConfig),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create voice session: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { value?: string; expires_at?: string };

  // The new GA response returns value directly
  if (!data.value) {
    throw new Error('Invalid response from OpenAI: missing ephemeral key value');
  }

  return {
    ephemeral_key: data.value,
    expires_at: data.expires_at,
  };
}

// Configuration for voice session (can be extended)
export const VOICE_CONFIG = {
  availableVoices: [
    'alloy',
    'echo',
    'fable',
    'onyx',
    'nova',
    'shimmer',
    'ash',
    'ballad',
    'coral',
    'sage',
    'verse',
  ] as const,
  defaultVoice: 'ash' as const,
  model: 'gpt-4o-realtime-preview' as const,
};
