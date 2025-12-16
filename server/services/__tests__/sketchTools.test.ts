/**
 * Sketch Tools Tests
 *
 * Unit tests for sketch tools service.
 * Run with: npx vitest run server/services/__tests__/sketchTools.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  generateFloorplanData,
  FloorplanData,
  FloorplanRoom,
  RoomConnection,
} from '../sketchTools';

describe('SketchTools', () => {
  describe('generateFloorplanData', () => {
    describe('valid inputs', () => {
      it('validates a simple floorplan with one room', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.rooms).toHaveLength(1);
        expect(result.data?.rooms[0].id).toBe('living_room');
        expect(result.data?.rooms[0].name).toBe('Living Room');
        expect(result.data?.rooms[0].dimensions.length_ft).toBe(15);
        expect(result.data?.rooms[0].dimensions.width_ft).toBe(12);
      });

      it('validates a floorplan with multiple rooms', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
            {
              id: 'kitchen',
              name: 'Kitchen',
              dimensions: { length_ft: 12, width_ft: 10 },
            },
            {
              id: 'bedroom',
              name: 'Master Bedroom',
              dimensions: { length_ft: 14, width_ft: 12 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms).toHaveLength(3);
      });

      it('validates a room with features', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
              features: [
                { type: 'door', wall: 'north', width_inches: 36 },
                { type: 'window', wall: 'east', width_inches: 48 },
                { type: 'cased_opening', wall: 'south' },
              ],
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms[0].features).toHaveLength(3);
        expect(result.data?.rooms[0].features?.[0].type).toBe('door');
        expect(result.data?.rooms[0].features?.[1].type).toBe('window');
        expect(result.data?.rooms[0].features?.[2].type).toBe('cased_opening');
      });

      it('validates a floorplan with connections', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
            {
              id: 'kitchen',
              name: 'Kitchen',
              dimensions: { length_ft: 12, width_ft: 10 },
            },
          ],
          connections: [
            {
              from_room_id: 'living_room',
              to_room_id: 'kitchen',
              via: 'door',
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.connections).toHaveLength(1);
        expect(result.data?.connections?.[0].via).toBe('door');
      });

      it('validates all connection types', async () => {
        const input: FloorplanData = {
          rooms: [
            { id: 'a', name: 'Room A', dimensions: { length_ft: 10, width_ft: 10 } },
            { id: 'b', name: 'Room B', dimensions: { length_ft: 10, width_ft: 10 } },
            { id: 'c', name: 'Room C', dimensions: { length_ft: 10, width_ft: 10 } },
            { id: 'd', name: 'Room D', dimensions: { length_ft: 10, width_ft: 10 } },
            { id: 'e', name: 'Room E', dimensions: { length_ft: 10, width_ft: 10 } },
          ],
          connections: [
            { from_room_id: 'a', to_room_id: 'b', via: 'door' },
            { from_room_id: 'b', to_room_id: 'c', via: 'cased_opening' },
            { from_room_id: 'c', to_room_id: 'd', via: 'hallway' },
            { from_room_id: 'd', to_room_id: 'e', via: 'open_plan' },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.connections).toHaveLength(4);
      });
    });

    describe('invalid inputs', () => {
      it('rejects empty rooms array', async () => {
        const input: FloorplanData = {
          rooms: [],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('at least one room is required');
      });

      it('rejects missing rooms array', async () => {
        const input = {} as FloorplanData;

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('rooms array is required');
      });

      it('rejects room without id', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: '',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            } as FloorplanRoom,
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('missing or invalid id');
      });

      it('rejects duplicate room ids', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
            {
              id: 'living_room',
              name: 'Another Room',
              dimensions: { length_ft: 10, width_ft: 10 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Duplicate room id');
      });

      it('rejects room without name', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: '',
              dimensions: { length_ft: 15, width_ft: 12 },
            } as FloorplanRoom,
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('missing or invalid name');
      });

      it('rejects room without dimensions', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
            } as FloorplanRoom,
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('missing dimensions');
      });

      it('rejects invalid length_ft', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: -5, width_ft: 12 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('length_ft must be a positive number');
      });

      it('rejects invalid width_ft', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 0 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('width_ft must be a positive number');
      });

      it('rejects invalid feature type', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
              features: [
                { type: 'invalid_type' as any, wall: 'north' },
              ],
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('type must be one of');
      });

      it('rejects invalid feature wall', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
              features: [
                { type: 'door', wall: 'invalid_wall' as any },
              ],
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('wall must be one of');
      });

      it('rejects connection with non-existent from_room_id', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
          connections: [
            {
              from_room_id: 'non_existent',
              to_room_id: 'living_room',
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('from_room_id');
        expect(result.error).toContain('does not exist');
      });

      it('rejects connection with non-existent to_room_id', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
          connections: [
            {
              from_room_id: 'living_room',
              to_room_id: 'non_existent',
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('to_room_id');
        expect(result.error).toContain('does not exist');
      });

      it('rejects self-referencing connection', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
          connections: [
            {
              from_room_id: 'living_room',
              to_room_id: 'living_room',
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('cannot connect to itself');
      });

      it('rejects invalid connection via type', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
            {
              id: 'kitchen',
              name: 'Kitchen',
              dimensions: { length_ft: 12, width_ft: 10 },
            },
          ],
          connections: [
            {
              from_room_id: 'living_room',
              to_room_id: 'kitchen',
              via: 'teleporter' as any,
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid connection via');
      });
    });

    describe('edge cases', () => {
      it('handles room with all feature types', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 20, width_ft: 15 },
              features: [
                { type: 'door', wall: 'north' },
                { type: 'window', wall: 'south', width_inches: 60 },
                { type: 'cased_opening', wall: 'east' },
                { type: 'missing_wall', wall: 'west' },
              ],
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms[0].features).toHaveLength(4);
      });

      it('handles room with features on all walls', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 20, width_ft: 15 },
              features: [
                { type: 'door', wall: 'north' },
                { type: 'window', wall: 'south' },
                { type: 'window', wall: 'east' },
                { type: 'door', wall: 'west' },
              ],
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms[0].features).toHaveLength(4);
      });

      it('handles floorplan without connections', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.connections).toBeUndefined();
      });

      it('handles room without features', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15, width_ft: 12 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms[0].features).toBeUndefined();
      });

      it('handles decimal dimensions', async () => {
        const input: FloorplanData = {
          rooms: [
            {
              id: 'living_room',
              name: 'Living Room',
              dimensions: { length_ft: 15.5, width_ft: 12.25 },
            },
          ],
        };

        const result = await generateFloorplanData(input);

        expect(result.success).toBe(true);
        expect(result.data?.rooms[0].dimensions.length_ft).toBe(15.5);
        expect(result.data?.rooms[0].dimensions.width_ft).toBe(12.25);
      });
    });
  });
});
