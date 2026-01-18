-- Migration: 057_photo_taxonomy_categories.sql
-- Purpose: Add structured photo taxonomy categories for organized evidence collection
-- Date: 2026-01-18

-- ============================================
-- PHOTO TAXONOMY CATEGORIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS photo_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Taxonomy prefix (e.g., 'OV', 'RF', 'RF-TSQ', 'EXT', 'WTR')
  prefix VARCHAR(20) NOT NULL UNIQUE,

  -- Parent category for hierarchical prefixes (e.g., 'RF' is parent of 'RF-TSQ')
  parent_prefix VARCHAR(20),

  -- Display info
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Photo requirements
  min_required INTEGER DEFAULT 0,
  max_allowed INTEGER,

  -- Peril applicability (NULL means applies to all perils)
  peril_types TEXT[] DEFAULT '{}',

  -- Property type applicability
  property_types TEXT[] DEFAULT ARRAY['residential', 'commercial'],

  -- UI ordering
  sort_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast prefix lookups
CREATE INDEX IF NOT EXISTS idx_photo_categories_prefix ON photo_categories(prefix);
CREATE INDEX IF NOT EXISTS idx_photo_categories_parent ON photo_categories(parent_prefix);
CREATE INDEX IF NOT EXISTS idx_photo_categories_peril ON photo_categories USING GIN(peril_types);

-- ============================================
-- ADD TAXONOMY COLUMNS TO CLAIM_PHOTOS
-- ============================================

-- Add taxonomy prefix column if it doesn't exist
ALTER TABLE claim_photos
  ADD COLUMN IF NOT EXISTS taxonomy_prefix VARCHAR(20);

-- Add reference to photo_categories
ALTER TABLE claim_photos
  ADD COLUMN IF NOT EXISTS taxonomy_category_id UUID REFERENCES photo_categories(id);

-- Add flag for auto-categorization
ALTER TABLE claim_photos
  ADD COLUMN IF NOT EXISTS auto_categorized BOOLEAN DEFAULT false;

-- Index for taxonomy queries
CREATE INDEX IF NOT EXISTS idx_claim_photos_taxonomy ON claim_photos(taxonomy_prefix);
CREATE INDEX IF NOT EXISTS idx_claim_photos_taxonomy_category ON claim_photos(taxonomy_category_id);

-- ============================================
-- SEED PHOTO CATEGORIES
-- ============================================

INSERT INTO photo_categories (prefix, parent_prefix, name, description, peril_types, min_required, sort_order) VALUES
  -- Overview (applies to all perils)
  ('OV', NULL, 'Overview', 'Property overview photos', '{}', 4, 1),
  ('OV-STR', 'OV', 'Street View', 'Street view of property showing context', '{}', 1, 2),
  ('OV-ADD', 'OV', 'Address', 'Address/house number visible', '{}', 1, 3),
  ('OV-4COR', 'OV', 'Four Corners', 'Four corners/elevations of property', '{}', 4, 4),

  -- Roof (hail, wind, fire)
  ('RF', NULL, 'Roof', 'General roof documentation', ARRAY['wind_hail', 'fire'], 4, 10),
  ('RF-TSQ', 'RF', 'Test Square', 'Hail test square with measurements', ARRAY['wind_hail'], 4, 11),
  ('RF-VNT', 'RF', 'Roof Vents', 'Vents, boots, penetrations', ARRAY['wind_hail', 'fire'], 2, 12),
  ('RF-RDG', 'RF', 'Ridge/Hip', 'Ridge caps, hip caps, valleys', ARRAY['wind_hail'], 2, 13),
  ('RF-DMG', 'RF', 'Roof Damage', 'Specific damage areas on roof', ARRAY['wind_hail', 'fire'], 0, 14),
  ('RF-DK', 'RF', 'Roof Decking', 'Decking/sheathing if exposed', ARRAY['wind_hail', 'fire'], 0, 15),

  -- Exterior (hail, wind, impact)
  ('EXT', NULL, 'Exterior', 'General exterior photos', ARRAY['wind_hail', 'impact'], 4, 20),
  ('EXT-GTR', 'EXT', 'Gutters', 'Gutters and downspouts', ARRAY['wind_hail'], 4, 21),
  ('EXT-SID', 'EXT', 'Siding', 'Siding, trim, fascia damage', ARRAY['wind_hail', 'impact'], 0, 22),
  ('EXT-WIN', 'EXT', 'Windows', 'Windows, frames, screens', ARRAY['wind_hail', 'impact'], 0, 23),
  ('EXT-DOR', 'EXT', 'Doors', 'Entry doors, garage doors', ARRAY['wind_hail', 'impact'], 0, 24),
  ('EXT-FNC', 'EXT', 'Fence', 'Fence damage', ARRAY['wind_hail', 'impact'], 0, 25),

  -- Interior Water Damage
  ('WTR', NULL, 'Water Damage', 'Interior water damage documentation', ARRAY['water', 'flood'], 4, 30),
  ('WTR-SRC', 'WTR', 'Water Source', 'Source of water intrusion', ARRAY['water'], 2, 31),
  ('WTR-CLG', 'WTR', 'Ceiling Damage', 'Ceiling water stains/damage', ARRAY['water'], 0, 32),
  ('WTR-WLL', 'WTR', 'Wall Damage', 'Wall water damage', ARRAY['water'], 0, 33),
  ('WTR-FLR', 'WTR', 'Floor Damage', 'Floor water damage', ARRAY['water', 'flood'], 0, 34),
  ('WTR-MTR', 'WTR', 'Moisture Readings', 'Moisture meter readings', ARRAY['water', 'flood'], 0, 35),

  -- Flood specific
  ('FLD', NULL, 'Flood', 'Flood damage documentation', ARRAY['flood'], 4, 40),
  ('FLD-LN', 'FLD', 'Water Line', 'High water mark evidence', ARRAY['flood'], 2, 41),
  ('FLD-DEB', 'FLD', 'Debris Line', 'Debris/sediment deposits', ARRAY['flood'], 0, 42),

  -- Fire
  ('FIRE', NULL, 'Fire', 'Fire damage documentation', ARRAY['fire'], 4, 50),
  ('FIRE-ORG', 'FIRE', 'Origin Area', 'Point of origin area', ARRAY['fire'], 2, 51),
  ('FIRE-CHR', 'FIRE', 'Char Patterns', 'Char depth and patterns', ARRAY['fire'], 0, 52),
  ('FIRE-STR', 'FIRE', 'Structural', 'Structural fire damage', ARRAY['fire'], 0, 53),

  -- Smoke
  ('SMK', NULL, 'Smoke', 'Smoke damage documentation', ARRAY['smoke', 'fire'], 2, 60),
  ('SMK-RES', 'SMK', 'Residue', 'Smoke residue on surfaces', ARRAY['smoke', 'fire'], 0, 61),
  ('SMK-MIG', 'SMK', 'Migration', 'Smoke migration patterns', ARRAY['smoke', 'fire'], 0, 62),

  -- Mold
  ('MLD', NULL, 'Mold', 'Mold damage documentation', ARRAY['mold', 'water'], 4, 70),
  ('MLD-VIS', 'MLD', 'Visible Mold', 'Visible mold growth', ARRAY['mold'], 0, 71),
  ('MLD-TST', 'MLD', 'Testing', 'Mold testing/sampling', ARRAY['mold'], 0, 72),

  -- Freeze
  ('FRZ', NULL, 'Freeze', 'Freeze damage documentation', ARRAY['water'], 2, 75),
  ('FRZ-PIP', 'FRZ', 'Pipe Damage', 'Frozen/burst pipe', ARRAY['water'], 2, 76),
  ('FRZ-ICE', 'FRZ', 'Ice Dam', 'Ice dam evidence', ARRAY['water', 'wind_hail'], 0, 77),

  -- Impact
  ('IMP', NULL, 'Impact', 'Impact damage documentation', ARRAY['impact'], 4, 80),
  ('IMP-SRC', 'IMP', 'Impact Source', 'Source of impact (tree, vehicle, etc.)', ARRAY['impact'], 2, 81),
  ('IMP-DMG', 'IMP', 'Impact Damage', 'Resulting damage from impact', ARRAY['impact'], 0, 82),

  -- Coverage B - Other Structures
  ('COVB', NULL, 'Coverage B', 'Other structures documentation', '{}', 0, 90),
  ('COVB-GAR', 'COVB', 'Garage/Carport', 'Detached garage or carport', '{}', 0, 91),
  ('COVB-SHD', 'COVB', 'Shed/Outbuilding', 'Sheds and outbuildings', '{}', 0, 92),
  ('COVB-FNC', 'COVB', 'Fence/Gate', 'Fences and gates', '{}', 0, 93),

  -- Contents (Coverage C)
  ('CONT', NULL, 'Contents', 'Personal property documentation', '{}', 0, 100),
  ('CONT-DMG', 'CONT', 'Damaged Items', 'Damaged personal property', '{}', 0, 101),
  ('CONT-INV', 'CONT', 'Inventory', 'Contents inventory photos', '{}', 0, 102),

  -- Mitigation
  ('MTG', NULL, 'Mitigation', 'Emergency services documentation', ARRAY['water', 'fire', 'flood'], 0, 110),
  ('MTG-EQP', 'MTG', 'Equipment', 'Drying equipment, air movers', ARRAY['water', 'flood'], 0, 111),
  ('MTG-DEM', 'MTG', 'Demo', 'Emergency demolition', ARRAY['water', 'fire', 'flood'], 0, 112),

  -- Pre-existing conditions
  ('PRE', NULL, 'Pre-existing', 'Prior/pre-existing conditions', '{}', 0, 120),
  ('PRE-WR', 'PRE', 'Wear', 'Normal wear and tear', '{}', 0, 121),
  ('PRE-DMG', 'PRE', 'Prior Damage', 'Damage pre-dating loss', '{}', 0, 122),

  -- Measurements
  ('MSR', NULL, 'Measurements', 'Measurement documentation', '{}', 0, 130),
  ('MSR-DIM', 'MSR', 'Dimensions', 'Room/area dimensions', '{}', 0, 131),
  ('MSR-DTL', 'MSR', 'Details', 'Detail measurements', '{}', 0, 132)

ON CONFLICT (prefix) DO NOTHING;

-- ============================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_photo_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_categories_updated_at ON photo_categories;
CREATE TRIGGER photo_categories_updated_at
  BEFORE UPDATE ON photo_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_photo_categories_updated_at();
