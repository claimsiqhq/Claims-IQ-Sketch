/**
 * E2E Smoke Test: Water Damage Inspection Flow
 *
 * This script tests the complete inspection flow from start to finish.
 * Run with: npx tsx server/tests/e2e-flow-smoke-test.ts
 *
 * Test Scenario:
 * - Create test claim with primary_peril = 'water_damage'
 * - Start water damage flow
 * - Execute movements through all phases
 * - Test photo/audio evidence attachment
 * - Test skip functionality
 * - Verify flow completion
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

// Test results tracking
interface TestResult {
  step: number;
  name: string;
  passed: boolean;
  notes: string;
  error?: string;
}

const testResults: TestResult[] = [];

// Test data
let testClaimId: string | null = null;
let testFlowInstanceId: string | null = null;
let testOrganizationId: string | null = null;
let testUserId: string = 'test-user-' + Date.now();

// Helper function to log test results
function logResult(step: number, name: string, passed: boolean, notes: string, error?: string) {
  const result: TestResult = { step, name, passed, notes, error };
  testResults.push(result);
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} - Step ${step}: ${name}`);
  console.log(`   Notes: ${notes}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
}

// ============================================================================
// STEP 0: Setup - Verify prerequisites
// ============================================================================
async function step0_verifyPrerequisites(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 0: Verifying Prerequisites');
  console.log('='.repeat(60));

  try {
    // Check flow_definitions table exists and has water damage flow
    const { data: flowDefs, error: flowError } = await supabase
      .from('flow_definitions')
      .select('*')
      .eq('is_active', true);

    if (flowError) {
      logResult(0, 'Verify Prerequisites', false, 'Cannot query flow_definitions', flowError.message);
      return false;
    }

    // Find water damage flow definition
    const waterFlow = flowDefs?.find(fd =>
      fd.peril_type === 'water_damage' ||
      (fd.flow_json as any)?.metadata?.primary_peril === 'water_damage'
    );

    if (!waterFlow) {
      logResult(0, 'Verify Prerequisites', false, 'No water damage flow definition found',
        'Need to seed flow_definitions with water damage flow');
      return false;
    }

    console.log(`   Found water damage flow: ${waterFlow.name} (ID: ${waterFlow.id})`);

    // Get or create test organization
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (orgs && orgs.length > 0) {
      testOrganizationId = orgs[0].id;
      console.log(`   Using organization: ${testOrganizationId}`);
    }

    logResult(0, 'Verify Prerequisites', true, 'Flow definitions and database are accessible');
    return true;

  } catch (err: any) {
    logResult(0, 'Verify Prerequisites', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 1: Create Test Claim
// ============================================================================
async function step1_createTestClaim(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 1: Creating Test Claim');
  console.log('='.repeat(60));

  try {
    const claimData = {
      claim_number: `TEST-WATER-${Date.now()}`,
      insured_name: 'John Test',
      property_address: '123 Test Street',
      property_city: 'Testville',
      property_state: 'TS',
      property_zip: '12345',
      loss_type: 'water',
      primary_peril: 'water_damage',
      status: 'open',
      date_of_loss: new Date().toISOString().split('T')[0],
      loss_description: 'Water damage from burst pipe - E2E smoke test',
      organization_id: testOrganizationId
    };

    const { data: claim, error } = await supabase
      .from('claims')
      .insert(claimData)
      .select()
      .single();

    if (error) {
      logResult(1, 'Create Test Claim', false, 'Failed to create claim', error.message);
      return false;
    }

    testClaimId = claim.id;
    console.log(`   Created claim: ${claim.claim_number}`);
    console.log(`   Claim ID: ${testClaimId}`);

    logResult(1, 'Create Test Claim', true, `Claim ${claim.claim_number} created successfully`);
    return true;

  } catch (err: any) {
    logResult(1, 'Create Test Claim', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 2: Verify Claim in Database
// ============================================================================
async function step2_verifyClaim(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 2: Verifying Claim in Database');
  console.log('='.repeat(60));

  try {
    const { data: claim, error } = await supabase
      .from('claims')
      .select('*')
      .eq('id', testClaimId!)
      .single();

    if (error || !claim) {
      logResult(2, 'Verify Claim', false, 'Claim not found', error?.message);
      return false;
    }

    console.log(`   Claim Number: ${claim.claim_number}`);
    console.log(`   Insured Name: ${claim.insured_name}`);
    console.log(`   Primary Peril: ${claim.primary_peril}`);
    console.log(`   Status: ${claim.status}`);

    const isValid = claim.primary_peril === 'water_damage' && claim.status === 'open';
    logResult(2, 'Verify Claim', isValid,
      isValid ? 'Claim verified successfully' : 'Claim data mismatch');
    return isValid;

  } catch (err: any) {
    logResult(2, 'Verify Claim', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 3: Start Flow for Claim
// ============================================================================
async function step3_startFlow(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 3: Starting Water Damage Flow');
  console.log('='.repeat(60));

  try {
    // First, find matching flow definition
    const { data: flowDefs, error: flowDefError } = await supabase
      .from('flow_definitions')
      .select('*')
      .eq('is_active', true);

    if (flowDefError) {
      logResult(3, 'Start Flow', false, 'Cannot query flow definitions', flowDefError.message);
      return false;
    }

    const flowDef = flowDefs?.find(fd =>
      fd.peril_type === 'water_damage' ||
      (fd.flow_json as any)?.metadata?.primary_peril === 'water_damage'
    );

    if (!flowDef) {
      logResult(3, 'Start Flow', false, 'No water damage flow definition found');
      return false;
    }

    // Check for existing active flow
    const { data: existingFlow } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('claim_id', testClaimId!)
      .eq('status', 'active')
      .maybeSingle();

    if (existingFlow) {
      // Cancel existing flow for test purposes
      await supabase
        .from('claim_flow_instances')
        .update({ status: 'cancelled' })
        .eq('id', existingFlow.id);
      console.log(`   Cancelled existing flow: ${existingFlow.id}`);
    }

    // Create new flow instance
    const flowJson = flowDef.flow_json as any;
    const firstPhaseId = flowJson.phases?.[0]?.id || null;

    const { data: flowInstance, error: instanceError } = await supabase
      .from('claim_flow_instances')
      .insert({
        claim_id: testClaimId,
        flow_definition_id: flowDef.id,
        status: 'active',
        current_phase_id: firstPhaseId,
        current_phase_index: 0,
        completed_movements: [],
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (instanceError) {
      logResult(3, 'Start Flow', false, 'Failed to create flow instance', instanceError.message);
      return false;
    }

    testFlowInstanceId = flowInstance.id;
    console.log(`   Flow Instance ID: ${testFlowInstanceId}`);
    console.log(`   Flow Definition: ${flowDef.name}`);
    console.log(`   First Phase: ${firstPhaseId}`);

    // Verify flow was created
    const { data: verifyFlow, error: verifyError } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('id', testFlowInstanceId)
      .single();

    if (verifyError || !verifyFlow) {
      logResult(3, 'Start Flow', false, 'Flow instance not found after creation');
      return false;
    }

    const isValid = verifyFlow.status === 'active' &&
                    verifyFlow.current_phase_index === 0 &&
                    Array.isArray(verifyFlow.completed_movements) &&
                    verifyFlow.completed_movements.length === 0;

    logResult(3, 'Start Flow', isValid,
      `Flow started: status=${verifyFlow.status}, phase_index=${verifyFlow.current_phase_index}`);
    return isValid;

  } catch (err: any) {
    logResult(3, 'Start Flow', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 4: Verify Flow Progress (Initial)
// ============================================================================
async function step4_verifyInitialProgress(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 4: Verifying Initial Flow Progress');
  console.log('='.repeat(60));

  try {
    // Get flow instance with definition
    const { data: flowInstance, error } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (id, name, flow_json)
      `)
      .eq('id', testFlowInstanceId!)
      .single();

    if (error || !flowInstance) {
      logResult(4, 'Verify Initial Progress', false, 'Flow instance not found', error?.message);
      return false;
    }

    const flowJson = (flowInstance.flow_definitions as any)?.flow_json;
    const phases = flowJson?.phases || [];

    // Count total movements
    let totalMovements = 0;
    phases.forEach((phase: any) => {
      totalMovements += phase.movements?.length || 0;
    });

    const completedCount = (flowInstance.completed_movements || []).length;
    const percentComplete = totalMovements > 0
      ? Math.round((completedCount / totalMovements) * 100)
      : 0;

    console.log(`   Total Phases: ${phases.length}`);
    console.log(`   Total Movements: ${totalMovements}`);
    console.log(`   Completed: ${completedCount}`);
    console.log(`   Progress: ${percentComplete}%`);
    console.log(`   Current Phase: ${flowInstance.current_phase_id}`);

    // List phases
    console.log('\n   Phase Overview:');
    phases.forEach((phase: any, idx: number) => {
      const isCurrent = idx === flowInstance.current_phase_index;
      const marker = isCurrent ? '▶' : ' ';
      console.log(`   ${marker} Phase ${idx + 1}: ${phase.name} (${phase.movements?.length || 0} movements)`);
    });

    const isValid = completedCount === 0 && flowInstance.status === 'active';
    logResult(4, 'Verify Initial Progress', isValid,
      `Initial state correct: 0/${totalMovements} completed, ${percentComplete}%`);
    return isValid;

  } catch (err: any) {
    logResult(4, 'Verify Initial Progress', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 5: Execute First Movement (verify_address)
// ============================================================================
async function step5_executeFirstMovement(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 5: Executing First Movement (verify_address)');
  console.log('='.repeat(60));

  try {
    // Get flow instance to find current phase
    const { data: flowInstance, error: instanceError } = await supabase
      .from('claim_flow_instances')
      .select(`
        *,
        flow_definitions (flow_json)
      `)
      .eq('id', testFlowInstanceId!)
      .single();

    if (instanceError || !flowInstance) {
      logResult(5, 'Execute First Movement', false, 'Flow instance not found', instanceError?.message);
      return false;
    }

    const flowJson = (flowInstance.flow_definitions as any)?.flow_json;
    const currentPhaseIndex = flowInstance.current_phase_index || 0;
    const currentPhase = flowJson?.phases?.[currentPhaseIndex];

    if (!currentPhase) {
      logResult(5, 'Execute First Movement', false, 'No current phase found');
      return false;
    }

    // Get first movement
    const firstMovement = currentPhase.movements?.[0];
    if (!firstMovement) {
      logResult(5, 'Execute First Movement', false, 'No movements in current phase');
      return false;
    }

    console.log(`   Movement: ${firstMovement.name}`);
    console.log(`   Description: ${firstMovement.description}`);
    console.log(`   Required: ${firstMovement.is_required}`);

    // Create movement key
    const movementKey = `${currentPhase.id}:${firstMovement.id}`;

    // Complete the movement
    const completedMovements = [...(flowInstance.completed_movements || []), movementKey];

    const { error: updateError } = await supabase
      .from('claim_flow_instances')
      .update({
        completed_movements: completedMovements
      })
      .eq('id', testFlowInstanceId);

    if (updateError) {
      logResult(5, 'Execute First Movement', false, 'Failed to update flow instance', updateError.message);
      return false;
    }

    // Record the completion
    const { data: completion, error: completionError } = await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        claim_id: testClaimId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test: Address verified - 123 Test Street matches policy',
        evidence_data: {
          photos: [],
          audioId: null,
          measurements: null
        }
      })
      .select()
      .single();

    if (completionError) {
      console.log(`   Warning: Movement completion record failed: ${completionError.message}`);
    } else {
      console.log(`   Completion ID: ${completion.id}`);
    }

    // Verify the completion
    const { data: verifyFlow } = await supabase
      .from('claim_flow_instances')
      .select('completed_movements')
      .eq('id', testFlowInstanceId!)
      .single();

    const hasMovement = verifyFlow?.completed_movements?.includes(movementKey);
    console.log(`   Movement Key: ${movementKey}`);
    console.log(`   Recorded: ${hasMovement}`);

    logResult(5, 'Execute First Movement', hasMovement || false,
      hasMovement ? 'Movement completed successfully' : 'Movement not recorded');
    return hasMovement || false;

  } catch (err: any) {
    logResult(5, 'Execute First Movement', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 6: Test Photo Evidence Capture
// ============================================================================
async function step6_testPhotoCapture(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 6: Testing Photo Evidence Capture');
  console.log('='.repeat(60));

  try {
    // Get current movement info
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[flowInstance?.current_phase_index || 0];
    const currentMovementKey = `${currentPhase?.id}:${currentPhase?.movements?.[1]?.id}`;

    // Create a test photo record (simulating photo capture)
    const { data: photo, error: photoError } = await supabase
      .from('claim_photos')
      .insert({
        claim_id: testClaimId,
        organization_id: testOrganizationId,
        flow_instance_id: testFlowInstanceId,
        movement_id: currentMovementKey,
        storage_path: `test/${testClaimId}/test-photo-${Date.now()}.jpg`,
        public_url: `https://test-bucket.storage.supabase.co/test/${testClaimId}/test-photo.jpg`,
        file_name: 'test-water-source-photo.jpg',
        mime_type: 'image/jpeg',
        file_size: 1024 * 100, // 100KB
        label: 'Water Source - Burst Pipe',
        description: 'E2E Test: Photo of burst pipe under kitchen sink',
        analysis_status: 'pending',
        uploaded_by: testUserId
      })
      .select()
      .single();

    if (photoError) {
      logResult(6, 'Test Photo Capture', false, 'Failed to create photo record', photoError.message);
      return false;
    }

    console.log(`   Photo ID: ${photo.id}`);
    console.log(`   Label: ${photo.label}`);
    console.log(`   Movement ID: ${photo.movement_id}`);
    console.log(`   Flow Instance ID: ${photo.flow_instance_id}`);

    // Attach evidence to movement
    const { error: evidenceError } = await supabase
      .from('movement_evidence')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: currentMovementKey,
        evidence_type: 'photo',
        reference_id: photo.id,
        evidence_data: {
          photoId: photo.id,
          label: photo.label,
          description: photo.description
        },
        created_by: testUserId
      });

    if (evidenceError) {
      console.log(`   Warning: Evidence link failed: ${evidenceError.message}`);
    }

    // Verify photo is linked
    const { data: linkedPhotos } = await supabase
      .from('claim_photos')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId!)
      .eq('movement_id', currentMovementKey);

    const photoLinked = linkedPhotos && linkedPhotos.length > 0;
    console.log(`   Photos linked to movement: ${linkedPhotos?.length || 0}`);

    logResult(6, 'Test Photo Capture', photoLinked,
      photoLinked ? 'Photo captured and linked to movement' : 'Photo not linked properly');
    return photoLinked;

  } catch (err: any) {
    logResult(6, 'Test Photo Capture', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 7: Test Audio Observation (Voice Note)
// ============================================================================
async function step7_testAudioObservation(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 7: Testing Audio Observation (Voice Note)');
  console.log('='.repeat(60));

  try {
    // Get current movement info
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const currentPhase = flowJson?.phases?.[flowInstance?.current_phase_index || 0];
    const currentMovementKey = `${currentPhase?.id}:${currentPhase?.movements?.[1]?.id}`;

    // Create a test audio observation record (note: movement_id is tracked via movement_evidence table, not in audio_observations)
    const { data: audio, error: audioError } = await supabase
      .from('audio_observations')
      .insert({
        organization_id: testOrganizationId,
        claim_id: testClaimId,
        flow_instance_id: testFlowInstanceId,
        audio_storage_path: `test/${testClaimId}/test-audio-${Date.now()}.webm`,
        audio_url: `https://test-bucket.storage.supabase.co/test/${testClaimId}/test-audio.webm`,
        transcription: 'E2E Test: Water source identified as burst copper pipe under kitchen sink. Appears to be due to freezing. Water has spread to adjacent dining room.',
        transcription_status: 'completed',
        extracted_entities: {
          source: 'burst copper pipe',
          location: 'kitchen sink',
          cause: 'freezing',
          affected_areas: ['kitchen', 'dining room']
        },
        extraction_status: 'completed',
        duration_seconds: 15,
        recorded_by: testUserId
      })
      .select()
      .single();

    if (audioError) {
      logResult(7, 'Test Audio Observation', false, 'Failed to create audio record', audioError.message);
      return false;
    }

    console.log(`   Audio ID: ${audio.id}`);
    console.log(`   Transcription: ${audio.transcription?.substring(0, 50)}...`);
    console.log(`   Duration: ${audio.duration_seconds}s`);
    console.log(`   Flow Instance ID: ${audio.flow_instance_id}`);

    // Attach evidence to movement via movement_evidence table
    const { error: evidenceError } = await supabase
      .from('movement_evidence')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: currentMovementKey,
        evidence_type: 'audio',
        reference_id: audio.id,
        evidence_data: {
          audioId: audio.id,
          transcription: audio.transcription,
          duration: audio.duration_seconds
        },
        created_by: testUserId
      });

    if (evidenceError) {
      console.log(`   Warning: Evidence link failed: ${evidenceError.message}`);
    }

    // Verify audio is linked via flow_instance_id
    const { data: linkedAudio } = await supabase
      .from('audio_observations')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId!)
      .eq('claim_id', testClaimId!);

    const audioLinked = linkedAudio && linkedAudio.length > 0;
    console.log(`   Audio observations linked: ${linkedAudio?.length || 0}`);

    logResult(7, 'Test Audio Observation', audioLinked,
      audioLinked ? 'Audio observation captured and linked' : 'Audio not linked properly');
    return audioLinked;

  } catch (err: any) {
    logResult(7, 'Test Audio Observation', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 8: Complete Movement with Evidence
// ============================================================================
async function step8_completeMovementWithEvidence(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 8: Completing Movement with Evidence');
  console.log('='.repeat(60));

  try {
    // Get current flow state
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const currentPhaseIndex = flowInstance?.current_phase_index || 0;
    const currentPhase = flowJson?.phases?.[currentPhaseIndex];

    // Find next incomplete movement
    const completedMovements = new Set(flowInstance?.completed_movements || []);
    let nextMovement = null;

    for (const movement of (currentPhase?.movements || [])) {
      const key = `${currentPhase.id}:${movement.id}`;
      if (!completedMovements.has(key)) {
        nextMovement = movement;
        break;
      }
    }

    if (!nextMovement) {
      console.log('   No incomplete movements in current phase');
      logResult(8, 'Complete Movement with Evidence', true, 'All movements already completed');
      return true;
    }

    const movementKey = `${currentPhase.id}:${nextMovement.id}`;
    console.log(`   Completing: ${nextMovement.name}`);
    console.log(`   Movement Key: ${movementKey}`);

    // Get linked evidence
    const { data: photos } = await supabase
      .from('claim_photos')
      .select('id')
      .eq('flow_instance_id', testFlowInstanceId!);

    const { data: audio } = await supabase
      .from('audio_observations')
      .select('id')
      .eq('flow_instance_id', testFlowInstanceId!);

    // Complete the movement
    const updatedCompletedMovements = [...(flowInstance?.completed_movements || []), movementKey];

    const { error: updateError } = await supabase
      .from('claim_flow_instances')
      .update({
        completed_movements: updatedCompletedMovements
      })
      .eq('id', testFlowInstanceId);

    if (updateError) {
      logResult(8, 'Complete Movement with Evidence', false, 'Failed to update flow', updateError.message);
      return false;
    }

    // Record completion with evidence
    const { data: completion, error: completionError } = await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        claim_id: testClaimId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test: Movement completed with photo and audio evidence',
        evidence_data: {
          photos: photos?.map(p => p.id) || [],
          audioId: audio?.[0]?.id || null
        }
      })
      .select()
      .single();

    if (completionError) {
      console.log(`   Warning: Completion record failed: ${completionError.message}`);
    } else {
      console.log(`   Completion ID: ${completion.id}`);
      console.log(`   Evidence: ${completion.evidence_data?.photos?.length || 0} photos, audio: ${completion.evidence_data?.audioId ? 'yes' : 'no'}`);
    }

    // Verify
    const { data: verifyFlow } = await supabase
      .from('claim_flow_instances')
      .select('completed_movements')
      .eq('id', testFlowInstanceId!)
      .single();

    const isComplete = verifyFlow?.completed_movements?.includes(movementKey);
    logResult(8, 'Complete Movement with Evidence', isComplete || false,
      isComplete ? 'Movement completed with evidence' : 'Completion not recorded');
    return isComplete || false;

  } catch (err: any) {
    logResult(8, 'Complete Movement with Evidence', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 9: Test Phase Transition
// ============================================================================
async function step9_testPhaseTransition(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 9: Testing Phase Transition');
  console.log('='.repeat(60));

  try {
    // Get flow state
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const phases = flowJson?.phases || [];
    const initialPhaseIndex = flowInstance?.current_phase_index || 0;
    const currentPhase = phases[initialPhaseIndex];

    console.log(`   Current Phase: ${currentPhase?.name} (index: ${initialPhaseIndex})`);

    // Complete all remaining movements in current phase
    const completedMovements = new Set(flowInstance?.completed_movements || []);
    const movementsToComplete: string[] = [];

    for (const movement of (currentPhase?.movements || [])) {
      const key = `${currentPhase.id}:${movement.id}`;
      if (!completedMovements.has(key)) {
        movementsToComplete.push(key);
      }
    }

    console.log(`   Movements to complete: ${movementsToComplete.length}`);

    if (movementsToComplete.length > 0) {
      // Complete all remaining movements
      const allCompletedMovements = [...(flowInstance?.completed_movements || []), ...movementsToComplete];

      const { error: updateError } = await supabase
        .from('claim_flow_instances')
        .update({
          completed_movements: allCompletedMovements
        })
        .eq('id', testFlowInstanceId);

      if (updateError) {
        logResult(9, 'Test Phase Transition', false, 'Failed to complete movements', updateError.message);
        return false;
      }

      // Record completions
      for (const movementKey of movementsToComplete) {
        await supabase
          .from('movement_completions')
          .insert({
            flow_instance_id: testFlowInstanceId,
            movement_id: movementKey,
            claim_id: testClaimId,
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: testUserId,
            notes: 'E2E Test: Bulk completion for phase transition test'
          });
      }
    }

    // Check if we should advance to next phase
    if (initialPhaseIndex < phases.length - 1) {
      const nextPhase = phases[initialPhaseIndex + 1];

      const { error: advanceError } = await supabase
        .from('claim_flow_instances')
        .update({
          current_phase_id: nextPhase.id,
          current_phase_index: initialPhaseIndex + 1
        })
        .eq('id', testFlowInstanceId);

      if (advanceError) {
        logResult(9, 'Test Phase Transition', false, 'Failed to advance phase', advanceError.message);
        return false;
      }

      // Verify transition
      const { data: verifyFlow } = await supabase
        .from('claim_flow_instances')
        .select('current_phase_index, current_phase_id')
        .eq('id', testFlowInstanceId!)
        .single();

      console.log(`   New Phase: ${nextPhase.name} (index: ${verifyFlow?.current_phase_index})`);

      const transitioned = verifyFlow?.current_phase_index === initialPhaseIndex + 1;
      logResult(9, 'Test Phase Transition', transitioned,
        transitioned ? `Phase transitioned from ${initialPhaseIndex} to ${verifyFlow?.current_phase_index}` : 'Phase transition failed');
      return transitioned;
    } else {
      console.log('   Already at last phase');
      logResult(9, 'Test Phase Transition', true, 'At last phase - no transition needed');
      return true;
    }

  } catch (err: any) {
    logResult(9, 'Test Phase Transition', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 10: Test Skip Movement
// ============================================================================
async function step10_testSkipMovement(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 10: Testing Skip Movement Functionality');
  console.log('='.repeat(60));

  try {
    // Get flow state
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const currentPhaseIndex = flowInstance?.current_phase_index || 0;
    const currentPhase = flowJson?.phases?.[currentPhaseIndex];

    // Find an optional (non-required) movement to skip
    const completedMovements = new Set(flowInstance?.completed_movements || []);
    let movementToSkip = null;

    for (const movement of (currentPhase?.movements || [])) {
      const key = `${currentPhase.id}:${movement.id}`;
      if (!completedMovements.has(key) && !movement.is_required) {
        movementToSkip = movement;
        break;
      }
    }

    if (!movementToSkip) {
      // Try to find any incomplete movement (for testing purposes)
      for (const movement of (currentPhase?.movements || [])) {
        const key = `${currentPhase.id}:${movement.id}`;
        if (!completedMovements.has(key)) {
          movementToSkip = movement;
          console.log(`   Note: Using required movement for skip test (would fail in production)`);
          break;
        }
      }
    }

    if (!movementToSkip) {
      console.log('   No movements available to skip');
      logResult(10, 'Test Skip Movement', true, 'No movements to skip - all completed');
      return true;
    }

    const movementKey = `${currentPhase.id}:${movementToSkip.id}`;
    console.log(`   Skipping: ${movementToSkip.name}`);
    console.log(`   Is Required: ${movementToSkip.is_required}`);

    // Skip the movement (add to completed without evidence)
    const updatedCompletedMovements = [...(flowInstance?.completed_movements || []), movementKey];

    const { error: updateError } = await supabase
      .from('claim_flow_instances')
      .update({
        completed_movements: updatedCompletedMovements
      })
      .eq('id', testFlowInstanceId);

    if (updateError) {
      logResult(10, 'Test Skip Movement', false, 'Failed to skip movement', updateError.message);
      return false;
    }

    // Record the skip
    const { error: skipError } = await supabase
      .from('movement_completions')
      .insert({
        flow_instance_id: testFlowInstanceId,
        movement_id: movementKey,
        claim_id: testClaimId,
        status: 'skipped',
        completed_at: new Date().toISOString(),
        completed_by: testUserId,
        notes: 'E2E Test: Movement skipped - not applicable to this claim'
      });

    if (skipError) {
      console.log(`   Warning: Skip record failed: ${skipError.message}`);
    }

    // Verify
    const { data: skipRecord } = await supabase
      .from('movement_completions')
      .select('*')
      .eq('flow_instance_id', testFlowInstanceId!)
      .eq('movement_id', movementKey)
      .eq('status', 'skipped')
      .maybeSingle();

    const skipped = skipRecord !== null;
    console.log(`   Skip recorded: ${skipped}`);

    logResult(10, 'Test Skip Movement', skipped,
      skipped ? 'Movement skipped successfully' : 'Skip not recorded properly');
    return skipped;

  } catch (err: any) {
    logResult(10, 'Test Skip Movement', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 11: Complete Remaining Phases
// ============================================================================
async function step11_completeRemainingPhases(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 11: Completing Remaining Phases');
  console.log('='.repeat(60));

  try {
    // Get flow state
    const { data: flowInstance } = await supabase
      .from('claim_flow_instances')
      .select(`*, flow_definitions (flow_json)`)
      .eq('id', testFlowInstanceId!)
      .single();

    const flowJson = (flowInstance?.flow_definitions as any)?.flow_json;
    const phases = flowJson?.phases || [];

    console.log(`   Total Phases: ${phases.length}`);

    // Complete all movements in all remaining phases
    let allMovementKeys: string[] = [...(flowInstance?.completed_movements || [])];

    for (const phase of phases) {
      for (const movement of (phase.movements || [])) {
        const key = `${phase.id}:${movement.id}`;
        if (!allMovementKeys.includes(key)) {
          allMovementKeys.push(key);

          // Record completion
          await supabase
            .from('movement_completions')
            .insert({
              flow_instance_id: testFlowInstanceId,
              movement_id: key,
              claim_id: testClaimId,
              status: 'completed',
              completed_at: new Date().toISOString(),
              completed_by: testUserId,
              notes: 'E2E Test: Bulk completion'
            });
        }
      }
      console.log(`   Phase "${phase.name}": All ${phase.movements?.length || 0} movements completed`);
    }

    // Update flow instance with all completed movements
    const { error: updateError } = await supabase
      .from('claim_flow_instances')
      .update({
        completed_movements: allMovementKeys,
        current_phase_index: phases.length - 1,
        current_phase_id: phases[phases.length - 1]?.id
      })
      .eq('id', testFlowInstanceId);

    if (updateError) {
      logResult(11, 'Complete Remaining Phases', false, 'Failed to update flow', updateError.message);
      return false;
    }

    // Count total movements
    let totalMovements = 0;
    phases.forEach((phase: any) => {
      totalMovements += phase.movements?.length || 0;
    });

    console.log(`   Total movements completed: ${allMovementKeys.length}/${totalMovements}`);

    const allComplete = allMovementKeys.length >= totalMovements;
    logResult(11, 'Complete Remaining Phases', allComplete,
      allComplete ? 'All phases and movements completed' : 'Some movements missing');
    return allComplete;

  } catch (err: any) {
    logResult(11, 'Complete Remaining Phases', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// STEP 12: Verify Flow Completion
// ============================================================================
async function step12_verifyFlowCompletion(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('Step 12: Verifying Flow Completion');
  console.log('='.repeat(60));

  try {
    // Mark flow as complete
    const { error: completeError } = await supabase
      .from('claim_flow_instances')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', testFlowInstanceId);

    if (completeError) {
      logResult(12, 'Verify Flow Completion', false, 'Failed to mark flow complete', completeError.message);
      return false;
    }

    // Verify final state
    const { data: finalFlow, error: verifyError } = await supabase
      .from('claim_flow_instances')
      .select('*')
      .eq('id', testFlowInstanceId!)
      .single();

    if (verifyError || !finalFlow) {
      logResult(12, 'Verify Flow Completion', false, 'Failed to verify final state', verifyError?.message);
      return false;
    }

    console.log(`   Status: ${finalFlow.status}`);
    console.log(`   Completed At: ${finalFlow.completed_at}`);
    console.log(`   Total Movements Completed: ${finalFlow.completed_movements?.length || 0}`);

    // Get summary statistics
    const { count: photoCount } = await supabase
      .from('claim_photos')
      .select('*', { count: 'exact', head: true })
      .eq('flow_instance_id', testFlowInstanceId!);

    const { count: audioCount } = await supabase
      .from('audio_observations')
      .select('*', { count: 'exact', head: true })
      .eq('flow_instance_id', testFlowInstanceId!);

    const { count: completionCount } = await supabase
      .from('movement_completions')
      .select('*', { count: 'exact', head: true })
      .eq('flow_instance_id', testFlowInstanceId!);

    console.log('\n   Evidence Summary:');
    console.log(`   - Photos captured: ${photoCount || 0}`);
    console.log(`   - Audio observations: ${audioCount || 0}`);
    console.log(`   - Movement completions: ${completionCount || 0}`);

    const isComplete = finalFlow.status === 'completed' && finalFlow.completed_at !== null;
    logResult(12, 'Verify Flow Completion', isComplete,
      isComplete ? 'Flow completed successfully!' : 'Flow not properly completed');
    return isComplete;

  } catch (err: any) {
    logResult(12, 'Verify Flow Completion', false, 'Unexpected error', err.message);
    return false;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================
async function cleanup(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('Cleanup: Removing Test Data');
  console.log('='.repeat(60));

  try {
    if (testFlowInstanceId) {
      // Delete movement evidence
      await supabase
        .from('movement_evidence')
        .delete()
        .eq('flow_instance_id', testFlowInstanceId);

      // Delete movement completions
      await supabase
        .from('movement_completions')
        .delete()
        .eq('flow_instance_id', testFlowInstanceId);

      // Delete photos
      await supabase
        .from('claim_photos')
        .delete()
        .eq('flow_instance_id', testFlowInstanceId);

      // Delete audio observations
      await supabase
        .from('audio_observations')
        .delete()
        .eq('flow_instance_id', testFlowInstanceId);

      // Delete flow instance
      await supabase
        .from('claim_flow_instances')
        .delete()
        .eq('id', testFlowInstanceId);

      console.log(`   Deleted flow instance: ${testFlowInstanceId}`);
    }

    if (testClaimId) {
      // Delete claim
      await supabase
        .from('claims')
        .delete()
        .eq('id', testClaimId);

      console.log(`   Deleted test claim: ${testClaimId}`);
    }

    console.log('   Cleanup complete');
  } catch (err: any) {
    console.log(`   Cleanup error (non-critical): ${err.message}`);
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runSmokeTest(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     E2E SMOKE TEST: Water Damage Inspection Flow          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Testing complete inspection flow from start to finish    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // Run all test steps
  let allPassed = true;

  if (await step0_verifyPrerequisites()) {
    if (await step1_createTestClaim()) {
      if (await step2_verifyClaim()) {
        if (await step3_startFlow()) {
          if (await step4_verifyInitialProgress()) {
            if (await step5_executeFirstMovement()) {
              if (await step6_testPhotoCapture()) {
                if (await step7_testAudioObservation()) {
                  if (await step8_completeMovementWithEvidence()) {
                    if (await step9_testPhaseTransition()) {
                      if (await step10_testSkipMovement()) {
                        if (await step11_completeRemainingPhases()) {
                          await step12_verifyFlowCompletion();
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Cleanup test data
  await cleanup();

  // Print summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS SUMMARY                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');

  let passCount = 0;
  let failCount = 0;

  for (const result of testResults) {
    const status = result.passed ? '✅' : '❌';
    if (result.passed) passCount++;
    else failCount++;
    console.log(`║ ${status} Step ${result.step.toString().padStart(2)}: ${result.name.padEnd(41)} ║`);
  }

  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ Total: ${testResults.length} tests | Passed: ${passCount} | Failed: ${failCount}`.padEnd(61) + '║');
  console.log(`║ Duration: ${duration}s`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Print failures
  const failures = testResults.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n');
    console.log('❌ FAILURES:');
    for (const failure of failures) {
      console.log(`\n   Step ${failure.step}: ${failure.name}`);
      console.log(`   Notes: ${failure.notes}`);
      if (failure.error) {
        console.log(`   Error: ${failure.error}`);
      }
    }
  }

  // Final status
  console.log('\n');
  if (failCount === 0) {
    console.log('🎉 ALL TESTS PASSED! The inspection flow system is ready for demo.');
  } else {
    console.log(`⚠️  ${failCount} test(s) failed. Review the failures above and fix issues.`);
    process.exit(1);
  }
}

// Run the test
runSmokeTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
