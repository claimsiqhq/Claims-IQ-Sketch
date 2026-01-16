import { supabaseAdmin } from '../../lib/supabaseAdmin';

/**
 * Flow Definition JSON structure that defines the workflow steps
 */
export interface FlowDefinitionJson {
  steps: FlowStep[];
  metadata?: {
    version?: string;
    author?: string;
    createdAt?: string;
  };
}

export interface FlowStep {
  id: string;
  name: string;
  type: 'task' | 'decision' | 'parallel' | 'wait';
  description?: string;
  nextSteps?: string[];
  conditions?: FlowCondition[];
  actions?: FlowAction[];
}

export interface FlowCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: any;
  nextStep: string;
}

export interface FlowAction {
  type: string;
  params?: Record<string, any>;
}

/**
 * Flow Definition interface matching the actual database schema
 *
 * Database columns:
 * - id, organization_id, flow_key, name, description, version
 * - perils (array), property_types (array), flow_json, source_rules
 * - is_active, is_system, created_at, updated_at
 */
export interface FlowDefinition {
  id: string;
  flowKey: string;
  name: string;
  description?: string;
  perils: string[];
  propertyTypes: string[];
  version: number;
  definition: FlowDefinitionJson;
  isActive: boolean;
}

/**
 * Flow instance representing an active workflow for a claim
 */
export interface FlowInstance {
  id: string;
  flowDefinitionId: string;
  claimId: string;
  currentStepId: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  context: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Normalizes database row to FlowDefinition interface
 */
function normalizeFlowDefinition(row: any): FlowDefinition {
  return {
    id: row.id,
    flowKey: row.flow_key,
    perils: row.perils || [],
    propertyTypes: row.property_types || [],
    version: row.version,
    definition: row.flow_json,
    isActive: row.is_active,
    name: row.name,
    description: row.description
  };
}

/**
 * Get a flow definition for a specific claim based on peril type and property type.
 * Uses array contains queries since perils and property_types are arrays.
 *
 * @param perilType - The type of peril (e.g., 'wind_hail', 'water', 'fire')
 * @param propertyType - The type of property (e.g., 'residential', 'commercial')
 * @returns The matching flow definition or null if not found
 */
export async function getFlowForClaim(
  perilType: string,
  propertyType: string = 'residential'
): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .contains('perils', [perilType.toLowerCase()])
      .contains('property_types', [propertyType.toLowerCase()])
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // If no specific match found, try to find a generic flow
      const { data: genericFlow, error: genericError } = await supabaseAdmin
        .from('flow_definitions')
        .select('*')
        .eq('flow_key', 'generic')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (genericError || !genericFlow) {
        return null;
      }
      return normalizeFlowDefinition(genericFlow);
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definition:', error);
    return null;
  }
}

/**
 * Get all active flow definitions for an organization
 */
export async function getAllFlowDefinitions(
  organizationId?: string
): Promise<FlowDefinition[]> {
  try {
    let query = supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (organizationId) {
      query = query.or(`organization_id.eq.${organizationId},is_system.eq.true`);
    }

    const { data, error } = await query;

    if (error || !data) {
      console.error('[FlowEngine] Error fetching flow definitions:', error);
      return [];
    }

    return data.map(normalizeFlowDefinition);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definitions:', error);
    return [];
  }
}

/**
 * Get a specific flow definition by ID
 */
export async function getFlowDefinitionById(
  flowId: string
): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('id', flowId)
      .single();

    if (error || !data) {
      return null;
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definition by ID:', error);
    return null;
  }
}

/**
 * Get a flow definition by flow key
 */
export async function getFlowDefinitionByKey(
  flowKey: string
): Promise<FlowDefinition | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_definitions')
      .select('*')
      .eq('flow_key', flowKey)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return normalizeFlowDefinition(data);
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow definition by key:', error);
    return null;
  }
}

/**
 * Start a flow instance for a claim
 */
export async function startFlow(
  claimId: string,
  perilType: string,
  propertyType: string = 'residential',
  initialContext: Record<string, any> = {}
): Promise<FlowInstance | null> {
  try {
    const flowDef = await getFlowForClaim(perilType, propertyType);
    if (!flowDef) {
      console.error('[FlowEngine] No flow definition found for claim');
      return null;
    }

    const definition = flowDef.definition as FlowDefinitionJson;
    const firstStep = definition.steps?.[0];

    if (!firstStep) {
      console.error('[FlowEngine] Flow definition has no steps');
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from('flow_instances')
      .insert({
        flow_definition_id: flowDef.id,
        claim_id: claimId,
        current_step_id: firstStep.id,
        status: 'active',
        context: {
          ...initialContext,
          perilType,
          propertyType,
          startedAt: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[FlowEngine] Error creating flow instance:', error);
      return null;
    }

    return {
      id: data.id,
      flowDefinitionId: data.flow_definition_id,
      claimId: data.claim_id,
      currentStepId: data.current_step_id,
      status: data.status,
      context: data.context,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  } catch (error) {
    console.error('[FlowEngine] Error starting flow:', error);
    return null;
  }
}

/**
 * Get the current flow instance for a claim
 */
export async function getFlowInstanceForClaim(
  claimId: string
): Promise<FlowInstance | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('flow_instances')
      .select('*')
      .eq('claim_id', claimId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      flowDefinitionId: data.flow_definition_id,
      claimId: data.claim_id,
      currentStepId: data.current_step_id,
      status: data.status,
      context: data.context,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  } catch (error) {
    console.error('[FlowEngine] Error fetching flow instance:', error);
    return null;
  }
}

/**
 * Advance the flow to the next step
 */
export async function advanceFlow(
  instanceId: string,
  nextStepId: string,
  contextUpdates: Record<string, any> = {}
): Promise<FlowInstance | null> {
  try {
    const { data: currentInstance, error: fetchError } = await supabaseAdmin
      .from('flow_instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (fetchError || !currentInstance) {
      console.error('[FlowEngine] Flow instance not found');
      return null;
    }

    const updatedContext = {
      ...currentInstance.context,
      ...contextUpdates,
      lastStepId: currentInstance.current_step_id,
      advancedAt: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('flow_instances')
      .update({
        current_step_id: nextStepId,
        context: updatedContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId)
      .select()
      .single();

    if (error || !data) {
      console.error('[FlowEngine] Error advancing flow:', error);
      return null;
    }

    return {
      id: data.id,
      flowDefinitionId: data.flow_definition_id,
      claimId: data.claim_id,
      currentStepId: data.current_step_id,
      status: data.status,
      context: data.context,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  } catch (error) {
    console.error('[FlowEngine] Error advancing flow:', error);
    return null;
  }
}

/**
 * Complete a flow instance
 */
export async function completeFlow(
  instanceId: string,
  finalContext: Record<string, any> = {}
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('flow_instances')
      .update({
        status: 'completed',
        context: finalContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId);

    return !error;
  } catch (error) {
    console.error('[FlowEngine] Error completing flow:', error);
    return false;
  }
}

/**
 * Cancel a flow instance
 */
export async function cancelFlow(
  instanceId: string,
  reason?: string
): Promise<boolean> {
  try {
    const { data: currentInstance, error: fetchError } = await supabaseAdmin
      .from('flow_instances')
      .select('context')
      .eq('id', instanceId)
      .single();

    if (fetchError) {
      return false;
    }

    const updatedContext = {
      ...(currentInstance?.context || {}),
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason
    };

    const { error } = await supabaseAdmin
      .from('flow_instances')
      .update({
        status: 'cancelled',
        context: updatedContext,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId);

    return !error;
  } catch (error) {
    console.error('[FlowEngine] Error cancelling flow:', error);
    return false;
  }
}
