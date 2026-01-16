/**
 * Flow Definition Service
 *
 * Handles CRUD operations and validation for flow definitions.
 * Flow definitions define the inspection movements an adjuster performs for specific peril types.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { FlowJson, FlowJsonPhase, FlowJsonMovement, FlowJsonGate, FlowJsonEvidenceRequirement } from '../../shared/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface FlowDefinitionInput {
  organizationId?: string | null;
  name: string;
  description?: string;
  perilType: string;
  propertyType: string;
  flowJson: FlowJson;
  isActive?: boolean;
  createdBy?: string;
}

export interface FlowDefinitionSummary {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  perilType: string;
  propertyType: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  phaseCount: number;
  movementCount: number;
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Get all flow definitions
 */
export async function getAllFlowDefinitions(organizationId?: string): Promise<FlowDefinitionSummary[]> {
  let query = supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .order('updated_at', { ascending: false });

  if (organizationId) {
    // Get org-specific and system-wide definitions
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[FlowDefinitionService] Error fetching flow definitions:', error);
    throw new Error(`Failed to fetch flow definitions: ${error.message}`);
  }

  return (data || []).map(def => {
    const flowJson = def.flow_json as FlowJson;
    const phaseCount = flowJson?.phases?.length || 0;
    const movementCount = flowJson?.phases?.reduce((sum, phase) => sum + (phase.movements?.length || 0), 0) || 0;

    return {
      id: def.id,
      organizationId: def.organization_id,
      name: def.name,
      description: def.description,
      perilType: def.peril_type,
      propertyType: def.property_type,
      version: def.version,
      isActive: def.is_active,
      createdAt: def.created_at,
      updatedAt: def.updated_at,
      phaseCount,
      movementCount,
    };
  });
}

/**
 * Get a single flow definition by ID
 */
export async function getFlowDefinition(id: string) {
  const { data, error } = await supabaseAdmin
    .from('flow_definitions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[FlowDefinitionService] Error fetching flow definition:', error);
    throw new Error(`Failed to fetch flow definition: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    perilType: data.peril_type,
    propertyType: data.property_type,
    flowJson: data.flow_json as FlowJson,
    version: data.version,
    isActive: data.is_active,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Create a new flow definition
 */
export async function createFlowDefinition(input: FlowDefinitionInput) {
  // Validate the flow JSON before saving
  const validation = validateFlowJson(input.flowJson);
  if (!validation.isValid) {
    throw new Error(`Invalid flow JSON: ${validation.errors.map(e => e.message).join(', ')}`);
  }

  const { data, error } = await supabaseAdmin
    .from('flow_definitions')
    .insert({
      organization_id: input.organizationId || null,
      name: input.name,
      description: input.description || null,
      peril_type: input.perilType,
      property_type: input.propertyType,
      flow_json: input.flowJson,
      is_active: input.isActive ?? true,
      created_by: input.createdBy || null,
      version: 1,
    })
    .select()
    .single();

  if (error) {
    console.error('[FlowDefinitionService] Error creating flow definition:', error);
    throw new Error(`Failed to create flow definition: ${error.message}`);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    perilType: data.peril_type,
    propertyType: data.property_type,
    flowJson: data.flow_json as FlowJson,
    version: data.version,
    isActive: data.is_active,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update an existing flow definition
 */
export async function updateFlowDefinition(id: string, input: Partial<FlowDefinitionInput>) {
  // If updating flowJson, validate it first
  if (input.flowJson) {
    const validation = validateFlowJson(input.flowJson);
    if (!validation.isValid) {
      throw new Error(`Invalid flow JSON: ${validation.errors.map(e => e.message).join(', ')}`);
    }
  }

  // Get current version to increment
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('flow_definitions')
    .select('version')
    .eq('id', id)
    .single();

  if (fetchError || !current) {
    throw new Error(`Flow definition not found: ${id}`);
  }

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
    version: current.version + 1,
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.perilType !== undefined) updateData.peril_type = input.perilType;
  if (input.propertyType !== undefined) updateData.property_type = input.propertyType;
  if (input.flowJson !== undefined) updateData.flow_json = input.flowJson;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.organizationId !== undefined) updateData.organization_id = input.organizationId;

  const { data, error } = await supabaseAdmin
    .from('flow_definitions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[FlowDefinitionService] Error updating flow definition:', error);
    throw new Error(`Failed to update flow definition: ${error.message}`);
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    perilType: data.peril_type,
    propertyType: data.property_type,
    flowJson: data.flow_json as FlowJson,
    version: data.version,
    isActive: data.is_active,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Delete a flow definition
 */
export async function deleteFlowDefinition(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('flow_definitions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[FlowDefinitionService] Error deleting flow definition:', error);
    throw new Error(`Failed to delete flow definition: ${error.message}`);
  }
}

/**
 * Duplicate a flow definition
 */
export async function duplicateFlowDefinition(id: string, newName: string) {
  // Get the original flow definition
  const original = await getFlowDefinition(id);
  if (!original) {
    throw new Error(`Flow definition not found: ${id}`);
  }

  // Update the metadata name in flowJson as well
  const flowJsonCopy = JSON.parse(JSON.stringify(original.flowJson)) as FlowJson;
  flowJsonCopy.metadata.name = newName;

  // Create a new flow definition with the same data but new name
  return createFlowDefinition({
    organizationId: original.organizationId,
    name: newName,
    description: original.description || '',
    perilType: original.perilType,
    propertyType: original.propertyType,
    flowJson: flowJsonCopy,
    isActive: false, // Start inactive to allow review
    createdBy: original.createdBy,
  });
}

/**
 * Toggle active status
 */
export async function toggleActiveStatus(id: string) {
  // Get current status
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('flow_definitions')
    .select('is_active')
    .eq('id', id)
    .single();

  if (fetchError || !current) {
    throw new Error(`Flow definition not found: ${id}`);
  }

  const { data, error } = await supabaseAdmin
    .from('flow_definitions')
    .update({
      is_active: !current.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[FlowDefinitionService] Error toggling active status:', error);
    throw new Error(`Failed to toggle active status: ${error.message}`);
  }

  return {
    id: data.id,
    isActive: data.is_active,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate flow JSON structure
 */
export function validateFlowJson(flowJson: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Basic structure validation
  if (!flowJson) {
    errors.push({ path: '', message: 'Flow JSON is required', severity: 'error' });
    return { isValid: false, errors, warnings };
  }

  // Schema version
  if (!flowJson.schema_version) {
    errors.push({ path: 'schema_version', message: 'Schema version is required', severity: 'error' });
  }

  // Metadata validation
  if (!flowJson.metadata) {
    errors.push({ path: 'metadata', message: 'Metadata is required', severity: 'error' });
  } else {
    if (!flowJson.metadata.name) {
      errors.push({ path: 'metadata.name', message: 'Flow name is required in metadata', severity: 'error' });
    }
    if (!flowJson.metadata.primary_peril) {
      warnings.push({ path: 'metadata.primary_peril', message: 'Primary peril should be specified', severity: 'warning' });
    }
    if (typeof flowJson.metadata.estimated_duration_minutes !== 'number') {
      warnings.push({ path: 'metadata.estimated_duration_minutes', message: 'Estimated duration should be a number', severity: 'warning' });
    }
  }

  // Phases validation
  if (!flowJson.phases || !Array.isArray(flowJson.phases)) {
    errors.push({ path: 'phases', message: 'Phases array is required', severity: 'error' });
  } else if (flowJson.phases.length === 0) {
    warnings.push({ path: 'phases', message: 'Flow has no phases defined', severity: 'warning' });
  } else {
    const phaseIds = new Set<string>();
    const allMovementIds = new Set<string>();

    flowJson.phases.forEach((phase: FlowJsonPhase, pIndex: number) => {
      const phasePath = `phases[${pIndex}]`;

      // Check phase ID
      if (!phase.id) {
        errors.push({ path: `${phasePath}.id`, message: `Phase ${pIndex + 1} is missing an ID`, severity: 'error' });
      } else if (phaseIds.has(phase.id)) {
        errors.push({ path: `${phasePath}.id`, message: `Duplicate phase ID: ${phase.id}`, severity: 'error' });
      } else {
        phaseIds.add(phase.id);
      }

      // Check phase name
      if (!phase.name) {
        errors.push({ path: `${phasePath}.name`, message: `Phase ${pIndex + 1} is missing a name`, severity: 'error' });
      }

      // Check sequence order
      if (typeof phase.sequence_order !== 'number') {
        errors.push({ path: `${phasePath}.sequence_order`, message: `Phase ${phase.id || pIndex + 1} is missing sequence_order`, severity: 'error' });
      } else if (phase.sequence_order !== pIndex + 1) {
        warnings.push({ path: `${phasePath}.sequence_order`, message: `Phase ${phase.id || pIndex + 1} sequence_order (${phase.sequence_order}) doesn't match its position (${pIndex + 1})`, severity: 'warning' });
      }

      // Validate movements
      if (!phase.movements || !Array.isArray(phase.movements)) {
        warnings.push({ path: `${phasePath}.movements`, message: `Phase ${phase.id || pIndex + 1} has no movements array`, severity: 'warning' });
      } else {
        phase.movements.forEach((movement: FlowJsonMovement, mIndex: number) => {
          const movementPath = `${phasePath}.movements[${mIndex}]`;

          // Check movement ID
          if (!movement.id) {
            errors.push({ path: `${movementPath}.id`, message: `Movement ${mIndex + 1} in phase ${phase.id || pIndex + 1} is missing an ID`, severity: 'error' });
          } else if (allMovementIds.has(movement.id)) {
            errors.push({ path: `${movementPath}.id`, message: `Duplicate movement ID: ${movement.id}`, severity: 'error' });
          } else {
            allMovementIds.add(movement.id);

            // Check movement ID follows pattern
            const expectedPrefix = phase.id ? `${phase.id}_` : '';
            if (expectedPrefix && !movement.id.startsWith(expectedPrefix)) {
              warnings.push({ path: `${movementPath}.id`, message: `Movement ID ${movement.id} should start with phase prefix ${expectedPrefix}`, severity: 'warning' });
            }
          }

          // Check movement name
          if (!movement.name) {
            errors.push({ path: `${movementPath}.name`, message: `Movement ${movement.id || mIndex + 1} is missing a name`, severity: 'error' });
          }

          // Check sequence order
          if (typeof movement.sequence_order !== 'number') {
            errors.push({ path: `${movementPath}.sequence_order`, message: `Movement ${movement.id || mIndex + 1} is missing sequence_order`, severity: 'error' });
          }

          // Check criticality
          if (movement.criticality && !['high', 'medium', 'low'].includes(movement.criticality)) {
            errors.push({ path: `${movementPath}.criticality`, message: `Movement ${movement.id || mIndex + 1} has invalid criticality: ${movement.criticality}`, severity: 'error' });
          }

          // Check guidance
          if (!movement.guidance) {
            warnings.push({ path: `${movementPath}.guidance`, message: `Movement ${movement.id || mIndex + 1} is missing guidance`, severity: 'warning' });
          } else {
            if (!movement.guidance.instruction) {
              warnings.push({ path: `${movementPath}.guidance.instruction`, message: `Movement ${movement.id || mIndex + 1} is missing instruction text`, severity: 'warning' });
            }
            if (!movement.guidance.tts_text) {
              warnings.push({ path: `${movementPath}.guidance.tts_text`, message: `Movement ${movement.id || mIndex + 1} is missing TTS text`, severity: 'warning' });
            }
          }

          // Check evidence requirements
          if (movement.evidence_requirements && Array.isArray(movement.evidence_requirements)) {
            movement.evidence_requirements.forEach((req: FlowJsonEvidenceRequirement, rIndex: number) => {
              const reqPath = `${movementPath}.evidence_requirements[${rIndex}]`;

              if (!req.type) {
                errors.push({ path: `${reqPath}.type`, message: `Evidence requirement ${rIndex + 1} is missing type`, severity: 'error' });
              } else if (!['photo', 'voice_note', 'measurement'].includes(req.type)) {
                errors.push({ path: `${reqPath}.type`, message: `Invalid evidence type: ${req.type}`, severity: 'error' });
              }

              if (typeof req.quantity_min !== 'number' || req.quantity_min < 0) {
                warnings.push({ path: `${reqPath}.quantity_min`, message: `Evidence requirement should have valid quantity_min`, severity: 'warning' });
              }

              if (typeof req.quantity_max !== 'number' || req.quantity_max < 0) {
                warnings.push({ path: `${reqPath}.quantity_max`, message: `Evidence requirement should have valid quantity_max`, severity: 'warning' });
              }

              if (req.quantity_min !== undefined && req.quantity_max !== undefined && req.quantity_min > req.quantity_max) {
                errors.push({ path: `${reqPath}`, message: `quantity_min cannot be greater than quantity_max`, severity: 'error' });
              }
            });
          }
        });
      }
    });

    // Check for sequence order gaps
    const sequenceOrders = flowJson.phases.map((p: FlowJsonPhase) => p.sequence_order).filter((s: any) => typeof s === 'number');
    const sortedOrders = [...sequenceOrders].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        warnings.push({ path: 'phases', message: `Phase sequence_order has gaps or doesn't start at 1`, severity: 'warning' });
        break;
      }
    }
  }

  // Gates validation
  if (flowJson.gates && Array.isArray(flowJson.gates)) {
    const gateIds = new Set<string>();
    const phaseIds = new Set(flowJson.phases?.map((p: FlowJsonPhase) => p.id) || []);

    flowJson.gates.forEach((gate: FlowJsonGate, gIndex: number) => {
      const gatePath = `gates[${gIndex}]`;

      // Check gate ID
      if (!gate.id) {
        errors.push({ path: `${gatePath}.id`, message: `Gate ${gIndex + 1} is missing an ID`, severity: 'error' });
      } else if (gateIds.has(gate.id)) {
        errors.push({ path: `${gatePath}.id`, message: `Duplicate gate ID: ${gate.id}`, severity: 'error' });
      } else {
        gateIds.add(gate.id);
      }

      // Check from_phase and to_phase reference valid phases
      if (gate.from_phase && !phaseIds.has(gate.from_phase)) {
        errors.push({ path: `${gatePath}.from_phase`, message: `Gate ${gate.id || gIndex + 1} references non-existent phase: ${gate.from_phase}`, severity: 'error' });
      }

      if (gate.to_phase && !phaseIds.has(gate.to_phase)) {
        errors.push({ path: `${gatePath}.to_phase`, message: `Gate ${gate.id || gIndex + 1} references non-existent phase: ${gate.to_phase}`, severity: 'error' });
      }

      // Check gate type
      if (gate.gate_type && !['blocking', 'advisory'].includes(gate.gate_type)) {
        errors.push({ path: `${gatePath}.gate_type`, message: `Invalid gate type: ${gate.gate_type}`, severity: 'error' });
      }

      // Check evaluation criteria
      if (!gate.evaluation_criteria) {
        warnings.push({ path: `${gatePath}.evaluation_criteria`, message: `Gate ${gate.id || gIndex + 1} is missing evaluation criteria`, severity: 'warning' });
      } else {
        if (!gate.evaluation_criteria.type || !['ai', 'simple'].includes(gate.evaluation_criteria.type)) {
          errors.push({ path: `${gatePath}.evaluation_criteria.type`, message: `Invalid evaluation type: ${gate.evaluation_criteria.type}`, severity: 'error' });
        }

        if (gate.evaluation_criteria.type === 'ai' && !gate.evaluation_criteria.ai_prompt_key) {
          warnings.push({ path: `${gatePath}.evaluation_criteria.ai_prompt_key`, message: `AI gate ${gate.id || gIndex + 1} should have ai_prompt_key`, severity: 'warning' });
        }

        if (gate.evaluation_criteria.type === 'simple' && !gate.evaluation_criteria.simple_rules) {
          warnings.push({ path: `${gatePath}.evaluation_criteria.simple_rules`, message: `Simple gate ${gate.id || gIndex + 1} should have simple_rules`, severity: 'warning' });
        }
      }
    });

    // Check for circular dependencies in gates
    if (flowJson.gates.length > 0) {
      const adjacencyList = new Map<string, string[]>();
      flowJson.gates.forEach((gate: FlowJsonGate) => {
        if (gate.from_phase && gate.to_phase) {
          if (!adjacencyList.has(gate.from_phase)) {
            adjacencyList.set(gate.from_phase, []);
          }
          adjacencyList.get(gate.from_phase)!.push(gate.to_phase);
        }
      });

      // Simple cycle detection using DFS
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      function hasCycle(node: string): boolean {
        if (recursionStack.has(node)) return true;
        if (visited.has(node)) return false;

        visited.add(node);
        recursionStack.add(node);

        const neighbors = adjacencyList.get(node) || [];
        for (const neighbor of neighbors) {
          if (hasCycle(neighbor)) return true;
        }

        recursionStack.delete(node);
        return false;
      }

      for (const node of adjacencyList.keys()) {
        if (hasCycle(node)) {
          errors.push({ path: 'gates', message: 'Circular gate dependencies detected', severity: 'error' });
          break;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get the default empty flow template
 */
export function getEmptyFlowTemplate(): FlowJson {
  return {
    schema_version: "1.0",
    metadata: {
      name: "New Flow",
      description: "",
      estimated_duration_minutes: 60,
      primary_peril: "water",
      secondary_perils: [],
    },
    phases: [
      {
        id: "arrival",
        name: "Arrival",
        description: "Initial property documentation",
        sequence_order: 1,
        movements: [],
      },
    ],
    gates: [],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getAllFlowDefinitions,
  getFlowDefinition,
  createFlowDefinition,
  updateFlowDefinition,
  deleteFlowDefinition,
  duplicateFlowDefinition,
  toggleActiveStatus,
  validateFlowJson,
  getEmptyFlowTemplate,
};
