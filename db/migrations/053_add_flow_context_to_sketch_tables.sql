-- Migration 053: Add Flow Context to Sketch Tables
-- Adds flow_instance_id and movement_id columns to claim_rooms and claim_damage_zones
-- to link sketch zones and damage markers to flow engine movements

-- ============================================
-- claim_rooms - Add flow context columns
-- ============================================

ALTER TABLE claim_rooms
ADD COLUMN IF NOT EXISTS flow_instance_id UUID REFERENCES claim_flow_instances(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS movement_id TEXT,
ADD COLUMN IF NOT EXISTS created_during_inspection BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_claim_rooms_flow 
ON claim_rooms(flow_instance_id, movement_id);

COMMENT ON COLUMN claim_rooms.flow_instance_id IS 'Links room to flow instance when created during inspection';
COMMENT ON COLUMN claim_rooms.movement_id IS 'Movement ID in format "phaseId:movementId" when created during flow';
COMMENT ON COLUMN claim_rooms.created_during_inspection IS 'True if room was created during an active flow inspection';

-- ============================================
-- claim_damage_zones - Add flow context columns
-- ============================================

ALTER TABLE claim_damage_zones
ADD COLUMN IF NOT EXISTS flow_instance_id UUID REFERENCES claim_flow_instances(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS movement_id TEXT;

CREATE INDEX IF NOT EXISTS idx_claim_damage_zones_flow 
ON claim_damage_zones(flow_instance_id, movement_id);

COMMENT ON COLUMN claim_damage_zones.flow_instance_id IS 'Links damage zone to flow instance when created during inspection';
COMMENT ON COLUMN claim_damage_zones.movement_id IS 'Movement ID in format "phaseId:movementId" when created during flow';
