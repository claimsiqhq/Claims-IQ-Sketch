/**
 * Script to update all non-voice prompts to use gpt-5.2
 */
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function updatePromptModels() {
  console.log('[UpdatePrompts] Starting update of non-voice prompts to gpt-5.2...');
  
  const { data: prompts, error: fetchError } = await supabaseAdmin
    .from('ai_prompts')
    .select('id, prompt_key, model');
  
  if (fetchError) {
    console.error('[UpdatePrompts] Failed to fetch prompts:', fetchError);
    process.exit(1);
  }
  
  console.log(`[UpdatePrompts] Found ${prompts?.length || 0} prompts`);
  
  const promptsToUpdate = prompts?.filter(p => 
    !p.prompt_key.toLowerCase().includes('voice') &&
    !p.prompt_key.toLowerCase().includes('realtime') &&
    p.model !== 'gpt-5.2'
  ) || [];
  
  console.log(`[UpdatePrompts] ${promptsToUpdate.length} prompts need updating`);
  
  for (const prompt of promptsToUpdate) {
    console.log(`[UpdatePrompts] Updating ${prompt.prompt_key}: ${prompt.model} -> gpt-5.2`);
    
    const { error: updateError } = await supabaseAdmin
      .from('ai_prompts')
      .update({ 
        model: 'gpt-5.2',
        updated_at: new Date().toISOString()
      })
      .eq('id', prompt.id);
    
    if (updateError) {
      console.error(`[UpdatePrompts] Failed to update ${prompt.prompt_key}:`, updateError);
    } else {
      console.log(`[UpdatePrompts] Updated ${prompt.prompt_key}`);
    }
  }
  
  console.log('[UpdatePrompts] Complete!');
}

updatePromptModels().catch(console.error);
