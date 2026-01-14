-- Migration: Add composite indexes for claims table
-- Purpose: Improve query performance for common filtering patterns
-- Date: 2026-01-13

-- Add composite index on claims(organization_id, status) for common query pattern
-- This optimizes queries that filter by organization and status together
CREATE INDEX IF NOT EXISTS idx_claims_org_status ON claims(organization_id, status);

-- Add composite index on claims(organization_id, primary_peril) for peril-based filtering
CREATE INDEX IF NOT EXISTS idx_claims_org_peril ON claims(organization_id, primary_peril);

-- Note: Individual indexes on organization_id and status already exist from previous migrations
