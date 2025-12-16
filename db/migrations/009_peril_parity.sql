-- Migration 009: Peril Parity Foundation
-- This migration adds first-class support for ALL perils across the schema,
-- eliminating the implicit bias toward wind/hail claims.

-- ============================================
-- CLAIMS TABLE: Add peril parity fields
-- ============================================

-- Primary peril - canonical peril enum value
ALTER TABLE claims ADD COLUMN IF NOT EXISTS primary_peril VARCHAR(50);

-- Secondary perils - array of additional perils (fire often comes with smoke, etc.)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS secondary_perils JSONB DEFAULT '[]'::jsonb;

-- Peril confidence - how confident we are in the peril inference (0.00-1.00)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS peril_confidence DECIMAL(3, 2);

-- Peril metadata - peril-specific structured data (water source, fire origin, etc.)
ALTER TABLE claims ADD COLUMN IF NOT EXISTS peril_metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for efficient peril-based queries
CREATE INDEX IF NOT EXISTS claims_primary_peril_idx ON claims(primary_peril);

-- ============================================
-- CLAIM_DAMAGE_ZONES TABLE: Add peril context
-- ============================================

-- Associated peril - links damage zone to canonical peril
ALTER TABLE claim_damage_zones ADD COLUMN IF NOT EXISTS associated_peril VARCHAR(50);

-- Peril confidence for damage zone inference
ALTER TABLE claim_damage_zones ADD COLUMN IF NOT EXISTS peril_confidence DECIMAL(3, 2);

-- Add index for peril-based damage zone queries
CREATE INDEX IF NOT EXISTS claim_damage_zones_peril_idx ON claim_damage_zones(associated_peril);

-- ============================================
-- DAMAGE_ZONES TABLE: Add peril context
-- ============================================

-- Associated peril - links damage zone to canonical peril
ALTER TABLE damage_zones ADD COLUMN IF NOT EXISTS associated_peril VARCHAR(50);

-- Peril confidence for damage zone inference
ALTER TABLE damage_zones ADD COLUMN IF NOT EXISTS peril_confidence DECIMAL(3, 2);

-- ============================================
-- ESTIMATE_ZONES TABLE: Add peril context
-- ============================================

-- Associated peril - links estimate zone to canonical peril
ALTER TABLE estimate_zones ADD COLUMN IF NOT EXISTS associated_peril VARCHAR(50);

-- Peril confidence for estimate zone inference
ALTER TABLE estimate_zones ADD COLUMN IF NOT EXISTS peril_confidence DECIMAL(3, 2);

-- Add index for peril-based estimate queries
CREATE INDEX IF NOT EXISTS estimate_zones_peril_idx ON estimate_zones(associated_peril);

-- ============================================
-- BACKFILL: Normalize existing claims to canonical perils
-- ============================================
-- This sets primary_peril based on existing loss_type field
-- Confidence is set low (0.50) since this is inferred from legacy data

UPDATE claims
SET primary_peril = CASE
    WHEN LOWER(loss_type) LIKE '%hail%' OR LOWER(loss_type) LIKE '%wind%' THEN 'wind_hail'
    WHEN LOWER(loss_type) LIKE '%fire%' THEN 'fire'
    WHEN LOWER(loss_type) LIKE '%water%' AND LOWER(loss_type) NOT LIKE '%flood%' THEN 'water'
    WHEN LOWER(loss_type) LIKE '%flood%' THEN 'flood'
    WHEN LOWER(loss_type) LIKE '%smoke%' THEN 'smoke'
    WHEN LOWER(loss_type) LIKE '%mold%' THEN 'mold'
    WHEN LOWER(loss_type) LIKE '%impact%' OR LOWER(loss_type) LIKE '%tree%' OR LOWER(loss_type) LIKE '%vehicle%' THEN 'impact'
    ELSE 'other'
END,
peril_confidence = 0.50
WHERE primary_peril IS NULL AND loss_type IS NOT NULL;

-- Set secondary perils based on common peril associations
UPDATE claims
SET secondary_perils = '["smoke"]'::jsonb
WHERE primary_peril = 'fire' AND secondary_perils = '[]'::jsonb;

UPDATE claims
SET secondary_perils = '["mold"]'::jsonb
WHERE primary_peril IN ('water', 'flood') AND secondary_perils = '[]'::jsonb;

-- Set flood coverage warning in metadata
UPDATE claims
SET peril_metadata = jsonb_build_object(
    'flood', jsonb_build_object(
        'coverage_warning', 'Flood damage typically excluded under HO policies unless separate flood coverage exists.'
    )
)
WHERE primary_peril = 'flood' AND peril_metadata = '{}'::jsonb;

-- ============================================
-- BACKFILL: Normalize existing damage zones to canonical perils
-- ============================================

-- Backfill claim_damage_zones
UPDATE claim_damage_zones
SET associated_peril = CASE
    WHEN LOWER(damage_type) IN ('wind', 'hail') THEN 'wind_hail'
    WHEN LOWER(damage_type) = 'fire' THEN 'fire'
    WHEN LOWER(damage_type) = 'water' THEN 'water'
    WHEN LOWER(damage_type) = 'smoke' THEN 'smoke'
    WHEN LOWER(damage_type) = 'mold' THEN 'mold'
    WHEN LOWER(damage_type) = 'impact' THEN 'impact'
    ELSE 'other'
END,
peril_confidence = 0.70
WHERE associated_peril IS NULL AND damage_type IS NOT NULL;

-- Backfill damage_zones
UPDATE damage_zones
SET associated_peril = CASE
    WHEN LOWER(damage_type) IN ('wind', 'hail') THEN 'wind_hail'
    WHEN LOWER(damage_type) = 'fire' THEN 'fire'
    WHEN LOWER(damage_type) = 'water' THEN 'water'
    WHEN LOWER(damage_type) = 'smoke' THEN 'smoke'
    WHEN LOWER(damage_type) = 'mold' THEN 'mold'
    WHEN LOWER(damage_type) = 'impact' THEN 'impact'
    ELSE 'other'
END,
peril_confidence = 0.70
WHERE associated_peril IS NULL AND damage_type IS NOT NULL;

-- Backfill estimate_zones
UPDATE estimate_zones
SET associated_peril = CASE
    WHEN LOWER(damage_type) IN ('wind', 'hail') THEN 'wind_hail'
    WHEN LOWER(damage_type) = 'fire' THEN 'fire'
    WHEN LOWER(damage_type) = 'water' THEN 'water'
    WHEN LOWER(damage_type) = 'smoke' THEN 'smoke'
    WHEN LOWER(damage_type) = 'mold' THEN 'mold'
    WHEN LOWER(damage_type) = 'impact' THEN 'impact'
    ELSE 'other'
END,
peril_confidence = 0.70
WHERE associated_peril IS NULL AND damage_type IS NOT NULL;

-- ============================================
-- COMMENTS: Document peril values
-- ============================================

COMMENT ON COLUMN claims.primary_peril IS 'Canonical peril enum: wind_hail, fire, water, flood, smoke, mold, impact, other';
COMMENT ON COLUMN claims.secondary_perils IS 'Array of secondary perils that often co-occur (e.g., fire -> smoke)';
COMMENT ON COLUMN claims.peril_confidence IS 'Confidence in peril inference (0.00-1.00)';
COMMENT ON COLUMN claims.peril_metadata IS 'Peril-specific structured data (water source, fire origin, etc.)';

COMMENT ON COLUMN claim_damage_zones.associated_peril IS 'Canonical peril this damage zone is associated with';
COMMENT ON COLUMN claim_damage_zones.peril_confidence IS 'Confidence in peril association (0.00-1.00)';

COMMENT ON COLUMN damage_zones.associated_peril IS 'Canonical peril this damage zone is associated with';
COMMENT ON COLUMN damage_zones.peril_confidence IS 'Confidence in peril association (0.00-1.00)';

COMMENT ON COLUMN estimate_zones.associated_peril IS 'Canonical peril this estimate zone is associated with';
COMMENT ON COLUMN estimate_zones.peril_confidence IS 'Confidence in peril association (0.00-1.00)';
