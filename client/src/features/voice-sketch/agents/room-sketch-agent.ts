// Room Sketch Voice Agent
// RealtimeAgent for voice-driven room sketching with OpenAI Agents SDK

import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { geometryEngine } from '../services/geometry-engine';

// System instructions for the voice agent
const ROOM_SKETCH_INSTRUCTIONS = `You are a field sketching assistant for property insurance claims adjusters. Your job is to help them create room sketches by voice.

PERSONALITY:
- Be concise and professional—adjusters are working in the field
- Confirm each element briefly before moving on
- Ask ONE clarifying question when information is ambiguous

ROOM CREATION FLOW:
1. Establish room name and basic shape
2. Get overall dimensions
3. Add openings (doors, windows) wall by wall
4. Add features (closets, alcoves, bump-outs)
5. Mark damage zones if applicable
6. Confirm and finalize

WALL ORIENTATION:
- When adjuster enters a room, the wall they're facing is "north" by default
- Accept relative terms: "wall on my left" = west, "wall behind me" = south, "the window wall"
- Clarify if needed: "Which wall is that—the one with the door or facing the street?"

DIMENSION HANDLING:
- Accept natural speech: "fourteen six" = 14.5', "fourteen and a half" = 14.5'
- If dimension sounds unusual (3ft x 50ft), ask to confirm
- Round to nearest inch for output
- Default ceiling height is 8 feet unless specified

DAMAGE DOCUMENTATION (CRITICAL FOR INSURANCE):
- Always ask about damage if not mentioned after room features are complete
- For water damage, determine IICRC category (1, 2, or 3):
  - Category 1: Clean water (broken supply lines, rainwater)
  - Category 2: Gray water (washing machine overflow, toilet overflow with urine)
  - Category 3: Black water (sewage, rising floodwater, toilet with feces)
- Document source and extent clearly

EDITING AND CORRECTIONS:
- When the adjuster says "actually" or "wait" or "change that", they're making a correction
- For room edits: "Actually, call it the guest bedroom" → use edit_room to change name
- For deleting: "Remove that window" or "Delete the closet" → use delete_opening or delete_feature
- For damage corrections: "Change that to Category 3" → use edit_damage_zone
- If adjuster wants to start over: "Delete this room" → use delete_room

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

ERROR HANDLING:
- If you can't parse a dimension: "I didn't catch that measurement—how many feet?"
- If wall reference is unclear: "Which wall is that—the one with the door or the window?"
- If impossible geometry: "That would make the closet bigger than the room—did you mean 6 feet wide?"
- If multiple items match for deletion: "Which one—the door or the window on the west wall?"`;

// Tool: Create a new room
const createRoomTool = tool({
  name: 'create_room',
  description: 'Initialize a new room with basic shape and dimensions. Call this first when the adjuster starts describing a new room.',
  parameters: z.object({
    name: z.string().describe('Room identifier like master_bedroom, kitchen, bathroom_1, living_room'),
    shape: z.enum(['rectangle', 'l_shape', 't_shape', 'irregular']).describe('Room shape - most rooms are rectangle'),
    width_ft: z.number().describe('Width in feet'),
    length_ft: z.number().describe('Length in feet'),
    ceiling_height_ft: z.number().default(8).describe('Ceiling height, defaults to 8ft if not specified'),
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
      z.number().describe('Feet from left corner')
    ]).describe('Position on the wall - left, center, right, or specific feet from left corner'),
    sill_height_ft: z.number().optional().describe('For windows, height from floor to bottom of window. Default 3ft'),
  }),
  execute: async (params) => {
    return geometryEngine.addOpening(params);
  },
});

// Tool: Add closet, alcove, bump-out, or built-in
const addFeatureTool = tool({
  name: 'add_feature',
  description: 'Add architectural features like closets, alcoves, islands, peninsulas, fireplaces, or built-ins to the room.',
  parameters: z.object({
    type: z.enum(['closet', 'alcove', 'bump_out', 'island', 'peninsula', 'fireplace', 'built_in']).describe('Type of feature'),
    wall: z.enum(['north', 'south', 'east', 'west', 'freestanding']).describe('Which wall the feature is on, or freestanding for islands'),
    width_ft: z.number().describe('Width in feet'),
    depth_ft: z.number().describe('Depth in feet (how far it extends from the wall)'),
    position: z.union([
      z.enum(['left', 'center', 'right']),
      z.number().describe('Feet from left corner')
    ]).describe('Position along the wall'),
  }),
  execute: async (params) => {
    return geometryEngine.addFeature(params);
  },
});

// Tool: Mark damage zone (critical for insurance claims)
const markDamageTool = tool({
  name: 'mark_damage',
  description: 'Define a damage zone for insurance claim documentation. CRITICAL: For water damage, always determine the IICRC category (1, 2, or 3).',
  parameters: z.object({
    type: z.enum(['water', 'fire', 'smoke', 'mold', 'wind', 'impact']).describe('Type of damage'),
    category: z.enum(['1', '2', '3']).optional().describe('IICRC category for water damage: 1=clean water, 2=gray water, 3=black water'),
    affected_walls: z.array(z.enum(['north', 'south', 'east', 'west'])).describe('Which walls are affected'),
    floor_affected: z.boolean().default(true).describe('Is the floor affected?'),
    ceiling_affected: z.boolean().default(false).describe('Is the ceiling affected?'),
    extent_ft: z.number().describe('How far the damage extends from the source in feet'),
    source: z.string().optional().describe('Source of damage, e.g., "burst pipe under sink", "roof leak", "adjacent bathroom"'),
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
  description: 'Edit room properties like name, shape, or dimensions. Use when the adjuster wants to correct or change room details.',
  parameters: z.object({
    room_name: z.string().optional().describe('Name of the room to edit. If not specified, edits the current room.'),
    new_name: z.string().optional().describe('New name for the room'),
    new_shape: z.enum(['rectangle', 'l_shape', 't_shape', 'irregular']).optional().describe('New shape for the room'),
    new_width_ft: z.number().optional().describe('New width in feet'),
    new_length_ft: z.number().optional().describe('New length in feet'),
    new_ceiling_height_ft: z.number().optional().describe('New ceiling height in feet'),
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
  description: 'Edit properties of a damage zone. Use when adjuster needs to correct damage category, extent, source, or affected areas.',
  parameters: z.object({
    damage_index: z.number().optional().describe('Index of the damage zone to edit (0-based). If room has only one damage zone, not needed.'),
    new_type: z.enum(['water', 'fire', 'smoke', 'mold', 'wind', 'impact']).optional().describe('New damage type'),
    new_category: z.enum(['1', '2', '3']).optional().describe('New IICRC category for water damage'),
    new_affected_walls: z.array(z.enum(['north', 'south', 'east', 'west'])).optional().describe('New list of affected walls'),
    new_floor_affected: z.boolean().optional().describe('Whether floor is affected'),
    new_ceiling_affected: z.boolean().optional().describe('Whether ceiling is affected'),
    new_extent_ft: z.number().optional().describe('New extent in feet'),
    new_source: z.string().optional().describe('New source description'),
  }),
  execute: async (params) => {
    return geometryEngine.editDamageZone(params);
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
};
