# Sketch UI Architecture

## Wall-First Sketching Model

ClaimsIQ Sketch uses a **wall-first editing paradigm** that aligns with professional estimating tools like Xactimate and Symbility.

### Core Philosophy

Walls are first-class entities that:
- Can be selected directly on the canvas
- Carry dimensional truth (length, height, type)
- Define room boundaries through their geometry
- Drive downstream quantity calculations
- Support shared wall editing between rooms

This matches professional estimating tools and ensures **geometry confidence** - adjusters can trust that the dimensions they see are the dimensions that will be used for scope calculations.

---

## Architecture Overview

### Data Flow

```
Room Geometry → Wall Extraction → Wall Store → Canvas Rendering
                                      ↓
                              Wall Properties Panel
                                      ↓
                              Geometry Updates → Room Updates
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `WallEntity` | `types/geometry.ts` | Wall data model |
| `wall-store.ts` | `services/wall-store.ts` | Wall state management |
| `polygon-math.ts` | `utils/polygon-math.ts` | Wall extraction & math |
| `WallPropertiesPanel` | `components/wall-properties-panel.tsx` | Wall editing UI |
| `SketchCanvasWalls` | `components/sketch-canvas-walls.tsx` | Enhanced canvas |

---

## Wall Entity Model

```typescript
interface WallEntity {
  id: string;

  // Geometry
  startPoint: Point;
  endPoint: Point;
  length_ft: number;
  height_ft: number;      // Usually ceiling height
  thickness_ft: number;   // Default 0.5 ft (6 inches)

  // Classification
  type: 'exterior' | 'interior' | 'missing';
  orientation: 'horizontal' | 'vertical';
  direction: 'north' | 'south' | 'east' | 'west';

  // Room Relationships
  roomIds: string[];      // 1 = exterior, 2 = shared interior
  isShared: boolean;
  parentRoomId?: string;
  wallIndex?: number;
}
```

### Wall Types

| Type | Description | Visual Style |
|------|-------------|--------------|
| `exterior` | Perimeter wall (not shared) | Thick dark stroke (4px) |
| `interior` | Internal wall between rooms | Medium stroke (2px) |
| `missing` | Gap in wall (archway, open plan) | Dashed line |

### Shared Walls

When two rooms share a wall segment:
- `isShared` is `true`
- `roomIds` contains both room IDs
- Editing the wall updates **both** rooms
- Type is forced to `interior`

---

## Wall Selection

### Single Selection
- Click on any wall segment to select it
- Selected wall displays:
  - Thicker stroke
  - Blue highlight color
  - Endpoint indicators (circles)
  - Properties panel opens

### Multi-Selection
- **Shift+Click** to add/remove walls from selection
- Multi-selection shows:
  - Summary statistics
  - Total length
  - Wall type counts

### Hit Testing

Wall hit detection uses perpendicular distance calculation:
- Default tolerance: 8 pixels
- Scales with zoom level
- Priority given to exact hits over proximity

---

## Wall Properties Panel

When a wall is selected, the properties panel displays:

### Editable Properties
- **Length**: Numeric input in feet (updates geometry)
- **Height**: Wall height, inherits ceiling height by default
- **Type**: Interior/Exterior toggle (disabled for shared walls)

### Read-Only Properties
- **Orientation**: Horizontal/Vertical
- **Direction**: Which direction the wall faces (N/S/E/W)
- **Connected Rooms**: List of rooms this wall belongs to
- **Shared Indicator**: Badge shown for shared walls

---

## Wall Move Tool

### Activation
- Select "Move Wall" tool from toolbar (or press `M`)
- Select a wall, then drag

### Behavior
- Wall moves **perpendicular** to its orientation
- Horizontal walls move up/down
- Vertical walls move left/right
- Movement is constrained by:
  - Minimum room size (2 ft)
  - Grid snapping (0.5 ft increments)

### Shared Wall Movement
When moving a shared wall:
- Both connected rooms resize
- One room grows, the other shrinks
- Total area is preserved

---

## Undo/Redo System

All wall edits are reversible through a full undo/redo system:

### Tracked Operations
- `move` - Wall position changes
- `resize` - Wall length changes
- `change_height` - Wall height changes
- `toggle_type` - Interior/exterior changes

### Operation Stack
```typescript
interface WallEditOperation {
  type: 'move' | 'resize' | 'toggle_type' | 'change_height';
  wallId: string;
  previousState: Partial<WallEntity>;
  newState: Partial<WallEntity>;
  affectedRoomIds: string[];
  timestamp: string;
}
```

### Keyboard Shortcuts
- **Ctrl+Z**: Undo
- **Ctrl+Y** / **Ctrl+Shift+Z**: Redo

---

## Visual Styling

### Wall Appearance by State

| State | Stroke Width | Color |
|-------|--------------|-------|
| Exterior | 4px | `#1e293b` (slate-800) |
| Interior | 2px | `#64748b` (slate-500) |
| Missing | 2px dashed | `#94a3b8` (slate-400) |
| Hovered | +1px | `#3b82f6` (blue-500) |
| Selected | +2px | `#2563eb` (blue-600) |

### Room Fill
- Rooms have semi-transparent fill (`bg-white/60`)
- Damage zones overlay in red tint
- Selected rooms have higher z-index

---

## Tool Modes

| Mode | Shortcut | Description |
|------|----------|-------------|
| Select | `V` | Click to select walls or rooms |
| Move Wall | `M` | Drag selected walls to reposition |
| Pan | `Space` | Click and drag to pan canvas |

---

## Integration with Existing System

### Room Compatibility
The wall-first system is **additive** to the existing room system:
- Rooms can still be created, moved, and resized
- Room selection coexists with wall selection
- Selecting a wall deselects rooms (and vice versa)

### Data Persistence
- Walls are **derived** from room polygons
- No separate wall storage needed
- Room updates trigger wall re-derivation

### Voice Sketch Integration
The wall model supports voice commands:
- "Make the north wall 14 feet"
- "Change the living room east wall to exterior"
- "Move the bedroom wall 2 feet north"

---

## Usage Example

```tsx
import SketchCanvasWalls from '@/components/sketch-canvas-walls';

function SketchPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const handleUpdateRoom = (roomId: string, data: Partial<Room>) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, ...data } : r
    ));
  };

  return (
    <SketchCanvasWalls
      rooms={rooms}
      onUpdateRoom={handleUpdateRoom}
      onSelectRoom={setSelectedRoomId}
      selectedRoomId={selectedRoomId}
    />
  );
}
```

---

## Future Enhancements

### Planned Features
- [ ] Wall snapping to parallel walls
- [ ] Auto-alignment guides
- [ ] Wall splitting (divide one wall into two)
- [ ] Wall merging (combine adjacent walls)
- [ ] Wall material properties
- [ ] 3D wall visualization

### Export Compatibility
The wall model is designed to support future export formats:
- Xactimate SKX format
- DXF/DWG CAD formats
- PDF floor plan generation
