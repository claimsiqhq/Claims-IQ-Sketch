// Floor Plan Engine Service
// Zustand store for managing multi-room floor plan layouts

import { create } from 'zustand';
import type {
  FloorPlan,
  RoomGeometry,
  RoomConnection,
  ConnectionPoint,
  WallDirection,
  AddRoomToPlanParams,
  ConnectRoomsParams,
  MoveRoomParams,
  RemoveConnectionParams,
  SetRoomPositionParams,
} from '../types/geometry';
import { generateId, getPolygonBounds } from '../utils/polygon-math';

interface FloorPlanEngineState {
  currentFloorPlan: FloorPlan | null;
  floorPlans: FloorPlan[];

  createFloorPlan: (name: string, level?: number) => string;
  addRoomToFloorPlan: (params: AddRoomToPlanParams, room?: RoomGeometry) => string;
  connectRooms: (params: ConnectRoomsParams) => string;
  moveRoom: (params: MoveRoomParams) => string;
  removeConnection: (params: RemoveConnectionParams) => string;
  setRoomPosition: (params: SetRoomPositionParams) => string;
  saveFloorPlan: () => string;
  loadFloorPlan: (id: string) => string;
  deleteFloorPlan: (id: string) => string;
  recalculateBounds: () => void;
}

const ROOM_GAP_FT = 0; // Gap between adjacent rooms when auto-positioning

function getOppositeWall(wall: WallDirection): WallDirection {
  switch (wall) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

function calculateRoomPosition(
  existingRoom: RoomGeometry,
  direction: WallDirection,
  newRoomWidth: number,
  newRoomLength: number
): { x: number; y: number } {
  const existingX = existingRoom.origin_x_ft ?? 0;
  const existingY = existingRoom.origin_y_ft ?? 0;
  const existingWidth = existingRoom.width_ft;
  const existingLength = existingRoom.length_ft;

  switch (direction) {
    case 'north':
      return {
        x: existingX + (existingWidth - newRoomWidth) / 2,
        y: existingY - newRoomLength - ROOM_GAP_FT,
      };
    case 'south':
      return {
        x: existingX + (existingWidth - newRoomWidth) / 2,
        y: existingY + existingLength + ROOM_GAP_FT,
      };
    case 'east':
      return {
        x: existingX + existingWidth + ROOM_GAP_FT,
        y: existingY + (existingLength - newRoomLength) / 2,
      };
    case 'west':
      return {
        x: existingX - newRoomWidth - ROOM_GAP_FT,
        y: existingY + (existingLength - newRoomLength) / 2,
      };
  }
}

export const useFloorPlanEngine = create<FloorPlanEngineState>((set, get) => ({
  currentFloorPlan: null,
  floorPlans: [],

  createFloorPlan: (name, level = 0) => {
    const now = new Date().toISOString();
    const newPlan: FloorPlan = {
      id: generateId(),
      name,
      level,
      rooms: [],
      connections: [],
      width_ft: 0,
      length_ft: 0,
      created_at: now,
      updated_at: now,
    };

    set({ currentFloorPlan: newPlan });
    return `Created floor plan: ${name} (Level ${level})`;
  },

  addRoomToFloorPlan: (params, room) => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan started. Please create a floor plan first.';
    }

    if (!room) {
      return 'Error: No room provided to add to floor plan.';
    }

    let posX = params.position_x_ft ?? 0;
    let posY = params.position_y_ft ?? 0;

    if (params.relative_to && params.direction) {
      const refRoom = currentFloorPlan.rooms.find(
        r => r.id === params.relative_to || r.name === params.relative_to
      );
      if (refRoom) {
        const calculated = calculateRoomPosition(
          refRoom,
          params.direction,
          room.width_ft,
          room.length_ft
        );
        posX = calculated.x;
        posY = calculated.y;
      }
    } else if (currentFloorPlan.rooms.length === 0) {
      posX = 0;
      posY = 0;
    }

    const roomWithPosition: RoomGeometry = {
      ...room,
      origin_x_ft: posX,
      origin_y_ft: posY,
    };

    const updatedRooms = [...currentFloorPlan.rooms, roomWithPosition];
    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      rooms: updatedRooms,
      updated_at: new Date().toISOString(),
    };

    set({ currentFloorPlan: updatedPlan });
    get().recalculateBounds();

    const posDesc = params.relative_to && params.direction
      ? `${params.direction} of ${params.relative_to}`
      : `at (${posX}, ${posY})`;

    return `Added ${room.name} to floor plan ${posDesc}`;
  },

  connectRooms: (params) => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan started.';
    }

    const fromRoom = currentFloorPlan.rooms.find(
      r => r.id === params.from_room_id || r.name === params.from_room_name
    );
    const toRoom = currentFloorPlan.rooms.find(
      r => r.id === params.to_room_id || r.name === params.to_room_name
    );

    if (!fromRoom) {
      return `Error: Could not find source room "${params.from_room_id || params.from_room_name}"`;
    }
    if (!toRoom) {
      return `Error: Could not find target room "${params.to_room_id || params.to_room_name}"`;
    }

    const fromPosition = params.from_position_ft ?? 
      (params.from_wall === 'north' || params.from_wall === 'south' 
        ? fromRoom.width_ft / 2 
        : fromRoom.length_ft / 2);
    
    const toPosition = params.to_position_ft ??
      (params.to_wall === 'north' || params.to_wall === 'south'
        ? toRoom.width_ft / 2
        : toRoom.length_ft / 2);

    const connection: RoomConnection = {
      id: generateId(),
      type: params.connection_type,
      from: {
        room_id: fromRoom.id,
        wall: params.from_wall,
        position_ft: fromPosition,
        width_ft: 3, // Default door width
      },
      to: {
        room_id: toRoom.id,
        wall: params.to_wall,
        position_ft: toPosition,
        width_ft: 3,
      },
    };

    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      connections: [...currentFloorPlan.connections, connection],
      updated_at: new Date().toISOString(),
    };

    set({ currentFloorPlan: updatedPlan });

    return `Connected ${fromRoom.name} to ${toRoom.name} via ${params.connection_type}`;
  },

  moveRoom: (params) => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan started.';
    }

    const roomIndex = currentFloorPlan.rooms.findIndex(
      r => r.id === params.room_id || r.name === params.room_name
    );

    if (roomIndex === -1) {
      return `Error: Could not find room "${params.room_id || params.room_name}"`;
    }

    const room = currentFloorPlan.rooms[roomIndex];
    let newX = params.new_x_ft ?? room.origin_x_ft ?? 0;
    let newY = params.new_y_ft ?? room.origin_y_ft ?? 0;

    if (params.relative_to && params.direction) {
      const refRoom = currentFloorPlan.rooms.find(
        r => r.id === params.relative_to || r.name === params.relative_to
      );
      if (refRoom) {
        const calculated = calculateRoomPosition(
          refRoom,
          params.direction,
          room.width_ft,
          room.length_ft
        );
        newX = calculated.x;
        newY = calculated.y;
      }
    }

    const updatedRooms = [...currentFloorPlan.rooms];
    updatedRooms[roomIndex] = {
      ...room,
      origin_x_ft: newX,
      origin_y_ft: newY,
    };

    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      rooms: updatedRooms,
      updated_at: new Date().toISOString(),
    };

    set({ currentFloorPlan: updatedPlan });
    get().recalculateBounds();

    return `Moved ${room.name} to (${newX}, ${newY})`;
  },

  removeConnection: (params) => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan started.';
    }

    let connectionIndex = -1;

    if (params.connection_id) {
      connectionIndex = currentFloorPlan.connections.findIndex(
        c => c.id === params.connection_id
      );
    } else if (params.from_room && params.to_room) {
      connectionIndex = currentFloorPlan.connections.findIndex(c => {
        const fromRoom = currentFloorPlan.rooms.find(r => r.id === c.from.room_id);
        const toRoom = currentFloorPlan.rooms.find(r => r.id === c.to.room_id);
        return (
          (fromRoom?.name === params.from_room || fromRoom?.id === params.from_room) &&
          (toRoom?.name === params.to_room || toRoom?.id === params.to_room)
        );
      });
    }

    if (connectionIndex === -1) {
      return 'Error: Could not find connection to remove.';
    }

    const connection = currentFloorPlan.connections[connectionIndex];
    const fromRoom = currentFloorPlan.rooms.find(r => r.id === connection.from.room_id);
    const toRoom = currentFloorPlan.rooms.find(r => r.id === connection.to.room_id);

    const updatedConnections = currentFloorPlan.connections.filter(
      (_, i) => i !== connectionIndex
    );

    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      connections: updatedConnections,
      updated_at: new Date().toISOString(),
    };

    set({ currentFloorPlan: updatedPlan });

    return `Removed connection between ${fromRoom?.name || 'room'} and ${toRoom?.name || 'room'}`;
  },

  setRoomPosition: (params) => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan started.';
    }

    const roomIndex = currentFloorPlan.rooms.findIndex(
      r => r.id === params.room_id || r.name === params.room_name
    );

    if (roomIndex === -1) {
      return `Error: Could not find room "${params.room_id || params.room_name}"`;
    }

    const room = currentFloorPlan.rooms[roomIndex];
    const updatedRooms = [...currentFloorPlan.rooms];
    updatedRooms[roomIndex] = {
      ...room,
      origin_x_ft: params.x_ft,
      origin_y_ft: params.y_ft,
    };

    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      rooms: updatedRooms,
      updated_at: new Date().toISOString(),
    };

    set({ currentFloorPlan: updatedPlan });
    get().recalculateBounds();

    return `Set ${room.name} position to (${params.x_ft}, ${params.y_ft})`;
  },

  saveFloorPlan: () => {
    const { currentFloorPlan, floorPlans } = get();
    if (!currentFloorPlan) {
      return 'Error: No floor plan to save.';
    }

    const existingIndex = floorPlans.findIndex(fp => fp.id === currentFloorPlan.id);
    const updatedPlans = existingIndex >= 0
      ? floorPlans.map((fp, i) => i === existingIndex ? currentFloorPlan : fp)
      : [...floorPlans, currentFloorPlan];

    set({ floorPlans: updatedPlans });
    return `Saved floor plan: ${currentFloorPlan.name}`;
  },

  loadFloorPlan: (id) => {
    const { floorPlans } = get();
    const plan = floorPlans.find(fp => fp.id === id);
    if (!plan) {
      return `Error: Could not find floor plan with ID ${id}`;
    }

    set({ currentFloorPlan: plan });
    return `Loaded floor plan: ${plan.name}`;
  },

  deleteFloorPlan: (id) => {
    const { floorPlans, currentFloorPlan } = get();
    const plan = floorPlans.find(fp => fp.id === id);
    if (!plan) {
      return `Error: Could not find floor plan with ID ${id}`;
    }

    const updatedPlans = floorPlans.filter(fp => fp.id !== id);
    const newCurrentPlan = currentFloorPlan?.id === id ? null : currentFloorPlan;

    set({ floorPlans: updatedPlans, currentFloorPlan: newCurrentPlan });
    return `Deleted floor plan: ${plan.name}`;
  },

  recalculateBounds: () => {
    const { currentFloorPlan } = get();
    if (!currentFloorPlan || currentFloorPlan.rooms.length === 0) {
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const room of currentFloorPlan.rooms) {
      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;
      const bounds = getPolygonBounds(room.polygon);

      minX = Math.min(minX, originX + bounds.minX);
      maxX = Math.max(maxX, originX + bounds.maxX);
      minY = Math.min(minY, originY + bounds.minY);
      maxY = Math.max(maxY, originY + bounds.maxY);
    }

    const updatedPlan: FloorPlan = {
      ...currentFloorPlan,
      width_ft: maxX - minX,
      length_ft: maxY - minY,
    };

    set({ currentFloorPlan: updatedPlan });
  },
}));
