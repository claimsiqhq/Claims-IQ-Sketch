import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getSupabaseAdmin, isSupabaseConfigured, DOCUMENTS_BUCKET, PREVIEWS_BUCKET } from '../lib/supabase';
import { InsertDocument } from '../../shared/schema';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface DocumentInfo {
  id: string;
  organizationId: string;
  claimId?: string;
  name: string;
  type: string;
  category?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  extractedData?: Record<string, any>;
  processingStatus: string;
  description?: string;
  tags?: string[];
  uploadedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToDocument(row: any): DocumentInfo {
  return {
    id: row.id,
    organizationId: row.organization_id,
    claimId: row.claim_id,
    name: row.name,
    type: row.type,
    category: row.category,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    extractedData: row.extracted_data,
    processingStatus: row.processing_status,
    description: row.description,
    tags: row.tags,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function initializeStorageBucket(): Promise<void> {
  if (!isSupabaseConfigured) {
    console.warn('[documents] Supabase not configured, skipping storage bucket initialization');
    return;
  }
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('Error listing storage buckets:', listError);
    throw listError;
  }

  const documentsBucketExists = buckets?.some(b => b.name === DOCUMENTS_BUCKET);
  const previewsBucketExists = buckets?.some(b => b.name === PREVIEWS_BUCKET);

  if (!documentsBucketExists) {
    const { error: createError } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: [
        'image/*',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
      ],
    });
    if (createError) {
      console.error('Error creating documents bucket:', createError);
      throw createError;
    }
    console.log(`Created Supabase storage bucket: ${DOCUMENTS_BUCKET}`);
  }
  // Bucket already exists - no need to log on every startup

  if (!previewsBucketExists) {
    const { error: createError } = await supabase.storage.createBucket(PREVIEWS_BUCKET, {
      public: false,
      fileSizeLimit: 10485760,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
    });
    if (createError) {
      console.error('Error creating previews bucket:', createError);
      throw createError;
    }
    console.log(`Created Supabase storage bucket: ${PREVIEWS_BUCKET}`);
  }
  // Bucket already exists - no need to log on every startup
}

export async function createDocument(
  organizationId: string,
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  },
  metadata: {
    claimId?: string;
    name?: string;
    type: string;
    category?: string;
    description?: string;
    tags?: string[];
    uploadedBy?: string;
  }
): Promise<DocumentInfo> {
  const supabase = getSupabaseAdmin();

  const timestamp = Date.now();
  const ext = file.originalname.split('.').pop() || '';
  const baseName = file.originalname
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);
  const uniqueFileName = `${timestamp}-${baseName}${ext ? '.' + ext : ''}`;
  const storagePath = `${organizationId}/${uniqueFileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase storage upload error:', uploadError);
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .insert({
      organization_id: organizationId,
      claim_id: metadata.claimId || null,
      name: metadata.name || file.originalname,
      type: metadata.type,
      category: metadata.category || null,
      file_name: file.originalname,
      file_size: file.size,
      mime_type: file.mimetype,
      storage_path: storagePath,
      description: metadata.description || null,
      tags: metadata.tags || [],
      uploaded_by: metadata.uploadedBy || null,
      processing_status: 'pending'
    })
    .select('*')
    .single();

  if (error || !doc) {
    throw new Error(`Failed to create document record: ${error?.message}`);
  }

  return mapRowToDocument(doc);
}

export async function getDocument(
  id: string,
  organizationId: string
): Promise<DocumentInfo | null> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) return null;
  return mapRowToDocument(data);
}

export async function getDocumentDownloadUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    console.error('Error creating signed URL:', error);
    throw new Error(`Failed to create download URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function downloadDocumentFile(storagePath: string): Promise<{ data: Blob; contentType: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error) {
    console.error('Error downloading file:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return { data, contentType: data.type };
}

export async function listDocuments(
  organizationId: string,
  options?: {
    claimId?: string;
    type?: string;
    category?: string;
    processingStatus?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ documents: DocumentInfo[]; total: number }> {
  let query = supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (options?.claimId) {
    query = query.eq('claim_id', options.claimId);
  }
  if (options?.type) {
    query = query.eq('type', options.type);
  }
  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.processingStatus) {
    query = query.eq('processing_status', options.processingStatus);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error || !data) {
    return { documents: [], total: 0 };
  }

  return { documents: data.map(mapRowToDocument), total: count || 0 };
}

export async function updateDocument(
  id: string,
  organizationId: string,
  updates: {
    name?: string;
    type?: string;
    category?: string;
    description?: string;
    tags?: string[];
    claimId?: string;
    extractedData?: Record<string, any>;
    processingStatus?: string;
  }
): Promise<DocumentInfo | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.tags !== undefined) updateData.tags = updates.tags;
  if (updates.claimId !== undefined) updateData.claim_id = updates.claimId;
  if (updates.extractedData !== undefined) updateData.extracted_data = updates.extractedData;
  if (updates.processingStatus !== undefined) updateData.processing_status = updates.processingStatus;

  const { data, error } = await supabaseAdmin
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error || !data) return null;
  return mapRowToDocument(data);
}

export async function deleteDocument(
  id: string,
  organizationId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const doc = await getDocument(id, organizationId);
  if (!doc) return false;

  const { error } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (!error) {
    await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([doc.storagePath]);
    return true;
  }

  return false;
}

export async function getClaimDocuments(
  claimId: string,
  organizationId: string
): Promise<DocumentInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('claim_id', claimId)
    .eq('organization_id', organizationId)
    .order('type')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapRowToDocument);
}

export async function associateDocumentWithClaim(
  documentId: string,
  claimId: string,
  organizationId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('documents')
    .update({ claim_id: claimId, updated_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('organization_id', organizationId);

  return !error;
}

export async function getDocumentStats(organizationId: string): Promise<{
  total: number;
  totalSize: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const { data: docs, count } = await supabaseAdmin
    .from('documents')
    .select('type, processing_status, file_size', { count: 'exact' })
    .eq('organization_id', organizationId);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalSize = 0;

  if (docs) {
    docs.forEach(doc => {
      byType[doc.type] = (byType[doc.type] || 0) + 1;
      byStatus[doc.processing_status] = (byStatus[doc.processing_status] || 0) + 1;
      totalSize += doc.file_size || 0;
    });
  }

  return {
    total: count || 0,
    totalSize,
    byType,
    byStatus
  };
}

export async function getDocumentPublicUrl(
  id: string,
  organizationId: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const doc = await getDocument(id, organizationId);
  if (!doc) return null;
  return getDocumentDownloadUrl(doc.storagePath, expiresIn);
}

export async function generateDocumentPreviews(
  documentId: string,
  organizationId: string
): Promise<{ success: boolean; pageCount: number; error?: string }> {
  const supabase = getSupabaseAdmin();
  const tempDir = path.join(os.tmpdir(), 'claimsiq-previews', documentId);

  try {
    await supabaseAdmin
      .from('documents')
      .update({ preview_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', documentId);

    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('storage_path, mime_type')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    if (!doc) {
      throw new Error('Document not found');
    }

    if (doc.mime_type !== 'application/pdf') {
      await supabaseAdmin
        .from('documents')
        .update({ 
          page_count: 1, 
          preview_status: 'completed', 
          preview_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        })
        .eq('id', documentId);
      return { success: true, pageCount: 1 };
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const { data: pdfData, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(doc.storage_path);

    if (downloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message || 'No data'}`);
    }

    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
    const pdfPath = path.join(tempDir, 'source.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    let pageCount = 1;
    try {
      const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
      const pageMatch = stdout.match(/Pages:\s*(\d+)/);
      if (pageMatch) {
        pageCount = parseInt(pageMatch[1]);
      }
    } catch (e) {
      console.warn('Could not get PDF page count, defaulting to 1');
    }

    const outputPrefix = path.join(tempDir, 'page');
    await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, outputPrefix]);

    const previewBasePath = `${organizationId}/${documentId}`;

    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured - cannot upload document previews');
    }

    let uploadFailed = false;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const possibleFiles = [
        `${outputPrefix}-${pageNum}.png`,
        `${outputPrefix}-${String(pageNum).padStart(2, '0')}.png`,
        `${outputPrefix}-${String(pageNum).padStart(3, '0')}.png`,
      ];

      let pageImagePath: string | null = null;
      for (const filePath of possibleFiles) {
        if (fs.existsSync(filePath)) {
          pageImagePath = filePath;
          break;
        }
      }

      if (!pageImagePath) {
        console.warn(`Could not find generated image for page ${pageNum}`);
        uploadFailed = true;
        continue;
      }

      const imageBuffer = fs.readFileSync(pageImagePath);
      const supabasePath = `${previewBasePath}/page-${pageNum}.png`;

      let uploadError = (
        await supabase.storage.from(PREVIEWS_BUCKET).upload(supabasePath, imageBuffer, {
          contentType: 'image/png',
          cacheControl: '31536000',
          upsert: true,
        })
      ).error;

      if (uploadError) {
        const isBucketMissing =
          uploadError.message?.includes('not found') ||
          uploadError.message?.toLowerCase().includes('bucket not found');
        if (isBucketMissing) {
          console.warn('[documents] document-previews bucket not found, initializing and retrying');
          await initializeStorageBucket();
          const retry = await supabase.storage.from(PREVIEWS_BUCKET).upload(supabasePath, imageBuffer, {
            contentType: 'image/png',
            cacheControl: '31536000',
            upsert: true,
          });
          uploadError = retry.error;
        }
        if (uploadError) {
          console.error(`Failed to upload page ${pageNum}:`, uploadError);
          uploadFailed = true;
        }
      }
    }

    if (uploadFailed) {
      await supabaseAdmin
        .from('documents')
        .update({
          preview_status: 'failed',
          preview_error: 'One or more preview page uploads failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);
      return { success: false, pageCount: 0, error: 'One or more preview page uploads failed' };
    }

    await supabaseAdmin
      .from('documents')
      .update({ 
        page_count: pageCount, 
        preview_status: 'completed',
        preview_generated_at: new Date().toISOString(),
        preview_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    return { success: true, pageCount };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Preview generation failed:', errorMessage);

    await supabaseAdmin
      .from('documents')
      .update({ 
        preview_status: 'failed', 
        preview_error: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    return { success: false, pageCount: 0, error: errorMessage };

  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Failed to cleanup temp dir:', e);
    }
  }
}

export async function getDocumentPreviewUrls(
  documentId: string,
  organizationId: string,
  expiresIn: number = 3600
): Promise<{ pageCount: number; previewStatus: string; urls: string[] }> {
  const supabase = getSupabaseAdmin();

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('page_count, preview_status, mime_type, storage_path')
    .eq('id', documentId)
    .eq('organization_id', organizationId)
    .single();

  if (!doc) {
    throw new Error('Document not found');
  }

  if (doc.preview_status !== 'completed') {
    return { pageCount: doc.page_count || 0, previewStatus: doc.preview_status || 'pending', urls: [] };
  }

  if (doc.mime_type && doc.mime_type.startsWith('image/')) {
    const { data } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_path, expiresIn);
    return {
      pageCount: 1,
      previewStatus: 'completed',
      urls: data ? [data.signedUrl] : []
    };
  }

  const urls: string[] = [];
  const previewBasePath = `${organizationId}/${documentId}`;

  for (let pageNum = 1; pageNum <= (doc.page_count || 0); pageNum++) {
    const pagePath = `${previewBasePath}/page-${pageNum}.png`;
    const { data } = await supabase.storage
      .from(PREVIEWS_BUCKET)
      .createSignedUrl(pagePath, expiresIn);
    if (data) {
      urls.push(data.signedUrl);
    }
  }

  return {
    pageCount: doc.page_count || 0,
    previewStatus: 'completed',
    urls
  };
}
