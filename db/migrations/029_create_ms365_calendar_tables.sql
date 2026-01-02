-- Migration: Create MS365 Calendar Integration Tables
-- Purpose: Store user OAuth tokens and inspection appointments synced with MS365 Calendar

-- ============================================
-- user_ms365_tokens table
-- Stores OAuth tokens for MS365 Graph API access
-- ============================================
CREATE TABLE IF NOT EXISTS user_ms365_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- OAuth tokens (encrypted at rest by Supabase)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  account_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS user_ms365_tokens_user_idx ON user_ms365_tokens(user_id);

-- ============================================
-- inspection_appointments table
-- Stores scheduled inspections synced with MS365 Calendar
-- ============================================
CREATE TABLE IF NOT EXISTS inspection_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  adjuster_id UUID NOT NULL,
  
  -- MS365 sync
  ms365_event_id TEXT,
  synced_at TIMESTAMP WITH TIME ZONE,
  
  -- Appointment details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Scheduling
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  
  -- Status tracking
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  appointment_type VARCHAR(50) NOT NULL DEFAULT 'initial_inspection',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS inspection_appointments_claim_idx ON inspection_appointments(claim_id);
CREATE INDEX IF NOT EXISTS inspection_appointments_org_idx ON inspection_appointments(organization_id);
CREATE INDEX IF NOT EXISTS inspection_appointments_adjuster_idx ON inspection_appointments(adjuster_id);
CREATE INDEX IF NOT EXISTS inspection_appointments_status_idx ON inspection_appointments(status);
CREATE INDEX IF NOT EXISTS inspection_appointments_scheduled_idx ON inspection_appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS inspection_appointments_ms365_idx ON inspection_appointments(ms365_event_id);

-- Composite index for "today's route" query
CREATE INDEX IF NOT EXISTS inspection_appointments_adjuster_date_idx 
  ON inspection_appointments(adjuster_id, scheduled_start);
