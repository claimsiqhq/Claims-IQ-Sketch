-- Migration: Fix MS365 tokens unique constraint
-- Purpose: Ensure user_id has a unique constraint for upsert operations

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  -- Check if unique constraint already exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_ms365_tokens_user_id_key'
    AND conrelid = 'user_ms365_tokens'::regclass
  ) THEN
    -- Add unique constraint
    ALTER TABLE user_ms365_tokens
    ADD CONSTRAINT user_ms365_tokens_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Also ensure account_id column exists (added in schema but might not be in DB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_ms365_tokens'
    AND column_name = 'account_id'
  ) THEN
    ALTER TABLE user_ms365_tokens
    ADD COLUMN account_id TEXT;
  END IF;
END $$;

-- Ensure expires_at is nullable (it might have been created as NOT NULL)
DO $$
BEGIN
  ALTER TABLE user_ms365_tokens
  ALTER COLUMN expires_at DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Column might already be nullable or not exist, ignore error
    NULL;
END $$;
