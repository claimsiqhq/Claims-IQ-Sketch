# Sketch Geometry Contract

**Version:** 1.0.0
**Status:** LOCKED
**Last Updated:** 2026-01-10

> This document defines the **locked geometry contract** for Claims-IQ-Sketch.
> All scope and estimate logic MUST rely on this contract.
> NO breaking changes are permitted after this version.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Types](#core-types)
3. [Room Geometry](#room-geometry)
4. [Wall Types](#wall-types)
5. [Openings](#openings)
6. [Features](#features)
7. [Damage Zones](#damage-zones)
8. [Coordinate System](#coordinate-system)
9. [Polygon Winding](#polygon-winding)
10. [Calculations](#calculations)
11. [API Invariants](#api-invariants)
12. [Voice Tool Contracts](#voice-tool-contracts)
13. [Migration Notes](#migration-notes)

---

## Overview

The sketch geometry contract defines the canonical data structures and invariants that downstream systems (scope generation, estimate calculation, pricing) depend upon. This contract ensures:

- **Stability**: Geometry APIs will not change in breaking ways
- **Predictability**: All measurements use consistent units and conventions
- **Completeness**: All required data for scope/estimate is captured
- **Validity**: Geometry is always normalized and valid

### Contract Guarantee

```typescript
// All scope/estimate logic can depend on:
// 1. Coordinates are in FEET (not pixels, meters, or other units)
// 2. Polygons are COUNTER-CLOCKWISE winding order
// 3. Room dimensions are derived from polygon bounds
// 4. Wall directions are derived from polygon edges
// 5. All operations are UNDOABLE
```

---

## Core Types

### Point

The fundamental coordinate type.

```typescript
interface Point {
  x: number;  // Feet, positive = east
  y: number;  // Feet, positive = south
}
```

### WallDirection

Cardinal directions for walls, openings, and features.

```typescript
type WallDirection = 'north' | 'south' | 'east' | 'west';
```

### RoomShape

Supported room shapes.

```typescript
type RoomShape = 'rectangle' | 'l_shape' | 't_shape' | 'irregular';
```

---

## Room Geometry

### RoomGeometry

The primary data structure for a room.

```typescript
interface RoomGeometry {
  // Identity
  id: string;                      // Unique identifier
  name: string;                    // Normalized name (lowercase, underscores)

  // Dimensions (in feet)
  width_ft: number;                // East-west dimension (bounding box)
  length_ft: number;               // North-south dimension (bounding box)
  ceiling_height_ft: number;       // Ceiling height (default 8')

  // Shape
  shape: RoomShape;
  polygon: Point[];                // CCW winding order, in feet

  // L-shape configuration (when shape='l_shape')
  l_shape_config?: {
    notch_corner: 'northeast' | 'northwest' | 'southeast' | 'southwest';
    notch_width_ft: number;
    notch_length_ft: number;
  };

  // T-shape configuration (when shape='t_shape')
  t_shape_config?: {
    stem_wall: WallDirection;
    stem_width_ft: number;
    stem_length_ft: number;
    stem_position_ft: number;
  };

  // Floor plan positioning (optional)
  origin_x_ft?: number;            // X position in floor plan
  origin_y_ft?: number;            // Y position in floor plan

  // Contents
  openings: Opening[];             // Doors, windows, archways
  features: Feature[];             // Closets, islands, built-ins
  damageZones: VoiceDamageZone[];  // Damage documentation
  notes: RoomNote[];               // Annotations

  // Hierarchy
  structureId?: string;            // Parent structure ID
  parentRoomId?: string;           // For sub-rooms (closets in bedrooms)
  subRooms?: RoomGeometry[];       // Child rooms

  // Metadata
  flooring_type?: FlooringType;
  created_at: string;              // ISO timestamp
  updated_at: string;              // ISO timestamp
}
```

### Invariants

1. **Polygon bounds match dimensions**: `width_ft` and `length_ft` equal the bounding box of `polygon`
2. **Polygon is valid**: At least 3 points, no self-intersection
3. **Polygon is CCW**: Counter-clockwise winding order enforced
4. **Ceiling height is positive**: Must be > 0 and typically 6-20 feet
5. **IDs are unique**: No duplicate room IDs within a session

---

## Wall Types

### WallEntity

Represents a wall segment derived from a room polygon.

```typescript
interface WallEntity {
  id: string;                      // Format: "{roomId}_wall_{direction}" or "{roomId}_wall_{index}"
  startPoint: Point;               // Start vertex
  endPoint: Point;                 // End vertex
  length_ft: number;               // Calculated length
  height_ft: number;               // Same as ceiling height
  thickness_ft: number;            // Default 0.5 (6 inches)

  // Classification
  type: 'exterior' | 'interior' | 'missing';
  orientation: 'horizontal' | 'vertical';
  direction: WallDirection;        // Outward-facing direction

  // Relationships
  roomIds: string[];               // Rooms this wall belongs to
  isShared: boolean;               // Shared between rooms
  parentRoomId: string;            // Primary room
  wallIndex: number;               // Index in polygon

  // Metadata
  created_at: string;
  updated_at: string;
}
```

### WallStatus

Runtime status for walls (exterior/missing detection).

```typescript
interface WallStatus {
  wallId: string;
  roomId: string;
  direction: WallDirection;
  isExterior: boolean;             // Auto-detected or manual
  isMissing: boolean;              // Open floor plan
  length_ft: number;
  height_ft: number;
}
```

### Invariants

1. **Exterior detection**: Walls with single room are exterior
2. **Missing walls**: Render dashed, exclude from perimeter
3. **Shared walls**: Listed in both rooms' roomIds
4. **Direction is outward**: Normal points away from polygon center

---

## Openings

### Opening

Doors, windows, and archways.

```typescript
interface Opening {
  id: string;
  type: OpeningType;               // 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door'
  wall: WallDirection;             // Which wall
  width_ft: number;                // Opening width
  height_ft: number;               // Opening height (default: door 6.67', window 4')
  position: PositionType;          // 'left' | 'center' | 'right' | number (feet from start)
  position_from?: 'start' | 'end'; // Reference point for numeric position
  sill_height_ft?: number;         // Windows only (default 3')
}
```

### Invariants

1. **Position within wall**: Cannot exceed wall length minus half width
2. **Height within ceiling**: Cannot exceed ceiling_height_ft
3. **Default heights**: Doors 6'8" (6.67'), Windows 4'
4. **Default sill**: Windows at 3' from floor

---

## Features

### Feature

Built-in elements like closets, islands, and fireplaces.

```typescript
interface Feature {
  id: string;
  type: FeatureType;               // 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in'
  wall: WallDirection | 'freestanding';
  width_ft: number;
  depth_ft: number;
  position: PositionType;
  position_from?: 'start' | 'end';

  // Freestanding features
  x_offset_ft?: number;            // Distance from west wall
  y_offset_ft?: number;            // Distance from north wall
}
```

### Invariants

1. **Wall-attached**: Position is along wall
2. **Freestanding**: Uses x/y offset from room origin
3. **Dimensions positive**: Width and depth must be > 0

---

## Damage Zones

### VoiceDamageZone

Damage documentation with IICRC water categories.

```typescript
interface VoiceDamageZone {
  id: string;
  type: DamageType;                // 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact'
  category?: '1' | '2' | '3';      // IICRC water damage category
  affected_walls: WallDirection[];
  floor_affected: boolean;
  ceiling_affected: boolean;
  extent_ft: number;               // Distance from affected walls
  source?: string;                 // Damage source description
  polygon?: Point[];               // Custom boundary (overrides wall-extent)
  is_freeform?: boolean;           // Using custom polygon
}
```

### IICRC Water Categories

| Category | Description | Examples |
|----------|-------------|----------|
| 1 | Clean water | Broken supply lines, sink overflows |
| 2 | Gray water | Washing machine discharge, toilet overflow (urine) |
| 3 | Black water | Sewage, flooding from rivers |

### Invariants

1. **At least one affected surface**: walls OR floor OR ceiling
2. **Extent is positive**: Must be > 0
3. **Category for water only**: Only applies to type='water'

---

## Coordinate System

### Conventions

```
            North (y=0)
               |
               |
               v
    West ------+------> East (x increases)
    (x=0)      |
               |
               v
            South (y increases)
```

- **Origin**: Top-left (northwest corner) of room/floor plan
- **X-axis**: Positive east (right)
- **Y-axis**: Positive south (down)
- **Units**: All coordinates in FEET

### Wall Directions

| Direction | Wall Orientation | Normal Vector |
|-----------|------------------|---------------|
| North | Horizontal at y=0 | (0, -1) |
| South | Horizontal at y=length | (0, 1) |
| East | Vertical at x=width | (1, 0) |
| West | Vertical at x=0 | (-1, 0) |

---

## Polygon Winding

All polygons use **counter-clockwise (CCW)** winding order when viewed with Y increasing downward.

### Example: Rectangle

```typescript
// 10' x 12' room
const polygon: Point[] = [
  { x: 0, y: 0 },     // Northwest corner
  { x: 10, y: 0 },    // Northeast corner
  { x: 10, y: 12 },   // Southeast corner
  { x: 0, y: 12 },    // Southwest corner
];
```

### Enforcement

The `ensureCCW()` function normalizes polygons:

```typescript
function ensureCCW(polygon: Point[]): Point[] {
  // Calculate signed area
  let signedArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    signedArea += (polygon[j].x - polygon[i].x) * (polygon[j].y + polygon[i].y);
  }

  // If clockwise (positive area), reverse
  if (signedArea > 0) {
    return polygon.slice().reverse();
  }
  return polygon;
}
```

---

## Calculations

### Area (Shoelace Formula)

```typescript
function calculateArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area / 2);
}
```

### Perimeter

```typescript
function calculatePerimeter(polygon: Point[]): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}
```

### Wall Quantities

```typescript
interface WallQuantities {
  totalLinearFt: number;           // Perimeter minus missing walls
  exteriorLinearFt: number;        // Exterior walls only
  interiorLinearFt: number;        // Interior/shared walls only
  wallAreaSqFt: number;            // Total wall surface area
  openingAreaSqFt: number;         // Total opening area
  netWallAreaSqFt: number;         // Wall area minus openings
}
```

---

## API Invariants

### Mutation Rules

1. **All mutations are undoable**: Every change is recorded in undo stack
2. **Rooms are validated on create/edit**: Invalid geometry is rejected
3. **IDs are immutable**: Room/wall/opening IDs never change after creation
4. **Timestamps are auto-updated**: `updated_at` is set on every mutation

### Query Guarantees

1. **Rooms are always valid**: Polygons are normalized and validated
2. **Walls are derived on-demand**: From current polygon state
3. **Calculations are consistent**: Same inputs produce same outputs
4. **No orphaned entities**: Openings/features always have parent room

### Thread Safety

1. **Single source of truth**: Zustand store is the canonical state
2. **Immutable updates**: All mutations create new objects
3. **Atomic operations**: Multi-step operations are batched

---

## Voice Tool Contracts

### Room Creation

```typescript
// create_room tool guarantees:
// - Returns room ID on success
// - Validates dimensions (min 2', max 100')
// - Generates valid polygon for shape
// - Sets default ceiling height (8')
```

### Room Manipulation

```typescript
// move_room: Changes origin_x/y_ft only, polygon unchanged
// rotate_room: Rotates polygon and openings/features
// copy_room: Creates new room with unique ID
```

### Wall Operations

```typescript
// select_wall: Returns wall ID for subsequent operations
// update_wall_properties: Modifies room dimensions to match
// move_wall: Changes perpendicular dimension
// toggle_wall_missing: Sets wall status without changing geometry
```

### Opening Operations

```typescript
// add_opening: Validates position within wall bounds
// update_opening: Validates new dimensions
// move_opening_along_wall: Clamps to valid range
// delete_opening: Removes from room, undoable
```

---

## Migration Notes

### From Pre-Contract Versions

If migrating from versions before the geometry contract:

1. **Validate all polygons**: Run `ensureCCW()` on all existing polygons
2. **Recalculate dimensions**: Derive width/length from polygon bounds
3. **Normalize positions**: Convert opening positions to numeric feet
4. **Add timestamps**: Set created_at/updated_at if missing

### Breaking Change Policy

After this contract version:

- **No field removals**: Existing fields will not be removed
- **No type changes**: Field types will not change
- **Additions only**: New optional fields may be added
- **Deprecation path**: Any changes require 6-month deprecation notice

---

## Appendix: Complete Type Reference

### All Types

```typescript
// Enums
type RoomShape = 'rectangle' | 'l_shape' | 't_shape' | 'irregular';
type WallDirection = 'north' | 'south' | 'east' | 'west';
type WallType = 'exterior' | 'interior' | 'missing';
type WallOrientation = 'horizontal' | 'vertical';
type OpeningType = 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door';
type FeatureType = 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in';
type DamageType = 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact';
type FlooringType = 'hardwood' | 'carpet' | 'tile' | 'vinyl' | 'laminate' | 'concrete' | 'stone' | 'other';
type PositionType = 'left' | 'center' | 'right' | number;

// Interfaces
interface Point { x: number; y: number; }
interface LShapeConfig { notch_corner: CornerPosition; notch_width_ft: number; notch_length_ft: number; }
interface TShapeConfig { stem_wall: WallDirection; stem_width_ft: number; stem_length_ft: number; stem_position_ft: number; }
interface Opening { id: string; type: OpeningType; wall: WallDirection; width_ft: number; height_ft: number; position: PositionType; position_from?: 'start' | 'end'; sill_height_ft?: number; }
interface Feature { id: string; type: FeatureType; wall: WallDirection | 'freestanding'; width_ft: number; depth_ft: number; position: PositionType; position_from?: 'start' | 'end'; x_offset_ft?: number; y_offset_ft?: number; }
interface VoiceDamageZone { id: string; type: DamageType; category?: '1' | '2' | '3'; affected_walls: WallDirection[]; floor_affected: boolean; ceiling_affected: boolean; extent_ft: number; source?: string; polygon?: Point[]; is_freeform?: boolean; }
interface RoomNote { id: string; target: string; note: string; created_at: string; }
interface WallEntity { id: string; startPoint: Point; endPoint: Point; length_ft: number; height_ft: number; thickness_ft: number; type: WallType; orientation: WallOrientation; direction: WallDirection; roomIds: string[]; isShared: boolean; parentRoomId: string; wallIndex: number; created_at: string; updated_at: string; }
interface WallStatus { wallId: string; roomId: string; direction: WallDirection; isExterior: boolean; isMissing: boolean; length_ft: number; height_ft: number; }
```

---

## Changelog

### v1.0.0 (2026-01-10)

- Initial locked contract
- Room manipulation (move, copy, rotate)
- Opening editing (drag along wall, numeric inputs)
- Multi-select with batch operations
- True grid snapping and alignment guides
- Exterior/missing wall detection
- Sketch completeness indicators
- Full voice parity for all features

---

*This document is the authoritative reference for Claims-IQ-Sketch geometry.*
*All scope and estimate logic MUST conform to this contract.*
