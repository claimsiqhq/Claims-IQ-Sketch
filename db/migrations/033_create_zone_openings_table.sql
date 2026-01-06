-- Migration: Create zone_openings table
-- 
-- PURPOSE: Create the canonical zone_openings table for storing wall openings
-- with wall-index based geometry (replacing estimate_missing_walls)
--
-- This table stores openings referenced by wall index into the zone's polygon.
-- This supports the voice-first sketch workflow where openings are placed
-- precisely on walls derived from the room polygon.
--
-- See: docs/sketch-esx-architecture.md for full architecture details.

BEGIN;

CREATE TABLE IF NOT EXISTS zone_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES estimate_zones(id) ON DELETE CASCADE,

  -- Opening type
  opening_type VARCHAR(30) NOT NULL, -- door, window, cased_opening, archway, sliding_door, french_door, missing_wall

  -- Wall reference (index into polygon edges)
  wall_index INTEGER NOT NULL, -- 0-based index of polygon edge

  -- Position on wall
  offset_from_vertex_ft DECIMAL(8, 2) NOT NULL, -- Distance from starting vertex

  -- Dimensions
  width_ft DECIMAL(6, 2) NOT NULL,
  height_ft DECIMAL(6, 2) NOT NULL,
  sill_height_ft DECIMAL(6, 2), -- For windows

  -- Optional: which zone this opening connects to
  connects_to_zone_id UUID REFERENCES estimate_zones(id) ON DELETE SET NULL,

  -- Metadata
  notes TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS zone_openings_zone_idx ON zone_openings(zone_id);
CREATE INDEX IF NOT EXISTS zone_openings_wall_idx ON zone_openings(zone_id, wall_index);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_zone_openings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER zone_openings_updated_at
  BEFORE UPDATE ON zone_openings
  FOR EACH ROW
  EXECUTE FUNCTION update_zone_openings_updated_at();

COMMIT;
