-- Migration: Create zone_openings and zone_connections tables
-- 
-- PURPOSE: Create canonical tables for zone geometry storage
-- - zone_openings: Wall openings with wall-index based geometry
-- - zone_connections: Room-to-room relationships
--
-- See: docs/sketch-esx-architecture.md for full architecture details.

BEGIN;

-- ============================================
-- ZONE_OPENINGS TABLE
-- ============================================

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

-- Create indexes for zone_openings
CREATE INDEX IF NOT EXISTS zone_openings_zone_idx ON zone_openings(zone_id);
CREATE INDEX IF NOT EXISTS zone_openings_wall_idx ON zone_openings(zone_id, wall_index);

-- Add updated_at trigger for zone_openings
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

-- ============================================
-- ZONE_CONNECTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS zone_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  
  -- Connection endpoints
  from_zone_id UUID NOT NULL REFERENCES estimate_zones(id) ON DELETE CASCADE,
  to_zone_id UUID NOT NULL REFERENCES estimate_zones(id) ON DELETE CASCADE,
  
  -- Connection type
  connection_type VARCHAR(30) NOT NULL, -- door, opening, shared_wall, hallway, stairway
  
  -- Optional: reference to opening that forms this connection
  opening_id UUID REFERENCES zone_openings(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure zones belong to same estimate
  CONSTRAINT zone_connections_same_estimate CHECK (
    (SELECT estimate_id FROM estimate_zones WHERE id = from_zone_id) = 
    (SELECT estimate_id FROM estimate_zones WHERE id = to_zone_id)
  ),
  
  -- Prevent self-connections
  CONSTRAINT zone_connections_no_self CHECK (from_zone_id != to_zone_id)
);

-- Create indexes for zone_connections
CREATE INDEX IF NOT EXISTS zone_connections_estimate_idx ON zone_connections(estimate_id);
CREATE INDEX IF NOT EXISTS zone_connections_from_zone_idx ON zone_connections(from_zone_id);
CREATE INDEX IF NOT EXISTS zone_connections_to_zone_idx ON zone_connections(to_zone_id);
CREATE INDEX IF NOT EXISTS zone_connections_opening_idx ON zone_connections(opening_id);

-- Add updated_at trigger for zone_connections
CREATE OR REPLACE FUNCTION update_zone_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER zone_connections_updated_at
  BEFORE UPDATE ON zone_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_zone_connections_updated_at();

COMMIT;
