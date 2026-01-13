import { supabaseAdmin } from '../server/lib/supabaseAdmin';

async function deleteWorkflow() {
  const workflowId = '61f9e018-4066-462b-89de-74e599dfdbca';
  
  console.log('Deleting workflow:', workflowId);
  
  // Delete workflow steps (should be empty but just in case)
  const { error: stepsError } = await supabaseAdmin
    .from('inspection_workflow_steps')
    .delete()
    .eq('workflow_id', workflowId);
  
  if (stepsError) {
    console.log('Steps delete result:', stepsError.message);
  } else {
    console.log('Steps deleted (or none existed)');
  }
  
  // Delete the workflow itself
  const { data, error: workflowError } = await supabaseAdmin
    .from('inspection_workflows')
    .delete()
    .eq('id', workflowId)
    .select();
  
  if (workflowError) {
    console.error('Workflow delete error:', workflowError);
  } else {
    console.log('Workflow deleted successfully:', data);
  }
  
  process.exit(0);
}

deleteWorkflow();
