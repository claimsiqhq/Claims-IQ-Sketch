-- Estimate Support Tables
-- These tables support the estimate calculation and storage system

-- ============================================
-- ESTIMATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id VARCHAR(100),
    claim_number VARCHAR(50),
    property_address TEXT,

    -- Status tracking
    status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'submitted', 'revised')),
    version INTEGER DEFAULT 1,

    -- Totals
    subtotal DECIMAL(12,2) DEFAULT 0,
    overhead_amount DECIMAL(12,2) DEFAULT 0,
    overhead_pct DECIMAL(5,2) DEFAULT 10.00,
    profit_amount DECIMAL(12,2) DEFAULT 0,
    profit_pct DECIMAL(5,2) DEFAULT 10.00,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    tax_pct DECIMAL(6,4) DEFAULT 0,
    grand_total DECIMAL(12,2) DEFAULT 0,

    -- Regional and carrier info
    region_id VARCHAR(30) DEFAULT 'US-NATIONAL',
    carrier_profile_id UUID,

    -- Metadata
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    submitted_at TIMESTAMP,

    CONSTRAINT fk_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_estimates_claim_id ON estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON estimates(created_at DESC);

-- ============================================
-- ESTIMATE LINE ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL,

    -- Line item reference
    line_item_id UUID,
    line_item_code VARCHAR(50) NOT NULL,
    line_item_description TEXT NOT NULL,
    category_id VARCHAR(20),

    -- Quantities
    quantity DECIMAL(12,4) NOT NULL,
    unit VARCHAR(10) NOT NULL,

    -- Pricing
    unit_price DECIMAL(12,4) NOT NULL,
    material_cost DECIMAL(12,2) DEFAULT 0,
    labor_cost DECIMAL(12,2) DEFAULT 0,
    equipment_cost DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,

    -- Source info
    source VARCHAR(30) DEFAULT 'manual' CHECK (source IN ('manual', 'ai_suggested', 'template', 'imported')),

    -- Damage zone reference
    damage_zone_id UUID,
    room_name VARCHAR(100),

    -- Notes and metadata
    notes TEXT,
    is_approved BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_estimate FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_category ON estimate_line_items(category_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_code ON estimate_line_items(line_item_code);

-- ============================================
-- ESTIMATE DOCUMENTS TABLE (for attachments)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL,
    document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('photo', 'sketch', 'pdf', 'moisture_report', 'scope', 'other')),
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    description TEXT,
    uploaded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_estimate_doc FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_estimate_docs_estimate_id ON estimate_documents(estimate_id);

-- ============================================
-- ESTIMATE HISTORY TABLE (audit trail)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_estimate_history FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_estimate_history_estimate_id ON estimate_history(estimate_id);

-- ============================================
-- DAMAGE ZONES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS damage_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    room_type VARCHAR(50),
    floor_level VARCHAR(20),

    -- Dimensions
    length_ft DECIMAL(8,2),
    width_ft DECIMAL(8,2),
    height_ft DECIMAL(8,2) DEFAULT 8.0,
    square_footage DECIMAL(10,2),

    -- Damage info
    damage_type VARCHAR(50),
    damage_severity VARCHAR(20) CHECK (damage_severity IN ('minor', 'moderate', 'severe', 'total_loss')),
    water_category INTEGER CHECK (water_category IN (1, 2, 3)),
    water_class INTEGER CHECK (water_class IN (1, 2, 3, 4)),

    -- Affected surfaces
    affected_surfaces JSONB DEFAULT '[]'::jsonb,

    -- Notes
    notes TEXT,
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_zone_estimate FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_damage_zones_estimate_id ON damage_zones(estimate_id);

-- ============================================
-- ESTIMATE TEMPLATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    damage_type VARCHAR(50) NOT NULL,

    -- Template line items stored as JSON
    template_items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,

    -- Ownership
    is_public BOOLEAN DEFAULT false,
    created_by VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_damage_type ON estimate_templates(damage_type);

-- ============================================
-- INSERT DEFAULT CARRIER PROFILES (if not exist)
-- ============================================

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Default Profile', 'DEFAULT', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'DEFAULT');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'State Farm', 'STATEFARM', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'STATEFARM');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Allstate', 'ALLSTATE', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'ALLSTATE');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'USAA', 'USAA', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'USAA');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Farmers Insurance', 'FARMERS', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'FARMERS');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Liberty Mutual', 'LIBERTY', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'LIBERTY');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Progressive', 'PROGRESSIVE', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'PROGRESSIVE');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos)
SELECT gen_random_uuid(), 'Travelers', 'TRAVELERS', 10.00, 10.00, false, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'TRAVELERS');

-- ============================================
-- INSERT SOME ESTIMATE TEMPLATES
-- ============================================

INSERT INTO estimate_templates (name, description, damage_type, template_items, is_public) VALUES
('Water Damage - Category 1 Small', 'Basic water damage from clean source (broken supply line)', 'water',
 '[
   {"code": "WTR-EXTRACT-PORT", "description": "Water extraction - portable extractor", "unit": "SF"},
   {"code": "WTR-DRY-SETUP", "description": "Drying equipment setup/takedown", "unit": "EA"},
   {"code": "WTR-DRY-DEHU", "description": "Dehumidifier - LGR per day", "unit": "DAY"},
   {"code": "WTR-DRY-AIRMOV", "description": "Air mover per day", "unit": "DAY"},
   {"code": "WTR-MOIST-INIT", "description": "Initial moisture inspection/mapping", "unit": "SF"},
   {"code": "WTR-MOIST-DAILY", "description": "Daily moisture monitoring", "unit": "DAY"},
   {"code": "DEM-BASE", "description": "Baseboard removal", "unit": "LF"},
   {"code": "DEM-DRY-FLOOD", "description": "Drywall removal - flood cut 2ft", "unit": "LF"}
 ]'::jsonb, true),

('Water Damage - Category 2 Medium', 'Gray water damage requiring antimicrobial treatment', 'water',
 '[
   {"code": "WTR-EXTRACT-PORT", "description": "Water extraction - portable extractor", "unit": "SF"},
   {"code": "WTR-DRY-SETUP", "description": "Drying equipment setup/takedown", "unit": "EA"},
   {"code": "WTR-DRY-DEHU", "description": "Dehumidifier - LGR per day", "unit": "DAY"},
   {"code": "WTR-DRY-AIRMOV", "description": "Air mover per day", "unit": "DAY"},
   {"code": "WTR-MOIST-INIT", "description": "Initial moisture inspection/mapping", "unit": "SF"},
   {"code": "WTR-MOIST-DAILY", "description": "Daily moisture monitoring", "unit": "DAY"},
   {"code": "WTR-ANTIMICROB", "description": "Antimicrobial treatment - surfaces", "unit": "SF"},
   {"code": "DEM-BASE", "description": "Baseboard removal", "unit": "LF"},
   {"code": "DEM-DRY-FLOOD-4", "description": "Drywall removal - flood cut 4ft", "unit": "LF"},
   {"code": "DEM-INSUL", "description": "Insulation removal - wet/contaminated", "unit": "SF"},
   {"code": "DRY-HTT-12", "description": "Drywall 1/2\" hang, tape, texture - walls", "unit": "SF"},
   {"code": "INSUL-BATT-R13", "description": "Batt insulation R-13 - walls", "unit": "SF"},
   {"code": "TRIM-BASE", "description": "Baseboard 3-1/4\" MDF - install", "unit": "LF"},
   {"code": "PAINT-INT-WALL", "description": "Interior wall paint - 2 coats", "unit": "SF"}
 ]'::jsonb, true),

('Fire/Smoke Damage - Small', 'Small fire damage with smoke cleanup', 'fire',
 '[
   {"code": "FIRE-ASSESS", "description": "Fire/smoke damage assessment", "unit": "HR"},
   {"code": "FIRE-SOOT-DRY", "description": "Dry soot removal - surfaces", "unit": "SF"},
   {"code": "FIRE-ODOR-FOG", "description": "Thermal fogging - odor treatment", "unit": "SF"},
   {"code": "FIRE-ODOR-SEAL", "description": "Odor sealing primer application", "unit": "SF"},
   {"code": "PAINT-INT-WALL", "description": "Interior wall paint - 2 coats", "unit": "SF"},
   {"code": "PAINT-INT-CEIL", "description": "Ceiling paint - 2 coats", "unit": "SF"}
 ]'::jsonb, true),

('Roof Damage - Shingles', 'Standard shingle roof replacement', 'wind',
 '[
   {"code": "ROOF-SHNG-ARCH", "description": "Roofing - Architectural shingles - remove & replace", "unit": "SQ"},
   {"code": "ROOF-FELT-SYN", "description": "Synthetic underlayment", "unit": "SQ"},
   {"code": "ROOF-FLASH-STEP", "description": "Step flashing installation", "unit": "LF"},
   {"code": "ROOF-VENT-RIDGE", "description": "Ridge vent installation", "unit": "LF"},
   {"code": "ROOF-DRIP-EDGE", "description": "Drip edge installation", "unit": "LF"},
   {"code": "ROOF-GUTTER", "description": "Aluminum gutter 5\" - install", "unit": "LF"},
   {"code": "ROOF-DOWNSPOUT", "description": "Downspout 2x3\" - install", "unit": "LF"}
 ]'::jsonb, true),

('Kitchen Water Damage', 'Water damage to kitchen with cabinet replacement', 'water',
 '[
   {"code": "WTR-EXTRACT-PORT", "description": "Water extraction - portable extractor", "unit": "SF"},
   {"code": "WTR-DRY-SETUP", "description": "Drying equipment setup/takedown", "unit": "EA"},
   {"code": "WTR-DRY-DEHU", "description": "Dehumidifier - LGR per day", "unit": "DAY"},
   {"code": "WTR-DRY-AIRMOV", "description": "Air mover per day", "unit": "DAY"},
   {"code": "DEM-CABINET", "description": "Cabinet removal - base", "unit": "LF"},
   {"code": "DEM-FLOOR-VNL", "description": "Vinyl/LVP flooring removal", "unit": "SF"},
   {"code": "DEM-DRY-FLOOD", "description": "Drywall removal - flood cut 2ft", "unit": "LF"},
   {"code": "WTR-ANTIMICROB", "description": "Antimicrobial treatment - surfaces", "unit": "SF"},
   {"code": "DRY-HTT-12", "description": "Drywall 1/2\" hang, tape, texture - walls", "unit": "SF"},
   {"code": "FLR-LAM-STD", "description": "Laminate flooring standard - remove & replace", "unit": "SF"},
   {"code": "TRIM-BASE", "description": "Baseboard 3-1/4\" MDF - install", "unit": "LF"},
   {"code": "PAINT-INT-WALL", "description": "Interior wall paint - 2 coats", "unit": "SF"}
 ]'::jsonb, true)

ON CONFLICT DO NOTHING;

-- ============================================
-- CREATE VIEW FOR ESTIMATE SUMMARY
-- ============================================

CREATE OR REPLACE VIEW estimate_summary AS
SELECT
    e.id,
    e.claim_number,
    e.property_address,
    e.status,
    e.version,
    e.subtotal,
    e.overhead_amount,
    e.profit_amount,
    e.tax_amount,
    e.grand_total,
    e.region_id,
    r.name as region_name,
    cp.name as carrier_name,
    e.created_at,
    e.updated_at,
    e.submitted_at,
    COUNT(eli.id) as line_item_count,
    COUNT(DISTINCT eli.category_id) as category_count,
    COUNT(ed.id) as document_count
FROM estimates e
LEFT JOIN regions r ON e.region_id = r.id
LEFT JOIN carrier_profiles cp ON e.carrier_profile_id = cp.id
LEFT JOIN estimate_line_items eli ON e.id = eli.estimate_id
LEFT JOIN estimate_documents ed ON e.id = ed.estimate_id
GROUP BY e.id, r.name, cp.name;

-- ============================================
-- CREATE FUNCTION TO UPDATE ESTIMATE TOTALS
-- ============================================

CREATE OR REPLACE FUNCTION update_estimate_totals(p_estimate_id UUID)
RETURNS void AS $$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_overhead_pct DECIMAL(5,2);
    v_profit_pct DECIMAL(5,2);
    v_tax_pct DECIMAL(6,4);
    v_overhead DECIMAL(12,2);
    v_profit DECIMAL(12,2);
    v_tax DECIMAL(12,2);
BEGIN
    -- Calculate subtotal from line items
    SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
    FROM estimate_line_items
    WHERE estimate_id = p_estimate_id AND is_approved = true;

    -- Get O&P percentages
    SELECT overhead_pct, profit_pct, tax_pct
    INTO v_overhead_pct, v_profit_pct, v_tax_pct
    FROM estimates WHERE id = p_estimate_id;

    -- Calculate O&P and tax
    v_overhead := v_subtotal * (v_overhead_pct / 100);
    v_profit := v_subtotal * (v_profit_pct / 100);
    v_tax := v_subtotal * (v_tax_pct / 100);

    -- Update estimate
    UPDATE estimates SET
        subtotal = v_subtotal,
        overhead_amount = v_overhead,
        profit_amount = v_profit,
        tax_amount = v_tax,
        grand_total = v_subtotal + v_overhead + v_profit + v_tax,
        updated_at = NOW()
    WHERE id = p_estimate_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE TRIGGER FOR AUTO-UPDATE TOTALS
-- ============================================

CREATE OR REPLACE FUNCTION trigger_update_estimate_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_estimate_totals(OLD.estimate_id);
        RETURN OLD;
    ELSE
        PERFORM update_estimate_totals(NEW.estimate_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimate_line_items_update_totals ON estimate_line_items;

CREATE TRIGGER estimate_line_items_update_totals
AFTER INSERT OR UPDATE OR DELETE ON estimate_line_items
FOR EACH ROW
EXECUTE FUNCTION trigger_update_estimate_totals();
