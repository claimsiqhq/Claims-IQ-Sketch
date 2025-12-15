# Claims IQ - Intelligent Seed Data Documentation

## Overview

This document describes the intelligent seed data expansion implemented in Claims IQ. The goal was to maximize usable intelligence in the database through data alone, without modifying schemas or engine logic.

## Seed Files Created

### 1. `24_intelligent_seed_expansion.sql`
Main seed file containing comprehensive line item intelligence, category enrichment, carrier rules, jurisdiction rules, and validation rules.

### 2. `25_example_estimate_seed.sql`
Complete example estimate demonstrating the scope engine, validation rules, and carrier rule effects.

---

## Part 1: Line Item Seed Enrichment

### Water Mitigation Items

| Code | Description | Quantity Formula | Carrier Sensitivity |
|------|-------------|------------------|---------------------|
| `WTR-EXTRACT-PORT` | Emergency water extraction (portable) | `FLOOR_SF(zone)` | Low |
| `WTR-EXTRACT-TRUCK` | Emergency water extraction (truck mount) | `FLOOR_SF(zone)` | Medium |
| `DEM-DRY-FLOOD` | Drywall flood cut removal (2ft) | `PERIMETER_LF(zone) * 0.9` | Low |
| `DEM-DRY-FLOOD-4` | Drywall flood cut removal (4ft) | `PERIMETER_LF(zone) * 0.9` | Medium |
| `WTR-ANTIMICROB` | Antimicrobial application | `WALL_SF_NET(zone) + FLOOR_SF(zone)` | High |
| `WTR-DRY-AIRMOV` | Air mover placement | `MAX(3, CEIL(FLOOR_SF(zone) / 100)) * 3` | Medium |
| `WTR-DRY-DEHU` | Dehumidifier placement | `MAX(3, CEIL(FLOOR_SF(zone) / 500)) * days` | Medium |

### Fire/Smoke Items

| Code | Description | Quantity Formula | Carrier Sensitivity |
|------|-------------|------------------|---------------------|
| `WTR-CONTENT-MOVE` | Contents manipulation | `1` (per room) | High |
| `FIRE-SOOT-DRY` | Light soot cleaning | `WALL_SF_NET(zone) + CEILING_SF(zone)` | Low |
| `FIRE-SOOT-WET` | Heavy soot cleaning | `WALL_SF_NET(zone) + CEILING_SF(zone)` | Medium |
| `FIRE-SOOT-PROT` | Protein residue cleaning | `WALL_SF_NET(zone) + CEILING_SF(zone)` | Medium |
| `FIRE-ODOR-SEAL` | Seal & paint | `WALL_SF_NET(zone) + CEILING_SF(zone)` | High |
| `DEM-DRY-FULL` | Fire-damaged drywall removal | `WALL_SF_NET(zone)` | Medium |
| `DEM-INSUL` | Insulation replacement | `WALL_SF_NET(zone)` | Low |

### Rebuild Items

| Code | Description | Quantity Formula | Carrier Sensitivity |
|------|-------------|------------------|---------------------|
| `DRY-HTT-12` | Drywall install (1/2") | `WALL_SF_NET(zone) * 0.25` | Low |
| `DRY-HTT-58` | Drywall install (5/8") | `WALL_SF_NET(zone)` | Low |
| `DRY-HTT-CEIL` | Ceiling drywall | `CEILING_SF(zone)` | Low |
| `DRY-TEXT-MATCH` | Texture matching | `WALL_SF_NET(zone)` | Medium |
| `PAINT-INT-WALL` | Wall paint (2 coats) | `WALL_SF_NET(zone)` | Low |
| `PAINT-INT-CEIL` | Ceiling paint (2 coats) | `CEILING_SF(zone)` | Low |
| `DEM-BASE` | Baseboard removal | `PERIMETER_LF(zone) * 0.9` | Low |
| `TRIM-BASE-MDF` | Baseboard install | `PERIMETER_LF(zone) * 0.9` | Low |
| `DEM-FLOOR-VNL` | Flooring removal | `FLOOR_SF(zone)` | Low |

### V2 Field Population

Each line item includes:

```json
{
  "scope_conditions": {
    "damageType": ["water", "fire"],
    "waterCategory": [1, 2, 3],
    "damageSeverity": ["minor", "moderate", "severe"],
    "affectedSurfaces": ["wall", "floor", "ceiling"],
    "roomType": ["kitchen", "bathroom"]
  },
  "quantity_formula": "FLOOR_SF(zone)",
  "auto_add_items": ["WTR-MOIST-INIT", "WTR-DRY-SETUP"],
  "requires_items": ["WTR-EXTRACT-PORT"],
  "excludes_items": ["WTR-EXTRACT-TRUCK"],
  "replaces_items": [],
  "default_coverage_code": "A",
  "default_trade": "WTR",
  "carrier_sensitivity_level": "medium",
  "validation_rules": {
    "min_quantity": 25,
    "max_quantity_per_zone": 5000,
    "requires_photo": false,
    "carrier_notes": "Per IICRC S500 guidelines"
  }
}
```

---

## Part 2: Category Enrichment

All categories updated with:

| Category | Coverage Code | Default Trade |
|----------|---------------|---------------|
| 01 - Water Mitigation | A | WTR |
| 02 - Demolition | A | DEM |
| 03 - General Cleaning | A | CLN |
| 04 - Fire/Smoke | A | CLN |
| 05 - Insulation | A | INSUL |
| 06 - Drywall | A | DRY |
| 07 - Flooring | A | FLR |
| 08 - Windows/Doors | A | CARP |
| 09 - Plumbing | A | PLMB |
| 10 - Electrical | A | ELEC |
| 11 - HVAC | A | HVAC |
| 12 - Roofing | A | ROOF |
| 13 - Exterior | A | EXT |
| 14 - Interior Painting | A | PAINT |
| 15 - Cabinets | A | CAB |
| 16 - Trim | A | TRIM |

---

## Part 3: Zone/Room Reference Normalization

### Canonical Room Types

For use in `scope_conditions.roomType`:

- `kitchen` - Kitchen, cooking areas
- `bathroom` - Full bath, half bath, powder room
- `bedroom` - Master bedroom, bedroom, guest room
- `living_room` - Living room, family room, great room
- `dining_room` - Dining room, breakfast nook
- `hallway` - Hallway, corridor, foyer
- `basement` - Basement, cellar
- `garage` - Garage, carport
- `utility` - Utility room, laundry room
- `closet` - Walk-in closet, reach-in closet
- `attic` - Attic, attic space
- `office` - Home office, study

### Default Ceiling Heights

- Standard: 8 ft (96 in)
- Vaulted: 10-12 ft
- Basement: 7.5 ft

### Normalized Affected Surfaces

- `wall` - Interior wall surfaces
- `ceiling` - Ceiling surfaces
- `floor` - Floor surfaces (generic)
- `carpet` - Carpeted floor
- `tile` - Tile floor
- `hardwood` - Hardwood floor
- `vinyl` - Vinyl/LVP floor
- `baseboard` - Baseboard trim
- `trim` - General trim/millwork
- `drywall` - Drywall specifically
- `insulation` - Wall/ceiling insulation
- `subfloor` - Subfloor material
- `cabinet` - Cabinetry
- `contents` - Room contents/furniture

---

## Part 4: Carrier Rule Profiles

### Carrier A: National Standard Insurance (`NATL-STD`)

**Characteristics:** Strict national carrier

| Rule | Effect | Description |
|------|--------|-------------|
| `NATL-MOLD-PREAPPROVAL` | Exclude | Mold requires pre-approval |
| `NATL-WTR-EQUIP-CAP` | Cap | 5-day drying equipment limit |
| `NATL-DOC-HIGHVALUE` | Require Doc | Photos for claims >$10K |
| `NATL-ANTIMICROB-CAP` | Cap | 2,000 SF/zone antimicrobial limit |
| `NATL-CONTENTS-DOC` | Require Doc | Contents photo inventory |
| `NATL-EQUIP-LIMIT` | Cap | 10 air movers, 3 dehu/zone |
| `NATL-SEAL-PREREQ` | Require Doc | Seal requires cleaning first |

**Item Caps:**
- Dehumidifier: Max 10/zone, $75/day
- Air mover: Max 15/zone, $35/day
- Antimicrobial: Max 2,000 SF/zone
- Ozone: Max 3 days/zone

### Carrier B: Regional Preferred Mutual (`REG-PREF`)

**Characteristics:** Lenient regional carrier

| Rule | Effect | Description |
|------|--------|-------------|
| `REG-CAT3-DOC` | Require Doc | Category 3 documentation only |
| `REG-LARGE-CLAIM` | Warn | Review warning for >$25K |
| `REG-EXTENDED-DRY` | Modify | 7-day drying allowed |
| `REG-ANTIMICROB-OK` | Modify | No pre-approval for antimicrobial |
| `REG-EQUIP-ALLOW` | Modify | 15 air movers, 5 dehu/zone |

---

## Part 5: Jurisdiction Rule Profiles

### Texas (`US-TX`)

**Characteristics:** Labor IS taxable

| Rule | Effect | Description |
|------|--------|-------------|
| `TX-LABOR-TAX` | Modify | 6.25% tax on labor |
| `TX-ELEC-LICENSE` | Require Doc | Licensed electrician required |
| `TX-ASBESTOS` | Warn | Pre-1980 asbestos testing |
| `TX-PERMIT-STRUCT` | Require Doc | Permit for work >$5K |
| `TX-LEAD-1978` | Warn | Pre-1978 lead paint testing |

### Florida (`US-FL`)

**Characteristics:** Labor NOT taxable

| Rule | Effect | Description |
|------|--------|-------------|
| `FL-NO-LABOR-TAX` | Modify | 0% tax on labor |
| `FL-ROOF-CODE` | Require Doc | Hurricane code compliance |
| `FL-ROOF-LICENSE` | Require Doc | Licensed roofer required |
| `FL-OP-THRESHOLD` | Modify | $3,000 O&P threshold |
| `FL-MOLD-DISC` | Require Doc | Licensed mold remediator |
| `FL-IMPACT-COAST` | Warn | Impact-rated glass warning |

### California (`US-CA`)

**Characteristics:** Labor NOT taxable, Title 24

| Rule | Effect | Description |
|------|--------|-------------|
| `CA-NO-LABOR-TAX` | Modify | 0% tax on labor |
| `CA-TITLE24` | Require Doc | Title 24 energy compliance |
| `CA-ASBESTOS-NOTIFY` | Warn | AQMD notification required |

---

## Part 6: Validation Rules

### Rule Types

1. **Install Requires Removal**
   - `DRY-HTT-12` requires `DEM-DRY-FLOOD`
   - `TRIM-BASE-MDF` requires `DEM-BASE`
   - Enforced via `requires_items`

2. **Paint Requires Prep**
   - `PAINT-INT-WALL` requires primer
   - `FIRE-ODOR-SEAL` requires soot cleaning
   - Enforced via `requires_items`

3. **Replacement Excludes Cleaning**
   - `DEM-DRY-FULL` replaces `FIRE-SOOT-WET`
   - `DEM-FLOOR-CARPET` replaces `WTR-CARPET-LIFT`
   - Enforced via `replaces_items`

4. **Quantity Geometry Checks**
   - Floor SF must match zone geometry
   - Wall SF must match calculated wall area
   - Perimeter LF must match zone perimeter
   - Enforced via `validation_rules.validation_checks`

### Validation Check Structure

```json
{
  "validation_checks": [
    {"type": "geometry_match", "source": "FLOOR_SF", "tolerance": 0.1},
    {"type": "prerequisite_required", "requires": "DEM-DRY-FLOOD"},
    {"type": "category_required", "min_category": 2},
    {"type": "severity_required", "min_severity": "moderate"},
    {"type": "one_per_zone", "enforce": true}
  ]
}
```

---

## Part 7: Example Estimate

### Claim Details

- **Claim ID:** CLM-2024-DEMO-001
- **Property:** 123 Main Street, Dallas, TX
- **Cause of Loss:** Water (dishwasher failure)
- **Water Category:** 2 (gray water)
- **Carrier:** National Standard Insurance
- **Jurisdiction:** Texas

### Zones

| Zone | Room Type | Size | Damage Severity |
|------|-----------|------|-----------------|
| Kitchen | kitchen | 168 SF | Moderate |
| Living Room | living_room | 320 SF | Moderate |
| Hallway | hallway | 60 SF | Minor |

### Line Items (Kitchen)

Demonstrates scope engine output:
- Water extraction (168 SF)
- Moisture inspection (168 SF)
- Drying setup (1 EA)
- Air movers (9 unit-days)
- Dehumidifier (3 unit-days)
- Daily monitoring (3 days)
- Antimicrobial (548 SF)
- Flood cut (46.8 LF)
- Baseboard removal (46.8 LF)
- Flooring removal (168 SF)
- Debris haul (1 load)
- Drywall install (95 SF)
- PVA primer (95 SF)
- Wall paint (380 SF)
- Baseboard install (46.8 LF)
- Trim paint (46.8 LF)

### Rule Effects Applied

1. **Carrier:** Antimicrobial pre-approval warning
2. **Carrier:** Documentation requirements
3. **Jurisdiction:** Texas labor tax (6.25%)

---

## How to Add Future Intelligent Seed Data

### 1. Line Item Intelligence

```sql
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor"],
    "waterCategory": [1, 2]
  }'::jsonb,
  auto_add_items = '["RELATED-ITEM-1"]'::jsonb,
  requires_items = '["PREREQ-ITEM"]'::jsonb,
  excludes_items = '["CONFLICT-ITEM"]'::jsonb,
  replaces_items = '["SUPERSEDED-ITEM"]'::jsonb,
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 5000,
    "carrier_notes": "Per IICRC S500",
    "validation_checks": [
      {"type": "geometry_match", "source": "FLOOR_SF", "tolerance": 0.1}
    ]
  }'::jsonb
WHERE code = 'YOUR-ITEM-CODE';
```

### 2. Carrier Rules

```sql
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
  (SELECT id FROM carrier_profiles WHERE code = 'CARRIER-CODE'),
  'UNIQUE-RULE-CODE',
  'Rule Display Name',
  'cap',              -- exclusion, cap, documentation, modification
  'line_item',        -- line_item, category, trade, estimate
  'ITEM-CODE',
  '{}'::jsonb,
  'cap_quantity',     -- exclude, cap_quantity, cap_cost, require_doc, warn, modify_pct
  '{"maxQuantity": 5}'::jsonb,
  'User-friendly explanation',
  'Policy Reference',
  10,
  true
);
```

### 3. Jurisdiction Rules

```sql
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
  (SELECT id FROM jurisdictions WHERE code = 'US-XX'),
  'XX-RULE-CODE',
  'Rule Display Name',
  'tax',              -- tax, labor, regulatory, op
  'tax',
  'labor',
  '{}'::jsonb,
  'modify_pct',
  '{"taxRate": 0.0625}'::jsonb,
  'User-friendly explanation',
  'State Code Reference',
  10,
  true
);
```

---

## Assumptions Made

1. **IICRC Standards:** All water mitigation quantities follow IICRC S500/S540 guidelines
2. **Geometry Formulas:** Assume zone geometry fields are populated correctly
3. **Coverage Codes:** A = Dwelling, C = Contents (for contents manipulation)
4. **Trade Codes:** Standard restoration industry trade classifications
5. **Carrier Sensitivity:** Based on typical carrier review patterns
6. **Validation Tolerances:** 10-15% tolerance for geometry matching

---

## Success Criteria Verification

After running seeds:

- [x] Scope engine produces real line items (via `scope_conditions`)
- [x] Quantities are geometry-driven (via `quantity_formula`)
- [x] Validation warnings fire (via `validation_rules`)
- [x] Carrier rules visibly modify scope (via carrier rules and `rule_effects`)
- [x] No schema or logic was changed (data only)

---

## Files Modified/Created

| File | Action | Description |
|------|--------|-------------|
| `db/seeds/24_intelligent_seed_expansion.sql` | Created | Main intelligence expansion |
| `db/seeds/25_example_estimate_seed.sql` | Created | Example estimate with all features |
| `docs/INTELLIGENT_SEED_DATA.md` | Created | This documentation |
