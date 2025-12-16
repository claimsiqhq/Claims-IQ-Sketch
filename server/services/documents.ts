import { pool } from '../db';
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from '../lib/supabase';
import { InsertDocument } from '../../shared/schema';

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

/**
 * Initialize Supabase Storage bucket (call this on app startup)
 */
export async function initializeStorageBucket(): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

  if (listError) {
    console.error('Error listing storage buckets:', listError);
    throw listError;
  }

  const bucketExists = buckets?.some(b => b.name === DOCUMENTS_BUCKET);

  if (!bucketExists) {
    // Create the documents bucket
    const { error: createError } = await supabaseAdmin.storage.createBucket(DOCUMENTS_BUCKET, {
      public: false, // Documents are private by default
      fileSizeLimit: 52428800, // 50MB max file size
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
      console.error('Error creating storage bucket:', createError);
      throw createError;
    }

    console.log(`Created Supabase storage bucket: ${DOCUMENTS_BUCKET}`);
  } else {
    console.log(`Supabase storage bucket "${DOCUMENTS_BUCKET}" already exists`);
  }
}

/**
 * Save uploaded file to Supabase Storage and create document record
 */
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
    type: string; // fnol, policy, endorsement, photo, estimate, correspondence
    category?: string;
    description?: string;
    tags?: string[];
    uploadedBy?: string;
  }
): Promise<DocumentInfo> {
  const supabaseAdmin = getSupabaseAdmin();
  const client = await pool.connect();

  try {
    // Generate unique storage path: organizationId/timestamp-filename
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || '';
    const baseName = file.originalname
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);
    const uniqueFileName = `${timestamp}-${baseName}${ext ? '.' + ext : ''}`;
    const storagePath = `${organizationId}/${uniqueFileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
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

    // Create database record
    const result = await client.query(
      `INSERT INTO documents (
        organization_id, claim_id, name, type, category,
        file_name, file_size, mime_type, storage_path,
        description, tags, uploaded_by, processing_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        organizationId,
        metadata.claimId || null,
        metadata.name || file.originalname,
        metadata.type,
        metadata.category || null,
        file.originalname,
        file.size,
        file.mimetype,
        storagePath,
        metadata.description || null,
        JSON.stringify(metadata.tags || []),
        metadata.uploadedBy || null,
        'pending'
      ]
    );

    return mapRowToDocument(result.rows[0]);
  } catch (error) {
    // If database insert failed, try to clean up the uploaded file
    const timestamp = Date.now();
    const storagePath = `${organizationId}/${timestamp}-*`;
    // Note: We can't easily clean up with wildcard, but the storage path in error
    // context should be specific. In production, implement cleanup logic.
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get document by ID with tenant check
 */
export async function getDocument(
  id: string,
  organizationId: string
): Promise<DocumentInfo | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM documents WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Get a signed URL for downloading a document from Supabase Storage
 */
export async function getDocumentDownloadUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    console.error('Error creating signed URL:', error);
    throw new Error(`Failed to create download URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Download file content from Supabase Storage
 */
export async function downloadDocumentFile(storagePath: string): Promise<{ data: Blob; contentType: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error) {
    console.error('Error downloading file:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return { data, contentType: data.type };
}

/**
 * List documents for organization or claim
 */
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
  const client = await pool.connect();
  try {
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (options?.claimId) {
      conditions.push(`claim_id = $${paramIndex}`);
      params.push(options.claimId);
      paramIndex++;
    }
    if (options?.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(options.type);
      paramIndex++;
    }
    if (options?.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }
    if (options?.processingStatus) {
      conditions.push(`processing_status = $${paramIndex}`);
      params.push(options.processingStatus);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM documents ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get documents
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await client.query(
      `SELECT * FROM documents ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return { documents: result.rows.map(mapRowToDocument), total };
  } finally {
    client.release();
  }
}

/**
 * Update document metadata
 */
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
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      params.push(updates.name);
      paramIndex++;
    }
    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex}`);
      params.push(updates.type);
      paramIndex++;
    }
    if (updates.category !== undefined) {
      setClauses.push(`category = $${paramIndex}`);
      params.push(updates.category);
      paramIndex++;
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      params.push(updates.description);
      paramIndex++;
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex}`);
      params.push(JSON.stringify(updates.tags));
      paramIndex++;
    }
    if (updates.claimId !== undefined) {
      setClauses.push(`claim_id = $${paramIndex}`);
      params.push(updates.claimId);
      paramIndex++;
    }
    if (updates.extractedData !== undefined) {
      setClauses.push(`extracted_data = $${paramIndex}`);
      params.push(JSON.stringify(updates.extractedData));
      paramIndex++;
    }
    if (updates.processingStatus !== undefined) {
      setClauses.push(`processing_status = $${paramIndex}`);
      params.push(updates.processingStatus);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return getDocument(id, organizationId);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id, organizationId);

    const result = await client.query(
      `UPDATE documents SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Delete document (removes file from Supabase Storage and database record)
 */
export async function deleteDocument(
  id: string,
  organizationId: string
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();
  const client = await pool.connect();

  try {
    // Get document to find storage path
    const doc = await getDocument(id, organizationId);
    if (!doc) return false;

    // Delete database record first
    const result = await client.query(
      `DELETE FROM documents WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rowCount && result.rowCount > 0) {
      // Delete file from Supabase Storage
      const { error } = await supabaseAdmin.storage
        .from(DOCUMENTS_BUCKET)
        .remove([doc.storagePath]);

      if (error) {
        console.error('Error deleting file from storage:', error);
        // Note: Database record is already deleted, log the orphaned file
      }

      return true;
    }

    return false;
  } finally {
    client.release();
  }
}

/**
 * Get documents for a claim
 */
export async function getClaimDocuments(
  claimId: string,
  organizationId: string
): Promise<DocumentInfo[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM documents
       WHERE claim_id = $1 AND organization_id = $2
       ORDER BY type, created_at DESC`,
      [claimId, organizationId]
    );
    return result.rows.map(mapRowToDocument);
  } finally {
    client.release();
  }
}

/**
 * Associate document with claim
 */
export async function associateDocumentWithClaim(
  documentId: string,
  claimId: string,
  organizationId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE documents SET claim_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [claimId, documentId, organizationId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

/**
 * Get document statistics for organization
 */
export async function getDocumentStats(organizationId: string): Promise<{
  total: number;
  totalSize: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size
       FROM documents WHERE organization_id = $1`,
      [organizationId]
    );

    const typeResult = await client.query(
      `SELECT type, COUNT(*) as count FROM documents
       WHERE organization_id = $1
       GROUP BY type`,
      [organizationId]
    );

    const statusResult = await client.query(
      `SELECT processing_status, COUNT(*) as count FROM documents
       WHERE organization_id = $1
       GROUP BY processing_status`,
      [organizationId]
    );

    const byType: Record<string, number> = {};
    typeResult.rows.forEach(row => {
      byType[row.type] = parseInt(row.count);
    });

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row.processing_status] = parseInt(row.count);
    });

    return {
      total: parseInt(result.rows[0].total),
      totalSize: parseInt(result.rows[0].total_size),
      byType,
      byStatus
    };
  } finally {
    client.release();
  }
}

/**
 * Get a public URL for a document (for temporary sharing)
 * Note: Creates a signed URL that expires after the specified duration
 */
export async function getDocumentPublicUrl(
  id: string,
  organizationId: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const doc = await getDocument(id, organizationId);
  if (!doc) return null;

  return getDocumentDownloadUrl(doc.storagePath, expiresIn);
}
