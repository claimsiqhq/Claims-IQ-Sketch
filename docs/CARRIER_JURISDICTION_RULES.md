# Claims IQ - Carrier & Jurisdiction Rules Engine

## Overview

The Carrier & Jurisdiction Rules Engine is a **deterministic institutional logic layer** that constrains, modifies, and explains estimate behavior based on carrier policies and regional regulations.

**This is NOT AI.** Every rule is explicit, auditable, and explainable.

## Design Principles

1. **Data-Driven Rules** - No carrier names hardcoded into logic
2. **Additive Rules** - Rules build on each other, can be overridden
3. **Full Explainability** - Every modification is documented
4. **Deterministic Evaluation** - Same inputs always produce same outputs
5. **No Silent Overrides** - All changes are explicit and logged

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ESTIMATE INPUT                           │
│  • Line items with quantities, prices                       │
│  • Zone damage context                                      │
│  • Carrier profile ID                                       │
│  • Jurisdiction ID                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               RULES EVALUATION ENGINE                        │
│                                                             │
│  Phase 1: Carrier Exclusions (quick lookup)                 │
│     └─► Deny items on exclusion list                        │
│                                                             │
│  Phase 2: Carrier Caps (quick lookup)                       │
│     └─► Apply quantity/price caps                           │
│                                                             │
│  Phase 3: Carrier Rules (complex conditions)                │
│     └─► Evaluate conditional rules                          │
│                                                             │
│  Phase 4: Jurisdiction Rules                                │
│     └─► Apply regional constraints                          │
│                                                             │
│  Phase 5: Estimate-Level Effects                            │
│     └─► Tax, O&P, regulatory warnings                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EVALUATION RESULT                         │
│  • Line item statuses (allowed/modified/denied/warning)     │
│  • Original vs modified values                              │
│  • Documentation requirements                               │
│  • Audit log with explanations                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Carrier Profiles (`carrier_profiles`)

Configuration for each carrier:

| Field | Type | Description |
|-------|------|-------------|
| `code` | VARCHAR | Unique carrier identifier |
| `name` | VARCHAR | Display name |
| `carrier_type` | VARCHAR | national, regional, specialty |
| `strictness_level` | VARCHAR | lenient, standard, strict |
| `op_threshold` | DECIMAL | O&P eligibility threshold |
| `op_trade_minimum` | INTEGER | Minimum trades for O&P |
| `requires_photos_all_rooms` | BOOLEAN | Photo documentation requirement |
| `requires_moisture_readings` | BOOLEAN | Moisture documentation requirement |
| `rule_config` | JSONB | Additional carrier-specific settings |

### Carrier Rules (`carrier_rules`)

Individual rules per carrier:

| Field | Type | Description |
|-------|------|-------------|
| `rule_code` | VARCHAR | Unique rule identifier |
| `rule_type` | VARCHAR | exclusion, cap, documentation, combination, modification |
| `target_type` | VARCHAR | line_item, category, trade, estimate |
| `target_value` | VARCHAR | Specific code or null for broad rules |
| `conditions` | JSONB | When rule applies |
| `effect_type` | VARCHAR | exclude, cap_quantity, cap_cost, require_doc, warn, modify_pct |
| `effect_value` | JSONB | Rule effect parameters |
| `explanation_template` | TEXT | Human-readable explanation |
| `priority` | INTEGER | Lower = higher priority |

### Jurisdictions (`jurisdictions`)

Regional configuration:

| Field | Type | Description |
|-------|------|-------------|
| `code` | VARCHAR | e.g., US-TX, US-FL |
| `sales_tax_rate` | DECIMAL | State sales tax rate |
| `labor_taxable` | BOOLEAN | Whether labor is taxed |
| `op_threshold_override` | DECIMAL | Override carrier O&P threshold |
| `licensed_trades` | JSONB | Trades requiring license |
| `regulatory_constraints` | JSONB | Regulatory requirements |

### Rule Effects (`rule_effects`)

Audit trail for all rule applications:

| Field | Type | Description |
|-------|------|-------------|
| `estimate_id` | UUID | Affected estimate |
| `estimate_line_item_id` | UUID | Affected line item |
| `rule_source` | VARCHAR | carrier, jurisdiction, line_item_default |
| `rule_code` | VARCHAR | Which rule applied |
| `effect_type` | VARCHAR | Type of modification |
| `original_value` | JSONB | Value before modification |
| `modified_value` | JSONB | Value after modification |
| `explanation_text` | TEXT | Human-readable explanation |

## Rule Types

### Exclusions

Items completely denied by carrier policy:

```sql
INSERT INTO carrier_excluded_items (
  carrier_profile_id,
  line_item_code,
  exclusion_reason
) VALUES (
  'carrier-uuid',
  'MOLD-REMEDIATION',
  'Mold remediation requires pre-approval from carrier adjustor'
);
```

### Quantity Caps

Maximum quantities per carrier guidelines:

```sql
INSERT INTO carrier_item_caps (
  carrier_profile_id,
  line_item_code,
  max_quantity,
  cap_reason
) VALUES (
  'carrier-uuid',
  'WTR-DRY-DEHU',
  5,
  'Standard drying period per carrier guidelines'
);
```

### Price Caps

Maximum unit prices:

```sql
INSERT INTO carrier_item_caps (
  carrier_profile_id,
  category_id,
  max_unit_price,
  cap_reason
) VALUES (
  'carrier-uuid',
  'PAINT',
  2.50,
  'Paint labor rate maximum per carrier schedule'
);
```

### Documentation Requirements

Conditional documentation needs:

```sql
INSERT INTO carrier_rules (
  carrier_profile_id,
  rule_code,
  rule_name,
  rule_type,
  target_type,
  conditions,
  effect_type,
  effect_value,
  explanation_template
) VALUES (
  'carrier-uuid',
  'CAT3-DOC',
  'Category 3 Water Documentation',
  'documentation',
  'estimate',
  '{"waterCategory": [3]}',
  'require_doc',
  '{"required": ["moisture_reading", "photo", "antimicrobial_cert"]}',
  'Category 3 water damage requires moisture readings, photos, and antimicrobial certification'
);
```

## API Usage

### Evaluate Rules

```typescript
import { evaluateRules } from './server/services/rulesEngine';

const result = await evaluateRules({
  id: 'estimate-uuid',
  carrierProfileId: 'carrier-uuid',
  jurisdictionId: 'jurisdiction-uuid',
  claimTotal: 15000,
  lineItems: [
    {
      id: 'item-1',
      code: 'WTR-DRY-DEHU',
      description: 'Dehumidifier rental',
      quantity: 10,
      unitPrice: 75.00,
      unit: 'DAY',
    },
  ],
  zones: [
    {
      id: 'zone-1',
      name: 'Kitchen',
      zoneType: 'room',
      damageType: 'water',
      waterCategory: 2,
    },
  ],
});

// Result structure
{
  estimateId: 'estimate-uuid',
  evaluatedAt: Date,
  totalItems: 1,
  allowedItems: 0,
  modifiedItems: 1,
  deniedItems: 0,
  warningItems: 0,
  lineItemResults: [
    {
      lineItemCode: 'WTR-DRY-DEHU',
      status: 'modified',
      originalQuantity: 10,
      modifiedQuantity: 5,
      explanation: 'Item MODIFIED by carrier/jurisdiction rules.\n• [CARRIER] Quantity capped at 5 per carrier guidelines',
    }
  ],
  auditLog: [...],
}
```

### Validate with Rules

```typescript
import { validateEstimateWithRules } from './server/services/estimateValidator';

const result = await validateEstimateWithRules({
  id: 'estimate-uuid',
  carrierProfileId: 'carrier-uuid',
  jurisdictionId: 'jurisdiction-uuid',
  lineItems: [...],
  zones: [...],
});

// Extended result includes
{
  ...standardValidationResult,
  rulesResult: RulesEvaluationResult,
  carrierIssues: ValidationIssue[],
  jurisdictionIssues: ValidationIssue[],
  documentationIssues: ValidationIssue[],
}
```

## Example Rule Sets

### Strict National Carrier

- Higher O&P threshold ($5,000)
- Photos required for all rooms
- Moisture readings required
- Mold remediation requires pre-approval
- Water equipment capped at 5 days
- Documentation required for claims over $10,000

### Lenient Regional Carrier

- Lower O&P threshold ($2,500)
- Only 2 trades required for O&P
- Documentation only required for Category 3 water
- Higher depreciation allowed (85%)
- Fewer documentation requirements

### Texas (Labor Taxable)

- 6.25% sales tax
- Labor IS taxable
- Licensed trades required (electrical, plumbing, HVAC)
- Pre-1980 asbestos testing warning
- Permits required

### Florida (Labor Not Taxable)

- 6% sales tax
- Labor is NOT taxable
- O&P threshold override ($3,000)
- Hurricane code compliance for roofing
- Licensed roofing contractor required

## Integration Points

### Estimate Creation/Update

When an estimate is saved with a carrier profile and jurisdiction, the rules engine can be called to evaluate and store rule effects.

### Validation

The extended validator (`validateEstimateWithRules`) combines standard validation with rules evaluation, producing a unified set of issues.

### Export

When exporting to Xactimate or other formats, rule effects and explanations can be included as documentation.

## Testing

Run rules engine tests:

```bash
npx vitest run server/services/__tests__/rulesEngine.test.ts
```

## Future Considerations

- **Rule versioning** - Track rule changes over time
- **Override workflows** - Allow adjusters to override with justification
- **Rule analytics** - Track which rules are triggered most often
- **Carrier API integration** - Fetch rules from carrier systems

## Files

| File | Purpose |
|------|---------|
| `db/migrations/007_carrier_jurisdiction_rules.sql` | Database schema |
| `shared/schema.ts` | TypeScript types and Drizzle schemas |
| `server/services/rulesEngine.ts` | Core evaluation engine |
| `server/services/estimateValidator.ts` | Validation integration |
| `db/seeds/carrier_jurisdiction_examples.sql` | Example rule sets |
| `server/services/__tests__/rulesEngine.test.ts` | Unit tests |
