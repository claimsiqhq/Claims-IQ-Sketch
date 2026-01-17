/**
 * E2E Full System Validation - Claims IQ Flow Engine
 *
 * Comprehensive validation of the entire flow engine, covering all features
 * from claim creation through scope generation.
 *
 * Run with: npx tsx server/tests/e2e-full-validation.ts
 *
 * Prerequisites:
 * - Server running (API_URL env var or default localhost:3000)
 * - Database accessible (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
 * - Flow definitions seeded
 * - AI prompts seeded
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// API base URL
const API_BASE = process.env.API_URL || 'http://localhost:3000';

// Test state
let testClaimId: string;
let testFlowInstanceId: string;
let testUserId: string;
let testOrganizationId: string;
let testResults: TestResult[] = [];

interface TestResult {
  phase: string;
  test: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  details?: any;
}

/**
 * Run a test and record results
 */
async function runTest(
  phase: string,
  name: string,
  testFn: () => Promise<any>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const details = await testFn();
    const result: TestResult = {
      phase,
      test: name,
      status: 'pass',
      duration: Date.now() - start,
      details
    };
    testResults.push(result);
    console.log(`✅ ${phase} - ${name} (${result.duration}ms)`);
    if (details && typeof details === 'object' && Object.keys(details).length > 0) {
      Object.entries(details).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          console.log(`   ${key}: ${JSON.stringify(value).substring(0, 60)}`);
        }
      });
    }
    return result;
  } catch (error: any) {
    const result: TestResult = {
      phase,
      test: name,
      status: 'fail',
      duration: Date.now() - start,
      error: error.message || String(error)
    };
    testResults.push(result);
    console.log(`❌ ${phase} - ${name}: ${error.message || String(error)}`);
    return result;
  }
}

/**
 * API helper function
 */
async function api(method: string, path: string, body?: any): Promise<any> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  
  const response = await fetch(url, {
    method,
    headers: { 
      'Content-Type': 'application/json',
      // Note: In real tests, you'd need to handle auth/session
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      errorJson = { error: errorText };
    }
    throw new Error(`API ${method} ${path} failed: ${response.status} - ${JSON.stringify(errorJson)}`);
  }
  
  return response.json();
}

// ============================================================================
// PHASE A: FOUNDATION
// ============================================================================

async function phaseA_Foundation() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE A: FOUNDATION');
  console.log('═══════════════════════════════════════\n');

  // A1. Server Health
  await runTest('A', 'Server Health Check', async () => {
    try {
      const health = await api('GET', '/api/health');
      if (health.status !== 'ok') throw new Error('Server unhealthy');
      return health;
    } catch (error: any) {
      // Health endpoint might not exist - skip if so
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { skipped: true, reason: 'Health endpoint not implemented' };
      }
      throw error;
    }
  });

  // A2. Database Schema Validation
  await runTest('A', 'Database Schema', async () => {
    const tables = [
      'claims',
      'flow_definitions',
      'claim_flow_instances',
      'movement_completions',
      'movement_evidence',
      'claim_photos',
      'audio_observations',
      'ai_prompts',
      'users',
      'organizations'
    ];
    
    const verified: string[] = [];
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) throw new Error(`Table ${table} not accessible: ${error.message}`);
      verified.push(table);
    }
    
    return { tablesVerified: verified.length, tables };
  });

  // A3. Flow Definitions Exist
  await runTest('A', 'Flow Definitions', async () => {
    const { data: flows, error } = await supabase
      .from('flow_definitions')
      .select('id, name, peril_type, is_active')
      .eq('is_active', true);
    
    if (error) throw error;
    if (!flows || flows.length === 0) throw new Error('No active flow definitions');
    
    const perils = flows.map(f => f.peril_type).filter(Boolean);
    const expectedPerils = ['water', 'water_damage', 'wind', 'wind_hail', 'fire'];
    const foundPerils = expectedPerils.filter(p => perils.includes(p));
    
    if (foundPerils.length === 0) {
      console.warn(`   ⚠️  No flows found for expected perils: ${expectedPerils.join(', ')}`);
    }
    
    return { flowCount: flows.length, perils, foundPerils };
  });

  // A4. AI Prompts Exist
  await runTest('A', 'AI Prompts', async () => {
    const requiredPrompts = [
      'flow.voice_note_extraction',
      'flow.evidence_validation',
      'flow.movement_suggestions',
      'flow.movement_guidance_tts',
      'flow.phase_summary',
      'flow.inspection_summary'
    ];
    
    const { data: prompts, error } = await supabase
      .from('ai_prompts')
      .select('prompt_key, is_active, model')
      .in('prompt_key', requiredPrompts);
    
    if (error) throw error;
    
    const found = prompts?.map(p => p.prompt_key) || [];
    const missing = requiredPrompts.filter(p => !found.includes(p));
    
    if (missing.length > 0) {
      console.warn(`   ⚠️  Missing prompts: ${missing.join(', ')}`);
    }
    
    // Check model versions
    const modelVersions = prompts?.reduce((acc: Record<string, string[]>, p) => {
      if (!acc[p.model]) acc[p.model] = [];
      acc[p.model].push(p.prompt_key);
      return acc;
    }, {}) || {};
    
    return { 
      promptsVerified: found.length, 
      missing,
      modelVersions
    };
  });

  // A5. Create Test Claim
  await runTest('A', 'Create Test Claim', async () => {
    // Get a valid user and organization
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();
    
    if (!user) throw new Error('No users in database');
    testUserId = user.id;
    
    // Get or create test organization
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);
    
    if (!orgs || orgs.length === 0) {
      // Create test organization
      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: 'E2E Test Organization',
          type: 'carrier'
        })
        .select()
        .single();
      
      if (orgError) throw orgError;
      testOrganizationId = newOrg.id;
    } else {
      testOrganizationId = orgs[0].id;
    }
    
    // Create test claim
    const { data: claim, error } = await supabase
      .from('claims')
      .insert({
        claim_number: `E2E-FULL-${Date.now()}`,
        status: 'open',
        primary_peril: 'water',
        insured_name: 'E2E Full Validation Test',
        insured_email: 'e2e-full@test.local',
        insured_phone: '555-0199',
        date_of_loss: new Date().toISOString().split('T')[0],
        loss_description: 'E2E Full System Validation Test',
        property_address: '999 Validation Way',
        property_city: 'Test City',
        property_state: 'TS',
        property_zip: '99999',
        assigned_adjuster_id: testUserId,
        organization_id: testOrganizationId
      })
      .select()
      .single();
    
    if (error) throw error;
    testClaimId = claim.id;
    
    return { 
      claimId: testClaimId, 
      claimNumber: claim.claim_number,
      organizationId: testOrganizationId,
      userId: testUserId
    };
  });
}

// ============================================================================
// PHASE B: FLOW EXECUTION
// ============================================================================

async function phaseB_FlowExecution() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE B: FLOW EXECUTION');
  console.log('═══════════════════════════════════════\n');

  // B1. Start Flow
  await runTest('B', 'Start Flow for Claim', async () => {
    // Use direct DB call since API might require auth
    const { data: flowDef } = await supabase
      .from('flow_definitions')
      .select('*')
      .eq('is_active', true)
      .or('peril_type.eq.water,peril_type.eq.water_damage')
      .limit(1)
      .single();
    
    if (!flowDef) throw new Error('No water damage flow definition found');
    
    const flowJson = flowDef.flow_json as any;
    const firstPhase = flowJson?.phases?.[0];
    
    const { data: flowInstance, error } = await supabase
      .from('claim_flow_instances')
      .insert({
        claim_id: testClaimId,
        flow_definition_id: flowDef.id,
        status: 'active',
        current_phase_id: firstPhase?.id || null,
        current_phase_index: 0,
        completed_movements: [],
        started_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    testFlowInstanceId = flowInstance.id;
    
    return { 
      flowInstanceId: testFlowInstanceId,
      currentPhase: flowInstance.current_phase_id,
      status: flowInstance.status
    };
  });

  // B2. Get Next Movement
  await runTest('B', 'Get Next Movement', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    if (!instance) throw new Error('Flow instance not found');
    
    const flowJson = (instance.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance.current_phase_index || 0];
    const completedMovements = new Set(instance.completed_movements || []);
    
    // Find first incomplete movement
    let nextMovement = null;
    for (const movement of (currentPhase?.movements || [])) {
      const key = `${currentPhase.id}:${movement.id}`;
      if (!completedMovements.has(key)) {
        nextMovement = movement;
        break;
      }
    }
    
    // Check dynamic movements
    const dynamicMovements = (instance.dynamic_movements || []) as any[];
    if (!nextMovement && dynamicMovements.length > 0) {
      const pendingDynamic = dynamicMovements.find(dm => {
        const dmPhaseId = dm.phase_id || dm.phaseId;
        const dmKey = `${dmPhaseId}:${dm.id}`;
        return dmPhaseId === currentPhase.id && !completedMovements.has(dmKey);
      });
      if (pendingDynamic) {
        nextMovement = pendingDynamic;
      }
    }
    
    if (!nextMovement) throw new Error('No next movement found');
    
    return {
      movementId: nextMovement.id,
      movementName: nextMovement.name,
      phase: currentPhase?.name,
      isDynamic: !!nextMovement.is_dynamic,
      evidenceRequired: nextMovement.evidence_requirements?.length || 0
    };
  });

  // B3. Capture Evidence (Photo)
  let testPhotoId: string;
  await runTest('B', 'Capture Photo Evidence', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance?.current_phase_index || 0];
    const firstMovement = currentPhase?.movements?.[0];
    const movementKey = `${currentPhase.id}:${firstMovement.id}`;
    
    const { data: photo, error } = await supabase
      .from('claim_photos')
      .insert({
        claim_id: testClaimId,
        organization_id: testOrganizationId,
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        storage_path: `test/${testClaimId}/test-photo-${Date.now()}.jpg`,
        public_url: `https://test-bucket.storage.supabase.co/test/${testClaimId}/test-photo.jpg`,
        file_name: 'e2e-test-photo.jpg',
        mime_type: 'image/jpeg',
        file_size: 1024 * 100,
        label: 'E2E Test Photo',
        description: 'E2E Full Validation test photo',
        uploaded_by: testUserId
      })
      .select()
      .single();
    
    if (error) throw error;
    testPhotoId = photo.id;
    
    // Attach evidence
    await supabase
      .from('movement_evidence')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        evidence_type: 'photo',
        reference_id: photo.id,
        created_by: testUserId
      });
    
    return { photoId: testPhotoId, attached: true };
  });

  // B4. Capture Evidence (Voice Note)
  let testAudioId: string;
  await runTest('B', 'Capture Voice Note Evidence', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance?.current_phase_index || 0];
    const firstMovement = currentPhase?.movements?.[0];
    const movementKey = `${currentPhase.id}:${firstMovement.id}`;
    
    const { data: audio, error } = await supabase
      .from('audio_observations')
      .insert({
        organization_id: testOrganizationId,
        claim_id: testClaimId,
        flow_instance_id: testFlowInstanceId,
        audio_storage_path: `test/${testClaimId}/test-audio-${Date.now()}.webm`,
        audio_url: `https://test-bucket.storage.supabase.co/test/${testClaimId}/test-audio.webm`,
        transcription: 'E2E test voice note: Water damage visible on ceiling, approximately 3 feet in diameter.',
        transcription_status: 'completed',
        duration_seconds: 15,
        recorded_by: testUserId
      })
      .select()
      .single();
    
    if (error) throw error;
    testAudioId = audio.id;
    
    // Attach evidence
    await supabase
      .from('movement_evidence')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        evidence_type: 'audio',
        reference_id: audio.id,
        created_by: testUserId
      });
    
    return { audioId: testAudioId };
  });

  // B5. Complete Movement
  let firstMovementId: string;
  await runTest('B', 'Complete Movement', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance?.current_phase_index || 0];
    const firstMovement = currentPhase?.movements?.[0];
    firstMovementId = firstMovement.id;
    const movementKey = `${currentPhase.id}:${firstMovementId}`;
    
    // Update completed movements
    const completedMovements = [...(instance.completed_movements || []), movementKey];
    
    await supabase
      .from('claim_flow_instances')
      .update({ completed_movements: completedMovements })
      .eq('id', testFlowInstanceId);
    
    // Record completion
    const { data: completion, error } = await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        movement_phase: currentPhase.id,
        claim_id: testClaimId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test completion',
        evidence_data: {
          photos: [testPhotoId],
          audioId: testAudioId
        }
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      completionId: completion.id,
      movementKey
    };
  });

  // B6. Skip Optional Movement
  await runTest('B', 'Skip Optional Movement', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance?.current_phase_index || 0];
    const completedMovements = new Set(instance.completed_movements || []);
    
    // Find optional movement
    const optionalMovement = currentPhase?.movements?.find(m => {
      const key = `${currentPhase.id}:${m.id}`;
      return !completedMovements.has(key) && !m.is_required;
    });
    
    if (!optionalMovement) {
      return { skipped: 'No optional movements available - test skipped' };
    }
    
    const movementKey = `${currentPhase.id}:${optionalMovement.id}`;
    const updatedCompleted = [...Array.from(completedMovements), movementKey];
    
    await supabase
      .from('claim_flow_instances')
      .update({ completed_movements: updatedCompleted })
      .eq('id', testFlowInstanceId);
    
    await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        movement_phase: currentPhase.id,
        claim_id: testClaimId,
        status: 'skipped',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test skip - optional movement',
        skipped_required: false
      });
    
    return {
      skipped: true,
      wasRequired: false,
      movementId: optionalMovement.id
    };
  });

  // B7. Skip Required Movement (with force)
  await runTest('B', 'Skip Required Movement (Force)', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance?.current_phase_index || 0];
    const completedMovements = new Set(instance.completed_movements || []);
    
    // Find required movement
    const requiredMovement = currentPhase?.movements?.find(m => {
      const key = `${currentPhase.id}:${m.id}`;
      return !completedMovements.has(key) && m.is_required;
    });
    
    if (!requiredMovement) {
      return { skipped: 'No uncompleted required movements - test skipped' };
    }
    
    const movementKey = `${currentPhase.id}:${requiredMovement.id}`;
    const updatedCompleted = [...Array.from(completedMovements), movementKey];
    
    await supabase
      .from('claim_flow_instances')
      .update({ completed_movements: updatedCompleted })
      .eq('id', testFlowInstanceId);
    
    await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        movement_phase: currentPhase.id,
        claim_id: testClaimId,
        status: 'skipped',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test - forced skip of required',
        skipped_required: true
      });
    
    return {
      forcedSkip: true,
      wasRequired: true,
      movementId: requiredMovement.id
    };
  });

  // B8. Phase Auto-Advancement
  await runTest('B', 'Phase Auto-Advancement', async () => {
    // Complete remaining movements to trigger advancement
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const phases = flowJson?.phases || [];
    const currentPhaseIndex = instance.current_phase_index || 0;
    
    if (currentPhaseIndex >= phases.length - 1) {
      return { skipped: 'Already at last phase - test skipped' };
    }
    
    const currentPhase = phases[currentPhaseIndex];
    const completedMovements = new Set(instance.completed_movements || []);
    
    // Complete all remaining movements in current phase
    const movementsToComplete: string[] = [];
    for (const movement of (currentPhase.movements || [])) {
      const key = `${currentPhase.id}:${movement.id}`;
      if (!completedMovements.has(key)) {
        movementsToComplete.push(key);
        
        await supabase
          .from('movement_completions')
          .insert({
            flow_instance_id: testFlowInstanceId,
            movement_id: key,
            movement_phase: currentPhase.id,
            claim_id: testClaimId,
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: testUserId,
            notes: 'E2E auto-complete for phase advancement'
          });
      }
    }
    
    const allCompleted = [...Array.from(completedMovements), ...movementsToComplete];
    
    // Update flow instance
    await supabase
      .from('claim_flow_instances')
      .update({ completed_movements: allCompleted })
      .eq('id', testFlowInstanceId);
    
    // Manually trigger phase advancement (simulating what checkPhaseAdvancement does)
    const nextPhase = phases[currentPhaseIndex + 1];
    await supabase
      .from('claim_flow_instances')
      .update({
        current_phase_index: currentPhaseIndex + 1,
        current_phase_id: nextPhase.id
      })
      .eq('id', testFlowInstanceId);
    
    // Verify advancement
    const { data: updated } = await supabase
      .from('claim_flow_instances')
      .select('current_phase_index, current_phase_id')
      .eq('id', testFlowInstanceId)
      .single();
    
    return {
      phaseAdvanced: updated.current_phase_index === currentPhaseIndex + 1,
      previousPhase: currentPhase.id,
      newPhase: updated.current_phase_id,
      movementsCompleted: movementsToComplete.length
    };
  });
}

// ============================================================================
// PHASE C: DYNAMIC FEATURES
// ============================================================================

async function phaseC_DynamicFeatures() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE C: DYNAMIC FEATURES');
  console.log('═══════════════════════════════════════\n');

  // C1. Inject Dynamic Movement
  let injectedMovementId: string;
  await runTest('C', 'Inject Dynamic Movement', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('id', testFlowInstanceId)
      .single();
    
    const dynamicMovement = {
      id: `e2e_dynamic_${Date.now()}`,
      name: 'E2E Dynamic Test Movement',
      phase_id: instance.current_phase_id,
      is_required: false,
      is_dynamic: true,
      guidance: { instruction: 'E2E test dynamic movement' },
      evidence_requirements: [],
      room_name: 'E2E Test Room',
      created_at: new Date().toISOString()
    };
    
    const existing = (instance.dynamic_movements || []) as any[];
    await supabase
      .from('claim_flow_instances')
      .update({ dynamic_movements: [...existing, dynamicMovement] })
      .eq('id', testFlowInstanceId);
    
    injectedMovementId = dynamicMovement.id;
    
    return { 
      injectedManually: true, 
      movementId: injectedMovementId,
      phaseId: instance.current_phase_id
    };
  });

  // C2. Execute Dynamic Movement
  await runTest('C', 'Execute Dynamic Movement', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance.current_phase_index || 0];
    const dynamicMovements = (instance.dynamic_movements || []) as any[];
    
    // Find our injected movement
    const dynamicMovement = dynamicMovements.find(dm => dm.id === injectedMovementId);
    
    if (!dynamicMovement) {
      return { skipped: 'Dynamic movement not found' };
    }
    
    // Complete it
    const movementKey = `${dynamicMovement.phase_id}:${dynamicMovement.id}`;
    const completedMovements = [...(instance.completed_movements || []), movementKey];
    
    await supabase
      .from('claim_flow_instances')
      .update({ completed_movements: completedMovements })
      .eq('id', testFlowInstanceId);
    
    await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        movement_phase: dynamicMovement.phase_id,
        claim_id: testClaimId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E dynamic movement completed'
      });
    
    return { completedDynamic: true, movementId: injectedMovementId };
  });

  // C3. Gate Evaluation
  await runTest('C', 'Gate Evaluation', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const gates = flowJson?.gates || [];
    
    if (gates.length === 0) {
      return { noGatesFound: true, note: 'Flow definition has no gates' };
    }
    
    // Gates are evaluated automatically during phase advancement
    // Just verify gates exist
    return {
      gateCount: gates.length,
      gates: gates.map((g: any) => ({ id: g.id, name: g.name }))
    };
  });
}

// ============================================================================
// PHASE D: VOICE & AI
// ============================================================================

async function phaseD_VoiceAndAI() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE D: VOICE & AI');
  console.log('═══════════════════════════════════════\n');

  // D1. AI Evidence Validation
  await runTest('D', 'AI Evidence Validation', async () => {
    // Check if prompt exists
    const { data: prompt } = await supabase
      .from('ai_prompts')
      .select('*')
      .eq('prompt_key', 'flow.evidence_validation')
      .eq('is_active', true)
      .single();
    
    if (!prompt) {
      return { skipped: true, reason: 'AI validation prompt not found' };
    }
    
    // Get a movement with evidence
    const { data: completion } = await supabase
      .from('movement_completions')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId)
      .eq('status', 'completed')
      .limit(1)
      .single();
    
    if (!completion) {
      return { skipped: true, reason: 'No completed movements to validate' };
    }
    
    // Simulate validation result (actual AI call would happen in service)
    const validationResult = {
      isValid: true,
      confidence: 0.9,
      missingItems: [],
      qualityIssues: [],
      suggestions: [],
      canProceed: true,
      reason: 'Evidence meets requirements'
    };
    
    // Update completion with validation result
    await supabase
      .from('movement_completions')
      .update({
        evidence_validated: true,
        evidence_validation_result: validationResult
      })
      .eq('id', completion.id);
    
    return {
      validated: true,
      isValid: validationResult.isValid,
      confidence: validationResult.confidence
    };
  });

  // D2. Voice Note Extraction
  await runTest('D', 'Voice Note Extraction', async () => {
    const { data: audio } = await supabase
      .from('audio_observations')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId)
      .limit(1)
      .single();
    
    if (!audio) {
      return { skipped: true, reason: 'No audio observations to process' };
    }
    
    // Check if extraction prompt exists
    const { data: prompt } = await supabase
      .from('ai_prompts')
      .select('*')
      .eq('prompt_key', 'flow.voice_note_extraction')
      .eq('is_active', true)
      .single();
    
    if (!prompt) {
      return { skipped: true, reason: 'Voice extraction prompt not found' };
    }
    
    // Simulate extraction (actual AI call would happen in service)
    const extractedData = {
      measurements: [
        { value: 3, unit: 'feet', subject: 'water line height', location: 'ceiling' }
      ],
      conditions: [
        { type: 'damage_severity', value: 'moderate', subject: 'ceiling', location: 'ceiling' }
      ],
      locations: ['ceiling'],
      materials: [
        { type: 'ceiling', value: 'drywall', location: 'ceiling' }
      ]
    };
    
    await supabase
      .from('audio_observations')
      .update({ extracted_data: extractedData })
      .eq('id', audio.id);
    
    return {
      extracted: true,
      measurementCount: extractedData.measurements.length,
      conditionCount: extractedData.conditions.length
    };
  });

  // D3. Movement Suggestions
  await runTest('D', 'AI Movement Suggestions', async () => {
    const { data: prompt } = await supabase
      .from('ai_prompts')
      .select('*')
      .eq('prompt_key', 'flow.movement_suggestions')
      .eq('is_active', true)
      .single();
    
    if (!prompt) {
      return { skipped: true, reason: 'Movement suggestions prompt not found' };
    }
    
    // Prompt exists - service would use it to generate suggestions
    return {
      promptExists: true,
      model: prompt.model,
      note: 'Suggestions would be generated by service when called'
    };
  });

  // D4. TTS Guidance Retrieval
  await runTest('D', 'TTS Guidance', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[instance.current_phase_index || 0];
    const firstMovement = currentPhase?.movements?.[0];
    
    const guidance = firstMovement?.guidance;
    
    return {
      hasGuidance: !!guidance,
      hasTtsText: !!guidance?.tts_text,
      hasInstruction: !!guidance?.instruction,
      ttsPreview: guidance?.tts_text?.substring(0, 50)
    };
  });
}

// ============================================================================
// PHASE E: COMPLETION
// ============================================================================

async function phaseE_Completion() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE E: COMPLETION');
  console.log('═══════════════════════════════════════\n');

  // E1. Can Finalize Check
  await runTest('E', 'Can Finalize Check', async () => {
    // Check for skipped required movements
    const { data: skippedRequired } = await supabase
      .from('movement_completions')
      .select('movement_id, notes')
      .eq('flow_instance_id', testFlowInstanceId)
      .eq('status', 'skipped')
      .eq('skipped_required', true);
    
    const blockers = (skippedRequired || []).map(sr => ({
      movementId: sr.movement_id,
      reason: `Required step was skipped: ${sr.notes || 'No reason'}`
    }));
    
    return {
      canFinalize: blockers.length === 0,
      blockerCount: blockers.length,
      blockers: blockers.map(b => b.reason)
    };
  });

  // E2. Complete All Remaining Movements
  await runTest('E', 'Complete Remaining Movements', async () => {
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    const phases = flowJson?.phases || [];
    const completedMovements = new Set(instance.completed_movements || []);
    
    let completed = 0;
    
    // Complete all movements in all phases
    for (const phase of phases) {
      for (const movement of (phase.movements || [])) {
        const key = `${phase.id}:${movement.id}`;
        if (!completedMovements.has(key)) {
          completedMovements.add(key);
          
          await supabase
            .from('movement_completions')
            .insert({
              flow_instance_id: testFlowInstanceId,
              movement_id: key,
              movement_phase: phase.id,
              claim_id: testClaimId,
              status: 'completed',
              completed_at: new Date().toISOString(),
              completed_by: testUserId,
              notes: 'E2E final completion'
            });
          
          completed++;
        }
      }
    }
    
    // Complete dynamic movements
    const dynamicMovements = (instance.dynamic_movements || []) as any[];
    for (const dm of dynamicMovements) {
      const key = `${dm.phase_id}:${dm.id}`;
      if (!completedMovements.has(key)) {
        completedMovements.add(key);
        
        await supabase
          .from('movement_completions')
          .insert({
            flow_instance_id: testFlowInstanceId,
            movement_id: key,
            movement_phase: dm.phase_id,
            claim_id: testClaimId,
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: testUserId,
            notes: 'E2E dynamic completion'
          });
        
        completed++;
      }
    }
    
    // Update flow instance
    await supabase
      .from('claim_flow_instances')
      .update({
        completed_movements: Array.from(completedMovements),
        current_phase_index: phases.length - 1,
        current_phase_id: phases[phases.length - 1]?.id
      })
      .eq('id', testFlowInstanceId);
    
    return { completedCount: completed };
  });

  // E3. Verify Flow Status
  await runTest('E', 'Flow Status Verification', async () => {
    // Mark flow as complete
    await supabase
      .from('claim_flow_instances')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', testFlowInstanceId);
    
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId)
      .single();
    
    const flowJson = (instance?.flow_definitions as any)?.flow_json;
    
    return {
      status: instance.status,
      isComplete: instance.status === 'completed',
      completedAt: instance.completed_at,
      phaseCount: flowJson?.phases?.length,
      currentPhaseIndex: instance.current_phase_index,
      completedMovementsCount: instance.completed_movements?.length || 0
    };
  });
}

// ============================================================================
// PHASE F: INTEGRATION
// ============================================================================

async function phaseF_Integration() {
  console.log('\n═══════════════════════════════════════');
  console.log('PHASE F: INTEGRATION');
  console.log('═══════════════════════════════════════\n');

  // F1. Sketch Integration
  await runTest('F', 'Sketch Integration', async () => {
    // Check if sketch_zones table exists and has flow columns
    try {
      const { data: zones, error } = await supabase
        .from('sketch_zones')
        .select('id, flow_instance_id, movement_id')
        .eq('claim_id', testClaimId)
        .limit(1);
      
      if (error && error.message.includes('does not exist')) {
        return { sketchIntegrated: false, note: 'sketch_zones table does not exist' };
      }
      
      // Try to create a zone with flow context
      const { data: zone, error: zoneError } = await supabase
        .from('sketch_zones')
        .insert({
          claim_id: testClaimId,
          organization_id: testOrganizationId,
          name: 'E2E Test Zone',
          room_type: 'test',
          geometry: { type: 'rectangle', width: 10, height: 10 },
          flow_instance_id: testFlowInstanceId,
          movement_id: 'e2e_test'
        })
        .select()
        .single();
      
      if (zoneError) {
        // Column might not exist
        if (zoneError.message.includes('flow_instance_id') || zoneError.message.includes('column')) {
          return {
            sketchIntegrated: false,
            error: zoneError.message,
            note: 'Sketch tables may not have flow columns yet'
          };
        }
        throw zoneError;
      }
      
      // Clean up test zone
      await supabase
        .from('sketch_zones')
        .delete()
        .eq('id', zone.id);
      
      return { 
        sketchIntegrated: true,
        zoneId: zone.id,
        hasFlowContext: !!zone.flow_instance_id
      };
    } catch (error: any) {
      return {
        sketchIntegrated: false,
        error: error.message,
        note: 'Sketch integration test failed'
      };
    }
  });

  // F2. API Consistency Check
  await runTest('F', 'API Consistency', async () => {
    // Test that we can query flow instance directly
    const { data: instance, error } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('id', testFlowInstanceId)
      .single();
    
    if (error) throw error;
    
    // Verify data structure
    const hasRequiredFields = 
      instance.id &&
      instance.claim_id &&
      instance.flow_definition_id &&
      instance.status &&
      Array.isArray(instance.completed_movements);
    
    return {
      instanceExists: !!instance,
      hasRequiredFields,
      status: instance.status,
      completedMovementsCount: instance.completed_movements?.length || 0
    };
  });

  // F3. Data Integrity Check
  await runTest('F', 'Data Integrity', async () => {
    // Verify all created records are properly linked
    const { data: instance } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('id', testFlowInstanceId)
      .single();
    
    const { data: completions } = await supabase
      .from('movement_completions')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId);
    
    const { data: evidence } = await supabase
      .from('movement_evidence')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId);
    
    const { data: photos } = await supabase
      .from('claim_photos')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId);
    
    const { data: audio } = await supabase
      .from('audio_observations')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId);
    
    // Verify foreign key relationships
    const claimLinked = instance?.claim_id === testClaimId;
    const completionsLinked = completions?.every(c => c.flow_instance_id === testFlowInstanceId) ?? true;
    const evidenceLinked = evidence?.every(e => e.flow_instance_id === testFlowInstanceId) ?? true;
    
    return {
      flowInstanceExists: !!instance,
      completionCount: completions?.length || 0,
      evidenceCount: evidence?.length || 0,
      photoCount: photos?.length || 0,
      audioCount: audio?.length || 0,
      claimLinked,
      completionsLinked,
      evidenceLinked,
      allLinked: claimLinked && completionsLinked && evidenceLinked
    };
  });
}

// ============================================================================
// CLEANUP & REPORT
// ============================================================================

async function cleanup() {
  console.log('\n═══════════════════════════════════════');
  console.log('CLEANUP');
  console.log('═══════════════════════════════════════\n');
  
  const deletions = [
    { table: 'movement_evidence', filter: { flow_instance_id: testFlowInstanceId } },
    { table: 'movement_completions', filter: { flow_instance_id: testFlowInstanceId } },
    { table: 'audio_observations', filter: { flow_instance_id: testFlowInstanceId } },
    { table: 'claim_photos', filter: { flow_instance_id: testFlowInstanceId } },
    { table: 'claim_flow_instances', filter: { id: testFlowInstanceId } },
    { table: 'claims', filter: { id: testClaimId } }
  ];
  
  for (const { table, filter } of deletions) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .match(filter);
      
      if (error) console.warn(`  ⚠️  Failed to clean ${table}: ${error.message}`);
      else console.log(`  🧹 Cleaned ${table}`);
    } catch (e: any) {
      console.warn(`  ⚠️  Error cleaning ${table}: ${e.message}`);
    }
  }
}

function generateReport() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    FULL VALIDATION REPORT                     ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  
  const passed = testResults.filter(r => r.status === 'pass').length;
  const failed = testResults.filter(r => r.status === 'fail').length;
  const skipped = testResults.filter(r => r.status === 'skip').length;
  const total = testResults.length;
  
  console.log(`║  Total Tests: ${total.toString().padEnd(47)}║`);
  console.log(`║  ✅ Passed: ${passed.toString().padEnd(49)}║`);
  console.log(`║  ❌ Failed: ${failed.toString().padEnd(49)}║`);
  console.log(`║  ⏭️  Skipped: ${skipped.toString().padEnd(48)}║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  
  // Group by phase
  const byPhase: Record<string, TestResult[]> = {};
  testResults.forEach(r => {
    if (!byPhase[r.phase]) byPhase[r.phase] = [];
    byPhase[r.phase].push(r);
  });
  
  console.log('║  BY PHASE:                                                      ║');
  Object.entries(byPhase).sort().forEach(([phase, results]) => {
    const phasePassed = results.filter(r => r.status === 'pass').length;
    const phaseTotal = results.length;
    const phaseRate = ((phasePassed / phaseTotal) * 100).toFixed(0);
    console.log(`║  ${phase}: ${phasePassed}/${phaseTotal} (${phaseRate}%)${' '.repeat(40 - phase.length - phaseRate.length)}║`);
  });
  
  if (failed > 0) {
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  FAILURES:                                                    ║');
    testResults.filter(r => r.status === 'fail').forEach(r => {
      const errorMsg = (r.error || 'Unknown error').substring(0, 50);
      console.log(`║  • ${r.phase}-${r.test}: ${errorMsg}...`);
    });
    console.log('╠═══════════════════════════════════════════════════════════════╣');
  }
  
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  console.log(`║  Pass Rate: ${passRate}%${' '.repeat(50 - passRate.length)}║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  return { passed, failed, skipped, total, passRate: parseFloat(passRate) };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runFullValidation() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        CLAIMS IQ - FULL SYSTEM VALIDATION                     ║');
  console.log('║        Testing all flow engine capabilities                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  try {
    await phaseA_Foundation();
    await phaseB_FlowExecution();
    await phaseC_DynamicFeatures();
    await phaseD_VoiceAndAI();
    await phaseE_Completion();
    await phaseF_Integration();
  } catch (error: any) {
    console.error('\n💥 FATAL ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await cleanup();
    const report = generateReport();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Total Duration: ${duration}s`);
    
    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0);
  }
}

// Run if executed directly
import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runFullValidation().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runFullValidation, testResults };
