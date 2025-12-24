-- Migration: 018_price_scraper_and_sessions.sql
-- Description: Add price scraping job tracking and persistent session storage
-- Fixes:
--   1. 500 error when running Home Depot scraper (price_scrape_jobs table missing)
--   2. 401 errors when sessions aren't persisted (sessions table missing)

-- ============================================
-- SESSIONS TABLE (for persistent session storage)
-- ============================================
-- Required by SupabaseSessionStore for production session persistence.
-- Without this table, sessions fall back to in-memory storage and are lost
-- on server restart, causing 401 Unauthorized errors.

CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);

-- ============================================
-- PRICE SCRAPE JOBS TABLE
-- ============================================
-- Tracks web scraping jobs for fetching material prices from retailers
-- like Home Depot. Required by the homeDepot scraper to record job status.

CREATE TABLE IF NOT EXISTS price_scrape_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(100) NOT NULL, -- 'home_depot', 'lowes', 'menards'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    items_processed INT DEFAULT 0,
    items_updated INT DEFAULT 0,
    errors JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_scrape_jobs_status ON price_scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_price_scrape_jobs_source ON price_scrape_jobs(source);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
-- Tracks historical prices for materials by region, enabling price trend
-- analysis and auditing of price changes over time.

CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    region_id VARCHAR(20) REFERENCES regions(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    source VARCHAR(100),
    captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_material ON price_history(material_id);
CREATE INDEX IF NOT EXISTS idx_price_history_region ON price_history(region_id);
CREATE INDEX IF NOT EXISTS idx_price_history_captured ON price_history(captured_at);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (if using Supabase RLS)
-- ============================================

-- Sessions table should be accessible by the service role only
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access to sessions
DROP POLICY IF EXISTS "Service role full access to sessions" ON sessions;
CREATE POLICY "Service role full access to sessions" ON sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Price scrape jobs - allow authenticated users to view
ALTER TABLE price_scrape_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to view price_scrape_jobs" ON price_scrape_jobs;
CREATE POLICY "Allow authenticated to view price_scrape_jobs" ON price_scrape_jobs
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Service role full access to price_scrape_jobs" ON price_scrape_jobs;
CREATE POLICY "Service role full access to price_scrape_jobs" ON price_scrape_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Price history - allow authenticated users to view
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to view price_history" ON price_history;
CREATE POLICY "Allow authenticated to view price_history" ON price_history
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Service role full access to price_history" ON price_history;
CREATE POLICY "Service role full access to price_history" ON price_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
