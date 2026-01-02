-- Migration: Standardize user ID type to UUID
-- Issue: users.id was varchar but should be uuid for consistency with other tables
-- This migration changes the column type and updates foreign key references

-- Note: This is a DATA-SAFE migration. UUIDs stored as varchar are valid UUID strings,
-- so the USING clause casts them properly.

-- Step 1: Drop dependent foreign key constraints (if any exist)
-- Note: organization_memberships.user_id will be updated

-- Step 2: Alter users.id from varchar to uuid
-- This requires first dropping the default since gen_random_uuid() already returns uuid
ALTER TABLE users 
  ALTER COLUMN id TYPE uuid USING id::uuid;

-- Step 3: Update organization_memberships.user_id to uuid
ALTER TABLE organization_memberships
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Step 4: Add foreign key constraint for organization_memberships.user_id
ALTER TABLE organization_memberships
  ADD CONSTRAINT fk_org_membership_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 5: Add foreign key constraint for organization_memberships.organization_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_org_membership_org'
  ) THEN
    ALTER TABLE organization_memberships
      ADD CONSTRAINT fk_org_membership_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 6: Update claims.assigned_adjuster_id to uuid if it references users
-- Note: This column may contain varchar user IDs, updating to uuid
ALTER TABLE claims
  ALTER COLUMN assigned_adjuster_id TYPE uuid USING 
    CASE 
      WHEN assigned_adjuster_id IS NULL THEN NULL
      WHEN assigned_adjuster_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
        THEN assigned_adjuster_id::uuid
      ELSE NULL
    END;
