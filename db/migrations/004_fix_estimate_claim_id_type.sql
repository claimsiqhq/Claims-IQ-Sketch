-- Migration: Fix estimates.claim_id type to match claims.id (UUID)
-- This fixes the type mismatch where estimates.claim_id was varchar(100)
-- but claims.id is UUID, requiring a cast in queries

-- Step 1: Drop any existing foreign key constraint (if exists)
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_claim_id_fkey;

-- Step 2: Alter the column type from varchar to UUID
-- This will fail if there are invalid UUIDs in the column
-- First, let's clean up any invalid data by setting non-UUID values to NULL
UPDATE estimates
SET claim_id = NULL
WHERE claim_id IS NOT NULL
  AND claim_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Step 3: Convert the column to UUID type
ALTER TABLE estimates
  ALTER COLUMN claim_id TYPE uuid USING claim_id::uuid;

-- Step 4: Add the foreign key constraint
ALTER TABLE estimates
  ADD CONSTRAINT estimates_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;

-- Step 5: Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_estimates_claim_id ON estimates(claim_id);

-- Verify the change
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'estimates' AND column_name = 'claim_id';
