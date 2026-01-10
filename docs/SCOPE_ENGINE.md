# Scope Engine Architecture

## Overview

**Scope defines WHAT work is required.**
**Scope is independent of pricing.**

The Scope Engine is the foundational layer of Claims IQ's estimation system. It answers the question "What work needs to be done?" before any pricing calculations occur.

## Core Principles

### 1. Separation of Concerns
- **Scope** = What work is required (this layer)
- **Pricing** = How much it costs (separate layer)
- **Estimate** = Scope + Pricing combined

### 2. Geometry-Driven Quantities
All quantities MUST be derived from zone geometry. Quantities are never typed manually.

```
Zone Geometry → Zone Metrics → Quantity Extraction → Scope Items
```

### 3. Deterministic Math Only
- No AI randomness in scope assembly
- No probabilistic calculations
- Every scope item has full provenance for audit

### 4. Trade-Based Organization
Work is organized by construction trade for:
- O&P eligibility tracking (3-trade rule)
- Clear work categorization
- Xactimate compatibility

## Database Schema

### `scope_trades`
Canonical trade definitions.

| Column | Type | Description |
|--------|------|-------------|
| code | VARCHAR(10) | Trade code (e.g., DRY, PNT, FLR) |
| name | VARCHAR(100) | Display name |
| description | TEXT | Full description |
| xact_category_prefix | VARCHAR(10) | Xactimate category mapping |
| op_eligible | BOOLEAN | Counts toward O&P eligibility |

**Standard Trades:**
- `MIT` - Mitigation (emergency services)
- `DEM` - Demolition
- `DRY` - Drywall
- `PNT` - Painting
- `FLR` - Flooring
- `INS` - Insulation
- `CAR` - Carpentry
- `CAB` - Cabinetry
- `CTR` - Countertops
- `RFG` - Roofing
- `WIN` - Windows
- `EXT` - Exteriors
- `ELE` - Electrical
- `PLM` - Plumbing
- `HVAC` - HVAC
- `GEN` - General Conditions

### `scope_line_items`
Line item catalog with Xactimate-style codes.

| Column | Type | Description |
|--------|------|-------------|
| code | VARCHAR(30) | Unique item code (e.g., DRY-1/2-SF) |
| description | TEXT | Full description |
| unit | VARCHAR(10) | Unit of measure (SF, LF, EA, SQ) |
| trade_code | VARCHAR(10) | FK to scope_trades |
| default_waste_factor | DECIMAL | Default waste (e.g., 0.10 = 10%) |
| quantity_formula | VARCHAR(50) | Metric reference for auto-calculation |
| companion_rules | JSONB | Requires/auto-adds/excludes rules |
| scope_conditions | JSONB | When this item applies |

**Quantity Formulas:**
- `FLOOR_SF` - Floor square footage
- `CEILING_SF` - Ceiling square footage
- `WALL_SF` - Gross wall square footage
- `WALL_SF_NET` - Wall SF minus openings
- `WALLS_CEILING_SF` - Combined walls and ceiling
- `PERIMETER_LF` - Floor perimeter linear feet
- `ROOF_SF` - Roof square footage (with pitch)
- `ROOF_SQ` - Roofing squares (100 SF)

**Units:**
- `SF` - Square Feet
- `LF` - Linear Feet
- `SY` - Square Yards
- `SQ` - Roofing Squares (100 SF)
- `EA` - Each
- `HR` - Hour
- `DAY` - Day

### `scope_items`
Assembled scope linking zones to line items.

| Column | Type | Description |
|--------|------|-------------|
| estimate_id | UUID | FK to estimates |
| zone_id | UUID | FK to estimate_zones |
| wall_index | INTEGER | Optional wall reference |
| line_item_id | UUID | FK to scope_line_items |
| line_item_code | VARCHAR(30) | Denormalized code |
| quantity | DECIMAL | Base quantity (from geometry) |
| unit | VARCHAR(10) | Unit of measure |
| waste_factor | DECIMAL | Applied waste factor |
| quantity_with_waste | DECIMAL | Final quantity |
| provenance | VARCHAR(30) | How item was created |
| provenance_details | JSONB | Full audit trail |
| trade_code | VARCHAR(10) | Denormalized trade |
| status | VARCHAR(20) | pending/approved/excluded |

**Provenance Types:**
- `geometry_derived` - Computed from zone geometry
- `manual` - Added manually by user
- `template` - From estimate template
- `ai_suggested` - AI recommendation (deterministic)
- `voice_command` - From voice sketch session

### `scope_summary`
Aggregate scope by trade (no pricing).

| Column | Type | Description |
|--------|------|-------------|
| estimate_id | UUID | FK to estimates |
| trade_code | VARCHAR(10) | FK to scope_trades |
| line_item_count | INTEGER | Items in this trade |
| zone_count | INTEGER | Zones with this trade |
| quantities_by_unit | JSONB | { "SF": 1200, "LF": 340 } |
| pending_count | INTEGER | Pending items |
| approved_count | INTEGER | Approved items |

## Services

### scopeQuantityEngine.ts
Derives quantities from zone metrics.

```typescript
// Extract quantity for a line item
const result = extractQuantity(metrics, lineItem);
// Returns: { quantity, quantityWithWaste, wasteFactor, formula, sourceMetric, provenance }

// Extract quantities for multiple items
const extraction = extractZoneQuantities(zone, missingWalls, subrooms, lineItems);
```

### scopeAssemblyService.ts
Assembles scope from zones and catalog.

```typescript
// Assemble scope for an estimate
const result = await assembleEstimateScope(estimateId);
// Returns: { items, zones, summary, assembledAt }

// Save assembled items to database
const { inserted, errors } = await saveScopeItems(result.items);

// Update summary table
await updateScopeSummary(estimateId);
```

## API Endpoints

### Trades
```
GET /api/scope/trades
```

### Line Item Catalog
```
GET /api/scope/catalog
GET /api/scope/catalog/:code
```

### Scope Items
```
GET /api/scope/estimate/:estimateId
POST /api/scope/estimate/:estimateId/assemble
DELETE /api/scope/estimate/:estimateId
```

### Summary
```
GET /api/scope/estimate/:estimateId/summary
POST /api/scope/estimate/:estimateId/summary/refresh
```

### Status Management
```
PATCH /api/scope/items/:itemId/status
POST /api/scope/estimate/:estimateId/approve-all
```

## UI Component

### ScopePanel
Read-only display of assembled scope.

```tsx
<ScopePanel estimateId={estimateId} />
```

Features:
- View by trade or zone
- See derived quantities
- Provenance tooltips
- Summary statistics
- NO pricing displayed

## Data Flow

```
┌─────────────────┐
│   Sketch/Voice  │
│   (Geometry)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  estimate_zones │
│  (Zone Data)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  zoneMetrics.ts │ ◄── │ scope_line_items│
│  (Compute SF)   │     │   (Catalog)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│ scopeQuantity   │ ◄────────────┘
│ Engine.ts       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ scopeAssembly   │
│ Service.ts      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   scope_items   │
│   (Database)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   ScopePanel    │
│   (UI)          │
└─────────────────┘
```

## Companion Rules

Line items can specify dependencies:

```json
{
  "requires": ["DRY-1/2-SF"],
  "auto_adds": ["DRY-TAPE-SF"],
  "excludes": ["DRY-PATCH-SM"]
}
```

- `requires` - Items that must be present for this item to apply
- `auto_adds` - Items automatically added when this item is added
- `excludes` - Items that cannot coexist with this item

## Scope Conditions

Line items can specify when they apply:

```json
{
  "damage_types": ["water", "mold"],
  "surfaces": ["floor", "wall"],
  "severity": ["moderate", "severe"],
  "zone_types": ["room"],
  "room_types": ["kitchen", "bathroom"]
}
```

## Migrations

1. `036_scope_engine_foundation.sql` - Creates tables and trades
2. `037_scope_line_items_seed.sql` - Seeds 100+ line items

## Future Enhancements

### Phase 2: Pricing Layer
- Price lookup from catalog
- Regional multipliers
- Material/labor split
- Tax calculations
- O&P application

### Phase 3: AI Integration
- Scope suggestions from photos
- Voice command scope assembly
- Damage detection → scope mapping

### Phase 4: ESX Export
- Full Xactimate compatibility
- Selector code mapping
- Activity type grouping

## Constraints

### NO Pricing
This layer intentionally excludes:
- Unit prices
- Material costs
- Labor costs
- Tax calculations
- O&P calculations

### NO Taxes
Tax calculations belong in the pricing layer.

### NO O&P
Overhead & Profit calculations belong in the pricing layer.
Trade counting for O&P eligibility IS included (3-trade rule).

### Deterministic Only
- No random number generation
- No AI hallucination
- No probabilistic models
- Every result is reproducible

## Testing

```bash
# Run scope engine tests
npm test -- --grep "scope"

# Test quantity extraction
npm test -- --grep "scopeQuantityEngine"

# Test scope assembly
npm test -- --grep "scopeAssemblyService"
```

## Troubleshooting

### Quantities are 0
1. Check zone has geometry (lengthFt, widthFt, or polygonFt)
2. Verify line item has quantity_formula
3. Check zone metrics are computed correctly

### Items not appearing
1. Check line item scope_conditions match zone
2. Verify line item is_active = true
3. Check trade is active

### Wrong quantities
1. Review provenance_details for formula used
2. Check waste_factor setting
3. Verify zone dimensions are correct
