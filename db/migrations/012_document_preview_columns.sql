-- Document Preview Columns Migration
-- Adds columns needed for Supabase-based document preview generation
-- =============================================================

-- Add preview-related columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS page_count INTEGER,
ADD COLUMN IF NOT EXISTS preview_status VARCHAR(30) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS preview_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS preview_error TEXT;

-- Create index for efficient preview status queries
CREATE INDEX IF NOT EXISTS idx_documents_preview_status ON documents(preview_status);

-- Add comment for documentation
COMMENT ON COLUMN documents.page_count IS 'Number of pages in document (for PDFs)';
COMMENT ON COLUMN documents.preview_status IS 'Status of preview generation: pending, processing, completed, failed';
COMMENT ON COLUMN documents.preview_generated_at IS 'Timestamp when previews were generated';
COMMENT ON COLUMN documents.preview_error IS 'Error message if preview generation failed';
