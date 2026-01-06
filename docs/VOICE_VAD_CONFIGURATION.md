# Voice Activity Detection (VAD) Configuration

## Overview

The voice agent uses OpenAI's server-side Voice Activity Detection (VAD) to improve resistance to background noise and reduce false interruptions.

## Configuration

### Current Settings

Both voice session hooks (`useVoiceSession` and `useVoiceScopeSession`) are configured with:

```typescript
turnDetection: {
  type: 'semantic_vad',
}
```

### Parameter Explanation

- **`type: 'semantic_vad'`**: Uses OpenAI's semantic voice activity detection classifier
  - Intelligently determines when user has finished a complete thought
  - Significantly reduces false interruptions from non-speech background noise
  - Uses context-aware classification rather than simple audio thresholds
  - Better at handling natural speech patterns and pauses
  - More accurate than threshold-based VAD for conversational interfaces

**Note:** `semantic_vad` does not use threshold, prefix_padding_ms, or silence_duration_ms parameters. It uses its own intelligent classifier that understands speech context and meaning.

## Files Modified

1. **`client/src/features/voice-sketch/hooks/useVoiceSession.ts`**
   - Updated turn detection configuration for room sketching

2. **`client/src/features/voice-scope/hooks/useVoiceScopeSession.ts`**
   - Updated turn detection configuration for scope capture

3. **`server/services/voice-session.ts`**
   - Updated server-side session configuration (if supported by OpenAI API)

## Tuning Recommendations

With `semantic_vad`, tuning is handled automatically by the classifier. However, if you need to switch back to threshold-based VAD:

### Alternative: Server VAD (threshold-based)

If `semantic_vad` doesn't meet your needs, you can switch to `server_vad`:

```typescript
turnDetection: {
  type: 'server_vad',
  threshold: 0.65,        // Higher = less sensitive to noise
  prefix_padding_ms: 200, // Audio before speech to capture
  silence_duration_ms: 800, // Silence before ending turn
}
```

**Tuning server_vad:**

- **Too Sensitive (triggers on background noise):**
  - Increase `threshold` to 0.7 or 0.75
  - Increase `silence_duration_ms` to 1000 or 1200

- **Not Sensitive Enough (misses speech):**
  - Decrease `threshold` to 0.55 or 0.6
  - Decrease `silence_duration_ms` to 600 or 700

- **Cutting off speech:**
  - Increase `prefix_padding_ms` to 300 or 400
  - Increase `silence_duration_ms` to allow for pauses

## Testing

After changing VAD settings, test with:
1. Background noise (fan, keyboard typing, etc.)
2. Natural speech pauses
3. Quiet environments
4. Noisy environments

## References

- OpenAI Realtime API Documentation: https://platform.openai.com/docs/guides/realtime
- VAD Configuration: https://platform.openai.com/docs/api-reference/realtime/sessions
