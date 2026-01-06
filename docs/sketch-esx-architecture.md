# Claims iQ Sketch & ESX Export Architecture

## Overview

This document describes the architecture of the Claims iQ Sketch system and its ESX (Xactimate Exchange) export capabilities. The system is designed around a **voice-first** approach where spoken room descriptions are converted to canonical geometry that can be rendered, edited, and exported.

## Key Design Principles

1. **Voice-First Input**: Voice-driven sketch creation is the primary input method
2. **Canonical Geometry Model**: All sketches resolve to a server-side geometry model stored in feet
3. **Deterministic Export**: ESX exports are standards-compliant ZIP archives
4. **Tier A ESX Export**: We generate importable ESX files without requiring Verisk partner SDKs

## ESX Export Philosophy

### Why Tier A Export (Read-Only Import)?

The ESX export in Claims iQ generates **import-ready** ESX files that Xactimate can read. This means:

- Claim metadata imports correctly
- Line items import with room/level grouping
- Sketch renders as a PDF underlay (visible but not editable as Xactimate sketch objects)

### Why Not Editable Xactimate Sketches?

Editable Xactimate sketches (SKX format) require:
- Proprietary Verisk partner SDK access
- Complex binary/XML encoding not publicly documented
- Ongoing compatibility maintenance with Xactimate versions

The Tier A approach provides 95% of the value (full estimate data, visual sketch reference) without the proprietary dependencies.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        Voice Input                               │
│  (OpenAI Realtime API → Room Sketch Agent → Geometry Engine)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Canonical Geometry Model                       │
│  - estimate_zones (polygons in feet, CCW winding)               │
│  - zone_openings (doors, windows with wall positions)           │
│  - zone_connections (room-to-room relationships)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Geometry Normalization                          │
│  - Polygon validation (closure, winding)                        │
│  - Wall derivation from polygon edges                           │
│  - Opening placement validation                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ESX Export                                  │
│  - XACTDOC.XML (claim metadata)                                 │
│  - GENERIC_ROUGHDRAFT.XML (estimate hierarchy + line items)     │
│  - SKETCH_UNDERLAY.PDF (visual floorplan)                       │
│  - Photos (JPG files)                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### Hierarchy

```
Claim
  └── Estimate
        └── Coverage (A/B/C/D)
              └── Structure (Main Dwelling, Garage, etc.)
                    └── Area (Interior, Exterior, Roofing)
                          └── Zone (Room/Space)
                                ├── Line Items
                                ├── Openings (doors, windows)
                                └── Connections (to other zones)
```

### Zone Geometry (estimate_zones)

Each zone stores:
- `polygon_ft`: JSONB array of `{x, y}` coordinates in feet (CCW order)
- `origin_x_ft`, `origin_y_ft`: Position in floor plan coordinate space
- `ceiling_height_ft`: Room height
- `shape_type`: RECT | L | T | POLY (for UI rendering hints)
- `level_name`: Floor level grouping (Main Level, Upper Level, Basement)

### Zone Openings (zone_openings)

Openings reference walls by index:
- `wall_index`: Index into polygon edge (0 = edge from point 0 to point 1)
- `offset_from_vertex_ft`: Distance along wall from starting vertex
- `width_ft`, `height_ft`: Opening dimensions
- `opening_type`: door | window | cased_opening

### Zone Connections (zone_connections)

Room-to-room relationships:
- `from_zone_id`, `to_zone_id`: Connected zones
- `connection_type`: door | opening | shared_wall

## Voice Sketch Flow

1. **Voice Input**: User speaks room dimensions and features
2. **AI Processing**: OpenAI Realtime API processes speech
3. **Geometry Engine**: Client-side Zustand store builds room geometry
4. **Canonical Conversion**: Polygon coordinates normalized to feet
5. **Server Persistence**: API saves to `claim_rooms` (pre-estimate) or `estimate_zones` (estimate)
6. **Rendering**: Canvas component renders from feet-based geometry

## ESX Export Structure

```
estimate_12345.esx (ZIP file)
├── XACTDOC.XML           # Claim metadata and headers
├── GENERIC_ROUGHDRAFT.XML # Estimate data with line items
├── SKETCH_UNDERLAY.PDF   # Visual floorplan rendering
├── 1.JPG                 # Photo attachments (optional)
├── 2.JPG
└── ...
```

### XACTDOC.XML Contents
- Claim number and date of loss
- Property address
- Policy information
- Insured and adjuster details
- Assignment identifiers

### GENERIC_ROUGHDRAFT.XML Contents
- Estimate totals (RCV, ACV, depreciation)
- Level hierarchy (Main Level, Upper Level, etc.)
- Room groupings with dimensions
- Line items with category, selector, action codes
- Quantities, units, and pricing

### SKETCH_UNDERLAY.PDF Contents
- Room polygons rendered to scale
- Room names and dimensions
- Door/window indicators
- Scale legend
- North indicator

## Future: Editable Sketch Encoder Interface

For future integration with Verisk partner SDKs or alternative sketch formats:

```typescript
interface EditableSketchEncoder {
  encode(geometry: SketchGeometry): {
    filename: string
    data: Buffer
  }[]
}
```

This interface allows plugging in different encoders without modifying the core export logic.

## File References

| Component | Location |
|-----------|----------|
| Database Schema | `/shared/schema.ts` |
| ESX Export Service | `/server/services/esxExport.ts` |
| Report Generator | `/server/services/reportGenerator.ts` |
| Geometry Normalization | `/shared/geometry/index.ts` |
| Sketch Canvas | `/client/src/components/sketch-canvas.tsx` |
| Voice Geometry Engine | `/client/src/features/voice-sketch/services/geometry-engine.ts` |
| Geometry Types | `/client/src/features/voice-sketch/types/geometry.ts` |
| Sketch Tools API | `/server/services/sketchTools.ts` |
