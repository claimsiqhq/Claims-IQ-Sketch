# Line Item v2 Structure Guide

## Overview

Claims IQ v2 line items are **domain-encoded knowledge bases** for claims estimation. Each line item encodes not just pricing, but complete claims logic:

- **When** it applies (scope conditions)
- **How much** is needed (quantity formulas)
- **What it requires** (dependencies)
- **What it conflicts with** (exclusions)
- **How carriers react** (sensitivity levels)

This guide explains how to understand, use, and extend v2 line items.

---

## Core v2 Fields

### 1. `scope_conditions` (JSONB)

Defines when a line item automatically applies to a zone based on damage attributes.

```json
{
  "damageType": ["water", "fire"],       // OR logic within array
  "waterCategory": [2, 3],               // IICRC water classification (1-3)
  "waterClass": [2, 3, 4],               // IICRC water class (1-4)
  "affectedSurfaces": ["wall", "floor"], // Damaged surfaces
  "damageSeverity": ["moderate", "severe"],
  "roomType": ["bathroom", "kitchen"],   // Specific room types
  "zoneType": ["room", "elevation"],     // Zone classification
  "floorLevel": ["main", "basement"]     // Building level
}
```

**Logic Rules:**
- Within a field: **OR** logic (any value matches)
- Across fields: **AND** logic (all specified must match)
- Omitted fields: No restriction (always matches)

**Example:**
```json
{
  "damageType": ["water"],
  "waterCategory": [2, 3],
  "affectedSurfaces": ["wall"]
}
```
This item applies when: `damageType is water` AND `waterCategory is 2 OR 3` AND `affectedSurfaces includes wall`

---

### 2. `quantity_formula` (TEXT)

Declarative formula for calculating quantity from zone geometry.

**Available Metrics:**
| Metric | Description | Use For |
|--------|-------------|---------|
| `FLOOR_SF(zone)` | Floor square footage | Flooring, extraction |
| `CEILING_SF(zone)` | Ceiling square footage | Ceiling paint, drywall |
| `WALL_SF(zone)` | Total wall area (gross) | Full wall coverage |
| `WALL_SF_NET(zone)` | Wall area minus openings | Paint, drywall |
| `WALLS_CEILING_SF(zone)` | Walls + ceiling combined | Antimicrobial |
| `PERIMETER_LF(zone)` | Floor perimeter | Baseboard, flood cut |
| `HEIGHT_FT(zone)` | Ceiling height | Height-based calc |
| `LONG_WALL_SF(zone)` | Longer wall area | Single wall work |
| `SHORT_WALL_SF(zone)` | Shorter wall area | Single wall work |
| `ROOF_SF(zone)` | Roof area (pitch-adjusted) | Roofing |
| `ROOF_SQ(zone)` | Roofing squares (100 SF) | Roofing materials |

**Available Functions:**
| Function | Description | Example |
|----------|-------------|---------|
| `MAX(a, b)` | Maximum value | `MAX(3, x)` for minimums |
| `MIN(a, b)` | Minimum value | `MIN(x, 100)` for caps |
| `CEIL(x)` | Round up | `CEIL(SF/100)` |
| `FLOOR(x)` | Round down | `FLOOR(LF/8)` |
| `ROUND(x)` | Round to nearest | `ROUND(x)` |
| `ABS(x)` | Absolute value | `ABS(a-b)` |

**Operators:** `+`, `-`, `*`, `/` with standard precedence

**Formula Examples:**

```sql
-- Simple area-based
'FLOOR_SF(zone)'                           -- Water extraction

-- Perimeter-based
'PERIMETER_LF(zone) * 0.9'                 -- Baseboard (90% for doorways)

-- Fractional wall area
'WALL_SF_NET(zone) * 0.25'                 -- 2ft flood cut on 8ft wall

-- Combined surfaces
'WALL_SF_NET(zone) + FLOOR_SF(zone)'       -- Antimicrobial (walls + floor)

-- Smart minimums
'MAX(3, CEIL(FLOOR_SF(zone) / 500))'       -- Dehu: min 3 days, 1 per 500 SF

-- Equipment with days
'MAX(3, CEIL(FLOOR_SF(zone) / 100)) * 3'   -- Air movers: 1/100SF × 3 days
```

---

### 3. `requires_items` (JSONB Array)

Line items that **MUST** be present for this item to be valid. Validation will warn if these are missing.

```json
["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]
```

**Logic:** ANY ONE of the listed items satisfies the requirement (OR logic).

**Use Cases:**
- Drywall install requires demo
- Paint requires primer
- Equipment rentals require setup

---

### 4. `auto_add_items` (JSONB Array)

Line items automatically added when this item is scoped.

```json
["WTR-MOIST-INIT", "WTR-DRY-SETUP", "WTR-CARPET-LIFT"]
```

**Behavior:**
- Auto-added items marked with `is_auto_added = true`
- Tracks which item triggered the addition
- Forms dependency chains

**Use Cases:**
- Extraction auto-adds drying setup
- Flood cut auto-adds haul, baseboard demo
- Heavy soot cleaning auto-adds seal & fog

---

### 5. `excludes_items` (JSONB Array)

Mutually exclusive items. Validation prevents both from appearing together.

```json
["DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]
```

**Use Cases:**
- Can't have 2ft AND 4ft flood cut
- Can't have 1/2" AND 5/8" drywall
- Can't have lift/block AND full carpet removal

---

### 6. `replaces_items` (JSONB Array)

Items this line item supersedes. The engine removes replaced items when this one is selected.

```json
["DEM-DRY-FLOOD"]
```

**Use Cases:**
- 4ft flood cut replaces 2ft cut
- Full drywall demo replaces flood cuts
- Heavy cleaning replaces light cleaning

**Priority Chain Example:**
```
Light Smoke → Heavy Smoke → Seal & Paint → Full Demo
(each replaces the previous)
```

---

### 7. `carrier_sensitivity_level` (VARCHAR)

Indicates how closely carriers scrutinize this item.

| Level | Description | Example Items |
|-------|-------------|---------------|
| `low` | Standard items, rarely questioned | Extraction, basic demo, standard labor |
| `medium` | May require documentation | Equipment counts, extended drying |
| `high` | Frequently denied/reduced | Antimicrobial, contents manipulation, seal & paint |

**Impact:**
- High-sensitivity items should have thorough documentation
- Validation can apply stricter rules
- Future carrier-rule layers will use this

---

### 8. `validation_rules` (JSONB)

Custom validation rules specific to this line item.

```json
{
  "min_quantity": 25,
  "max_quantity": 5000,
  "max_quantity_per_zone": 5000,
  "max_quantity_multiplier": 1.15,
  "requires_photo": true,
  "requires_category_documentation": true,
  "carrier_notes": "Required for Cat 2/3 per IICRC S500",
  "documentation_required": ["moisture_readings", "water_category"],
  "extended_drying_threshold_days": 5
}
```

**Available Rules:**
| Rule | Description |
|------|-------------|
| `min_quantity` | Minimum plausible quantity |
| `max_quantity` | Maximum plausible quantity |
| `max_quantity_per_zone` | Zone-specific maximum |
| `max_quantity_multiplier` | Multiplier on computed quantity |
| `requires_photo` | Photo documentation needed |
| `requires_category_documentation` | Water category determination |
| `carrier_notes` | Guidance for carrier justification |
| `documentation_required` | Specific documents needed |

---

## How to Add New Line Items

### Step 1: Identify the Item Category

Determine which loss type and workflow phase:
- **Water Mitigation:** Emergency, extraction, drying, monitoring
- **Fire/Smoke:** Assessment, cleaning, sealing, demo
- **Rebuild:** Drywall, paint, flooring, trim

### Step 2: Define Scope Conditions

Ask: "When does this item apply?"

```json
{
  "damageType": ["water"],           // What damage type?
  "waterCategory": [2, 3],           // What water category?
  "affectedSurfaces": ["wall"],      // What surfaces?
  "damageSeverity": ["moderate"]     // What severity?
}
```

### Step 3: Write the Quantity Formula

Ask: "How is quantity calculated?"

- Flooring items → `FLOOR_SF(zone)`
- Wall items → `WALL_SF_NET(zone)` or `PERIMETER_LF(zone)`
- Ceiling items → `CEILING_SF(zone)`
- Equipment → Use `MAX(min, CEIL(SF/area_per_unit))` pattern

### Step 4: Define Dependencies

**requires_items:** What must exist first?
```json
["DEMO-ITEM-CODE"]
```

**auto_add_items:** What should be added with this?
```json
["COMPANION-ITEM-CODE"]
```

### Step 5: Define Conflicts

**excludes_items:** What can't coexist?
```json
["ALTERNATIVE-ITEM-CODE"]
```

**replaces_items:** What does this supersede?
```json
["LESSER-ITEM-CODE"]
```

### Step 6: Set Carrier Sensitivity

- `low`: Standard labor/materials
- `medium`: Requires documentation
- `high`: Frequently challenged

### Step 7: Add Validation Rules

```json
{
  "min_quantity": <sensible_minimum>,
  "max_quantity_multiplier": 1.15,
  "carrier_notes": "<justification guidance>",
  "requires_photo": <true_if_high_sensitivity>
}
```

---

## Example: Adding a New Line Item

Let's add "Wall Cavity Injection Drying System":

```sql
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(PERIMETER_LF(zone) / 20)) * MAX(1, CEIL(FLOOR_SF(zone) / 800))',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [2, 3],
    "affectedSurfaces": ["wall_cavity"]
  }'::jsonb,
  auto_add_items = '["DRY-HOLE-DRILL", "WTR-MOIST-DAILY"]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 42,
    "carrier_notes": "Wall cavity drying per IICRC S500. 1 panel per 20 LF. Minimum 3 days.",
    "documentation_required": ["cavity_moisture_readings", "panel_placement_photos"]
  }'::jsonb
WHERE code = 'WTR-DRY-INJECT';
```

**Reasoning:**
- **Formula:** 1 panel per 20 LF of perimeter × days based on area
- **Scope:** Cat 2-3 water affecting wall cavities
- **Auto-adds:** Drill holes and daily monitoring
- **Requires:** Drying setup must exist
- **Sensitivity:** Medium (equipment counts scrutinized)

---

## Dependency Chain Examples

### Water Mitigation Chain
```
Extraction (WTR-EXTRACT-PORT)
  └─ auto_adds → Drying Setup (WTR-DRY-SETUP)
                   └─ auto_adds → Dehumidifier (WTR-DRY-DEHU)
                   └─ auto_adds → Air Movers (WTR-DRY-AIRMOV)
  └─ auto_adds → Moisture Init (WTR-MOIST-INIT)
                   └─ auto_adds → Moisture Log (WTR-MOIST-LOG)
  └─ auto_adds → Carpet Lift (WTR-CARPET-LIFT)
                   └─ auto_adds → Carpet Relay (WTR-CARPET-RELAY)
```

### Flood Cut → Rebuild Chain
```
Flood Cut 2ft (DEM-DRY-FLOOD)
  └─ auto_adds → Haul (DEM-HAUL)
  └─ auto_adds → Baseboard Demo (DEM-BASE)
  └─ auto_adds → Insulation Demo (DEM-INSUL)

Drywall Install (DRY-HTT-12)
  └─ requires → DEM-DRY-FLOOD (or DEM-DRY-FLOOD-4 or DEM-DRY-FULL)
  └─ auto_adds → PVA Primer (PAINT-INT-PRIME-PVA)

Paint (PAINT-INT-WALL)
  └─ requires → Primer (any primer type)
```

### Fire/Smoke Chain
```
Heavy Soot Cleaning (FIRE-SOOT-WET)
  └─ replaces → Light Cleaning (FIRE-SOOT-DRY)
  └─ auto_adds → Odor Seal (FIRE-ODOR-SEAL)
  └─ auto_adds → Thermal Fog (FIRE-ODOR-FOG)

Seal & Paint (FIRE-ODOR-SEAL)
  └─ requires → Heavy Cleaning (FIRE-SOOT-WET or FIRE-SOOT-PROT)
  └─ replaces → Standard Primer
```

---

## Best Practices

### Do:
- Use zone metrics, never hardcoded values
- Add `carrier_notes` explaining justification
- Use `MAX()` for sensible minimums
- Chain related items through `auto_add_items`
- Mark carrier-sensitive items appropriately

### Don't:
- Use `eval()` or arbitrary code in formulas
- Create circular dependencies
- Add items without clear scope conditions
- Ignore industry standards (IICRC S500, S540)
- Skip validation rules for high-sensitivity items

---

## Testing Your Line Items

1. **Scope Engine Test:**
   ```typescript
   import { evaluateZoneScope } from './services/scopeEngine';

   const result = await evaluateZoneScope(zone, catalogItems);
   console.log(result.suggestedItems);
   ```

2. **Quantity Engine Test:**
   ```typescript
   import { calculateQuantity } from './services/quantityEngine';

   const result = calculateQuantity(formula, zoneMetrics);
   console.log(result.quantity, result.explanation);
   ```

3. **Validation Test:**
   ```typescript
   import { validateEstimate } from './services/estimateValidator';

   const result = await validateEstimate(estimateId);
   console.log(result.issues);
   ```

---

## Reference: IICRC Standards

Line items reference these industry standards:

- **S500**: Water Damage Restoration
  - Water categories (1-3)
  - Water classes (1-4)
  - Drying equipment ratios
  - Antimicrobial protocols

- **S540**: Fire Damage Restoration
  - Soot types (dry, wet, protein)
  - Cleaning methods
  - Odor control procedures

When in doubt, defer to IICRC guidelines for defensible scope decisions.
