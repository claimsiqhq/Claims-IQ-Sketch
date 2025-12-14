import { pool } from '../db';
import { InsertDocument } from '../../shared/schema';
import fs from 'fs';
import path from 'path';

// Storage directory for uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

/**
 * Save uploaded file and create document record
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
  const client = await pool.connect();
  try {
    // Create organization subdirectory
    const orgDir = path.join(UPLOAD_DIR, organizationId);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);
    const uniqueFileName = `${timestamp}-${baseName}${ext}`;
    const storagePath = path.join(organizationId, uniqueFileName);
    const fullPath = path.join(UPLOAD_DIR, storagePath);

    // Write file to disk
    fs.writeFileSync(fullPath, file.buffer);

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

    return result.rows[0];
  } catch (error) {
    // Clean up file if database insert fails
    const storagePath = path.join(UPLOAD_DIR, organizationId, `${Date.now()}-*`);
    // Note: In production, you'd want better cleanup logic
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
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Get document file path for download
 */
export function getDocumentFilePath(storagePath: string): string {
  return path.join(UPLOAD_DIR, storagePath);
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

    return { documents: result.rows, total };
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

    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Delete document (removes file and database record)
 */
export async function deleteDocument(
  id: string,
  organizationId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    // Get document to find file path
    const doc = await getDocument(id, organizationId);
    if (!doc) return false;

    // Delete database record
    const result = await client.query(
      `DELETE FROM documents WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rowCount && result.rowCount > 0) {
      // Delete file
      const filePath = getDocumentFilePath(doc.storagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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
    return result.rows;
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
