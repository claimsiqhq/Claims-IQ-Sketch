-- Migration: Add surface column to claim_damage_zones
-- Date: 2026-01-23
-- Purpose: Support editing damage zone surface (ceiling, wall, floor) via voice agent

-- Add surface column
ALTER TABLE claim_damage_zones
ADD COLUMN IF NOT EXISTS surface VARCHAR(50);

-- Add index for surface queries
CREATE INDEX IF NOT EXISTS claim_damage_zones_surface_idx ON claim_damage_zones(surface);

-- Update existing records: infer surface from floor_affected and ceiling_affected
UPDATE claim_damage_zones
SET surface = CASE
  WHEN floor_affected = true AND ceiling_affected = true THEN 'floor_ceiling'
  WHEN floor_affected = true THEN 'floor'
  WHEN ceiling_affected = true THEN 'ceiling'
  ELSE 'wall'
END
WHERE surface IS NULL;

-- Comment
COMMENT ON COLUMN claim_damage_zones.surface IS 'Affected surface: ceiling, wall, floor, or combination (e.g., floor_ceiling)';
