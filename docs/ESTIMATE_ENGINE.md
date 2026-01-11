# Estimate Engine Architecture

## Overview

**Estimate = Scope + Pricing + Validation**

The Estimate Engine is the pricing and validation layer that transforms scope (what work is needed) into a fully priced estimate with totals, breakdowns, and validation.

## Core Principles

### 1. Separation of Concerns
- **Scope** = What work is required (previous layer)
- **Pricing** = How much it costs (this layer)
- **Validation** = Is the estimate complete and correct (this layer)
- **Settlement** = Final ACV/RCV calculations

### 2. Region-Based Pricing
All pricing is region-aware with configurable multipliers for:
- Material costs
- Labor rates
- Equipment costs
- Tax rates

### 3. Deterministic Calculations
- No AI randomness in pricing
- Every calculation is auditable
- Consistent results for same inputs

### 4. Validation Without Blocking
- Validation produces warnings, not hard failures
- Adjuster can override validation warnings
- All issues are actionable

## Data Flow

```
┌─────────────────┐
│  Scope Engine   │
│  (What work?)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Estimate Pricing│ ◄── │  Regional Price │
│    Engine.ts    │     │     Sets        │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Validation    │ ◄── │ Companion Rules │
│    Engine       │     │ Trade Sequences │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Settlement Calc │
│  (O&P, Tax)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  EstimatePanel  │
│     (UI)        │
└─────────────────┘
```

## Pricing Tables

### Regional Price Sets

Each region has configurable multipliers:

| Field | Description | Example |
|-------|-------------|---------|
| regionId | Unique identifier | CO-DENVER |
| regionName | Display name | Denver Metro |
| materialMultiplier | Material cost factor | 1.15 |
| laborMultiplier | Labor cost factor | 1.20 |
| equipmentMultiplier | Equipment cost factor | 1.05 |
| taxRate | Sales tax rate | 0.0775 |

### Line Item Pricing

Each line item in the catalog includes:

| Field | Description |
|-------|-------------|
| code | Unique item code |
| material_components | Material cost breakdown |
| labor_components | Labor hours and trade |
| equipment_components | Equipment costs |
| waste_factor | Default waste (e.g., 1.10 = 10%) |
| minimum_charge | Minimum charge amount |
| default_coverage_code | A, B, or C |
| trade_code | Trade for O&P eligibility |

### Labor/Material Split

Every line item is broken down into components:

```
Unit Price = Material + Labor + Equipment
             (adjusted for region and waste)
```

**Material Cost Calculation:**
```
Material = Base Material × Regional Material Multiplier × Waste Factor
```

**Labor Cost Calculation:**
```
Labor = Labor Hours × Trade Hourly Rate × Regional Labor Multiplier
```

## Estimate Calculations

### Subtotals

```typescript
interface EstimateTotals {
  lineItemCount: number;
  subtotalMaterial: number;    // Sum of all material costs
  subtotalLabor: number;       // Sum of all labor costs
  subtotalEquipment: number;   // Sum of all equipment costs
  subtotalBeforeTax: number;   // Material + Labor + Equipment
  taxAmount: number;           // Tax on taxable amount
  taxRate: number;             // Applied tax rate
  subtotalAfterTax: number;    // Subtotal + Tax
  wasteIncluded: number;       // Total waste factor cost
}
```

### Waste Factor

Waste is applied to material costs only:
```
Adjusted Material = Base Material × Waste Factor
```

Common waste factors:
- Drywall: 10% (1.10)
- Flooring: 10-15% (1.10-1.15)
- Paint: 5% (1.05)
- Roofing: 10% (1.10)

### Tax Calculation

Tax rules vary by carrier:
- Some carriers tax only materials
- Some carriers tax full subtotal
- Rate is region-specific

```typescript
// Carrier-specific tax rules
const taxableAmount = carrierRules.taxOnMaterialsOnly
  ? totalMaterial
  : subtotalBeforeTax;
const taxAmount = taxableAmount * taxRate;
```

### Overhead & Profit (O&P)

O&P eligibility is determined by carrier rules:

```typescript
interface OverheadAndProfit {
  qualifiesForOp: boolean;      // Meets threshold?
  tradesInvolved: string[];     // List of trades
  opThreshold: number;          // Minimum amount for O&P
  opTradeMinimum: number;       // Minimum trades (usually 3)
  overheadPct: number;          // Overhead percentage (10%)
  profitPct: number;            // Profit percentage (10%)
  overheadAmount: number;       // Calculated overhead
  profitAmount: number;         // Calculated profit
}
```

**Standard O&P Rules:**
- Minimum 3 trades involved
- Minimum dollar threshold (varies by carrier)
- Applied to subtotal after tax

### RCV / ACV Calculation

**RCV (Replacement Cost Value):**
```
RCV = Subtotal + Tax + O&P (if eligible)
```

**ACV (Actual Cash Value):**
```
ACV = RCV - Depreciation
```

Depreciation is calculated in the Depreciation Engine (see depreciationEngine.ts).

## Validation Rules

### 1. Missing Companion Items

Items that typically require other items:

| Primary | Requires | Relationship |
|---------|----------|--------------|
| DRY-HANG | DRY-TAPE | requires |
| DRY-TAPE | PNT-PRIME | suggests |
| PNT-PRIME | PNT-WALL | requires |
| FLR-REMOVE | FLR-INSTALL | suggests |
| MIT-EXTRACT | MIT-DEHU | requires |

**Severity:**
- `requires` = Error (must fix)
- `suggests` = Warning (review)
- `often_with` = Info (FYI)

### 2. Quantity Mismatches

Validates quantities against expected ranges:

| Issue | Severity | Description |
|-------|----------|-------------|
| Zero quantity | Error | Quantity <= 0 |
| Fractional EA | Warning | EA items should be whole numbers |
| Large quantity | Warning | SF > 10,000 per zone |
| Floor/ceiling mismatch | Warning | >15% difference |

### 3. Trade Completeness

Validates that trade sequences are complete:

**DRY (Drywall) Sequence:**
```
DEM → HANG → TAPE → PRIME → PAINT
```

**FLR (Flooring) Sequence:**
```
REMOVE → PREP → INSTALL → BASE
```

**MIT (Mitigation) Sequence:**
```
EXTRACT → DEHU → AIR → FINAL
```

### 4. Coverage Issues

Validates items are assigned to correct coverage:

| Trade | Expected Coverage | Forbidden Coverage |
|-------|-------------------|-------------------|
| MIT | A | C |
| RFG | A, B | C |
| APP | C | A, B |
| FRN | C | A, B |
| DRY | A | C |

### 5. Pricing Anomalies

Detects unusual pricing patterns:

| Issue | Severity | Description |
|-------|----------|-------------|
| Zero price | Error | No pricing in catalog |
| High unit price | Warning | >$500/unit (non-EA) |
| Labor-heavy | Info | Labor > 3× Material |

### 6. Duplicate Items

Detects items that appear multiple times in same zone:
- Suggests consolidation
- Calculates combined quantity

## Services

### estimatePricingEngine.ts

Main pricing engine that converts scope to priced estimate.

```typescript
// Price a single zone's scope
const result = await priceScopeResult(scopeResult, config);

// Price entire estimate (multiple zones)
const result = await priceEstimateScope(estimateScopeResult, config);

// Get regional price sets
const priceSets = await getRegionalPriceSets();
```

### estimateValidator.ts

Validates priced estimates for completeness and correctness.

```typescript
// Validate a priced estimate
const validation = await validatePricedEstimate(estimate);

// Returns:
// - isValid: boolean
// - errorCount, warningCount, infoCount
// - issues: ValidationIssue[]
// - summary: { missingCompanions, quantityMismatches, ... }
```

## API Endpoints

### Pricing

```
POST /api/pricing/scope
  Body: { scopeResult, config }
  Returns: { estimate: PricedEstimateResult }

POST /api/pricing/estimate-scope
  Body: { estimateScopeResult, config }
  Returns: { estimate: PricedEstimateResult }

POST /api/pricing/zone-to-estimate
  Body: { zone, missingWalls, subrooms, config }
  Returns: { scope, estimate, validation }

POST /api/pricing/full-estimate
  Body: { estimateId, zones, config }
  Returns: { scope, estimate, validation }
```

### Validation

```
POST /api/pricing/validate
  Body: { estimate: PricedEstimateResult }
  Returns: { validation: ValidationResult }
```

### Regional Data

```
GET /api/pricing/regional-price-sets
  Returns: { priceSets: RegionalPriceSet[] }

GET /api/pricing/regional-price-sets/:regionId
  Returns: { priceSet: RegionalPriceSet }
```

## UI Components

### EstimatePanel

Displays the priced estimate with multiple views.

```tsx
<EstimatePanel
  estimate={pricedEstimate}
  validation={validationResult}
  showValidation={true}
/>
```

**Tabs:**
- Summary - Totals, cost breakdown, O&P status
- By Trade - Trade-level breakdown with M/L/E split
- By Coverage - Coverage A/B/C breakdown
- Line Items - Full line item table with tooltips
- Validation - Validation warnings (if enabled)

### ValidationWarnings

Displays validation issues with severity and actionable suggestions.

```tsx
<ValidationWarnings
  validation={validationResult}
  compact={false}
  showCategoryFilter={true}
/>
```

**Features:**
- Grouped by severity (errors, warnings, info)
- Category-based filtering
- Expandable issue details
- Suggested fixes
- Related items highlighting

### ValidationIndicator

Compact badge showing validation status.

```tsx
<ValidationIndicator validation={validationResult} />
```

## Configuration

### EstimatePricingConfig

```typescript
interface EstimatePricingConfig {
  regionId: string;              // Required: Region for pricing
  carrierProfileId?: string;     // Carrier for rules
  overheadPct?: number;          // Override O&P overhead (default: 10)
  profitPct?: number;            // Override O&P profit (default: 10)
  defaultAgeYears?: number;      // For depreciation
  defaultCondition?: 'Good' | 'Average' | 'Poor';
  deductibles?: {                // For settlement calculation
    covA?: number;
    covB?: number;
    covC?: number;
  };
}
```

## Output Structure

### PricedEstimateResult

```typescript
interface PricedEstimateResult {
  // Line items with full pricing
  lineItems: PricedLineItem[];

  // Totals grouped by trade
  tradeBreakdown: TradeTotals[];

  // Totals grouped by coverage
  coverageBreakdown: CoverageBreakdown[];

  // Aggregate totals
  totals: EstimateTotals;

  // O&P eligibility and amounts
  overheadAndProfit: OverheadAndProfit;

  // Final RCV total
  rcvTotal: number;

  // Configuration used
  config: {
    regionId: string;
    carrierProfileId?: string;
    calculatedAt: Date;
  };

  // Settlement (if deductibles provided)
  settlement?: SettlementResult;
}
```

### PricedLineItem

```typescript
interface PricedLineItem {
  lineItemCode: string;
  description: string;
  quantity: number;
  unit: string;

  // Pricing breakdown
  unitPriceBreakdown: {
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    wasteFactor: number;
    unitPrice: number;
  };

  // Totals
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
  subtotal: number;
  taxAmount: number;
  rcv: number;

  // Classification
  coverageCode: string;
  tradeCode: string | null;

  // Source info
  reasons: string[];
  isAutoAdded: boolean;
  zoneId?: string;
  zoneName?: string;
}
```

## Integration with Existing Systems

### Scope Engine Integration

The Estimate Pricing Engine takes output from the Scope Engine:

```typescript
// From Scope Engine
const scopeResult = await evaluateZoneScope(zone, missingWalls, subrooms);

// To Pricing Engine
const pricedEstimate = await priceScopeResult(scopeResult, config);
```

### Depreciation Engine Integration

The Pricing Engine integrates with the Depreciation Engine for ACV:

```typescript
// From Depreciation Engine
const depreciationResult = calculateDepreciation(item, ageYears, condition);

// Applied to pricing
item.acv = item.rcv - depreciationResult.amount;
```

### Settlement Integration

For full settlement calculation with deductibles:

```typescript
const settlement = calculateSettlement(
  lineItems,
  opRules,
  deductibles
);
```

## Troubleshooting

### Prices are $0
1. Check line item exists in catalog with pricing
2. Verify region has price data
3. Check material/labor components are populated

### O&P not calculating
1. Verify 3+ trades are involved
2. Check subtotal meets threshold
3. Review carrier O&P rules

### Validation too strict
1. Companion rules may need adjustment
2. Trade sequences are guidelines, not requirements
3. Coverage rules are defaults, override allowed

### Wrong tax rate
1. Check region configuration
2. Verify carrier tax rules
3. Review taxable amount calculation

## Testing

```bash
# Run estimate engine tests
npm test -- --grep "estimatePricing"

# Test validation
npm test -- --grep "validatePricedEstimate"

# Test O&P calculation
npm test -- --grep "overheadAndProfit"
```

## Future Enhancements

### Phase 2: ACV Integration
- Full depreciation integration
- Condition-based adjustments
- Recovery value tracking

### Phase 3: Settlement Dashboard
- Deductible application
- Coverage limit checking
- Payment scheduling

### Phase 4: Carrier Rules Engine
- Dynamic rule loading
- Rule override tracking
- Compliance reporting
