-- Migration 054: Add foreign key constraint for claims.organizationId and missing indexes
-- This ensures referential integrity and improves query performance

-- ============================================
-- Add foreign key constraint for claims.organizationId
-- ============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claims_organization') THEN
    -- Clean up any orphaned claims before adding FK
    DELETE FROM claims 
    WHERE organization_id NOT IN (SELECT id FROM organizations);
    
    ALTER TABLE claims
      ADD CONSTRAINT fk_claims_organization
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================
-- Add missing indexes on frequently queried columns
-- ============================================

-- Index on claims.assignedUserId for user assignment queries
CREATE INDEX IF NOT EXISTS idx_claims_assigned_user ON claims(assigned_user_id);

-- Index on claims.carrierId for carrier-based queries
CREATE INDEX IF NOT EXISTS idx_claims_carrier ON claims(carrier_id);

-- Index on claims.status for status filtering
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- Index on claims.primaryPeril for peril-based queries
CREATE INDEX IF NOT EXISTS idx_claims_primary_peril ON claims(primary_peril);

-- Index on estimateZones.areaId for zone queries
CREATE INDEX IF NOT EXISTS idx_estimate_zones_area ON estimate_zones(area_id);

-- Composite index for common claim queries (organization + status)
CREATE INDEX IF NOT EXISTS idx_claims_org_status ON claims(organization_id, status);

-- Composite index for claim assignment queries
CREATE INDEX IF NOT EXISTS idx_claims_org_assigned ON claims(organization_id, assigned_user_id);
