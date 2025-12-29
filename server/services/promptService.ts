/**
 * Prompt Service
 *
 * Centralized service for managing AI prompts stored in the database.
 * Provides caching, template variable substitution, and usage tracking.
 * 
 * Uses Supabase client for all database operations.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AiPrompt, PromptKey } from '../../shared/schema';

// In-memory cache for prompts
const promptCache = new Map<string, AiPrompt>();
let cacheInitialized = false;
let cacheLastRefresh = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize the prompt cache from the database
 */
async function initializeCache(): Promise<void> {
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[PromptService] Failed to initialize cache:', error.message);
      return;
    }

    promptCache.clear();
    for (const prompt of prompts || []) {
      // Convert snake_case from DB to camelCase for internal use
      const normalizedPrompt = normalizePrompt(prompt);
      promptCache.set(normalizedPrompt.promptKey, normalizedPrompt);
    }

    cacheInitialized = true;
    cacheLastRefresh = Date.now();
    console.log(`[PromptService] Loaded ${prompts?.length || 0} prompts into cache`);
  } catch (error) {
    console.error('[PromptService] Failed to initialize cache:', error);
    // Don't throw - allow fallback to hardcoded prompts
  }
}

/**
 * Normalize database row (snake_case) to AiPrompt type (camelCase)
 */
function normalizePrompt(row: any): AiPrompt {
  return {
    id: row.id,
    promptKey: row.prompt_key,
    promptName: row.prompt_name,
    category: row.category,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    model: row.model,
    temperature: row.temperature?.toString() || '0.3',
    maxTokens: row.max_tokens,
    responseFormat: row.response_format,
    description: row.description,
    isActive: row.is_active ?? true,
    version: row.version ?? 1,
    usageCount: row.usage_count ?? 0,
    avgTokensUsed: row.avg_tokens_used ?? 0,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

/**
 * Refresh cache if TTL has expired
 */
async function refreshCacheIfNeeded(): Promise<void> {
  if (!cacheInitialized || Date.now() - cacheLastRefresh > CACHE_TTL_MS) {
    await initializeCache();
  }
}

/**
 * Get a prompt by its key
 */
export async function getPrompt(key: PromptKey | string): Promise<AiPrompt | null> {
  await refreshCacheIfNeeded();

  // Try cache first
  const cached = promptCache.get(key);
  if (cached) {
    // Update usage count asynchronously (fire and forget)
    updateUsageCount(key).catch(console.error);
    return cached;
  }

  // Fallback to database query
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*')
      .eq('prompt_key', key)
      .limit(1);

    if (error) {
      console.error(`[PromptService] Failed to fetch prompt ${key}:`, error.message);
      return null;
    }

    if (prompts && prompts.length > 0) {
      const prompt = normalizePrompt(prompts[0]);
      promptCache.set(key, prompt);
      updateUsageCount(key).catch(console.error);
      return prompt;
    }
  } catch (error) {
    console.error(`[PromptService] Failed to fetch prompt ${key}:`, error);
  }

  return null;
}

/**
 * Get system prompt with optional variable substitution
 */
export async function getSystemPrompt(
  key: PromptKey | string,
  variables?: Record<string, string>
): Promise<string | null> {
  const prompt = await getPrompt(key);
  if (!prompt) return null;

  return substituteVariables(prompt.systemPrompt, variables);
}

/**
 * Get user prompt template with variable substitution
 */
export async function getUserPromptTemplate(
  key: PromptKey | string,
  variables?: Record<string, string>
): Promise<string | null> {
  const prompt = await getPrompt(key);
  if (!prompt?.userPromptTemplate) return null;

  return substituteVariables(prompt.userPromptTemplate, variables);
}

/**
 * Get full prompt configuration for OpenAI API call
 */
export async function getPromptConfig(key: PromptKey | string): Promise<{
  systemPrompt: string;
  userPromptTemplate: string | null;
  model: string;
  temperature: number;
  maxTokens: number | null;
  responseFormat: string;
  version?: number;
} | null> {
  const prompt = await getPrompt(key);
  if (!prompt) return null;

  return {
    systemPrompt: prompt.systemPrompt,
    userPromptTemplate: prompt.userPromptTemplate,
    model: prompt.model,
    temperature: parseFloat(prompt.temperature || '0.3'),
    maxTokens: prompt.maxTokens ?? null,
    responseFormat: prompt.responseFormat || 'text',
    version: prompt.version ?? undefined,
  };
}

/**
 * Substitute {{variable}} placeholders in a template
 */
export function substituteVariables(
  template: string,
  variables?: Record<string, string>
): string {
  if (!variables) return template;

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

/**
 * Update usage count and last used timestamp
 */
async function updateUsageCount(key: string): Promise<void> {
  try {
    // Get current usage count
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('ai_prompts')
      .select('usage_count')
      .eq('prompt_key', key)
      .single();

    if (fetchError) {
      console.error(`[PromptService] Failed to fetch usage count for ${key}:`, fetchError.message);
      return;
    }

    const currentCount = current?.usage_count || 0;

    const { error } = await supabaseAdmin
      .from('ai_prompts')
      .update({
        usage_count: currentCount + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('prompt_key', key);

    if (error) {
      console.error(`[PromptService] Failed to update usage count for ${key}:`, error.message);
    }
  } catch (error) {
    // Non-critical - don't fail the request
    console.error(`[PromptService] Failed to update usage count for ${key}:`, error);
  }
}

/**
 * Clear the prompt cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  promptCache.clear();
  cacheInitialized = false;
}

/**
 * Force refresh the cache
 */
export async function refreshCache(): Promise<void> {
  await initializeCache();
}

/**
 * Get all prompts (for admin UI)
 */
export async function getAllPrompts(): Promise<AiPrompt[]> {
  try {
    const { data: prompts, error } = await supabaseAdmin
      .from('ai_prompts')
      .select('*');

    if (error) {
      console.error('[PromptService] Failed to fetch all prompts:', error.message);
      return [];
    }

    return (prompts || []).map(normalizePrompt);
  } catch (error) {
    console.error('[PromptService] Failed to fetch all prompts:', error);
    return [];
  }
}

/**
 * Update a prompt (for admin UI)
 */
export async function updatePrompt(
  key: string,
  updates: Partial<Pick<AiPrompt, 'systemPrompt' | 'userPromptTemplate' | 'model' | 'temperature' | 'maxTokens' | 'responseFormat' | 'description' | 'isActive'>>
): Promise<AiPrompt | null> {
  try {
    // Get current version
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('ai_prompts')
      .select('version')
      .eq('prompt_key', key)
      .single();

    if (fetchError) {
      console.error(`[PromptService] Failed to fetch prompt ${key}:`, fetchError.message);
      return null;
    }

    const currentVersion = current?.version || 1;

    // Convert camelCase to snake_case for Supabase
    const dbUpdates: Record<string, any> = {
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    };

    if (updates.systemPrompt !== undefined) dbUpdates.system_prompt = updates.systemPrompt;
    if (updates.userPromptTemplate !== undefined) dbUpdates.user_prompt_template = updates.userPromptTemplate;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) dbUpdates.max_tokens = updates.maxTokens;
    if (updates.responseFormat !== undefined) dbUpdates.response_format = updates.responseFormat;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data: updated, error } = await supabaseAdmin
      .from('ai_prompts')
      .update(dbUpdates)
      .eq('prompt_key', key)
      .select('*')
      .single();

    if (error) {
      console.error(`[PromptService] Failed to update prompt ${key}:`, error.message);
      return null;
    }

    const normalizedPrompt = normalizePrompt(updated);

    // Update cache
    if (normalizedPrompt.isActive) {
      promptCache.set(key, normalizedPrompt);
    } else {
      promptCache.delete(key);
    }

    return normalizedPrompt;
  } catch (error) {
    console.error(`[PromptService] Failed to update prompt ${key}:`, error);
    return null;
  }
}

/**
 * Get prompt from Supabase database - NO FALLBACKS
 *
 * IMPORTANT: All prompts MUST be stored in the ai_prompts table in Supabase.
 * There are NO hardcoded fallback prompts in the codebase.
 *
 * If you receive an error about a missing prompt, you must add it to Supabase:
 * 1. Go to the Supabase dashboard
 * 2. Navigate to the ai_prompts table
 * 3. Insert the required prompt with the correct prompt_key
 *
 * Required prompt keys for document extraction:
 * - document.extraction.fnol
 * - document.extraction.policy
 * - document.extraction.endorsement
 */
export async function getPromptWithFallback(key: PromptKey | string): Promise<{
  systemPrompt: string;
  userPromptTemplate: string | null;
  model: string;
  temperature: number;
  maxTokens: number | null;
  responseFormat: string;
  version?: number;
}> {
  // Get prompt from database - this is the ONLY source
  const dbPrompt = await getPromptConfig(key);
  if (dbPrompt) {
    return dbPrompt;
  }

  // NO FALLBACKS - prompts MUST be in Supabase
  throw new Error(
    `[PromptService] MISSING PROMPT: No prompt found in database for key "${key}". ` +
    `All prompts must be stored in the ai_prompts table in Supabase. ` +
    `Please add the required prompt to the database before proceeding. ` +
    `See documentation for required prompt structure and fields.`
  );
}
