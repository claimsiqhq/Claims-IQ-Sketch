-- Migration: Migrate estimate_missing_walls to zone_openings (Fixed)
-- 
-- PURPOSE: Consolidate opening storage to use canonical zone_openings table
-- which uses wall_index instead of wall names, enabling precise geometry.
--
-- This migration:
-- 1. Adds missing canonical geometry columns to estimate_zones if they don't exist
-- 2. Migrates all openings from estimate_missing_walls to zone_openings
-- 3. Converts wall names (north/south/east/west) to wall_index based on polygon
-- 4. Sets offset_from_vertex_ft to 0 (center of wall) for legacy data

BEGIN;

-- ============================================
-- 1. Add canonical geometry columns
-- ============================================

ALTER TABLE estimate_zones
ADD COLUMN IF NOT EXISTS origin_x_ft DECIMAL(8, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS origin_y_ft DECIMAL(8, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS polygon_ft JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS shape_type VARCHAR(10) DEFAULT 'RECT',
ADD COLUMN IF NOT EXISTS level_name VARCHAR(50) DEFAULT 'Main Level';

-- Try to populate polygon_ft from sketch_polygon if it exists and polygon_ft is empty
UPDATE estimate_zones
SET polygon_ft = sketch_polygon
WHERE (polygon_ft IS NULL OR jsonb_array_length(polygon_ft) = 0)
  AND sketch_polygon IS NOT NULL 
  AND sketch_polygon != 'null'::jsonb;

-- Verify zone_openings table exists (should be from 033)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_openings') THEN
    RAISE EXCEPTION 'zone_openings table does not exist. Please run migration 033_create_zone_openings_and_connections.sql first.';
  END IF;
END $$;

-- ============================================
-- 2. Migration Logic
-- ============================================

-- Function to convert wall name to wall index based on polygon
CREATE OR REPLACE FUNCTION get_wall_index_from_name(
  polygon_ft jsonb,
  wall_name text
) RETURNS integer AS $$
DECLARE
  points jsonb;
  point_count integer;
  min_x numeric;
  max_x numeric;
  min_y numeric;
  max_y numeric;
  i integer;
  p1 jsonb;
  p2 jsonb;
  wall_dx numeric;
  wall_dy numeric;
BEGIN
  -- Get polygon points
  points := polygon_ft;
  
  IF points IS NULL OR jsonb_typeof(points) != 'array' THEN
    RETURN 0;
  END IF;

  point_count := jsonb_array_length(points);
  
  IF point_count < 3 THEN
    RETURN 0; -- Default to first wall if invalid polygon
  END IF;
  
  -- Calculate bounding box to determine orientation
  SELECT 
    MIN((pt->>'x')::numeric),
    MAX((pt->>'x')::numeric),
    MIN((pt->>'y')::numeric),
    MAX((pt->>'y')::numeric)
  INTO min_x, max_x, min_y, max_y
  FROM jsonb_array_elements(points) pt;
  
  -- Find wall that matches the direction
  FOR i IN 0..point_count-1 LOOP
    p1 := points->(i);
    p2 := points->((i + 1) % point_count);
    
    wall_dx := (p2->>'x')::numeric - (p1->>'x')::numeric;
    wall_dy := (p2->>'y')::numeric - (p1->>'y')::numeric;
    
    -- Determine wall direction based on vector
    IF wall_name = 'north' AND wall_dy > 0 THEN
      RETURN i;
    ELSIF wall_name = 'south' AND wall_dy < 0 THEN
      RETURN i;
    ELSIF wall_name = 'east' AND wall_dx > 0 THEN
      RETURN i;
    ELSIF wall_name = 'west' AND wall_dx < 0 THEN
      RETURN i;
    END IF;
  END LOOP;
  
  -- Fallback: use first wall
  RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Migrate openings from estimate_missing_walls to zone_openings
INSERT INTO zone_openings (
  zone_id,
  opening_type,
  wall_index,
  offset_from_vertex_ft,
  width_ft,
  height_ft,
  sill_height_ft,
  connects_to_zone_id,
  notes,
  sort_order,
  created_at
)
SELECT 
  emw.zone_id,
  CASE 
    WHEN emw.opening_type = 'missing_wall' THEN 'missing_wall'
    WHEN emw.opening_type = 'door' THEN 'door'
    WHEN emw.opening_type = 'window' THEN 'window'
    WHEN emw.opening_type = 'opening' THEN 'cased_opening'
    ELSE 'door' -- Default fallback
  END as opening_type,
  -- Convert wall name to wall index
  COALESCE(
    get_wall_index_from_name(ez.polygon_ft, emw.name),
    0
  ) as wall_index,
  -- Set offset to 0 (center of wall) for legacy data
  0::numeric as offset_from_vertex_ft,
  emw.width_ft,
  emw.height_ft,
  CASE 
    WHEN emw.goes_to_floor = false THEN emw.height_ft / 2
    ELSE 0
  END as sill_height_ft,
  NULL as connects_to_zone_id, -- Legacy data doesn't have this
  CASE 
    WHEN emw.name IS NOT NULL THEN 'Legacy Name: ' || emw.name 
    ELSE NULL 
  END as notes,
  emw.sort_order,
  emw.created_at
FROM estimate_missing_walls emw
INNER JOIN estimate_zones ez ON emw.zone_id = ez.id
-- Only migrate if not already present (avoid duplicates if re-run)
WHERE NOT EXISTS (
    SELECT 1 
    FROM zone_openings zo 
    WHERE zo.zone_id = emw.zone_id
      AND zo.width_ft = emw.width_ft
      AND zo.height_ft = emw.height_ft
);

-- Drop the helper function
DROP FUNCTION IF EXISTS get_wall_index_from_name(jsonb, text);

COMMIT;
