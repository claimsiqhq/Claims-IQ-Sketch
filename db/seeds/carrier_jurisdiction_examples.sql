-- ============================================
-- Seed Data: Example Carrier & Jurisdiction Rules
-- Claims IQ Sketch - Illustrative Examples
-- ============================================
--
-- DISCLAIMER: These are ILLUSTRATIVE examples only.
-- They do not represent any real insurance carrier policies.
-- Names are fictional to avoid any confusion.
--
-- Examples include:
-- 1. "National Standard Insurance" - Strict national carrier
-- 2. "Regional Preferred Mutual" - Lenient regional carrier
-- 3. Texas - Jurisdiction with labor tax
-- 4. Florida - Jurisdiction without labor tax
-- ============================================

-- ============================================
-- EXAMPLE CARRIER 1: National Standard Insurance
-- A strict national carrier with extensive rules
-- ============================================

INSERT INTO carrier_profiles (
  code,
  name,
  display_name,
  carrier_type,
  strictness_level,
  op_threshold,
  op_trade_minimum,
  op_pct_overhead,
  op_pct_profit,
  tax_on_materials_only,
  tax_on_labor,
  tax_on_equipment,
  depreciation_method,
  max_depreciation_pct,
  default_depreciation_recoverable,
  requires_photos_all_rooms,
  requires_moisture_readings,
  requires_itemized_invoice,
  rule_config,
  is_active
) VALUES (
  'NATL-STD',
  'National Standard Insurance',
  'National Standard',
  'national',
  'strict',
  5000.00,  -- Higher O&P threshold
  3,
  10.00,
  10.00,
  false,
  true,
  false,
  'straight_line',
  75.00,  -- Lower max depreciation
  true,
  true,   -- Photos required for all rooms
  true,   -- Moisture readings required
  true,
  '{"requiresPreApprovalAbove": 25000, "defaultJustificationRequired": true}'::jsonb,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  strictness_level = EXCLUDED.strictness_level,
  op_threshold = EXCLUDED.op_threshold,
  requires_photos_all_rooms = EXCLUDED.requires_photos_all_rooms,
  requires_moisture_readings = EXCLUDED.requires_moisture_readings,
  rule_config = EXCLUDED.rule_config,
  updated_at = NOW();

-- Get the carrier ID for rules
DO $$
DECLARE
  v_carrier_id UUID;
BEGIN
  SELECT id INTO v_carrier_id FROM carrier_profiles WHERE code = 'NATL-STD';

  -- Exclusion: No mold remediation without pre-approval
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'NATL-MOLD-PREAPPROVAL',
    'Mold Remediation Pre-Approval Required',
    'exclusion',
    'category',
    'MOLD',
    '{}'::jsonb,
    'exclude',
    '{"reason": "Mold remediation requires pre-approval from carrier adjustor"}'::jsonb,
    'Mold remediation line items require written pre-approval from the carrier adjustor before inclusion in the estimate. Contact your carrier representative.',
    'Policy Section 4.2.3',
    10,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Cap: Water mitigation equipment limited to 5 days
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'NATL-WTR-EQUIP-CAP',
    'Water Equipment Duration Cap',
    'cap',
    'category',
    'WTR-DRY',
    '{"damageType": ["water"]}'::jsonb,
    'cap_quantity',
    '{"maxQuantity": 5, "reason": "Standard drying period per carrier guidelines"}'::jsonb,
    'Water drying equipment limited to 5 days per carrier guidelines. Additional days require moisture documentation showing continued elevated readings.',
    'Mitigation Guidelines 2.1',
    20,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Documentation: Photos required for all high-value items
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'NATL-DOC-HIGHVALUE',
    'High Value Item Documentation',
    'documentation',
    'estimate',
    NULL,
    '{"claimTotalMin": 10000}'::jsonb,
    'require_doc',
    '{"required": ["photo_before", "photo_after", "itemized_invoice"], "justificationMinLength": 100}'::jsonb,
    'Claims over $10,000 require before/after photos and itemized invoices for all affected areas.',
    'Documentation Standards 3.1',
    30,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    conditions = EXCLUDED.conditions,
    effect_value = EXCLUDED.effect_value;

  -- Price modification: Contractor rates capped at regional average
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'NATL-RATE-CAP',
    'Regional Rate Cap',
    'modification',
    'trade',
    'GEN',
    '{}'::jsonb,
    'modify_pct',
    '{"multiplier": 0.95, "reason": "Adjusted to regional average rate"}'::jsonb,
    'Labor rates adjusted to regional average per carrier pricing guidelines.',
    'Pricing Guidelines 1.4',
    40,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value;

  -- Quick lookup: Excluded items
  INSERT INTO carrier_excluded_items (
    carrier_profile_id,
    line_item_code,
    exclusion_reason,
    carrier_reference,
    is_active
  ) VALUES
    (v_carrier_id, 'TEMP-FENCE', 'Temporary fencing not covered under standard policy', 'Policy Exclusion A.4'),
    (v_carrier_id, 'TREE-REMOVAL-LG', 'Large tree removal requires separate approval', 'Policy Section 5.1'),
    (v_carrier_id, 'POOL-DRAIN', 'Pool-related items excluded from dwelling coverage', 'Policy Exclusion B.2')
  ON CONFLICT (carrier_profile_id, line_item_code) DO UPDATE SET
    exclusion_reason = EXCLUDED.exclusion_reason;

  -- Quick lookup: Item caps
  INSERT INTO carrier_item_caps (
    carrier_profile_id,
    line_item_code,
    category_id,
    max_quantity,
    max_quantity_per_zone,
    max_unit_price,
    cap_reason,
    carrier_reference,
    is_active
  ) VALUES
    (v_carrier_id, 'WTR-DRY-DEHU', NULL, 30, 10, 75.00, 'Dehumidifier rental capped per carrier schedule', 'Rate Schedule W-1'),
    (v_carrier_id, 'WTR-DRY-AIRMOV', NULL, 50, 15, 35.00, 'Air mover rental capped per carrier schedule', 'Rate Schedule W-2'),
    (v_carrier_id, NULL, 'PAINT', NULL, NULL, 5.00, 'Paint labor rate maximum', 'Rate Schedule P-1')
  ON CONFLICT DO NOTHING;

END $$;

-- ============================================
-- EXAMPLE CARRIER 2: Regional Preferred Mutual
-- A lenient regional carrier with minimal restrictions
-- ============================================

INSERT INTO carrier_profiles (
  code,
  name,
  display_name,
  carrier_type,
  strictness_level,
  op_threshold,
  op_trade_minimum,
  op_pct_overhead,
  op_pct_profit,
  tax_on_materials_only,
  tax_on_labor,
  tax_on_equipment,
  depreciation_method,
  max_depreciation_pct,
  default_depreciation_recoverable,
  requires_photos_all_rooms,
  requires_moisture_readings,
  requires_itemized_invoice,
  rule_config,
  is_active
) VALUES (
  'REG-PREF',
  'Regional Preferred Mutual',
  'Regional Preferred',
  'regional',
  'lenient',
  2500.00,  -- Lower O&P threshold
  2,        -- Only 2 trades needed for O&P
  10.00,
  10.00,
  false,
  true,
  false,
  'straight_line',
  85.00,    -- Higher max depreciation allowed
  true,
  false,    -- Photos not required for all rooms
  false,    -- Moisture readings not required
  true,
  '{"requiresPreApprovalAbove": 50000, "defaultJustificationRequired": false}'::jsonb,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  strictness_level = EXCLUDED.strictness_level,
  op_threshold = EXCLUDED.op_threshold,
  op_trade_minimum = EXCLUDED.op_trade_minimum,
  requires_photos_all_rooms = EXCLUDED.requires_photos_all_rooms,
  requires_moisture_readings = EXCLUDED.requires_moisture_readings,
  rule_config = EXCLUDED.rule_config,
  updated_at = NOW();

DO $$
DECLARE
  v_carrier_id UUID;
BEGIN
  SELECT id INTO v_carrier_id FROM carrier_profiles WHERE code = 'REG-PREF';

  -- Documentation: Only for water Category 3
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'REG-CAT3-DOC',
    'Category 3 Water Documentation',
    'documentation',
    'estimate',
    NULL,
    '{"waterCategory": [3]}'::jsonb,
    'require_doc',
    '{"required": ["moisture_reading", "photo"], "justificationMinLength": 50}'::jsonb,
    'Category 3 water damage requires moisture readings and photos for affected areas.',
    'Water Claims Guide 2.3',
    10,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    conditions = EXCLUDED.conditions,
    effect_value = EXCLUDED.effect_value;

  -- Warning: Large claims get flagged for review
  INSERT INTO carrier_rules (
    carrier_profile_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    carrier_reference,
    priority,
    is_active
  ) VALUES (
    v_carrier_id,
    'REG-LARGE-CLAIM',
    'Large Claim Review',
    'modification',
    'estimate',
    NULL,
    '{"claimTotalMin": 25000}'::jsonb,
    'warn',
    '{"message": "Claims over $25,000 may be subject to desk review"}'::jsonb,
    'This estimate may be subject to additional desk review due to claim size.',
    'Claims Processing 4.1',
    20,
    true
  ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
    conditions = EXCLUDED.conditions,
    effect_value = EXCLUDED.effect_value;

END $$;

-- ============================================
-- EXAMPLE JURISDICTION 1: Texas (US-TX)
-- Labor IS taxable
-- ============================================

INSERT INTO jurisdictions (
  code,
  name,
  state_code,
  country_code,
  sales_tax_rate,
  labor_taxable,
  materials_taxable,
  equipment_taxable,
  op_allowed,
  op_threshold_override,
  op_trade_minimum_override,
  op_max_pct,
  licensed_trades_only,
  licensed_trades,
  labor_rate_maximum,
  minimum_charge,
  service_call_minimum,
  regulatory_constraints,
  is_active
) VALUES (
  'US-TX',
  'Texas',
  'TX',
  'US',
  0.0625,   -- 6.25% state sales tax
  true,     -- Labor IS taxable in Texas (on new construction, repairs vary)
  true,
  false,
  true,
  NULL,     -- Use carrier default
  NULL,
  20.00,
  true,     -- Licensed trades required
  '["electrical", "plumbing", "hvac"]'::jsonb,
  '{"electrical": 85.00, "plumbing": 80.00, "general": 65.00}'::jsonb,
  150.00,   -- $150 minimum charge
  75.00,    -- $75 service call minimum
  '{"asbestosTestingRequiredPre1980": true, "leadTestingRequiredPre1978": true, "permitRequired": true}'::jsonb,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sales_tax_rate = EXCLUDED.sales_tax_rate,
  labor_taxable = EXCLUDED.labor_taxable,
  licensed_trades = EXCLUDED.licensed_trades,
  labor_rate_maximum = EXCLUDED.labor_rate_maximum,
  regulatory_constraints = EXCLUDED.regulatory_constraints,
  updated_at = NOW();

DO $$
DECLARE
  v_jurisdiction_id UUID;
BEGIN
  SELECT id INTO v_jurisdiction_id FROM jurisdictions WHERE code = 'US-TX';

  -- Rule: Labor tax application
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'TX-LABOR-TAX',
    'Texas Labor Tax',
    'tax',
    'tax',
    'labor',
    '{}'::jsonb,
    'modify_pct',
    '{"taxRate": 0.0625, "appliesTo": "labor"}'::jsonb,
    'Texas sales tax of 6.25% applies to labor on repair work.',
    'Texas Tax Code §151.0101',
    10,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Rule: Licensed electrician required
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'TX-ELEC-LICENSE',
    'Licensed Electrician Required',
    'labor',
    'trade',
    'ELEC',
    '{}'::jsonb,
    'require_doc',
    '{"required": ["contractor_license", "permit"]}'::jsonb,
    'Electrical work in Texas requires a licensed electrician and permit.',
    'Texas Occupations Code §1305',
    20,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Rule: Pre-1980 asbestos testing
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'TX-ASBESTOS',
    'Pre-1980 Asbestos Testing',
    'regulatory',
    'estimate',
    NULL,
    '{}'::jsonb,
    'warn',
    '{"message": "Properties built before 1980 may require asbestos testing before demolition"}'::jsonb,
    'Properties constructed before 1980 may contain asbestos-containing materials. Testing may be required before demolition work.',
    'TCEQ 30 TAC Chapter 295',
    30,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

END $$;

-- ============================================
-- EXAMPLE JURISDICTION 2: Florida (US-FL)
-- Labor is NOT taxable
-- ============================================

INSERT INTO jurisdictions (
  code,
  name,
  state_code,
  country_code,
  sales_tax_rate,
  labor_taxable,
  materials_taxable,
  equipment_taxable,
  op_allowed,
  op_threshold_override,
  op_trade_minimum_override,
  op_max_pct,
  licensed_trades_only,
  licensed_trades,
  labor_rate_maximum,
  minimum_charge,
  service_call_minimum,
  regulatory_constraints,
  is_active
) VALUES (
  'US-FL',
  'Florida',
  'FL',
  'US',
  0.0600,   -- 6% state sales tax
  false,    -- Labor is NOT taxable in Florida for repairs
  true,
  false,
  true,
  3000.00,  -- Florida O&P threshold override
  3,
  20.00,
  true,
  '["electrical", "plumbing", "roofing", "general_contractor"]'::jsonb,
  '{"electrical": 90.00, "plumbing": 85.00, "roofing": 75.00, "general": 70.00}'::jsonb,
  NULL,     -- No minimum charge
  NULL,
  '{"hurricaneCodeCompliance": true, "permitRequired": true, "roofInspectionRequired": true}'::jsonb,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sales_tax_rate = EXCLUDED.sales_tax_rate,
  labor_taxable = EXCLUDED.labor_taxable,
  op_threshold_override = EXCLUDED.op_threshold_override,
  licensed_trades = EXCLUDED.licensed_trades,
  regulatory_constraints = EXCLUDED.regulatory_constraints,
  updated_at = NOW();

DO $$
DECLARE
  v_jurisdiction_id UUID;
BEGIN
  SELECT id INTO v_jurisdiction_id FROM jurisdictions WHERE code = 'US-FL';

  -- Rule: No labor tax
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'FL-NO-LABOR-TAX',
    'Florida No Labor Tax',
    'tax',
    'tax',
    'labor',
    '{}'::jsonb,
    'modify_pct',
    '{"taxRate": 0, "appliesTo": "labor"}'::jsonb,
    'Florida does not apply sales tax to labor for repair services.',
    'Florida Statute §212.05',
    10,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Rule: Hurricane code compliance for roofing
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'FL-ROOF-CODE',
    'Hurricane Roofing Code Compliance',
    'regulatory',
    'category',
    'ROOF',
    '{}'::jsonb,
    'require_doc',
    '{"required": ["permit", "inspection", "code_compliance_cert"]}'::jsonb,
    'Roofing work in Florida must comply with Florida Building Code hurricane standards. Permit and inspection required.',
    'Florida Building Code Chapter 15',
    20,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Rule: Licensed roofing contractor
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'FL-ROOF-LICENSE',
    'Licensed Roofing Contractor Required',
    'labor',
    'trade',
    'ROOF',
    '{}'::jsonb,
    'require_doc',
    '{"required": ["contractor_license", "insurance_cert"]}'::jsonb,
    'Roofing work in Florida requires a state-licensed roofing contractor with proper insurance.',
    'Florida Statute §489.105',
    25,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

  -- Rule: O&P threshold
  INSERT INTO jurisdiction_rules (
    jurisdiction_id,
    rule_code,
    rule_name,
    rule_type,
    target_type,
    target_value,
    conditions,
    effect_type,
    effect_value,
    explanation_template,
    regulatory_reference,
    priority,
    is_active
  ) VALUES (
    v_jurisdiction_id,
    'FL-OP-THRESHOLD',
    'Florida O&P Threshold',
    'op',
    'estimate',
    NULL,
    '{}'::jsonb,
    'modify_pct',
    '{"opThreshold": 3000}'::jsonb,
    'Overhead and profit applies to claims exceeding $3,000 per Florida insurance regulations.',
    'Florida Insurance Code',
    30,
    true
  ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
    effect_value = EXCLUDED.effect_value,
    explanation_template = EXCLUDED.explanation_template;

END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Example carrier and jurisdiction data seeded successfully!';
  RAISE NOTICE 'Carriers: NATL-STD (strict), REG-PREF (lenient)';
  RAISE NOTICE 'Jurisdictions: US-TX (labor taxable), US-FL (labor not taxable)';
END $$;
