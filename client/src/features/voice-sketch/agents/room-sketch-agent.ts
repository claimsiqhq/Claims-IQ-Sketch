// Room Sketch Voice Agent
// RealtimeAgent for voice-driven room sketching with OpenAI Agents SDK
//
// Prompts are loaded dynamically from the database via /api/prompts/voice.room_sketch/config
// This ensures the database is the single source of truth for all AI prompts.

import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { geometryEngine } from '../services/geometry-engine';
import { useFloorPlanEngine } from '../services/floor-plan-engine';

// Prompt cache to avoid repeated API calls
let cachedInstructions: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache

/**
 * Fetch prompt instructions from the database API
 * Returns cached version if available and not expired
 * Throws error if prompt not available - database is the ONLY source
 */
async function fetchInstructionsFromAPI(): Promise<string> {
  // Check cache first
  const now = Date.now();
  if (cachedInstructions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedInstructions;
  }

  const response = await fetch('/api/prompts/voice.room_sketch/config', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(
      `[RoomSketchAgent] Failed to fetch prompt from database (HTTP ${response.status}). ` +
      `The prompt "voice.room_sketch" must exist in the ai_prompts table.`
    );
  }

  const data = await response.json();
  const systemPrompt = data.config?.systemPrompt;
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    throw new Error(
      `[RoomSketchAgent] No systemPrompt found in database response. ` +
      `Check that the "voice.room_sketch" prompt is properly configured in ai_prompts.`
    );
  }

  cachedInstructions = systemPrompt;
  cacheTimestamp = now;
  console.log('[RoomSketchAgent] Loaded instructions from database');
  return systemPrompt;
}

/**
 * Get personalized instructions with user name substitution
 */
function personalizeInstructions(instructions: string, userName?: string): string {
  const displayName = userName || 'there';
  return instructions.replace(/\{userName\}/g, displayName);
}

// Tool: Create a new structure (building/detached structure)
const createStructureTool = tool({
  name: 'create_structure',
  description: `Create a new structure to organize rooms. Use this when starting to document a building like "Main House", "Detached Garage", "Guest House", etc.

Structures help organize rooms hierarchically - rooms added after creating a structure will automatically be associated with it.

Common structure types:
- main_dwelling: Main house, primary residence
- detached_garage: Standalone garage building
- shed: Storage shed, workshop
- guest_house: Separate living quarters
- pool_house: Pool cabana or pool house
- barn: Agricultural building
- other: Any other detached structure`,
  parameters: z.object({
    name: z.string().describe('Name for the structure, e.g., "Main House", "Detached Garage", "Guest House"'),
    type: z.enum(['main_dwelling', 'detached_garage', 'attached_garage', 'shed', 'guest_house', 'pool_house', 'barn', 'other']).describe('Type of structure'),
    description: z.string().optional().describe('Optional description of the structure'),
    stories: z.number().optional().describe('Number of stories (floors)'),
    yearBuilt: z.number().optional().describe('Year the structure was built'),
    constructionType: z.string().optional().describe('Construction type, e.g., "wood frame", "masonry", "steel"'),
    roofType: z.string().optional().describe('Roof type, e.g., "asphalt shingle", "tile", "metal"'),
  }),
  execute: async (params) => {
    return geometryEngine.createStructure(params);
  },
});

// Tool: Edit an existing structure
const editStructureTool = tool({
  name: 'edit_structure',
  description: `Edit properties of an existing structure like name, type, number of stories, etc.
  
Use this when the adjuster wants to correct or update structure information.`,
  parameters: z.object({
    structure_name: z.string().optional().describe('Name of the structure to edit'),
    structure_id: z.string().optional().describe('ID of the structure to edit (if known)'),
    new_name: z.string().optional().describe('New name for the structure'),
    new_type: z.enum(['main_dwelling', 'detached_garage', 'attached_garage', 'shed', 'guest_house', 'pool_house', 'barn', 'other']).optional().describe('New type of structure'),
    new_description: z.string().optional().describe('New description of the structure'),
    new_stories: z.number().optional().describe('New number of stories'),
  }),
  execute: async (params) => {
    return geometryEngine.editStructure(params);
  },
});

// Tool: Delete a structure
const deleteStructureTool = tool({
  name: 'delete_structure',
  description: `Delete a structure and all its associated rooms. Use with caution - this removes all rooms within the structure.
  
Use when the adjuster wants to remove a structure they added by mistake or no longer needs.`,
  parameters: z.object({
    structure_name: z.string().optional().describe('Name of the structure to delete'),
    structure_id: z.string().optional().describe('ID of the structure to delete (if known)'),
  }),
  execute: async (params) => {
    return geometryEngine.deleteStructure(params);
  },
});

// Tool: Select an existing structure
const selectStructureTool = tool({
  name: 'select_structure',
  description: `Select an existing structure to add rooms to it. Use this when switching between structures, e.g., "Now let's do the garage".

Rooms created after selecting a structure will be associated with that structure.`,
  parameters: z.object({
    structure_name: z.string().optional().describe('Name of the structure to select'),
    structure_id: z.string().optional().describe('ID of the structure to select (if known)'),
  }),
  execute: async (params) => {
    return geometryEngine.selectStructure(params);
  },
});

// Tool: Create a new room
const createRoomTool = tool({
  name: 'create_room',
  description: `Initialize a new room with basic shape and dimensions. Call this first when the adjuster starts describing a new room.

For L-SHAPED rooms (shape='l_shape'):
- Think of it as a rectangle with one corner cut out
- Provide the OVERALL bounding box dimensions (width_ft, length_ft)
- Use l_shape_config to specify which corner is cut out and the notch size
- notch_corner: 'northeast', 'northwest', 'southeast', or 'southwest'
- notch_width_ft: how wide the cutout is (along width axis)
- notch_length_ft: how deep the cutout is (along length axis)

For T-SHAPED rooms (shape='t_shape'):  
- Think of it as a rectangle with a stem extending from one wall
- Provide the MAIN body dimensions (width_ft, length_ft)
- Use t_shape_config to specify the stem
- stem_wall: which wall the stem extends from ('north', 'south', 'east', 'west')
- stem_width_ft: width of the stem (perpendicular to the wall)
- stem_length_ft: how far the stem extends out
- stem_position_ft: position along the wall where stem starts (from west corner for N/S walls, from north corner for E/W walls)`,
  parameters: z.object({
    name: z.string().describe('Room identifier like master_bedroom, kitchen, bathroom_1, living_room'),
    shape: z.enum(['rectangle', 'l_shape', 't_shape', 'irregular']).describe('Room shape - most rooms are rectangle'),
    width_ft: z.number().describe('Width in feet (overall bounding box for L-shape, main body for T-shape)'),
    length_ft: z.number().describe('Length in feet (overall bounding box for L-shape, main body for T-shape)'),
    ceiling_height_ft: z.number().default(8).describe('Ceiling height, defaults to 8ft if not specified'),
    flooring_type: z.enum(['hardwood', 'carpet', 'tile', 'vinyl', 'laminate', 'concrete', 'stone', 'other']).optional().describe('Type of flooring in the room'),
    l_shape_config: z.object({
      notch_corner: z.enum(['northeast', 'northwest', 'southeast', 'southwest']).describe('Which corner has the cutout'),
      notch_width_ft: z.number().describe('Width of the notch along the width axis'),
      notch_length_ft: z.number().describe('Length of the notch along the length axis'),
    }).optional().describe('Configuration for L-shaped rooms - which corner is cut out and notch dimensions'),
    t_shape_config: z.object({
      stem_wall: z.enum(['north', 'south', 'east', 'west']).describe('Which wall the stem extends from'),
      stem_width_ft: z.number().describe('Width of the stem'),
      stem_length_ft: z.number().describe('How far the stem extends out from the main body'),
      stem_position_ft: z.number().describe('Position along the wall where stem starts'),
    }).optional().describe('Configuration for T-shaped rooms - stem location and dimensions'),
    polygon: z.array(z.object({
      x: z.number(),
      y: z.number()
    })).optional().describe('For irregular rooms: array of corner coordinates in feet relative to start (0,0). Each point defines a vertex of the room polygon.'),
  }),
  execute: async (params) => {
    return geometryEngine.createRoom(params);
  },
});

// Tool: Add door, window, or archway
const addOpeningTool = tool({
  name: 'add_opening',
  description: 'Add a door, window, or archway to a wall. Standard door width is 3ft, standard window width is 3ft.',
  parameters: z.object({
    type: z.enum(['door', 'window', 'archway', 'sliding_door', 'french_door']).describe('Type of opening'),
    wall: z.enum(['north', 'south', 'east', 'west']).describe('Which wall - north is the wall adjuster is facing when entering'),
    width_ft: z.number().describe('Width in feet. Standard door is 3ft, standard window is 3ft'),
    height_ft: z.number().optional().describe('Height in feet. Default 6.67 for doors, 4 for windows'),
    position: z.union([
      z.enum(['left', 'center', 'right']),
      z.number().describe('Feet from the reference point')
    ]).describe('Position on the wall - left, center, right, or specific feet measurement'),
    position_from: z.enum(['start', 'end']).default('start').describe('Where to measure position from. "start" = beginning of wall (north/west corner), "end" = end of wall (south/east corner). CRITICAL: Use "end" when adjuster says "X feet from south wall" on east/west walls, or "X feet from east wall" on north/south walls.'),
    sill_height_ft: z.number().optional().describe('For windows, height from floor to bottom of window. Default 3ft'),
  }),
  execute: async (params) => {
    return geometryEngine.addOpening(params);
  },
});

// Tool: Add closet, alcove, bump-out, or built-in
const addFeatureTool = tool({
  name: 'add_feature',
  description: `Add architectural features to the room.

WALL-EMBEDDED features (closet, alcove, pantry, bump_out, fireplace, built_in):
- These extend OUTWARD from the room, BEYOND the wall boundary (not into the room)
- Set wall to north/south/east/west (which wall the opening is on)
- width_ft = opening width along the wall
- depth_ft = how deep the feature extends OUTWARD from the wall (AWAY from room interior)
- Example: A closet on the east wall extends EAST, beyond the room's east boundary

FREESTANDING features (island, peninsula):
- These sit on the floor, not attached to walls
- Set wall='freestanding'
- width_ft and depth_ft = the footprint dimensions
- Use x_offset_ft and y_offset_ft for precise positioning:
  - x_offset_ft = distance from west wall (left edge of room)
  - y_offset_ft = distance from south wall (bottom edge of room)
- If no offsets provided, defaults to centered`,
  parameters: z.object({
    type: z.enum(['closet', 'alcove', 'bump_out', 'island', 'peninsula', 'fireplace', 'built_in']).describe('Type of feature. Use "closet" for pantries.'),
    wall: z.enum(['north', 'south', 'east', 'west', 'freestanding']).describe('Which wall the feature opening is on (feature extends OUTWARD from this wall), or "freestanding" for islands/peninsulas'),
    width_ft: z.number().describe('Width in feet (along the wall for wall features, or footprint width for islands)'),
    depth_ft: z.number().describe('Depth in feet. For wall features: how far the feature extends OUTWARD/BEYOND the wall (away from room interior). For islands: footprint depth.'),
    position: z.union([
      z.enum(['left', 'center', 'right']),
      z.number().describe('Feet from the reference point')
    ]).describe('Position along the wall - left, center, right, or specific feet measurement'),
    position_from: z.enum(['start', 'end']).default('start').describe('Where to measure position from. "start" = beginning of wall (north/west corner), "end" = end of wall (south/east corner). CRITICAL: Use "end" when adjuster says "X feet from south wall" on east/west walls, or "X feet from east wall" on north/south walls.'),
    x_offset_ft: z.number().optional().describe('For freestanding features: distance from west wall (left edge of room) in feet. Use when adjuster specifies distance from east or west wall.'),
    y_offset_ft: z.number().optional().describe('For freestanding features: distance from south wall (bottom edge of room) in feet. Use when adjuster specifies distance from north or south wall.'),
  }),
  execute: async (params) => {
    return geometryEngine.addFeature(params);
  },
});

// Tool: Mark damage zone (critical for insurance claims)
const markDamageTool = tool({
  name: 'mark_damage',
  description: `Define a damage zone for insurance claim documentation. CRITICAL: For water damage, always determine the IICRC category (1, 2, or 3). IMPORTANT: If user does not specify extent, use 2 feet as default.

For WALL-BASED damage (most common):
- Specify affected_walls and extent_ft
- A polygon will be auto-generated from wall-extent data

For FREEFORM damage (irregular shapes not following walls):
- Set is_freeform=true
- Provide polygon as array of points [{x: feet, y: feet}, ...]
- Polygon coordinates are in room-relative feet (0,0 is northwest corner)
- Can still specify affected_walls for reference but polygon takes precedence`,
  parameters: z.object({
    type: z.enum(['water', 'fire', 'smoke', 'mold', 'wind', 'impact']).describe('Type of damage'),
    category: z.enum(['1', '2', '3']).optional().describe('IICRC category for water damage: 1=clean water, 2=gray water, 3=black water'),
    affected_walls: z.array(z.enum(['north', 'south', 'east', 'west'])).describe('Which walls are affected (required for wall-based, optional for freeform)'),
    floor_affected: z.boolean().default(true).describe('Is the floor affected?'),
    ceiling_affected: z.boolean().default(false).describe('Is the ceiling affected?'),
    extent_ft: z.number().default(2).describe('How far the damage extends from the wall in feet. Default 2 feet if not specified by user.'),
    source: z.string().optional().describe('Source of damage, e.g., "burst pipe under sink", "roof leak", "adjacent bathroom"'),
    polygon: z.array(z.object({
      x: z.number().describe('X coordinate in feet from west wall'),
      y: z.number().describe('Y coordinate in feet from north wall'),
    })).optional().describe('Custom polygon for freeform damage zones. Overrides wall-extent calculation.'),
    is_freeform: z.boolean().optional().describe('Set true for irregular damage zones not attached to walls'),
  }),
  execute: async (params) => {
    return geometryEngine.markDamage(params);
  },
});

// Tool: Modify existing dimension
const modifyDimensionTool = tool({
  name: 'modify_dimension',
  description: 'Adjust an existing measurement when the adjuster provides a correction.',
  parameters: z.object({
    target: z.string().describe('What to modify: room_width, room_length, ceiling_height, opening_0, feature_0, etc.'),
    new_value_ft: z.number().describe('New value in feet'),
  }),
  execute: async (params) => {
    return geometryEngine.modifyDimension(params);
  },
});

// Tool: Add note to room or feature
const addNoteTool = tool({
  name: 'add_note',
  description: 'Attach an observation or note to the room, a wall, feature, or damage zone.',
  parameters: z.object({
    target: z.string().describe('What to attach the note to: room, wall_north, closet, damage_zone, etc.'),
    note: z.string().describe('The note content'),
  }),
  execute: async (params) => {
    return geometryEngine.addNote(params);
  },
});

// Tool: Undo last action
const undoTool = tool({
  name: 'undo',
  description: 'Undo the last action when the adjuster wants to correct something.',
  parameters: z.object({
    steps: z.number().default(1).describe('Number of steps to undo, default 1'),
  }),
  execute: async (params) => {
    return geometryEngine.undo(params.steps ?? 1);
  },
});

// Tool: Confirm room and prepare for next
const confirmRoomTool = tool({
  name: 'confirm_room',
  description: 'Finalize current room sketch and optionally prepare for the next room.',
  parameters: z.object({
    ready_for_next: z.boolean().describe('Whether the adjuster is ready to start the next room'),
  }),
  execute: async (params) => {
    return geometryEngine.confirmRoom(params);
  },
});

// Tool: Delete a room entirely
const deleteRoomTool = tool({
  name: 'delete_room',
  description: 'Delete a room entirely. Use when the adjuster wants to start over or remove a room completely.',
  parameters: z.object({
    room_name: z.string().optional().describe('Name of the room to delete. If not specified, deletes the current room being edited.'),
  }),
  execute: async (params) => {
    return geometryEngine.deleteRoom(params);
  },
});

// Tool: Edit room properties
const editRoomTool = tool({
  name: 'edit_room',
  description: `Edit room properties like name, shape, dimensions, flooring, or L/T shape configurations. Use when the adjuster wants to correct or change room details.

For L-shaped rooms, you can update the notch configuration:
- new_l_shape_config to change which corner is cut out or notch dimensions

For T-shaped rooms, you can update the stem configuration:
- new_t_shape_config to change stem wall, dimensions, or position`,
  parameters: z.object({
    room_name: z.string().optional().describe('Name of the room to edit. If not specified, edits the current room.'),
    new_name: z.string().optional().describe('New name for the room'),
    new_shape: z.enum(['rectangle', 'l_shape', 't_shape', 'irregular']).optional().describe('New shape for the room'),
    new_width_ft: z.number().optional().describe('New width in feet'),
    new_length_ft: z.number().optional().describe('New length in feet'),
    new_ceiling_height_ft: z.number().optional().describe('New ceiling height in feet'),
    new_flooring_type: z.enum(['hardwood', 'carpet', 'tile', 'vinyl', 'laminate', 'concrete', 'stone', 'other']).optional().describe('New flooring type for the room'),
    new_l_shape_config: z.object({
      notch_corner: z.enum(['northeast', 'northwest', 'southeast', 'southwest']).optional().describe('Which corner has the cutout'),
      notch_width_ft: z.number().optional().describe('Width of the notch along the width axis'),
      notch_length_ft: z.number().optional().describe('Length of the notch along the length axis'),
    }).optional().describe('Update L-shape configuration'),
    new_t_shape_config: z.object({
      stem_wall: z.enum(['north', 'south', 'east', 'west']).optional().describe('Which wall the stem extends from'),
      stem_width_ft: z.number().optional().describe('Width of the stem'),
      stem_length_ft: z.number().optional().describe('How far the stem extends out'),
      stem_position_ft: z.number().optional().describe('Position along the wall where stem starts'),
    }).optional().describe('Update T-shape configuration'),
  }),
  execute: async (params) => {
    return geometryEngine.editRoom(params);
  },
});

// Tool: Delete an opening (door, window, etc.)
const deleteOpeningTool = tool({
  name: 'delete_opening',
  description: 'Delete a door, window, or other opening from the current room. Can identify by wall, type, or index.',
  parameters: z.object({
    wall: z.enum(['north', 'south', 'east', 'west']).optional().describe('Which wall the opening is on'),
    type: z.enum(['door', 'window', 'archway', 'sliding_door', 'french_door']).optional().describe('Type of opening to delete'),
    opening_index: z.number().optional().describe('Index of the opening (0-based) if there are multiple'),
  }),
  execute: async (params) => {
    return geometryEngine.deleteOpening(params);
  },
});

// Tool: Delete a feature (closet, island, etc.)
const deleteFeatureTool = tool({
  name: 'delete_feature',
  description: 'Delete a feature like a closet, island, or fireplace from the current room.',
  parameters: z.object({
    type: z.enum(['closet', 'alcove', 'bump_out', 'island', 'peninsula', 'fireplace', 'built_in']).optional().describe('Type of feature to delete'),
    feature_index: z.number().optional().describe('Index of the feature (0-based) if there are multiple of the same type'),
  }),
  execute: async (params) => {
    return geometryEngine.deleteFeature(params);
  },
});

// Tool: Edit damage zone properties
const editDamageZoneTool = tool({
  name: 'edit_damage_zone',
  description: 'Edit properties of a damage zone. Use when adjuster needs to correct damage category, extent, source, affected areas, or polygon boundary.',
  parameters: z.object({
    damage_index: z.number().optional().describe('Index of the damage zone to edit (0-based). If room has only one damage zone, not needed.'),
    new_type: z.enum(['water', 'fire', 'smoke', 'mold', 'wind', 'impact']).optional().describe('New damage type'),
    new_category: z.enum(['1', '2', '3']).optional().describe('New IICRC category for water damage'),
    new_affected_walls: z.array(z.enum(['north', 'south', 'east', 'west'])).optional().describe('New list of affected walls'),
    new_floor_affected: z.boolean().optional().describe('Whether floor is affected'),
    new_ceiling_affected: z.boolean().optional().describe('Whether ceiling is affected'),
    new_extent_ft: z.number().optional().describe('New extent in feet'),
    new_source: z.string().optional().describe('New source description'),
    new_polygon: z.array(z.object({
      x: z.number().describe('X coordinate in feet from west wall'),
      y: z.number().describe('Y coordinate in feet from north wall'),
    })).optional().describe('New polygon boundary for the damage zone'),
    new_is_freeform: z.boolean().optional().describe('Whether the damage zone is freeform'),
  }),
  execute: async (params) => {
    return geometryEngine.editDamageZone(params);
  },
});

// Tool: Delete a damage zone
const deleteDamageZoneTool = tool({
  name: 'delete_damage_zone',
  description: 'Delete a damage zone from the current room. Use when adjuster wants to remove a damage zone they added by mistake or no longer needs.',
  parameters: z.object({
    damage_index: z.number().optional().describe('Index of the damage zone to delete (0-based). If room has only one damage zone, not needed.'),
    type: z.enum(['water', 'fire', 'smoke', 'mold', 'wind', 'impact']).optional().describe('Type of damage zone to delete if multiple exist'),
  }),
  execute: async (params) => {
    return geometryEngine.deleteDamageZone(params);
  },
});

// ============================================
// WALL-FIRST EDITING TOOLS
// ============================================

// Tool: Select a wall by direction, index, or proximity
const selectWallTool = tool({
  name: 'select_wall',
  description: `Select a wall for editing. Use this before modifying wall properties.

Select by direction (most common):
- "north", "south", "east", "west" - Select wall by cardinal direction

Select by index:
- "wall_0", "wall_1", "wall_2", etc. - Select by polygon index

Select by proximity:
- "nearest" - Select closest wall to current focus

For multi-room properties, optionally specify room_name to clarify which room's wall.`,
  parameters: z.object({
    reference: z.union([
      z.enum(['north', 'south', 'east', 'west', 'nearest']),
      z.string().regex(/^wall_\d+$/).describe('Wall by index, e.g., "wall_0", "wall_3"'),
    ]).describe('How to identify the wall'),
    room_name: z.string().optional().describe('Room name for context if multiple rooms exist'),
  }),
  execute: async (params) => {
    return geometryEngine.selectWall({
      reference: params.reference as any,
      room_name: params.room_name,
    });
  },
});

// Tool: Update wall properties
const updateWallPropertiesTool = tool({
  name: 'update_wall_properties',
  description: `Update properties of a wall. Use after selecting a wall with select_wall.

Properties you can update:
- length_ft: Change wall length (will adjust room dimensions)
- height_ft: Change wall height (usually ceiling height)
- is_exterior: Mark as exterior wall (affects quantities)
- is_missing: Mark as missing wall (open to adjacent space)

SAFETY: Changing length affects room area calculations. Changing to exterior affects exterior quantities.`,
  parameters: z.object({
    wall_id: z.string().optional().describe('Wall ID (if known)'),
    reference: z.union([
      z.enum(['north', 'south', 'east', 'west', 'nearest']),
      z.string().regex(/^wall_\d+$/),
    ]).optional().describe('Alternative to wall_id - identify by direction'),
    room_name: z.string().optional().describe('Room name for context'),
    length_ft: z.number().optional().describe('New wall length in feet'),
    height_ft: z.number().optional().describe('New wall height in feet'),
    is_exterior: z.boolean().optional().describe('Mark as exterior wall'),
    is_missing: z.boolean().optional().describe('Mark as missing wall'),
  }),
  execute: async (params) => {
    return geometryEngine.updateWallProperties({
      wall_id: params.wall_id,
      reference: params.reference as any,
      room_name: params.room_name,
      length_ft: params.length_ft,
      height_ft: params.height_ft,
      is_exterior: params.is_exterior,
      is_missing: params.is_missing,
    });
  },
});

// Tool: Move a wall
const moveWallTool = tool({
  name: 'move_wall',
  description: `Move a wall perpendicular to its orientation. Use for adjusting room dimensions without recreating.

SHARED WALL WARNING: If the wall is shared between rooms, BOTH rooms will be affected.
Before moving shared walls, ask for confirmation: "This wall is shared with the kitchen. Move it for both rooms?"

Direction meanings:
- "in" - Move wall inward (shrink room)
- "out" - Move wall outward (expand room)
- "left" / "right" - For vertical walls, moves left or right`,
  parameters: z.object({
    wall_id: z.string().optional().describe('Wall ID (if known)'),
    reference: z.union([
      z.enum(['north', 'south', 'east', 'west', 'nearest']),
      z.string().regex(/^wall_\d+$/),
    ]).optional().describe('Alternative to wall_id - identify by direction'),
    room_name: z.string().optional().describe('Room name for context'),
    offset_ft: z.number().describe('How far to move the wall in feet'),
    direction: z.enum(['in', 'out', 'left', 'right']).describe('Direction to move the wall'),
  }),
  execute: async (params) => {
    return geometryEngine.moveWall({
      wall_id: params.wall_id,
      reference: params.reference as any,
      room_name: params.room_name,
      offset_ft: params.offset_ft,
      direction: params.direction,
    });
  },
});

// Tool: Update opening properties
const updateOpeningTool = tool({
  name: 'update_opening',
  description: `Update properties of an existing door, window, or opening. Use to correct dimensions without recreating.

Identify the opening by:
- opening_id if known
- wall + opening_index (e.g., "east wall, second opening")
- Just wall if only one opening on that wall`,
  parameters: z.object({
    opening_id: z.string().optional().describe('Opening ID if known'),
    wall: z.enum(['north', 'south', 'east', 'west']).optional().describe('Wall the opening is on'),
    opening_index: z.number().optional().describe('Index of opening on the wall (0-based)'),
    width_ft: z.number().optional().describe('New width in feet'),
    height_ft: z.number().optional().describe('New height in feet'),
    sill_height_ft: z.number().optional().describe('For windows: new sill height'),
    type: z.enum(['door', 'window', 'archway', 'sliding_door', 'french_door']).optional().describe('Change opening type'),
  }),
  execute: async (params) => {
    return geometryEngine.updateOpening({
      opening_id: params.opening_id,
      wall: params.wall,
      opening_index: params.opening_index,
      width_ft: params.width_ft,
      height_ft: params.height_ft,
      sill_height_ft: params.sill_height_ft,
      type: params.type,
    });
  },
});

// Floor Plan Tools
const createFloorPlanTool = tool({
  name: 'create_floor_plan',
  description: 'Start a new floor plan to arrange multiple rooms. Call this when starting a multi-room sketch.',
  parameters: z.object({
    name: z.string().describe('Name for the floor plan, e.g., "First Floor", "Ground Level", "Main House"'),
    level: z.number().default(0).describe('Floor level: 0=ground, 1=second floor, -1=basement'),
  }),
  execute: async (params) => {
    const engine = useFloorPlanEngine.getState();
    return engine.createFloorPlan(params.name, params.level);
  },
});

const addRoomToPlanTool = tool({
  name: 'add_room_to_plan',
  description: `Add a room to the current floor plan. The room must already be created with create_room.
  
Position can be:
- Absolute: provide position_x_ft and position_y_ft
- Relative: provide relative_to (room name) and direction (north/south/east/west of that room)
- Auto: first room defaults to (0,0), subsequent rooms auto-position based on relative_to`,
  parameters: z.object({
    room_name: z.string().describe('Name of the room to add (must match a created room)'),
    position_x_ft: z.number().optional().describe('Absolute X position in feet'),
    position_y_ft: z.number().optional().describe('Absolute Y position in feet'),
    relative_to: z.string().optional().describe('Name of room to position relative to'),
    direction: z.enum(['north', 'south', 'east', 'west']).optional().describe('Direction from the relative room'),
  }),
  execute: async (params) => {
    const room = geometryEngine.getRoomByName(params.room_name);
    if (!room) {
      return `Error: Room "${params.room_name}" not found. Create it first with create_room.`;
    }
    const engine = useFloorPlanEngine.getState();
    return engine.addRoomToFloorPlan({
      room_name: params.room_name,
      position_x_ft: params.position_x_ft,
      position_y_ft: params.position_y_ft,
      relative_to: params.relative_to,
      direction: params.direction,
    }, room);
  },
});

const connectRoomsTool = tool({
  name: 'connect_rooms',
  description: `Connect two rooms with a door, archway, or hallway. This creates a logical and visual connection between rooms.
  
Example: "Connect the living room to the kitchen through a doorway on the east wall"`,
  parameters: z.object({
    from_room_name: z.string().describe('Name of the first room'),
    from_wall: z.enum(['north', 'south', 'east', 'west']).describe('Wall of the first room where connection is'),
    from_position_ft: z.number().optional().describe('Position along the wall in feet from start'),
    to_room_name: z.string().describe('Name of the second room'),
    to_wall: z.enum(['north', 'south', 'east', 'west']).describe('Wall of the second room where connection is'),
    to_position_ft: z.number().optional().describe('Position along the wall in feet from start'),
    connection_type: z.enum(['door', 'archway', 'hallway', 'stairway']).describe('Type of connection'),
  }),
  execute: async (params) => {
    const engine = useFloorPlanEngine.getState();
    return engine.connectRooms({
      from_room_name: params.from_room_name,
      from_wall: params.from_wall,
      from_position_ft: params.from_position_ft,
      to_room_name: params.to_room_name,
      to_wall: params.to_wall,
      to_position_ft: params.to_position_ft,
      connection_type: params.connection_type,
    });
  },
});

const moveRoomTool = tool({
  name: 'move_room',
  description: 'Move a room to a new position in the floor plan.',
  parameters: z.object({
    room_name: z.string().describe('Name of the room to move'),
    new_x_ft: z.number().optional().describe('New absolute X position'),
    new_y_ft: z.number().optional().describe('New absolute Y position'),
    relative_to: z.string().optional().describe('Move relative to this room'),
    direction: z.enum(['north', 'south', 'east', 'west']).optional().describe('Direction from the relative room'),
  }),
  execute: async (params) => {
    const engine = useFloorPlanEngine.getState();
    return engine.moveRoom({
      room_name: params.room_name,
      new_x_ft: params.new_x_ft,
      new_y_ft: params.new_y_ft,
      relative_to: params.relative_to,
      direction: params.direction,
    });
  },
});

const saveFloorPlanTool = tool({
  name: 'save_floor_plan',
  description: 'Save the current floor plan. Call when the floor plan is complete.',
  parameters: z.object({}),
  execute: async () => {
    const engine = useFloorPlanEngine.getState();
    return engine.saveFloorPlan();
  },
});

// Tool list for agent creation
const agentTools = [
  // Structure tools
  createStructureTool,
  editStructureTool,
  deleteStructureTool,
  selectStructureTool,
  // Room creation tools
  createRoomTool,
  addOpeningTool,
  addFeatureTool,
  markDamageTool,
  modifyDimensionTool,
  addNoteTool,
  undoTool,
  confirmRoomTool,
  deleteRoomTool,
  editRoomTool,
  deleteOpeningTool,
  deleteFeatureTool,
  editDamageZoneTool,
  deleteDamageZoneTool,
  // Wall-first editing tools
  selectWallTool,
  updateWallPropertiesTool,
  moveWallTool,
  updateOpeningTool,
  // Floor plan tools
  createFloorPlanTool,
  addRoomToPlanTool,
  connectRoomsTool,
  moveRoomTool,
  saveFloorPlanTool,
];

/**
 * Create a personalized room sketch agent with instructions loaded from database
 * Database is the ONLY source - throws if prompt not available
 */
export async function createRoomSketchAgentAsync(userName?: string): Promise<RealtimeAgent> {
  const baseInstructions = await fetchInstructionsFromAPI();
  const personalizedInstructions = personalizeInstructions(baseInstructions, userName);

  return new RealtimeAgent({
    name: 'RoomSketchAgent',
    instructions: personalizedInstructions,
    tools: agentTools,
  });
}

// Export individual tools for testing
export const tools = {
  createStructure: createStructureTool,
  editStructure: editStructureTool,
  deleteStructure: deleteStructureTool,
  selectStructure: selectStructureTool,
  createRoom: createRoomTool,
  addOpening: addOpeningTool,
  addFeature: addFeatureTool,
  markDamage: markDamageTool,
  modifyDimension: modifyDimensionTool,
  addNote: addNoteTool,
  undo: undoTool,
  confirmRoom: confirmRoomTool,
  deleteRoom: deleteRoomTool,
  editRoom: editRoomTool,
  deleteOpening: deleteOpeningTool,
  deleteFeature: deleteFeatureTool,
  editDamageZone: editDamageZoneTool,
  deleteDamageZone: deleteDamageZoneTool,
  createFloorPlan: createFloorPlanTool,
  addRoomToPlan: addRoomToPlanTool,
  connectRooms: connectRoomsTool,
  moveRoom: moveRoomTool,
  saveFloorPlan: saveFloorPlanTool,
};
