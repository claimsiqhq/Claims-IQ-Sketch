-- Migration: Create claim_photos table for photo upload and AI analysis
-- Purpose: Store photos captured during inspections with AI analysis metadata

-- Create the claim_photos table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.claim_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    structure_id UUID,
    room_id UUID,
    damage_zone_id UUID,

    -- Storage info
    storage_path VARCHAR(500) NOT NULL,
    public_url VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER,

    -- Photo metadata
    label VARCHAR(255),
    hierarchy_path VARCHAR(500),
    description TEXT,

    -- GPS coordinates
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geo_address VARCHAR(500),

    -- AI Analysis results
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    quality_score INTEGER,
    damage_detected BOOLEAN DEFAULT false,

    -- Analysis status
    analysis_status VARCHAR(30) DEFAULT 'pending',
    analysis_error TEXT,

    -- Timestamps
    captured_at TIMESTAMP DEFAULT NOW(),
    analyzed_at TIMESTAMP,
    uploaded_by VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS claim_photos_claim_idx ON public.claim_photos(claim_id);
CREATE INDEX IF NOT EXISTS claim_photos_org_idx ON public.claim_photos(organization_id);
CREATE INDEX IF NOT EXISTS claim_photos_structure_idx ON public.claim_photos(structure_id);
CREATE INDEX IF NOT EXISTS claim_photos_room_idx ON public.claim_photos(room_id);
CREATE INDEX IF NOT EXISTS claim_photos_damage_idx ON public.claim_photos(damage_zone_id);
CREATE INDEX IF NOT EXISTS claim_photos_status_idx ON public.claim_photos(analysis_status);
CREATE INDEX IF NOT EXISTS claim_photos_created_idx ON public.claim_photos(created_at DESC);

-- Add RLS policies for organization-based access
ALTER TABLE public.claim_photos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "claim_photos_org_select" ON public.claim_photos;
DROP POLICY IF EXISTS "claim_photos_org_insert" ON public.claim_photos;
DROP POLICY IF EXISTS "claim_photos_org_update" ON public.claim_photos;
DROP POLICY IF EXISTS "claim_photos_org_delete" ON public.claim_photos;

-- Policy: Users can only see photos from their organization
CREATE POLICY "claim_photos_org_select" ON public.claim_photos
    FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
    ));

-- Policy: Users can only insert photos for their organization
CREATE POLICY "claim_photos_org_insert" ON public.claim_photos
    FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
    ));

-- Policy: Users can only update photos from their organization
CREATE POLICY "claim_photos_org_update" ON public.claim_photos
    FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
    ));

-- Policy: Users can only delete photos from their organization
CREATE POLICY "claim_photos_org_delete" ON public.claim_photos
    FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_memberships
        WHERE user_id = auth.uid()
    ));

-- Add comment
COMMENT ON TABLE public.claim_photos IS 'Photos captured during claim inspections with AI analysis for damage detection and quality scoring';
