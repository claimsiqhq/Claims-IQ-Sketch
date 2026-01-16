-- ============================================================================
-- Diagnostic and Update Script for OpenAI Model Migration
-- ============================================================================
-- This will help diagnose why the update didn't work and then perform it
-- ============================================================================

-- STEP 1: Check what models currently exist
SELECT DISTINCT model, COUNT(*) as count
FROM ai_prompts
GROUP BY model
ORDER BY model;

-- STEP 2: Check specifically for gpt-4.1 prompts by category
SELECT 
  category,
  COUNT(*) as count,
  STRING_AGG(prompt_key, ', ') as prompt_keys
FROM ai_prompts
WHERE model = 'gpt-4.1'
GROUP BY category
ORDER BY category;

-- STEP 3: Preview exactly what will be updated (non-voice only)
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS current_model,
  is_active
FROM ai_prompts
WHERE model = 'gpt-4.1'
  AND category != 'voice'
ORDER BY category, prompt_key;

-- STEP 4: Count how many will be updated
SELECT COUNT(*) as rows_to_update
FROM ai_prompts
WHERE model = 'gpt-4.1'
  AND category != 'voice';

-- STEP 5: Perform the update
UPDATE ai_prompts
SET 
  model = 'gpt-5.2-2025-12-11',
  updated_at = NOW()
WHERE model = 'gpt-4.1'
  AND category != 'voice';

-- STEP 6: Verify the update worked
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS updated_model,
  updated_at
FROM ai_prompts
WHERE model = 'gpt-5.2-2025-12-11'
ORDER BY category, prompt_key;

-- STEP 7: Verify voice prompts were NOT changed
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS current_model
FROM ai_prompts
WHERE category = 'voice'
ORDER BY prompt_key;

-- STEP 8: Final check - should show 0 rows with gpt-4.1 and non-voice category
SELECT COUNT(*) as remaining_gpt41_non_voice
FROM ai_prompts
WHERE model = 'gpt-4.1'
  AND category != 'voice';
