import { randomUUID } from 'crypto';
const uuidv4 = randomUUID;
import { getSupabaseAdmin, PHOTOS_BUCKET, isSupabaseConfigured } from '../lib/supabase';
import OpenAI from 'openai';
import { storage } from '../storage';
import type { ClaimPhoto, InsertClaimPhoto } from '@shared/schema';

const openai = new OpenAI();

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
  } else {
    console.log(`[photos] Supabase storage bucket "${PHOTOS_BUCKET}" already exists`);
  }
}

initializePhotosBucket().catch(console.error);

async function analyzePhotoWithVision(base64Image: string, mimeType: string): Promise<PhotoAnalysis> {
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
    "recommendedLabel": "<suggested label for this photo>"
  },
  "metadata": {
    "lighting": "<good|fair|poor>",
    "focus": "<sharp|acceptable|blurry>",
    "angle": "<optimal|acceptable|suboptimal>",
    "coverage": "<complete|partial|insufficient>"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    return JSON.parse(content) as PhotoAnalysis;
  } catch (error) {
    console.error('[photos] OpenAI Vision analysis error:', error);
    return {
      quality: {
        score: 5,
        issues: ['Analysis unavailable'],
        suggestions: [],
      },
      content: {
        description: 'Unable to analyze photo',
        damageDetected: false,
        damageTypes: [],
        damageLocations: [],
        materials: [],
        recommendedLabel: 'Photo',
      },
      metadata: {
        lighting: 'fair',
        focus: 'acceptable',
        angle: 'acceptable',
        coverage: 'partial',
      },
    };
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
      console.error('[photos] Upload error:', uploadError);
      throw new Error(`Failed to upload photo: ${uploadError.message}`);
    }
    
    const { data: urlData } = supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .getPublicUrl(storagePath);
    
    url = urlData?.publicUrl || '';
  } else {
    url = `local://${storagePath}`;
    console.warn('[photos] Supabase not configured, using local storage path');
  }

  const base64Image = input.file.buffer.toString('base64');
  const analysis = await analyzePhotoWithVision(base64Image, input.file.mimetype);

  const label = input.label || analysis.content.recommendedLabel || 'Photo';
  const hierarchyPath = input.hierarchyPath || 'Exterior';

  // Save to database if claimId is provided
  if (input.claimId && input.organizationId) {
    const photoRecord: InsertClaimPhoto = {
      claimId: input.claimId,
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
      description: analysis.content.description,
      aiAnalysis: analysis,
      qualityScore: analysis.quality.score,
      damageDetected: analysis.content.damageDetected,
      capturedAt: new Date(now),
      analyzedAt: new Date(now),
    };

    const saved = await storage.createClaimPhoto(photoRecord);
    console.log('[photos] Saved photo to database:', saved.id);
  }

  return {
    id: photoId,
    url,
    storagePath,
    analysis,
    label,
    hierarchyPath,
    claimId: input.claimId,
    structureId: input.structureId,
    roomId: input.roomId,
    subRoomId: input.subRoomId,
    objectId: input.objectId,
    capturedAt: now,
    analyzedAt: now,
  };
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
