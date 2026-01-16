-- ============================================================================
-- Update OpenAI Model for Non-Voice Prompts
-- ============================================================================
-- This script updates all non-voice agent prompts from "gpt-4.1" to "gpt-5.2-2025-12-11"
-- Voice agent prompts are excluded (they use gpt-4o-realtime-preview)
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

-- Update all non-voice prompts from gpt-4.1 to gpt-5.2-2025-12-11
UPDATE ai_prompts
SET 
  model = 'gpt-5.2-2025-12-11',
  updated_at = NOW()
WHERE model = 'gpt-4.1'
  AND category != 'voice';

-- Verify the update:
SELECT 
  id,
  prompt_key,
  prompt_name,
  category,
  model AS updated_model,
  is_active
FROM ai_prompts
WHERE model = 'gpt-5.2-2025-12-11'
  AND category != 'voice'
ORDER BY category, prompt_key;

-- ============================================================================
-- Alternative: Update ALL non-voice prompts regardless of current model
-- (Uncomment if you want to update all non-voice prompts, not just gpt-4.1)
-- ============================================================================
-- UPDATE ai_prompts
-- SET 
--   model = 'gpt-5.2-2025-12-11',
--   updated_at = NOW()
-- WHERE category != 'voice'
--   AND model != 'gpt-5.2-2025-12-11';  -- Avoid updating already-updated rows
