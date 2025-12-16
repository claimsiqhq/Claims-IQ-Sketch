-- Migration: 011_carrier_inspection_overlays.sql
-- Description: Add carrier-specific inspection overlays to carrier_profiles
-- Part of: Carrier-Specific Inspection Overlays feature

-- ============================================
-- CARRIER INSPECTION OVERLAYS
-- ============================================
-- Allows carriers to define inspection preferences that:
-- - Influence AI guidance
-- - Influence inspection emphasis
-- - Do NOT hardcode coverage rules
--
-- Overlays:
-- - Can emphasize (highlight importance)
-- - Can de-emphasize (reduce priority)
-- - Cannot contradict core peril logic
-- ============================================

-- Add carrier_inspection_overlays column to carrier_profiles
ALTER TABLE carrier_profiles
ADD COLUMN IF NOT EXISTS carrier_inspection_overlays JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN carrier_profiles.carrier_inspection_overlays IS
'Carrier-specific inspection preferences per peril. Structure:
{
  "wind_hail": {
    "require_test_squares": true,
    "photo_density": "high",
    "emphasis": ["soft_metal_documentation", "roof_age_verification"],
    "de_emphasis": []
  },
  "water": {
    "require_duration_confirmation": true,
    "require_moisture_readings": true,
    "emphasis": ["contamination_level", "mold_risk"],
    "de_emphasis": []
  },
  "fire": {
    "require_origin_documentation": true,
    "emphasis": ["hvac_inspection", "smoke_migration"],
    "de_emphasis": []
  },
  "flood": {
    "require_high_water_mark": true,
    "emphasis": ["coverage_verification"],
    "de_emphasis": []
  }
}
';

-- ============================================
-- EXAMPLE DATA (for reference)
-- ============================================
-- You can seed carrier overlays like this:
-- UPDATE carrier_profiles SET carrier_inspection_overlays = '{
--   "wind_hail": {
--     "require_test_squares": true,
--     "photo_density": "high",
--     "test_square_count": 3
--   },
--   "water": {
--     "require_duration_confirmation": true,
--     "require_moisture_readings": true
--   }
-- }'::jsonb WHERE code = 'ACME';
