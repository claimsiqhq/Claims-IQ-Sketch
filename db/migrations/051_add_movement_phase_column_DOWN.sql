-- Rollback migration for 051_add_movement_phase_column.sql
-- Drops the movement_phase column and its index

DROP INDEX IF EXISTS movement_completions_phase_idx;
ALTER TABLE movement_completions DROP COLUMN IF EXISTS movement_phase;
