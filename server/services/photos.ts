import { randomUUID } from 'crypto';
const uuidv4 = randomUUID;
import { getSupabaseAdmin, PHOTOS_BUCKET, isSupabaseConfigured } from '../lib/supabase';
import OpenAI from 'openai';
import { storage } from '../storage';
import type { ClaimPhoto, InsertClaimPhoto } from '@shared/schema';
import { reverseGeocode } from './geocoding';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PhotoUploadInput {
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  claimId?: string;
  organizationId?: string;
  structureId?: string;
  roomId?: string;
  subRoomId?: string;
  objectId?: string;
  label?: string;
  hierarchyPath?: string;
  latitude?: number;
  longitude?: number;
  uploadedBy?: string;
  // Flow context for linking photos to flow movements
  flowInstanceId?: string;
  movementId?: string;
  capturedContext?: string;
  // Taxonomy categorization
  taxonomyPrefix?: string; // e.g., 'RF-TSQ', 'WTR-SRC'
}

export interface PhotoAnalysis {
  quality: {
    score: number;
    issues: string[];
    suggestions: string[];
  };
  content: {
    description: string;
    damageDetected: boolean;
    damageTypes: string[];
    damageLocations: string[];
    materials: string[];
    recommendedLabel: string;
  };
  metadata: {
    lighting: 'good' | 'fair' | 'poor';
    focus: 'sharp' | 'acceptable' | 'blurry';
    angle: 'optimal' | 'acceptable' | 'suboptimal';
    coverage: 'complete' | 'partial' | 'insufficient';
  };
}

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed' | 'concerns';

export interface UploadedPhoto {
  id: string;
  url: string;
  storagePath: string;
  analysis: PhotoAnalysis | null;
  label: string;
  hierarchyPath: string;
  claimId?: string;
  structureId?: string;
  roomId?: string;
  subRoomId?: string;
  objectId?: string;
  capturedAt: string;
  analyzedAt?: string;
  analysisStatus: AnalysisStatus;
  analysisError?: string;
}

async function initializePhotosBucket(): Promise<void> {
  if (!isSupabaseConfigured) {
    console.warn('[photos] Supabase not configured, skipping bucket initialization');
    return;
  }
  
  const supabaseAdmin = getSupabaseAdmin();
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  
  if (listError) {
    console.error('[photos] Error listing storage buckets:', listError);
    return;
  }
  
  const photosBucketExists = buckets?.some(b => b.name === PHOTOS_BUCKET);
  
  if (!photosBucketExists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(PHOTOS_BUCKET, {
      public: true,
      fileSizeLimit: 20971520,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    });
    
    if (createError) {
      console.error('[photos] Error creating photos bucket:', createError);
      return;
    }
    console.log(`[photos] Created Supabase storage bucket: ${PHOTOS_BUCKET}`);
  }
  // Bucket already exists - no need to log on every startup
}

// Export for explicit initialization during server startup
export { initializePhotosBucket };

interface AnalysisResult {
  analysis: PhotoAnalysis;
  hasConcerns: boolean;
  concernReasons: string[];
}

async function analyzePhotoWithVision(base64Image: string, mimeType: string): Promise<AnalysisResult> {
  const systemPrompt = `You are an expert insurance claims photo analyst. Analyze property damage photos for quality, content, and documentation completeness.

Respond with a JSON object matching this exact structure:
{
  "quality": {
    "score": <1-10 number>,
    "issues": [<string array of quality issues>],
    "suggestions": [<string array of improvement suggestions>]
  },
  "content": {
    "description": "<brief description of what's shown>",
    "damageDetected": <boolean>,
    "damageTypes": [<array of damage types like "water damage", "hail damage", "fire damage", "structural">],
    "damageLocations": [<array of specific locations like "ceiling", "wall", "roof">],
    "materials": [<array of materials visible like "drywall", "shingles", "vinyl siding">],
    "recommendedLabel": "<suggested label for this photo>",
    "concerns": [<array of concerns about photo authenticity, staging, or documentation issues - empty array if none>]
  },
  "metadata": {
    "lighting": "<good|fair|poor>",
    "focus": "<sharp|acceptable|blurry>",
    "angle": "<optimal|acceptable|suboptimal>",
    "coverage": "<complete|partial|insufficient>"
  }
}

Look for concerns such as:
- Very low quality photos that may be unusable
- Photos that don't appear to show property damage
- Potentially staged damage
- Photos that are clearly not of a property (selfies, random objects, etc.)
- Blurry or out of focus images that make damage assessment difficult`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Analyze this property/damage photo for an insurance claim. Return only the JSON response.',
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    const analysis = JSON.parse(content) as PhotoAnalysis & { content: { concerns?: string[] } };

    // Determine if there are concerns
    const concerns: string[] = [];

    // Check for explicit concerns from OpenAI
    if (analysis.content.concerns && analysis.content.concerns.length > 0) {
      concerns.push(...analysis.content.concerns);
    }

    // Check for quality-based concerns
    if (analysis.quality.score <= 3) {
      concerns.push('Very low quality photo - may be unusable for claims documentation');
    }

    // Check for metadata-based concerns
    if (analysis.metadata.focus === 'blurry') {
      concerns.push('Photo is blurry and may need to be retaken');
    }
    if (analysis.metadata.coverage === 'insufficient') {
      concerns.push('Photo does not adequately capture the subject');
    }

    return {
      analysis,
      hasConcerns: concerns.length > 0,
      concernReasons: concerns,
    };
  } catch (error) {
    console.error('[photos] OpenAI Vision analysis error:', error);
    throw error; // Re-throw to handle in caller for proper status
  }
}

// Background analysis function - runs after photo is saved (with one retry on OpenAI failure)
async function runBackgroundAnalysis(photoId: string, base64Image: string, mimeType: string): Promise<void> {
  console.log(`[photos] Starting background analysis for photo ${photoId}`);

  const attempt = async (): Promise<void> => {
    const result = await analyzePhotoWithVision(base64Image, mimeType);
    const { analysis, hasConcerns, concernReasons } = result;

    await storage.updateClaimPhoto(photoId, {
      aiAnalysis: analysis,
      qualityScore: analysis.quality.score,
      damageDetected: analysis.content.damageDetected,
      description: analysis.content.description,
      analysisStatus: hasConcerns ? 'concerns' : 'completed',
      analysisError: hasConcerns ? concernReasons.join('; ') : null,
      analyzedAt: new Date(),
    });

    console.log(`[photos] Background analysis completed for photo ${photoId}, status: ${hasConcerns ? 'concerns' : 'completed'}`);
  };

  try {
    await storage.updateClaimPhoto(photoId, {
      analysisStatus: 'analyzing',
    });

    await attempt();
  } catch (error) {
    console.error(`[photos] Background analysis failed for photo ${photoId} (will retry once):`, error);

    try {
      await new Promise((r) => setTimeout(r, 2000));
      await attempt();
    } catch (retryError) {
      console.error(`[photos] Background analysis retry failed for photo ${photoId}:`, retryError);
      await storage.updateClaimPhoto(photoId, {
        analysisStatus: 'failed',
        analysisError: retryError instanceof Error ? retryError.message : 'Unknown analysis error',
      });
    }
  }
}

export async function uploadAndAnalyzePhoto(input: PhotoUploadInput): Promise<UploadedPhoto> {
  const photoId = uuidv4();
  const now = new Date().toISOString();
  const fileExt = input.file.originalname.split('.').pop() || 'jpg';
  const storagePath = `${input.claimId || 'unassigned'}/${photoId}.${fileExt}`;

  let url = '';

  if (isSupabaseConfigured) {
    const supabaseAdmin = getSupabaseAdmin();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .upload(storagePath, input.file.buffer, {
        contentType: input.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('[photos] Upload error:', {
        message: uploadError.message,
        name: uploadError.name,
        bucket: PHOTOS_BUCKET,
        storagePath,
        fileSize: input.file.size,
        mimeType: input.file.mimetype,
      });
      
      // If bucket doesn't exist, try to create it and retry
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket not found')) {
        console.log('[photos] Bucket not found, attempting to create...');
        await initializePhotosBucket();
        
        // Retry upload
        const { error: retryError } = await supabaseAdmin.storage
          .from(PHOTOS_BUCKET)
          .upload(storagePath, input.file.buffer, {
            contentType: input.file.mimetype,
            upsert: false,
          });
        
        if (retryError) {
          console.error('[photos] Retry upload error:', retryError);
          throw new Error(`Failed to upload photo after bucket creation: ${retryError.message}`);
        }
      } else {
        throw new Error(`Failed to upload photo: ${uploadError.message}`);
      }
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .getPublicUrl(storagePath);

    url = urlData?.publicUrl || '';
    console.log('[photos] Successfully uploaded to Supabase storage:', {
      bucket: PHOTOS_BUCKET,
      storagePath,
      publicUrl: url,
      fileSize: input.file.size,
    });
  } else {
    url = `local://${storagePath}`;
    console.warn('[photos] Supabase not configured, using local storage path');
  }

  // Use provided label or default - will be updated after analysis
  const label = input.label || 'Photo';
  const hierarchyPath = input.hierarchyPath || (input.claimId ? 'Exterior' : 'Uncategorized');

  // Reverse geocode if coordinates are provided
  let geoAddress: string | null = null;
  if (input.latitude != null && input.longitude != null) {
    try {
      const geoResult = await reverseGeocode(input.latitude, input.longitude);
      if (geoResult) {
        geoAddress = geoResult.shortAddress;
        console.log(`[photos] Reverse geocoded: ${geoAddress}`);
      }
    } catch (error) {
      console.error('[photos] Reverse geocoding failed:', error);
    }
  }

  // Save to database IMMEDIATELY with pending status - don't wait for analysis
  let savedPhotoId = photoId;
  if (input.organizationId) {
    const photoRecord: InsertClaimPhoto & { flow_instance_id?: string; movement_id?: string; captured_context?: string; taxonomy_prefix?: string; auto_categorized?: boolean } = {
      claimId: input.claimId || null,
      organizationId: input.organizationId,
      structureId: input.structureId || null,
      roomId: input.roomId || null,
      damageZoneId: input.subRoomId || null,
      storagePath,
      publicUrl: url,
      fileName: input.file.originalname,
      mimeType: input.file.mimetype,
      fileSize: input.file.size,
      label,
      hierarchyPath,
      description: null, // Will be set by analysis
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geoAddress,
      aiAnalysis: {}, // Empty until analysis completes
      qualityScore: null,
      damageDetected: false,
      capturedAt: new Date(now),
      analyzedAt: null, // Not analyzed yet
      analysisStatus: 'pending',
      analysisError: null,
      uploadedBy: input.uploadedBy ?? null,
      // Flow context for linking to movements
      flow_instance_id: input.flowInstanceId || null,
      movement_id: input.movementId || null,
      captured_context: input.capturedContext || null,
      // Taxonomy categorization
      taxonomy_prefix: input.taxonomyPrefix?.toUpperCase() || null,
      auto_categorized: false,
    };

    const saved = await storage.createClaimPhoto(photoRecord);
    savedPhotoId = saved.id;
    console.log('[photos] Saved photo to database (pending analysis):', saved.id, input.claimId ? `(claim: ${input.claimId})` : '(uncategorized)');

    // Trigger background analysis - don't await, let it run in background
    const base64Image = input.file.buffer.toString('base64');
    runBackgroundAnalysis(saved.id, base64Image, input.file.mimetype).catch((err) => {
      console.error(`[photos] Background analysis error for ${saved.id}:`, err);
    });
  } else {
    console.warn('[photos] No organizationId provided, photo not saved to database');
  }

  // Return immediately without waiting for analysis
  return {
    id: savedPhotoId,
    url,
    storagePath,
    analysis: null, // Analysis will be available later
    label,
    hierarchyPath,
    claimId: input.claimId,
    structureId: input.structureId,
    roomId: input.roomId,
    subRoomId: input.subRoomId,
    objectId: input.objectId,
    capturedAt: now,
    analysisStatus: 'pending',
  };
}

// Re-analyze a photo (for retrying failed analysis or manual re-analysis)
export async function reanalyzePhoto(photoId: string): Promise<{ success: boolean; error?: string }> {
  const photo = await storage.getClaimPhoto(photoId);
  if (!photo) {
    return { success: false, error: 'Photo not found' };
  }

  // Only allow re-analysis if not currently analyzing
  if (photo.analysisStatus === 'analyzing') {
    return { success: false, error: 'Photo is already being analyzed' };
  }

  // Fetch the image from storage
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Storage not configured' };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .download(photo.storagePath);

    if (error || !data) {
      return { success: false, error: 'Failed to fetch photo from storage' };
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const base64Image = buffer.toString('base64');

    // Trigger background analysis
    runBackgroundAnalysis(photoId, base64Image, photo.mimeType).catch((err) => {
      console.error(`[photos] Re-analysis error for ${photoId}:`, err);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getPhotoSignedUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured) {
    return null;
  }
  
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  
  if (error) {
    console.error('[photos] Error creating signed URL:', error);
    return null;
  }
  
  return data?.signedUrl || null;
}

export async function deletePhoto(storagePath: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return true;
  }
  
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .remove([storagePath]);
  
  if (error) {
    console.error('[photos] Error deleting photo:', error);
    return false;
  }
  
  return true;
}

export async function listClaimPhotos(
  claimId: string,
  filters?: { structureId?: string; roomId?: string; damageZoneId?: string; damageDetected?: boolean }
): Promise<ClaimPhoto[]> {
  return storage.listClaimPhotos(claimId, filters);
}

export async function getClaimPhoto(id: string): Promise<ClaimPhoto | undefined> {
  return storage.getClaimPhoto(id);
}

export async function deleteClaimPhoto(id: string): Promise<boolean> {
  const photo = await storage.getClaimPhoto(id);
  if (!photo) {
    return false;
  }

  const storageDeleted = await deletePhoto(photo.storagePath);
  if (!storageDeleted) {
    console.warn('[photos] Failed to delete from Supabase storage, continuing with database deletion');
  }

  return storage.deleteClaimPhoto(id);
}

export async function listAllClaimPhotos(organizationId: string): Promise<ClaimPhoto[]> {
  return storage.listAllClaimPhotos(organizationId);
}

export async function updateClaimPhoto(
  id: string,
  updates: {
    label?: string;
    hierarchyPath?: string;
    claimId?: string | null; // Allow reassigning photo to different claim or unassigning
    structureId?: string | null;
    roomId?: string | null;
    damageZoneId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geoAddress?: string | null;
  }
): Promise<ClaimPhoto | undefined> {
  // If coordinates are provided but no geoAddress, reverse geocode
  if (updates.latitude != null && updates.longitude != null && !updates.geoAddress) {
    try {
      const geoResult = await reverseGeocode(updates.latitude, updates.longitude);
      if (geoResult) {
        updates.geoAddress = geoResult.shortAddress;
      }
    } catch (error) {
      console.error('[photos] Reverse geocoding failed during update:', error);
    }
  }

  // If claimId is being set to null (unassigning), also clear hierarchy links
  if (updates.claimId === null) {
    updates.structureId = null;
    updates.roomId = null;
    updates.damageZoneId = null;
    updates.hierarchyPath = 'Uncategorized';
  }

  return storage.updateClaimPhoto(id, updates);
}
