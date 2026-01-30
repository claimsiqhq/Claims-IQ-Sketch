/**
 * Audio Observation Service
 *
 * Handles voice note capture during field inspections.
 * Pipeline: audio upload → Whisper transcription → Claude entity extraction
 *
 * Processing flow:
 * 1. Audio file uploaded to Supabase Storage
 * 2. Record created with pending statuses
 * 3. Background processing:
 *    - Whisper transcribes audio
 *    - Claude extracts structured entities using flow.voice_note_extraction prompt
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase';
import { getPrompt, substituteVariables } from './promptService';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'audio-observations' });

// Initialize API clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Storage configuration
export const AUDIO_BUCKET = 'audio-observations';

// ============================================
// TYPES
// ============================================

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CreateAudioObservationInput {
  audioBuffer: Buffer;
  mimeType: string;
  originalFilename: string;
  organizationId: string;
  claimId?: string;
  flowInstanceId?: string;
  movementCompletionId?: string;
  roomId?: string;
  structureId?: string;
  recordedBy: string;
}

export interface AudioObservation {
  id: string;
  organization_id: string;
  claim_id: string | null;
  flow_instance_id: string | null;
  movement_completion_id: string | null;
  room_id: string | null;
  structure_id: string | null;
  audio_storage_path: string;
  audio_url: string | null;
  transcription: string | null;
  transcription_status: ProcessingStatus;
  transcription_error: string | null;
  transcribed_at: string | null;
  extracted_entities: Record<string, unknown> | null;
  extraction_status: ProcessingStatus;
  extraction_error: string | null;
  extraction_prompt_key: string | null;
  extracted_at: string | null;
  duration_seconds: number | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface AudioObservationWithJoins extends AudioObservation {
  claims?: {
    id: string;
    claim_number: string;
    peril_type: string | null;
  } | null;
  claim_rooms?: {
    id: string;
    name: string;
  } | null;
  claim_structures?: {
    id: string;
    name: string;
  } | null;
}

// ============================================
// BUCKET INITIALIZATION
// ============================================

/**
 * Initialize the audio-observations storage bucket if it doesn't exist
 */
export async function initializeAudioBucket(): Promise<void> {
  if (!isSupabaseConfigured) {
    log.warn('Supabase not configured, skipping audio bucket initialization');
    return;
  }
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

    if (listError) {
      log.error({ err: listError }, 'Failed to list storage buckets');
      return;
    }

    const bucketExists = buckets?.some((b) => b.name === AUDIO_BUCKET);

    if (!bucketExists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(AUDIO_BUCKET, {
        public: true,
        fileSizeLimit: 26214400, // 25MB
        allowedMimeTypes: [
          'audio/webm',
          'audio/mp3',
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'audio/m4a',
          'audio/x-m4a',
          'audio/mp4',
        ],
      });

      if (createError) {
        log.error({ err: createError }, 'Failed to create audio-observations bucket');
      } else {
        log.info('Created audio-observations storage bucket');
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Error initializing audio bucket');
  }
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Create a new audio observation
 *
 * - Uploads audio to Supabase Storage
 * - Inserts record with pending statuses
 * - Triggers async processing (non-blocking)
 */
export async function createAudioObservation(input: CreateAudioObservationInput): Promise<{ id: string; audioUrl: string | null }> {
  const {
    audioBuffer,
    mimeType,
    originalFilename,
    organizationId,
    claimId,
    flowInstanceId,
    movementCompletionId,
    roomId,
    structureId,
    recordedBy,
  } = input;

  // Determine file extension from mime type
  const extension = getExtensionFromMimeType(mimeType);
  const timestamp = Date.now();
  const storagePath = `${organizationId}/${claimId || 'unassigned'}/${timestamp}.${extension}`;

  log.info(
    { organizationId, claimId, storagePath, mimeType },
    'Creating audio observation'
  );

  if (!isSupabaseConfigured) {
    log.error('Supabase not configured - cannot upload audio');
    throw new Error('Audio storage is not configured. Please set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Upload to Supabase Storage (with bucket init retry like photos)
  let uploadError: { message?: string } | null = null;
  uploadError = (
    await supabaseAdmin.storage.from(AUDIO_BUCKET).upload(storagePath, audioBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    })
  ).error;

  if (uploadError) {
    const isBucketMissing =
      uploadError.message?.includes('not found') ||
      uploadError.message?.toLowerCase().includes('bucket not found');
    if (isBucketMissing) {
      log.warn({ storagePath }, 'Audio bucket not found, initializing and retrying');
      await initializeAudioBucket();
      const retry = await supabaseAdmin.storage.from(AUDIO_BUCKET).upload(storagePath, audioBuffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });
      uploadError = retry.error;
    }
    if (uploadError) {
      log.error({ err: uploadError, storagePath }, 'Failed to upload audio to storage');
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath);
  const audioUrl = urlData?.publicUrl || null;

  // Insert record into database
  const { data: observation, error: insertError } = await supabaseAdmin
    .from('audio_observations')
    .insert({
      organization_id: organizationId,
      claim_id: claimId || null,
      flow_instance_id: flowInstanceId || null,
      movement_completion_id: movementCompletionId || null,
      room_id: roomId || null,
      structure_id: structureId || null,
      audio_storage_path: storagePath,
      audio_url: audioUrl,
      transcription_status: 'pending',
      extraction_status: 'pending',
      recorded_by: recordedBy,
    })
    .select('id')
    .single();

  if (insertError) {
    log.error({ err: insertError }, 'Failed to insert audio observation record');
    // Clean up uploaded file
    await supabaseAdmin.storage.from(AUDIO_BUCKET).remove([storagePath]);
    throw new Error(`Failed to create audio observation: ${insertError.message}`);
  }

  const audioObservationId = observation.id;

  log.info({ audioObservationId, storagePath }, 'Audio observation created, starting processing');

  // Trigger async processing (don't await)
  processAudioObservation(audioObservationId).catch((err) => {
    log.error({ err, audioObservationId }, 'Background audio processing failed');
  });

  return { id: audioObservationId, audioUrl };
}

/**
 * Process an audio observation
 *
 * Step 1: Transcribe audio with Whisper
 * Step 2: Extract entities with Claude
 */
export async function processAudioObservation(audioObservationId: string): Promise<void> {
  log.info({ audioObservationId }, 'Processing audio observation');
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Step 1: Transcribe
    await transcribeAudio(audioObservationId);

    // Step 2: Extract entities (only if transcription succeeded)
    const { data: observation } = await supabaseAdmin
      .from('audio_observations')
      .select('transcription_status')
      .eq('id', audioObservationId)
      .single();

    if (observation?.transcription_status === 'completed') {
      await extractEntities(audioObservationId);
    } else {
      log.warn({ audioObservationId }, 'Skipping entity extraction - transcription not completed');
    }
  } catch (error) {
    log.error({ err: error, audioObservationId }, 'Audio observation processing failed');
  }
}

/**
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeAudio(audioObservationId: string): Promise<void> {
  log.info({ audioObservationId }, 'Starting audio transcription');
  const supabaseAdmin = getSupabaseAdmin();

  // Update status to processing
  await supabaseAdmin
    .from('audio_observations')
    .update({
      transcription_status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', audioObservationId);

  try {
    // Get the audio observation record
    const { data: observation, error: fetchError } = await supabaseAdmin
      .from('audio_observations')
      .select('audio_storage_path, audio_url')
      .eq('id', audioObservationId)
      .single();

    if (fetchError || !observation) {
      throw new Error(`Audio observation not found: ${fetchError?.message}`);
    }

    // Download audio from Supabase Storage
    const { data: audioData, error: downloadError } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .download(observation.audio_storage_path);

    if (downloadError || !audioData) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    // Convert Blob to File for OpenAI API
    const arrayBuffer = await audioData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract filename from storage path
    const filename = observation.audio_storage_path.split('/').pop() || 'audio.webm';

    // Create a File object for OpenAI
    const file = new File([buffer], filename, { type: audioData.type });

    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'en',
    });

    // Update record with transcription result
    await supabaseAdmin
      .from('audio_observations')
      .update({
        transcription: transcription.text,
        transcription_status: 'completed',
        duration_seconds: transcription.duration || null,
        transcribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', audioObservationId);

    log.info(
      { audioObservationId, durationSeconds: transcription.duration },
      'Audio transcription completed'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error, audioObservationId }, 'Audio transcription failed');

    await supabaseAdmin
      .from('audio_observations')
      .update({
        transcription_status: 'failed',
        transcription_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', audioObservationId);

    throw error;
  }
}

/**
 * Extract entities from transcription using Claude
 */
export async function extractEntities(audioObservationId: string): Promise<void> {
  log.info({ audioObservationId }, 'Starting entity extraction');
  const supabaseAdmin = getSupabaseAdmin();

  // Update status to processing
  await supabaseAdmin
    .from('audio_observations')
    .update({
      extraction_status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', audioObservationId);

  try {
    // Get observation with joins
    const { data: observation, error: fetchError } = await supabaseAdmin
      .from('audio_observations')
      .select(`
        *,
        claims:claim_id (
          id,
          claim_number,
          peril_type
        ),
        claim_rooms:room_id (
          id,
          name
        ),
        claim_structures:structure_id (
          id,
          name
        )
      `)
      .eq('id', audioObservationId)
      .single();

    if (fetchError || !observation) {
      throw new Error(`Audio observation not found: ${fetchError?.message}`);
    }

    if (!observation.transcription) {
      throw new Error('No transcription available for entity extraction');
    }

    // Get prompt configuration
    const prompt = await getPrompt('flow.voice_note_extraction');
    if (!prompt) {
      throw new Error('Prompt not found: flow.voice_note_extraction');
    }

    // Build context object
    const context: Record<string, string> = {
      transcription: observation.transcription,
      claim_number: observation.claims?.claim_number || 'Unknown',
      peril_type: observation.claims?.peril_type || 'Unknown',
      current_location:
        observation.claim_rooms?.name || observation.claim_structures?.name || 'Unknown',
      movement_context: observation.movement_completion_id ? 'Guided movement' : 'Ad-hoc',
    };

    // Render user prompt template
    const userPrompt = substituteVariables(prompt.userPromptTemplate || '', context);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: prompt.model || 'claude-sonnet-4-20250514',
      max_tokens: prompt.maxTokens || 4096,
      temperature: parseFloat(prompt.temperature || '0'),
      system: prompt.systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Parse JSON response (handle markdown code blocks)
    const extractedEntities = parseJsonResponse(textContent.text);

    // Update record with extraction result
    await supabaseAdmin
      .from('audio_observations')
      .update({
        extracted_entities: extractedEntities,
        extraction_status: 'completed',
        extraction_prompt_key: 'flow.voice_note_extraction',
        extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', audioObservationId);

    log.info({ audioObservationId }, 'Entity extraction completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error, audioObservationId }, 'Entity extraction failed');

    await supabaseAdmin
      .from('audio_observations')
      .update({
        extraction_status: 'failed',
        extraction_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', audioObservationId);

    throw error;
  }
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get a single audio observation with joins
 */
export async function getAudioObservation(
  id: string
): Promise<AudioObservationWithJoins | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('audio_observations')
    .select(`
      *,
      claims:claim_id (
        id,
        claim_number,
        peril_type
      ),
      claim_rooms:room_id (
        id,
        name
      ),
      claim_structures:structure_id (
        id,
        name
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    log.error({ err: error, id }, 'Failed to get audio observation');
    return null;
  }

  return data as AudioObservationWithJoins;
}

/**
 * Get all audio observations for a claim
 */
export async function getClaimAudioObservations(
  claimId: string
): Promise<AudioObservationWithJoins[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('audio_observations')
    .select(`
      *,
      claims:claim_id (
        id,
        claim_number,
        peril_type
      ),
      claim_rooms:room_id (
        id,
        name
      ),
      claim_structures:structure_id (
        id,
        name
      )
    `)
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false });

  if (error) {
    log.error({ err: error, claimId }, 'Failed to get claim audio observations');
    return [];
  }

  return (data as AudioObservationWithJoins[]) || [];
}

/**
 * Retry processing for a failed audio observation
 *
 * Determines which step to retry based on current status
 */
export async function retryAudioProcessing(audioObservationId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: observation, error } = await supabaseAdmin
    .from('audio_observations')
    .select('transcription_status, extraction_status')
    .eq('id', audioObservationId)
    .single();

  if (error || !observation) {
    throw new Error(`Audio observation not found: ${error?.message}`);
  }

  log.info(
    { audioObservationId, transcriptionStatus: observation.transcription_status, extractionStatus: observation.extraction_status },
    'Retrying audio processing'
  );

  // If transcription failed, retry from transcription
  if (observation.transcription_status === 'failed') {
    await processAudioObservation(audioObservationId);
    return;
  }

  // If only extraction failed, retry just extraction
  if (observation.extraction_status === 'failed' && observation.transcription_status === 'completed') {
    await extractEntities(audioObservationId);
    return;
  }

  // If both are pending, process from scratch
  if (observation.transcription_status === 'pending') {
    await processAudioObservation(audioObservationId);
    return;
  }

  log.info({ audioObservationId }, 'No retry needed - processing already completed or in progress');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mp4': 'm4a',
  };

  return mimeToExt[mimeType] || 'webm';
}

/**
 * Parse JSON response from Claude, handling markdown code blocks
 */
function parseJsonResponse(text: string): Record<string, unknown> {
  let jsonStr = text.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    log.warn({ text: jsonStr.substring(0, 200) }, 'Failed to parse JSON response');
    // Return a basic structure with the raw text
    return {
      raw_response: text,
      parse_error: true,
    };
  }
}
