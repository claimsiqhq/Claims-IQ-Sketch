-- Migration: Add Calendar Event Cache Table
-- Purpose: Cache all MS365 calendar events locally for offline access and history

-- ============================================
-- calendar_event_cache table
-- Stores ALL calendar events from MS365, not just claim-linked ones
-- Provides offline access and historical calendar data
-- ============================================
CREATE TABLE IF NOT EXISTS calendar_event_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,

  -- MS365 event identification
  ms365_event_id TEXT NOT NULL,
  ms365_calendar_id TEXT,

  -- Event details (cached from MS365)
  subject TEXT NOT NULL,
  body_preview TEXT,
  location TEXT,

  -- Scheduling
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,

  -- Organizer and attendees (JSON for flexibility)
  organizer_email TEXT,
  organizer_name TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,

  -- Event metadata
  sensitivity VARCHAR(20) DEFAULT 'normal', -- normal, personal, private, confidential
  show_as VARCHAR(20) DEFAULT 'busy', -- free, tentative, busy, oof, workingElsewhere
  importance VARCHAR(20) DEFAULT 'normal', -- low, normal, high
  is_cancelled BOOLEAN DEFAULT FALSE,
  is_online_meeting BOOLEAN DEFAULT FALSE,
  online_meeting_url TEXT,

  -- Categories/tags from MS365
  categories JSONB DEFAULT '[]'::jsonb,

  -- Link to local appointment if exists
  local_appointment_id UUID REFERENCES inspection_appointments(id) ON DELETE SET NULL,

  -- Sync metadata
  last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ms365_last_modified TIMESTAMP WITH TIME ZONE,
  sync_etag TEXT, -- For detecting changes

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint on user + ms365 event
  CONSTRAINT calendar_event_cache_user_event_unique UNIQUE (user_id, ms365_event_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS calendar_event_cache_user_idx ON calendar_event_cache(user_id);
CREATE INDEX IF NOT EXISTS calendar_event_cache_org_idx ON calendar_event_cache(organization_id);
CREATE INDEX IF NOT EXISTS calendar_event_cache_ms365_idx ON calendar_event_cache(ms365_event_id);
CREATE INDEX IF NOT EXISTS calendar_event_cache_start_idx ON calendar_event_cache(start_datetime);

-- Composite index for "events in date range" query
CREATE INDEX IF NOT EXISTS calendar_event_cache_user_date_idx
  ON calendar_event_cache(user_id, start_datetime, end_datetime);

-- Index for finding events by local appointment
CREATE INDEX IF NOT EXISTS calendar_event_cache_local_apt_idx
  ON calendar_event_cache(local_appointment_id) WHERE local_appointment_id IS NOT NULL;

-- ============================================
-- Add sync tracking columns to user_ms365_tokens
-- ============================================
ALTER TABLE user_ms365_tokens
  ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
  ADD COLUMN IF NOT EXISTS sync_errors_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- Comment for documentation
COMMENT ON TABLE calendar_event_cache IS 'Caches all MS365 calendar events locally for offline access and historical data. Events are synced periodically and stored regardless of whether they link to claims.';
