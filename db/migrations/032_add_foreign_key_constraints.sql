-- Migration: Add missing foreign key constraints
-- Adds proper FK relationships for referential integrity
-- Includes cleanup of orphaned records before adding constraints
--
-- WARNING: NON-REVERSIBLE MIGRATION
-- This migration performs DELETE operations to clean up orphaned records
-- before adding foreign key constraints. These deletes are NOT reversible.
-- Data is permanently lost.
--
-- Before running this migration in production:
-- 1. Backup the database
-- 2. Review the DELETE operations (lines 10-112)
-- 3. Consider running on a test database first
--
-- Rollback: This migration cannot be rolled back. To undo:
-- 1. Restore from backup
-- 2. Remove foreign key constraints manually

-- =================================================
-- CLEANUP: Remove orphaned records before adding FKs
-- =================================================

-- Clean up claim_briefings with missing claims
DELETE FROM claim_briefings 
WHERE claim_id IS NOT NULL 
  AND claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_briefings with missing organizations
DELETE FROM claim_briefings 
WHERE organization_id IS NOT NULL 
  AND organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_structures with missing claims
DELETE FROM claim_structures 
WHERE claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_structures with missing organizations
DELETE FROM claim_structures 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_rooms with missing claims
DELETE FROM claim_rooms 
WHERE claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_rooms with missing organizations
DELETE FROM claim_rooms 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_rooms with missing structures
DELETE FROM claim_rooms 
WHERE structure_id IS NOT NULL 
  AND structure_id NOT IN (SELECT id FROM claim_structures);

-- Clean up claim_damage_zones with missing claims
DELETE FROM claim_damage_zones 
WHERE claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_damage_zones with missing organizations
DELETE FROM claim_damage_zones 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_damage_zones with missing rooms
DELETE FROM claim_damage_zones 
WHERE room_id IS NOT NULL 
  AND room_id NOT IN (SELECT id FROM claim_rooms);

-- Clean up claim_photos with missing claims
DELETE FROM claim_photos 
WHERE claim_id IS NOT NULL 
  AND claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_photos with missing organizations
DELETE FROM claim_photos 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_photos with missing structures
DELETE FROM claim_photos 
WHERE structure_id IS NOT NULL 
  AND structure_id NOT IN (SELECT id FROM claim_structures);

-- Clean up claim_photos with missing rooms
DELETE FROM claim_photos 
WHERE room_id IS NOT NULL 
  AND room_id NOT IN (SELECT id FROM claim_rooms);

-- Clean up claim_photos with missing damage zones
DELETE FROM claim_photos 
WHERE damage_zone_id IS NOT NULL 
  AND damage_zone_id NOT IN (SELECT id FROM claim_damage_zones);

-- Clean up documents with missing claims
DELETE FROM documents 
WHERE claim_id IS NOT NULL 
  AND claim_id NOT IN (SELECT id FROM claims);

-- Clean up documents with missing organizations
DELETE FROM documents 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Clean up estimates with missing organizations
DELETE FROM estimates 
WHERE organization_id IS NOT NULL 
  AND organization_id NOT IN (SELECT id FROM organizations);

-- Clean up estimate_line_items with missing estimates
DELETE FROM estimate_line_items 
WHERE estimate_id NOT IN (SELECT id FROM estimates);

-- Clean up inspection_workflows with missing claims
DELETE FROM inspection_workflows 
WHERE claim_id IS NOT NULL 
  AND claim_id NOT IN (SELECT id FROM claims);

-- Clean up inspection_workflows with missing organizations
DELETE FROM inspection_workflows 
WHERE organization_id IS NOT NULL 
  AND organization_id NOT IN (SELECT id FROM organizations);

-- Clean up claim_checklists with missing claims
DELETE FROM claim_checklists 
WHERE claim_id NOT IN (SELECT id FROM claims);

-- Clean up claim_checklists with missing organizations
DELETE FROM claim_checklists 
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- =================================================
-- claim_briefings
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_briefings_org') THEN
    ALTER TABLE claim_briefings
      ADD CONSTRAINT fk_claim_briefings_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_briefings_claim') THEN
    ALTER TABLE claim_briefings
      ADD CONSTRAINT fk_claim_briefings_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =================================================
-- claim_structures
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_structures_claim') THEN
    ALTER TABLE claim_structures
      ADD CONSTRAINT fk_claim_structures_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_structures_org') THEN
    ALTER TABLE claim_structures
      ADD CONSTRAINT fk_claim_structures_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

-- =================================================
-- claim_rooms
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_rooms_claim') THEN
    ALTER TABLE claim_rooms
      ADD CONSTRAINT fk_claim_rooms_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_rooms_org') THEN
    ALTER TABLE claim_rooms
      ADD CONSTRAINT fk_claim_rooms_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_rooms_structure') THEN
    ALTER TABLE claim_rooms
      ADD CONSTRAINT fk_claim_rooms_structure
      FOREIGN KEY (structure_id) REFERENCES claim_structures(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =================================================
-- claim_damage_zones
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_damage_zones_claim') THEN
    ALTER TABLE claim_damage_zones
      ADD CONSTRAINT fk_claim_damage_zones_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_damage_zones_org') THEN
    ALTER TABLE claim_damage_zones
      ADD CONSTRAINT fk_claim_damage_zones_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_damage_zones_room') THEN
    ALTER TABLE claim_damage_zones
      ADD CONSTRAINT fk_claim_damage_zones_room
      FOREIGN KEY (room_id) REFERENCES claim_rooms(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =================================================
-- claim_photos
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_photos_claim') THEN
    ALTER TABLE claim_photos
      ADD CONSTRAINT fk_claim_photos_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_photos_org') THEN
    ALTER TABLE claim_photos
      ADD CONSTRAINT fk_claim_photos_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_photos_structure') THEN
    ALTER TABLE claim_photos
      ADD CONSTRAINT fk_claim_photos_structure
      FOREIGN KEY (structure_id) REFERENCES claim_structures(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_photos_room') THEN
    ALTER TABLE claim_photos
      ADD CONSTRAINT fk_claim_photos_room
      FOREIGN KEY (room_id) REFERENCES claim_rooms(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_photos_zone') THEN
    ALTER TABLE claim_photos
      ADD CONSTRAINT fk_claim_photos_zone
      FOREIGN KEY (damage_zone_id) REFERENCES claim_damage_zones(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =================================================
-- documents
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_claim') THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_org') THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

-- =================================================
-- estimates
-- =================================================
-- Note: estimates.claim_id was varchar but is being changed to uuid
-- This migration assumes the column type has already been changed

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_estimates_org') THEN
    ALTER TABLE estimates
      ADD CONSTRAINT fk_estimates_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

-- Only add this FK if claim_id is uuid type
DO $$ 
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'estimates' AND column_name = 'claim_id';
  
  IF col_type = 'uuid' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_estimates_claim') THEN
      -- Clean up any remaining orphaned estimates before adding FK
      DELETE FROM estimates 
      WHERE claim_id IS NOT NULL 
        AND claim_id NOT IN (SELECT id FROM claims);
      
      ALTER TABLE estimates
        ADD CONSTRAINT fk_estimates_claim
        FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- =================================================
-- estimate_line_items
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_estimate_line_items_estimate') THEN
    ALTER TABLE estimate_line_items
      ADD CONSTRAINT fk_estimate_line_items_estimate
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =================================================
-- inspection_workflows
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inspection_workflows_claim') THEN
    ALTER TABLE inspection_workflows
      ADD CONSTRAINT fk_inspection_workflows_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inspection_workflows_org') THEN
    ALTER TABLE inspection_workflows
      ADD CONSTRAINT fk_inspection_workflows_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

-- =================================================
-- claim_checklists
-- =================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_checklists_claim') THEN
    ALTER TABLE claim_checklists
      ADD CONSTRAINT fk_claim_checklists_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_claim_checklists_org') THEN
    ALTER TABLE claim_checklists
      ADD CONSTRAINT fk_claim_checklists_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

-- =================================================
-- claim_checklist_items
-- =================================================
-- This table already has ON DELETE CASCADE via the checklist_id FK in the schema

-- Add index for FK columns if not exists
CREATE INDEX IF NOT EXISTS idx_claim_briefings_claim ON claim_briefings(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_structures_claim ON claim_structures(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_rooms_structure ON claim_rooms(structure_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_claim ON claim_photos(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_structure ON claim_photos(structure_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_room ON claim_photos(room_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_zone ON claim_photos(damage_zone_id);
CREATE INDEX IF NOT EXISTS idx_documents_claim ON documents(claim_id);
CREATE INDEX IF NOT EXISTS idx_estimates_claim ON estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON estimate_line_items(estimate_id);
