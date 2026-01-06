-- Migration: Migrate estimate_missing_walls to zone_openings
-- 
-- PURPOSE: Consolidate opening storage to use canonical zone_openings table
-- which uses wall_index instead of wall names, enabling precise geometry.
--
-- PREREQUISITE: This migration requires zone_openings table to exist
-- (created by migration 033_create_zone_openings_table.sql)
--
-- This migration:
-- 1. Migrates all openings from estimate_missing_walls to zone_openings
-- 2. Converts wall names (north/south/east/west) to wall_index based on polygon
-- 3. Sets offset_from_vertex_ft to 0 (center of wall) for legacy data
-- 4. Preserves all opening metadata

BEGIN;

-- Verify zone_openings table exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zone_openings') THEN
    RAISE EXCEPTION 'zone_openings table does not exist. Please run migration 024_create_zone_openings_table.sql first.';
  END IF;
END $$;

-- Function to convert wall name to wall index based on polygon
-- This is a helper function for the migration
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
  center_x numeric;
  center_y numeric;
  i integer;
  p1 jsonb;
  p2 jsonb;
  wall_dx numeric;
  wall_dy numeric;
BEGIN
  -- Get polygon points
  points := polygon_ft;
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
  
  center_x := (min_x + max_x) / 2;
  center_y := (min_y + max_y) / 2;
  
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
-- Only migrate if zone has a valid polygon
INSERT INTO zone_openings (
  zone_id,
  opening_type,
  wall_index,
  offset_from_vertex_ft,
  width_ft,
  height_ft,
  sill_height_ft,
  connects_to_zone_id,
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
    ELSE NULL
  END as sill_height_ft,
  NULL as connects_to_zone_id, -- Legacy data doesn't have this
  emw.sort_order,
  emw.created_at
FROM estimate_missing_walls emw
INNER JOIN estimate_zones ez ON emw.zone_id = ez.id
WHERE ez.polygon_ft IS NOT NULL 
  AND jsonb_array_length(ez.polygon_ft) >= 3
  -- Avoid duplicates (check if opening already exists)
  AND NOT EXISTS (
    SELECT 1 
    FROM zone_openings zo 
    WHERE zo.zone_id = emw.zone_id
      AND zo.wall_index = get_wall_index_from_name(ez.polygon_ft, emw.name)
      AND zo.opening_type = CASE 
        WHEN emw.opening_type = 'missing_wall' THEN 'missing_wall'
        WHEN emw.opening_type = 'door' THEN 'door'
        WHEN emw.opening_type = 'window' THEN 'window'
        WHEN emw.opening_type = 'opening' THEN 'cased_opening'
        ELSE 'door'
      END
  );

-- Drop the helper function
DROP FUNCTION IF EXISTS get_wall_index_from_name(jsonb, text);

-- Note: We do NOT drop estimate_missing_walls table yet
-- It will be deprecated but kept for backward compatibility during transition
-- A future migration will drop it after all code is updated

COMMIT;
