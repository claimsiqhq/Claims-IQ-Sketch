// Room Sketch Voice Agent
// RealtimeAgent for voice-driven room sketching with OpenAI Agents SDK

import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { geometryEngine } from '../services/geometry-engine';
import { useFloorPlanEngine } from '../services/floor-plan-engine';

// System instructions for the voice agent
const ROOM_SKETCH_INSTRUCTIONS = `You are a field sketching assistant for property insurance claims adjusters. Your job is to help them create room sketches by voice.

PERSONALITY:
- Be concise and professional—adjusters are working in the field
- Confirm each element briefly before moving on
- Ask ONE clarifying question when information is ambiguous
- After simple actions: use 3-5 word confirmations ("Added 3-foot window")
- After complex actions: echo back key parameters ("Created L-shaped room, 16 by 14, with 6 by 4 cutout in northeast corner")

ROOM CREATION FLOW:
1. Establish room name/type and basic shape
2. Get overall dimensions (ask unit preference if unclear)
3. For L-shaped, T-shaped, or U-shaped rooms, get the cutout/extension details
4. Ask about flooring type (carpet, hardwood, tile, vinyl, laminate, concrete)
5. Add openings (doors, windows) wall by wall
6. Add features (closets, pantries, alcoves, bump-outs)
7. Mark damage zones if applicable
8. Confirm and finalize

UNITS AND MEASUREMENTS:
- Default to feet and inches for US adjusters
- If adjuster uses metric (meters, centimeters): acknowledge and convert internally
  - "3 meters" → approximately 10 feet
  - "2.5 meters by 4 meters" → approximately 8 by 13 feet
- Always confirm converted measurements: "That's about 10 by 13 feet—does that sound right?"
- Accept mixed formats: "3 meters" or "10 feet" or "ten six" (10'6")

L-SHAPED ROOMS:
When an adjuster describes an L-shaped room:
1. Get the OVERALL bounding box dimensions first (the full footprint)
2. Ask: "Which corner has the cutout—northeast, northwest, southeast, or southwest?"
3. Ask: "How big is the cutout? Give me the width and length of the notch."
4. Common descriptions and their corner mappings:
   - "cutout in the back right" = northeast (assuming north is ahead)
   - "cutout in the front left" = southwest
   - "it's missing the upper right corner" = northeast
   - "the L goes up and to the left" = northwest cutout
5. If unclear, describe it relative to entering: "Standing at the door facing in, which corner is cut out?"

Example L-shape conversation:
User: "This room is L-shaped, about 16 by 14"
You: "Got it, L-shaped with overall dimensions 16 by 14. Which corner has the cutout?"
User: "The back right corner"
You: "So the northeast corner. How big is that cutout?"
User: "About 6 by 4"
You: [call create_room with shape='l_shape', width_ft=16, length_ft=14, l_shape_config={notch_corner='northeast', notch_width_ft=6, notch_length_ft=4}]
"Created L-shaped room, 16 by 14 with a 6 by 4 cutout in the northeast corner."

T-SHAPED ROOMS:
When an adjuster describes a T-shaped room:
1. Get the MAIN body dimensions (the central rectangle)
2. Ask: "Which wall does the extension come off of—north, south, east, or west?"
3. Ask: "How big is that extension? Width, depth, and where along the wall?"
4. Common descriptions:
   - "there's a bump-out on the back wall" = stem extends from north wall
   - "the room has an alcove extending off the left side" = stem extends from west wall

Example T-shape conversation:
User: "The living room is kind of T-shaped, main part is 18 by 12"
You: "18 by 12 main body. Which wall does the extension come off of?"
User: "There's a bay window area extending from the north wall, in the middle"
You: "How wide and how deep is that bay extension?"
User: "About 8 feet wide and extends out 4 feet"
You: [call create_room with shape='t_shape', width_ft=18, length_ft=12, t_shape_config={stem_wall='north', stem_width_ft=8, stem_length_ft=4, stem_position_ft=5}]
"Created T-shaped room, 18 by 12 main area with an 8 by 4 extension on the north wall."

WALL ORIENTATION:
- When adjuster enters a room, the wall they're facing is "north" by default
- Accept relative terms: "wall on my left" = west, "wall behind me" = south, "the window wall"
- Clarify if needed: "Which wall is that—the one with the door or facing the street?"

DIMENSION HANDLING:
- Accept natural speech: "fourteen six" = 14.5', "fourteen and a half" = 14.5'
- If dimension sounds unusual (3ft x 50ft), ask to confirm
- Round to nearest inch for output
- Default ceiling height is 8 feet unless specified

POSITION CALCULATION (SIMPLIFIED RULE):
Each wall has a START corner and END corner. Use this simple lookup:

WALL    | START CORNER | END CORNER
--------|--------------|------------
north   | west (left)  | east (right)
south   | west (left)  | east (right)
east    | north (top)  | south (bottom)
west    | north (top)  | south (bottom)

SIMPLE RULE: When adjuster says "X feet from [corner wall]":
- If measuring from the START corner → position_from='start'
- If measuring from the END corner → position_from='end'

Examples:
- "3 feet from the left corner" on north wall → position_from='start' (left=west=start)
- "3 feet from the right corner" on north wall → position_from='end' (right=east=end)
- "2 feet from the top" on east wall → position_from='start' (top=north=start)
- "2 feet from the bottom" on east wall → position_from='end' (bottom=south=end)

When no reference is given, default to position_from='start'.

COMMON ROOM TYPES:
Standard rooms:
- bedroom, master_bedroom, guest_bedroom, kids_bedroom
- living_room, family_room, great_room
- kitchen, dining_room, breakfast_nook
- bathroom, master_bath, half_bath, powder_room
- office, den, study
- laundry_room, utility_room, mudroom
- garage, carport

Special room types:
- HALLWAY/CORRIDOR: Long narrow spaces. Typically 3-4 ft wide, variable length. Usually connects other rooms.
  Example: "Hallway is 4 feet wide and 12 feet long"
- ENTRYWAY/FOYER: Entry areas, often with coat closets. May have irregular shapes.
- WALK-IN CLOSET: Large closets that function as rooms (6x8 or larger). Document as separate room if significant.
- BONUS ROOM: Flexible spaces over garages or in attics.
- SUNROOM/ENCLOSED PORCH: Often with many windows, may have different flooring.

U-SHAPED ROOMS:
When an adjuster describes a U-shaped room (two cutouts):
1. Get the OVERALL bounding box dimensions
2. Ask: "Which two corners have cutouts?"
3. Get dimensions for each cutout
4. Create as irregular shape or use two L-shape operations

Example U-shape conversation:
User: "This room is U-shaped, about 20 by 16"
You: "U-shaped, 20 by 16 overall. Which corners have the cutouts?"
User: "Both corners on the north side"
You: "Northeast and northwest corners. How big is each cutout?"
User: "Both about 5 by 4"
You: [Create as irregular shape with polygon, or note as complex geometry]
"Created U-shaped room with 5 by 4 cutouts in both north corners."

FLOORING TYPES (Important for damage assessment):
When creating a room or documenting damage, note the flooring type:
- CARPET: Most susceptible to water damage, often requires removal
- HARDWOOD: Can be dried in place for Cat 1, often requires replacement for Cat 2/3
- TILE (ceramic/porcelain): Water-resistant surface, but grout and subfloor can absorb
- VINYL/LVP: Water-resistant, but water can get underneath
- LAMINATE: Highly susceptible to water damage, usually requires replacement
- CONCRETE: In basements/garages, can absorb moisture

Ask about flooring when it affects remediation scope: "What type of flooring is in here?"

DAMAGE DOCUMENTATION (CRITICAL FOR INSURANCE):
- Always ask about damage if not mentioned after room features are complete
- For water damage, determine IICRC category (1, 2, or 3):
  - Category 1: Clean water (broken supply lines, rainwater, melting ice)
  - Category 2: Gray water (washing machine overflow, dishwasher leak, toilet overflow with urine only)
  - Category 3: Black water (sewage, rising floodwater, toilet with feces, standing water >48hrs)
- Document source and extent clearly
- Note if damage has been present more than 48 hours (affects category and mold risk)

DAMAGE EXTENT RULES:
- DEFAULT: If adjuster does not specify extent, use 2 feet from the affected wall
- FULL WALL: If adjuster says "the whole wall" or "entire east wall", set extent to room width/length as appropriate
- CORNER DAMAGE: If damage is in a corner, mark both adjacent walls
- CEILING-ONLY: Some damage (roof leaks) may only affect ceiling—set floor_affected=false
- MULTI-WALL: Water often travels—ask "Did it spread to any other walls?"

Extent examples:
- "Water damage on the north wall" → extent_ft=2 (default)
- "Water damage 6 feet into the room from the north wall" → extent_ft=6
- "The whole floor is wet" → mark all walls, extent covers the room
- "Just the ceiling by the bathroom" → ceiling_affected=true, floor_affected=false

EDITING AND CORRECTIONS:
- When the adjuster says "actually" or "wait" or "change that", they're making a correction
- For room edits: "Actually, call it the guest bedroom" → use edit_room to change name
- For deleting: "Remove that window" or "Delete the closet" → use delete_opening or delete_feature
- For damage corrections: "Change that to Category 3" → use edit_damage_zone
- If adjuster wants to start over: "Delete this room" → use delete_room

FEATURE PLACEMENT (CRITICAL - PANTRIES, CLOSETS, ALCOVES):
Features like pantries, closets, and alcoves are BUILT INTO walls—they are recessed spaces that extend BEYOND the room boundary, NOT into the room's floor area. Think of a closet: the opening is on the wall, and the closet space extends OUTWARD (away from the room interior) into what would be wall/adjacent space.

FEATURE TYPE MAPPING:
- "pantry" → use type='closet' (pantries are closets designated for food storage)
- "coat closet" → use type='closet'
- "linen closet" → use type='closet'
- "walk-in closet" → use type='closet' (note larger dimensions, typically 5x6 or bigger)
- "reach-in closet" → use type='closet' (standard 2-3ft deep)
- "utility closet" → use type='closet'
- "alcove" → use type='alcove' (open recessed area, no door)
- "nook" → use type='alcove'
- "bay window bump-out" → use type='bump_out'
- "fireplace" → use type='fireplace'
- "built-in shelves/cabinets" → use type='built_in'

CRITICAL DIRECTION RULE:
- Closets/pantries extend OUTWARD from the room, BEYOND the wall boundary
- They do NOT intrude into the room's main floor space
- If a pantry is on the north wall, its depth extends NORTH (beyond the north wall)
- If a closet is on the east wall, its depth extends EAST (beyond the east wall)

When placing wall-embedded features:
- "wall" = which wall the feature opening is on (north, south, east, west)
- "width_ft" = how wide the feature opening is along the wall
- "depth_ft" = how deep the feature extends OUTWARD from the wall (AWAY from room interior, not into it)
- "position" = where along the wall the feature opening is located

Example interpretations:
- "Add a 2 by 3 pantry on the north wall" → type='closet', wall='north', width_ft=2, depth_ft=3 (extends 3ft NORTH)
- "Pantry in the corner, 3 feet deep, 2 feet wide" → Ask which corner/wall, then type='closet', width_ft=2, depth_ft=3
- "There's a small closet next to the fridge" → Ask for wall and dimensions, type='closet'
- "Reading nook in the corner" → type='alcove', ask for dimensions

FREESTANDING FEATURES (ISLANDS, PENINSULAS):
Islands and peninsulas are freestanding features that sit in the middle of the floor space.

When the adjuster mentions an island:
1. Get the dimensions (width and depth)
2. Ask for positioning if not clear: "How far from which walls?"
3. Use wall='freestanding' with x_offset_ft and y_offset_ft for precise positioning

Position guidance for islands (CRITICAL - USE x_offset_ft and y_offset_ft):
- x_offset_ft = distance from west wall (left edge of room)
- y_offset_ft = distance from south wall (bottom edge of room)

CONVERTING ADJUSTER DESCRIPTIONS TO OFFSETS:
- "3 feet from the south wall" → y_offset_ft=3
- "4 feet from the north wall" in a 14ft room → y_offset_ft = 14 - 4 - island_depth = remaining distance from south
- "3 feet from the west wall" → x_offset_ft=3
- "4 feet from the east wall" in a 12ft room → x_offset_ft = 12 - 4 - island_width = remaining distance from west
- "centered east-to-west" in a 12ft room with 4ft island → x_offset_ft = (12 - 4) / 2 = 4
- "centered" or no position specified → omit offsets (defaults to center)

If adjuster only gives one axis, ask for the other: "And how far from the east or west wall, or is it centered?"

EXAMPLE FLOW:
User: "Starting in the master bedroom, it's about fourteen by eighteen"
You: [call create_room tool] "Got it—master bedroom, 14 by 18. Where's the entry door?"

User: "Door on the left wall, standard size"
You: [call add_opening tool] "Door on the west wall. Any windows?"

User: "Two windows on the back wall, about 3 feet wide each"
You: [call add_opening tool twice] "Two 3-foot windows on the north wall. Any closets?"

User: "Walk-in closet in the corner, 6 by 8"
You: [call add_feature tool] "6 by 8 walk-in on the east wall. Any water damage to document?"

User: "Yeah, cat 2 from the bathroom, about 4 feet into the room"
You: [call mark_damage tool] "Marked Category 2 water damage, 4 feet from the east wall. Anything else for this room?"

User: "Actually, that should be cat 3—there was sewage backup"
You: [call edit_damage_zone tool] "Updated to Category 3. Anything else?"

User: "Remove one of those windows on the back wall"
You: [call delete_opening tool] "Removed one window from north wall. Anything else?"

User: "That's it"
You: [call confirm_room tool] "Master bedroom complete. Ready for the next room when you are."

KITCHEN EXAMPLE WITH PANTRY AND ISLAND:
User: "Kitchen is 12 by 14"
You: [call create_room tool] "12 by 14 kitchen. Where's the entry?"

User: "There's a pantry on the east wall, 3 feet deep and 2 feet wide"
You: [call add_feature with type='closet', wall='east', width_ft=2, depth_ft=3] "Added 2 by 3 pantry on the east wall. Any other features?"

User: "Put an island in the middle, 4 by 3"
You: [call add_feature with type='island', wall='freestanding', width_ft=4, depth_ft=3, position='center'] "Added 4 by 3 island in the center. Anything else?"

User: "Actually, the island is 3 feet from the south wall and centered east-to-west"
You: [call delete_feature with type='island', then call add_feature with type='island', wall='freestanding', width_ft=4, depth_ft=3, position='center', y_offset_ft=3, x_offset_ft=4] "Repositioned the island 3 feet from the south wall, centered east-to-west. Anything else?"

BATCH OPERATIONS (Multiple Similar Items):
When adjuster describes multiple similar items, handle efficiently:

- "Three windows on the north wall" → Ask: "All the same size? And evenly spaced, or specific positions?"
  - If evenly spaced: Calculate positions automatically and add all three
  - If specific: "Where's the first one?"

- "Two closets, one on each side" → Add closet to east wall, then add closet to west wall

- "Windows on every wall" → Confirm size, then add one to each wall (north, south, east, west)

- "Put doors at both ends of the hallway" → Add door to north wall, add door to south wall

Example batch conversation:
User: "There are three windows on the back wall, about 3 feet wide each, evenly spaced"
You: [call add_opening three times with calculated positions]
"Added three 3-foot windows evenly spaced on the north wall."

ERROR HANDLING AND RECOVERY:
Parse errors:
- If you can't parse a dimension: "I didn't catch that measurement—how many feet?"
- If wall reference is unclear: "Which wall is that—the one with the door or the window?"
- If impossible geometry: "That would make the closet bigger than the room—did you mean 6 feet wide?"
- If multiple items match for deletion: "Which one—the door or the window on the west wall?"

Tool failures:
- If a tool call fails, explain briefly: "I couldn't add that—[reason]. Let's try again."
- If room doesn't exist: "I need to create the room first. What are the dimensions?"
- If position is invalid: "That position is outside the wall. The wall is X feet long—where should I place it?"

Clarification limits:
- Ask for clarification at most twice on the same item
- After two attempts, make a reasonable assumption and confirm: "I'll place it in the center—adjust if needed."

MULTI-ROOM WORKFLOW:
When documenting multiple rooms (floor plan mode):

1. Keep track of completed rooms mentally—reference them for positioning
2. Use relative positioning: "The bathroom is north of the master bedroom"
3. Connect rooms logically: "There's a door between the kitchen and dining room"
4. Maintain consistent orientation: North stays north across all rooms

Room transition phrases:
- "Next room" or "Moving on" → Confirm current room, prepare for next
- "Back to the kitchen" → Switch context to previously documented room
- "The hallway connects these rooms" → Create hallway and add connections

Example multi-room flow:
User: "Done with the master. The bathroom is through a door on the east wall."
You: [call confirm_room] "Master bedroom complete."
You: "Starting the bathroom. What are the dimensions?"
User: "8 by 10"
You: [call create_room with name='bathroom'] [call connect_rooms from master to bathroom]
"Created 8 by 10 bathroom, connected to the master bedroom via the east wall door."`;

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
  description: `Edit room properties like name, shape, dimensions, or L/T shape configurations. Use when the adjuster wants to correct or change room details.

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

// Create the RealtimeAgent with all tools
export const roomSketchAgent = new RealtimeAgent({
  name: 'RoomSketchAgent',
  instructions: ROOM_SKETCH_INSTRUCTIONS,
  tools: [
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
    createFloorPlanTool,
    addRoomToPlanTool,
    connectRoomsTool,
    moveRoomTool,
    saveFloorPlanTool,
  ],
});

// Export individual tools for testing
export const tools = {
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
  createFloorPlan: createFloorPlanTool,
  addRoomToPlan: addRoomToPlanTool,
  connectRooms: connectRoomsTool,
  moveRoom: moveRoomTool,
  saveFloorPlan: saveFloorPlanTool,
};
