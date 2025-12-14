import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EstimateZone,
  EstimateStructure,
  EstimateArea,
  EstimateMissingWall,
  EstimateSubroom,
  ZoneDimensions,
  ZoneType,
  ZoneStatus,
  EstimateStatus,
} from '@shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ZoneWithChildren extends Omit<EstimateZone, 'dimensions'> {
  dimensions: ZoneDimensions;
  missingWalls: EstimateMissingWall[];
  subrooms: EstimateSubroom[];
  lineItemCount: number;
  zoneTotals: {
    rcvTotal: number;
    acvTotal: number;
  };
}

export interface AreaWithChildren extends EstimateArea {
  zones: ZoneWithChildren[];
}

export interface StructureWithChildren extends EstimateStructure {
  areas: AreaWithChildren[];
}

export interface EstimateHierarchy {
  estimateId: string;
  structures: StructureWithChildren[];
}

export interface CreateStructureInput {
  name: string;
  description?: string;
  coverageId?: string;
  sketchName?: string;
  yearBuilt?: number;
  constructionType?: string;
  stories?: number;
}

export interface CreateAreaInput {
  name: string;
  areaType: string;
}

export interface CreateZoneInput {
  name: string;
  zoneCode?: string;
  zoneType?: ZoneType;
  roomType?: string;
  floorLevel?: string;
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  pitch?: string;
  damageType?: string;
  damageSeverity?: string;
  notes?: string;
}

export interface UpdateZoneInput {
  name?: string;
  zoneCode?: string;
  zoneType?: ZoneType;
  status?: ZoneStatus;
  roomType?: string;
  floorLevel?: string;
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  pitch?: string;
  damageType?: string;
  damageSeverity?: string;
  sketchPolygon?: any;
  notes?: string;
}

export interface CreateMissingWallInput {
  name?: string;
  openingType?: string;
  widthFt: number;
  heightFt: number;
  quantity?: number;
  goesToFloor?: boolean;
  goesToCeiling?: boolean;
  opensInto?: string;
}

export interface AddLineItemInput {
  lineItemCode: string;
  quantity: number;
  calcRef?: string;
  notes?: string;
  isHomeowner?: boolean;
  isCredit?: boolean;
  isNonOp?: boolean;
}

// ============================================
// API FUNCTIONS
// ============================================

async function fetchEstimateHierarchy(estimateId: string): Promise<EstimateHierarchy> {
  const response = await fetch(`/api/estimates/${estimateId}/hierarchy`);
  if (!response.ok) {
    throw new Error('Failed to fetch estimate hierarchy');
  }
  return response.json();
}

async function initializeHierarchy(estimateId: string, options?: {
  structureName?: string;
  includeInterior?: boolean;
  includeExterior?: boolean;
  includeRoofing?: boolean;
}): Promise<EstimateHierarchy> {
  const response = await fetch(`/api/estimates/${estimateId}/hierarchy/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!response.ok) {
    throw new Error('Failed to initialize estimate hierarchy');
  }
  return response.json();
}

async function recalculateEstimate(estimateId: string): Promise<any> {
  const response = await fetch(`/api/estimates/${estimateId}/recalculate`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to recalculate estimate');
  }
  return response.json();
}

// Structure API
async function createStructure(estimateId: string, input: CreateStructureInput): Promise<EstimateStructure> {
  const response = await fetch(`/api/estimates/${estimateId}/structures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create structure');
  }
  return response.json();
}

async function updateStructure(structureId: string, input: Partial<CreateStructureInput>): Promise<EstimateStructure> {
  const response = await fetch(`/api/structures/${structureId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to update structure');
  }
  return response.json();
}

async function deleteStructure(structureId: string): Promise<void> {
  const response = await fetch(`/api/structures/${structureId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete structure');
  }
}

// Area API
async function createArea(structureId: string, input: CreateAreaInput): Promise<EstimateArea> {
  const response = await fetch(`/api/structures/${structureId}/areas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create area');
  }
  return response.json();
}

async function updateArea(areaId: string, input: Partial<CreateAreaInput>): Promise<EstimateArea> {
  const response = await fetch(`/api/areas/${areaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to update area');
  }
  return response.json();
}

async function deleteArea(areaId: string): Promise<void> {
  const response = await fetch(`/api/areas/${areaId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete area');
  }
}

// Zone API
async function createZone(areaId: string, input: CreateZoneInput): Promise<EstimateZone> {
  const response = await fetch(`/api/areas/${areaId}/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create zone');
  }
  return response.json();
}

async function fetchZone(zoneId: string): Promise<EstimateZone> {
  const response = await fetch(`/api/zones/${zoneId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch zone');
  }
  return response.json();
}

async function fetchZoneWithChildren(zoneId: string): Promise<ZoneWithChildren> {
  const response = await fetch(`/api/zones/${zoneId}/full`);
  if (!response.ok) {
    throw new Error('Failed to fetch zone');
  }
  return response.json();
}

async function updateZone(zoneId: string, input: UpdateZoneInput): Promise<EstimateZone> {
  const response = await fetch(`/api/zones/${zoneId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to update zone');
  }
  return response.json();
}

async function recalculateZoneDimensions(zoneId: string): Promise<ZoneDimensions> {
  const response = await fetch(`/api/zones/${zoneId}/calculate-dimensions`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to recalculate dimensions');
  }
  const data = await response.json();
  return data.dimensions;
}

async function deleteZone(zoneId: string): Promise<void> {
  const response = await fetch(`/api/zones/${zoneId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete zone');
  }
}

// Missing Wall API
async function createMissingWall(zoneId: string, input: CreateMissingWallInput): Promise<EstimateMissingWall> {
  const response = await fetch(`/api/zones/${zoneId}/missing-walls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create missing wall');
  }
  return response.json();
}

async function deleteMissingWall(wallId: string): Promise<void> {
  const response = await fetch(`/api/missing-walls/${wallId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete missing wall');
  }
}

// Line Item API
async function fetchZoneLineItems(zoneId: string): Promise<any[]> {
  const response = await fetch(`/api/zones/${zoneId}/line-items`);
  if (!response.ok) {
    throw new Error('Failed to fetch line items');
  }
  return response.json();
}

async function addLineItemToZone(zoneId: string, input: AddLineItemInput): Promise<ZoneWithChildren> {
  const response = await fetch(`/api/zones/${zoneId}/line-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to add line item');
  }
  return response.json();
}

async function updateLineItem(lineItemId: string, updates: any): Promise<any> {
  const response = await fetch(`/api/line-items/${lineItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error('Failed to update line item');
  }
  return response.json();
}

async function deleteLineItem(lineItemId: string): Promise<void> {
  const response = await fetch(`/api/line-items/${lineItemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete line item');
  }
}

// ============================================
// MAIN HOOK
// ============================================

export function useEstimateBuilder(estimateId: string) {
  const queryClient = useQueryClient();
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [activeLineItemId, setActiveLineItemId] = useState<string | null>(null);

  // Query for the full hierarchy
  const hierarchyQuery = useQuery({
    queryKey: ['estimate-hierarchy', estimateId],
    queryFn: () => fetchEstimateHierarchy(estimateId),
    enabled: !!estimateId,
    staleTime: 30000, // Consider fresh for 30 seconds
  });

  // Query for active zone details
  const activeZoneQuery = useQuery({
    queryKey: ['zone', activeZoneId],
    queryFn: () => activeZoneId ? fetchZoneWithChildren(activeZoneId) : null,
    enabled: !!activeZoneId,
  });

  // Mutations
  const initializeMutation = useMutation({
    mutationFn: (options?: Parameters<typeof initializeHierarchy>[1]) =>
      initializeHierarchy(estimateId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: () => recalculateEstimate(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['estimate', estimateId] });
    },
  });

  // Structure mutations
  const createStructureMutation = useMutation({
    mutationFn: (input: CreateStructureInput) => createStructure(estimateId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const updateStructureMutation = useMutation({
    mutationFn: ({ structureId, input }: { structureId: string; input: Partial<CreateStructureInput> }) =>
      updateStructure(structureId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const deleteStructureMutation = useMutation({
    mutationFn: deleteStructure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  // Area mutations
  const createAreaMutation = useMutation({
    mutationFn: ({ structureId, input }: { structureId: string; input: CreateAreaInput }) =>
      createArea(structureId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const updateAreaMutation = useMutation({
    mutationFn: ({ areaId, input }: { areaId: string; input: Partial<CreateAreaInput> }) =>
      updateArea(areaId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const deleteAreaMutation = useMutation({
    mutationFn: deleteArea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  // Zone mutations
  const createZoneMutation = useMutation({
    mutationFn: ({ areaId, input }: { areaId: string; input: CreateZoneInput }) =>
      createZone(areaId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ zoneId, input }: { zoneId: string; input: UpdateZoneInput }) =>
      updateZone(zoneId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['zone', variables.zoneId] });
    },
  });

  const recalcZoneMutation = useMutation({
    mutationFn: recalculateZoneDimensions,
    onSuccess: (_, zoneId) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['zone', zoneId] });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: deleteZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
      setActiveZoneId(null);
    },
  });

  // Missing wall mutations
  const createMissingWallMutation = useMutation({
    mutationFn: ({ zoneId, input }: { zoneId: string; input: CreateMissingWallInput }) =>
      createMissingWall(zoneId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['zone', variables.zoneId] });
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const deleteMissingWallMutation = useMutation({
    mutationFn: deleteMissingWall,
    onSuccess: () => {
      if (activeZoneId) {
        queryClient.invalidateQueries({ queryKey: ['zone', activeZoneId] });
      }
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  // Line item mutations
  const addLineItemMutation = useMutation({
    mutationFn: ({ zoneId, input }: { zoneId: string; input: AddLineItemInput }) =>
      addLineItemToZone(zoneId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['zone', variables.zoneId] });
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: ({ lineItemId, updates }: { lineItemId: string; updates: any }) =>
      updateLineItem(lineItemId, updates),
    onSuccess: () => {
      if (activeZoneId) {
        queryClient.invalidateQueries({ queryKey: ['zone', activeZoneId] });
      }
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: deleteLineItem,
    onSuccess: () => {
      if (activeZoneId) {
        queryClient.invalidateQueries({ queryKey: ['zone', activeZoneId] });
      }
      queryClient.invalidateQueries({ queryKey: ['estimate-hierarchy', estimateId] });
    },
  });

  // Computed values
  const totalZones = useMemo(() => {
    if (!hierarchyQuery.data) return 0;
    return hierarchyQuery.data.structures.reduce((total, structure) => {
      return total + structure.areas.reduce((areaTotal, area) => {
        return areaTotal + area.zones.length;
      }, 0);
    }, 0);
  }, [hierarchyQuery.data]);

  const totalLineItems = useMemo(() => {
    if (!hierarchyQuery.data) return 0;
    return hierarchyQuery.data.structures.reduce((total, structure) => {
      return total + structure.areas.reduce((areaTotal, area) => {
        return areaTotal + area.zones.reduce((zoneTotal, zone) => {
          return zoneTotal + zone.lineItemCount;
        }, 0);
      }, 0);
    }, 0);
  }, [hierarchyQuery.data]);

  const estimateTotals = useMemo(() => {
    if (!hierarchyQuery.data) return { rcvTotal: 0, acvTotal: 0 };
    return hierarchyQuery.data.structures.reduce(
      (total, structure) => {
        structure.areas.forEach(area => {
          area.zones.forEach(zone => {
            total.rcvTotal += zone.zoneTotals.rcvTotal;
            total.acvTotal += zone.zoneTotals.acvTotal;
          });
        });
        return total;
      },
      { rcvTotal: 0, acvTotal: 0 }
    );
  }, [hierarchyQuery.data]);

  return {
    // Data
    hierarchy: hierarchyQuery.data,
    activeZone: activeZoneQuery.data,
    isLoading: hierarchyQuery.isLoading,
    isError: hierarchyQuery.isError,
    error: hierarchyQuery.error,

    // State
    activeZoneId,
    activeLineItemId,
    setActiveZoneId,
    setActiveLineItemId,

    // Computed
    totalZones,
    totalLineItems,
    estimateTotals,

    // Actions
    initialize: initializeMutation.mutateAsync,
    recalculate: recalculateMutation.mutateAsync,

    // Structure actions
    createStructure: createStructureMutation.mutateAsync,
    updateStructure: (structureId: string, input: Partial<CreateStructureInput>) =>
      updateStructureMutation.mutateAsync({ structureId, input }),
    deleteStructure: deleteStructureMutation.mutateAsync,

    // Area actions
    createArea: (structureId: string, input: CreateAreaInput) =>
      createAreaMutation.mutateAsync({ structureId, input }),
    updateArea: (areaId: string, input: Partial<CreateAreaInput>) =>
      updateAreaMutation.mutateAsync({ areaId, input }),
    deleteArea: deleteAreaMutation.mutateAsync,

    // Zone actions
    createZone: (areaId: string, input: CreateZoneInput) =>
      createZoneMutation.mutateAsync({ areaId, input }),
    updateZone: (zoneId: string, input: UpdateZoneInput) =>
      updateZoneMutation.mutateAsync({ zoneId, input }),
    recalcZoneDimensions: recalcZoneMutation.mutateAsync,
    deleteZone: deleteZoneMutation.mutateAsync,

    // Missing wall actions
    createMissingWall: (zoneId: string, input: CreateMissingWallInput) =>
      createMissingWallMutation.mutateAsync({ zoneId, input }),
    deleteMissingWall: deleteMissingWallMutation.mutateAsync,

    // Line item actions
    addLineItem: (zoneId: string, input: AddLineItemInput) =>
      addLineItemMutation.mutateAsync({ zoneId, input }),
    updateLineItem: (lineItemId: string, updates: any) =>
      updateLineItemMutation.mutateAsync({ lineItemId, updates }),
    deleteLineItem: deleteLineItemMutation.mutateAsync,

    // Loading states
    isInitializing: initializeMutation.isPending,
    isRecalculating: recalculateMutation.isPending,
    isSaving: createStructureMutation.isPending ||
              updateStructureMutation.isPending ||
              createAreaMutation.isPending ||
              createZoneMutation.isPending ||
              updateZoneMutation.isPending ||
              addLineItemMutation.isPending,

    // Refetch
    refetch: hierarchyQuery.refetch,
  };
}

// ============================================
// HELPER HOOKS
// ============================================

export function useZone(zoneId: string | null) {
  return useQuery({
    queryKey: ['zone', zoneId],
    queryFn: () => zoneId ? fetchZoneWithChildren(zoneId) : null,
    enabled: !!zoneId,
  });
}

export function useZoneLineItems(zoneId: string | null) {
  return useQuery({
    queryKey: ['zone-line-items', zoneId],
    queryFn: () => zoneId ? fetchZoneLineItems(zoneId) : [],
    enabled: !!zoneId,
  });
}

// ============================================
// DIMENSION UTILITIES
// ============================================

export const DIMENSION_LABELS: Record<keyof ZoneDimensions, string> = {
  sfFloor: 'Floor SF',
  syFloor: 'Floor SY',
  lfFloorPerim: 'Floor Perimeter LF',
  sfCeiling: 'Ceiling SF',
  lfCeilingPerim: 'Ceiling Perimeter LF',
  sfWalls: 'Walls SF',
  sfWallsCeiling: 'Walls + Ceiling SF',
  sfLongWall: 'Long Wall SF',
  sfShortWall: 'Short Wall SF',
  sfTotal: 'Total SF',
  sfSkRoof: 'Roof SF (Sloped)',
  skRoofSquares: 'Roof Squares',
  lfSkRoofPerim: 'Roof Perimeter LF',
  lfSkRoofRidge: 'Ridge LF',
  lfSkRoofEave: 'Eave LF',
  lfSkRoofRake: 'Rake LF',
  lfTotal: 'Total LF',
  lfRailing: 'Railing LF',
};

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  room: 'Room',
  elevation: 'Elevation',
  roof: 'Roof',
  deck: 'Deck',
  linear: 'Linear',
  custom: 'Custom',
};

export const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  pending: 'Pending',
  measured: 'Measured',
  scoped: 'Scoped',
  complete: 'Complete',
};

export function getDimensionsForZoneType(zoneType: ZoneType): (keyof ZoneDimensions)[] {
  switch (zoneType) {
    case 'room':
      return ['sfFloor', 'syFloor', 'lfFloorPerim', 'sfCeiling', 'sfWalls', 'sfWallsCeiling', 'sfLongWall', 'sfShortWall'];
    case 'elevation':
      return ['sfWalls', 'sfLongWall'];
    case 'roof':
      return ['sfFloor', 'sfSkRoof', 'skRoofSquares', 'lfSkRoofPerim', 'lfSkRoofRidge', 'lfSkRoofEave', 'lfSkRoofRake'];
    case 'deck':
      return ['sfFloor', 'syFloor', 'lfFloorPerim', 'lfRailing'];
    case 'linear':
      return ['lfTotal'];
    default:
      return ['sfFloor', 'syFloor', 'lfFloorPerim'];
  }
}
