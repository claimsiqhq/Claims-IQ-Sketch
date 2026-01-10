# Voice Sketching Documentation

ClaimsIQ voice sketching enables property adjusters to create detailed floor plans and document damage using natural language voice commands.

## Wall-First Voice Editing

ClaimsIQ voice sketching supports full wall-level editing.

Voice commands can:
- Select and modify walls
- Adjust dimensions precisely
- Toggle interior/exterior status
- Edit openings safely
- Move shared walls with confirmation

Voice and UI share the same geometry contract. If an action is available in UI, it is available by voice.

## Wall Selection

Walls can be selected by direction or index:

| Reference | Description |
|-----------|-------------|
| `north` | North wall (top of room) |
| `south` | South wall (bottom of room) |
| `east` | East wall (right side) |
| `west` | West wall (left side) |
| `wall_0` | First wall (north) |
| `wall_1` | Second wall (east) |
| `wall_2` | Third wall (south) |
| `wall_3` | Fourth wall (west) |
| `nearest` | Nearest wall to cursor |

### Example Voice Commands
- "Select the north wall"
- "Select the east wall of the living room"
- "Select wall 2"

## Wall Property Updates

Once a wall is selected, you can modify its properties:

| Property | Description |
|----------|-------------|
| `length_ft` | Wall length in feet (affects room dimensions) |
| `height_ft` | Wall/ceiling height in feet |
| `is_exterior` | Mark wall as exterior (true/false) |
| `is_missing` | Mark wall as missing/open (true/false) |

### Dimension Semantics

The geometry engine uses a consistent coordinate system:
- Room **width** = east-west extent (horizontal)
- Room **length** = north-south extent (vertical)

**When updating wall length (`update_wall_properties`):**
- **North/South walls** run east-west, so their length equals the room's **width**
- **East/West walls** run north-south, so their length equals the room's **length**

**When moving walls (`move_wall`):**
- Moving **North/South walls** in/out changes the room's **length** (pushing north wall out makes room longer)
- Moving **East/West walls** in/out changes the room's **width** (pushing east wall out makes room wider)

This follows the principle: moving a wall affects the dimension **perpendicular** to that wall's orientation.

### Example Voice Commands
- "Make the north wall 15 feet long"
- "Set the ceiling height to 9 feet"
- "Mark the east wall as exterior"
- "The south wall is missing"

## Wall Movement

Walls can be moved to resize rooms:

| Direction | Effect |
|-----------|--------|
| `out` | Expand room (wall moves outward) |
| `in` | Shrink room (wall moves inward) |
| `left` | Move wall left (relative to facing from inside) |
| `right` | Move wall right (relative to facing from inside) |

### Movement Semantics
- Minimum room dimension is 2 feet
- See Dimension Semantics above for axis mappings

### Example Voice Commands
- "Move the north wall out 2 feet"
- "Push the east wall in 1 foot"
- "Extend the south wall outward by 3 feet"

## Opening Modifications

Doors and windows on walls can be updated:

| Property | Description |
|----------|-------------|
| `width_ft` | Opening width in feet |
| `height_ft` | Opening height in feet |
| `sill_height_ft` | Window sill height from floor |
| `type` | Opening type (door, window, sliding_door, etc.) |

### Example Voice Commands
- "Make the door on the north wall 3 feet wide"
- "Change the window height to 4 feet"
- "Set the sill height to 3 feet"
- "Change the first opening on the east wall to a sliding door"

## Undo/Redo Support

All wall-first editing operations support undo:
- Each operation saves the previous state to the undo stack
- Say "undo" to revert the last change
- Multiple undos are supported

## State Synchronization

Wall edits are automatically synchronized:
- Current room state is updated immediately
- Changes propagate to the rooms collection
- Polygon geometry is regenerated after dimension changes
- All changes persist when the sketch is saved

## Tool Reference

### select_wall
Selects a wall for subsequent operations.

```typescript
interface SelectWallParams {
  reference: WallReference;  // 'north'|'south'|'east'|'west'|'nearest'|'wall_N'
  room_name?: string;        // Optional room context
}
```

### update_wall_properties
Updates properties of the selected or specified wall.

```typescript
interface UpdateWallPropertiesParams {
  wall_id?: string;          // Direct wall ID (if not provided, uses selected wall)
  reference?: WallReference; // Alternative: wall direction or index
  room_name?: string;        // Room context when using reference
  length_ft?: number;        // New wall length in feet
  height_ft?: number;        // New wall/ceiling height in feet
  is_exterior?: boolean;     // Mark as exterior wall
  is_missing?: boolean;      // Mark wall as missing/open
}
```

### move_wall
Moves a wall to resize the room.

```typescript
interface MoveWallParams {
  wall_id?: string;          // Direct wall ID (if not provided, uses selected wall)
  reference?: WallReference; // Alternative: wall direction or index
  room_name?: string;        // Room context when using reference
  offset_ft: number;         // Distance to move in feet
  direction: 'in' | 'out' | 'left' | 'right'; // Move direction
}
```

### update_opening
Modifies a door or window on a wall.

```typescript
interface UpdateOpeningParams {
  opening_id?: string;       // Direct opening ID
  wall?: WallDirection;      // Find opening by wall direction
  opening_index?: number;    // Index if multiple openings on same wall (0-based)
  width_ft?: number;         // New width in feet
  height_ft?: number;        // New height in feet
  sill_height_ft?: number;   // New sill height from floor (windows)
  type?: OpeningType;        // Opening type (door, window, sliding_door, etc.)
}
```

### Type Definitions

```typescript
type WallDirection = 'north' | 'south' | 'east' | 'west';
type WallReference = WallDirection | 'nearest' | `wall_${number}`;
type OpeningType = 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door';
```

## Architecture

The wall-first editing system is implemented in:
- `client/src/features/voice-sketch/types/geometry.ts` - Type definitions
- `client/src/features/voice-sketch/services/geometry-engine.ts` - State management and operations
- `client/src/features/voice-sketch/agents/room-sketch-agent.ts` - AI agent tool definitions

The geometry engine uses Zustand for state management with full undo/redo support via an undo stack pattern.
