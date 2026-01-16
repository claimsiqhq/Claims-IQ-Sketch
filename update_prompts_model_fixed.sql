-- ============================================================================
-- Update OpenAI Model for Non-Voice Prompts
-- ============================================================================
-- This script updates all non-voice agent prompts from "gpt-4.1" to "gpt-5.2-2025-12-11"
-- Voice agent prompts are excluded (they use gpt-4o-realtime-preview or gpt-4.1)
--
-- Usage:
--   1. Review the SELECT query below to see what will be updated
--   2. Run the UPDATE query to apply changes
--   3. Verify with the SELECT query again
-- ============================================================================

-- First, preview what will be updated:
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

-- Count how many rows will be affected:
SELECT COUNT(*) as rows_to_update
FROM ai_prompts
WHERE model = 'gpt-4.1'
  AND category != 'voice';

-- Update all non-voice prompts from gpt-4.1 to gpt-5.2-2025-12-11
UPDATE ai_prompts
SET 
  model = 'gpt-5.2-2025-12-11',
  updated_at = NOW()
WHERE model = 'gpt-4.1'
  AND category != 'voice';

-- Verify the update (should show updated rows):
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS updated_model,
  is_active,
  updated_at
FROM ai_prompts
WHERE model = 'gpt-5.2-2025-12-11'
  AND category != 'voice'
ORDER BY category, prompt_key;

-- Verify voice prompts were NOT updated (should still be gpt-4.1):
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS current_model
FROM ai_prompts
WHERE category = 'voice'
ORDER BY prompt_key;
