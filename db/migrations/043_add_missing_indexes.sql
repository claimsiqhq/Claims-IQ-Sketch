-- Migration: Add missing indexes on frequently queried columns
-- Purpose: Improve query performance for status filtering and zone-specific queries
-- Date: 2026-01-13

-- Add index on estimates.status (filtered for list views)
-- Note: estimates.organization_id index already exists (idx_estimates_org_idx)
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);

-- Add composite index on estimates(organization_id, status) for common query pattern
CREATE INDEX IF NOT EXISTS idx_estimates_org_status ON estimates(organization_id, status);

-- Add index on estimate_line_items.damage_zone_id (filtered for zone-specific queries)
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_damage_zone_id ON estimate_line_items(damage_zone_id);

-- Note: claims.organization_id and documents.type already have indexes:
-- - claims: idx_claims_org_idx on organization_id
-- - documents: idx_documents_type_idx on type
