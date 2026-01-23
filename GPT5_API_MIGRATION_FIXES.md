# GPT-5.2 API Migration Fixes

## Summary
Fixed all OpenAI API calls to use `max_completion_tokens` for GPT-5.x models and `max_tokens` for GPT-4.x models, as required by OpenAI's API changes.

## Files Fixed

### ✅ `server/services/claimBriefingService.ts`
- **Status**: Fixed
- **Changes**: 
  - Added helper functions `isGpt5Model()` and `buildOpenAIParams()` for cleaner code
  - Updated API call to conditionally use correct parameter based on model

### ✅ `server/services/ai-estimate-suggest.ts`
- **Status**: Fixed
- **Changes**: 
  - Updated both `generateEstimateSuggestions()` and `quickSuggestLineItems()` functions
  - Added conditional parameter selection based on model

### ✅ `server/services/documentProcessor.ts`
- **Status**: Fixed
- **Changes**: 
  - Fixed two OpenAI API calls in document extraction functions
  - Both now check model type before using parameter

### ✅ `server/services/flowEngineService.ts`
- **Status**: Fixed
- **Changes**: 
  - Fixed one API call that uses `promptConfig.model` (voice note extraction)
  - Two other calls use hardcoded `gpt-4o` without max_tokens (uses defaults - OK)

### ✅ Already Correct (No Changes Needed)

#### `server/services/photos.ts`
- Uses hardcoded `gpt-5.2` with `max_completion_tokens` - ✅ Correct

#### `server/services/documentClassifier.ts`
- Uses hardcoded `gpt-5.2` with `max_completion_tokens` - ✅ Correct

#### `server/services/audioObservationService.ts`
- Uses Anthropic Claude API (not OpenAI) - ✅ Uses `max_tokens` which is correct for Claude

#### `server/services/flowEngineService.ts` (two calls)
- Uses hardcoded `gpt-4o` without max_tokens parameter - ✅ Uses OpenAI defaults (OK)

## Pattern Used

All fixes follow this pattern:

```typescript
// GPT-5.x models require max_completion_tokens instead of max_tokens
const isGpt5Model = promptConfig.model?.startsWith('gpt-5') || promptConfig.model?.includes('gpt-5');
const requestParams: Record<string, unknown> = {
  model: promptConfig.model,
  messages: [...],
  temperature: promptConfig.temperature,
  response_format: { type: 'json_object' }
};

// Use max_completion_tokens for GPT-5.x, max_tokens for GPT-4.x and older
const tokenLimit = promptConfig.maxTokens || DEFAULT_VALUE;
if (isGpt5Model) {
  requestParams.max_completion_tokens = tokenLimit;
} else {
  requestParams.max_tokens = tokenLimit;
}

const response = await openai.chat.completions.create(requestParams);
```

## Testing Recommendations

1. Test claim briefing generation with GPT-5.2 model
2. Test document extraction (FNOL, Policy, Endorsement) with both GPT-4.x and GPT-5.2
3. Test estimate suggestions with both model types
4. Verify flow engine voice note extraction works correctly

## Notes

- All fixes maintain backward compatibility with GPT-4.x models
- The helper function in `claimBriefingService.ts` can be extracted to a shared utility if needed
- Database prompt configurations can now safely use GPT-5.2 models without code changes
