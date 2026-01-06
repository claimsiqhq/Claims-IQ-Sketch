# Voice Activity Detection (VAD) Configuration

## Overview

The voice agent uses OpenAI's server-side Voice Activity Detection (VAD) to improve resistance to background noise and reduce false interruptions.

## Configuration

### Current Settings

Both voice session hooks (`useVoiceSession` and `useVoiceScopeSession`) are configured with:

```typescript
turnDetection: {
  type: 'server_vad',
  threshold: 0.65,
  prefix_padding_ms: 200,
  silence_duration_ms: 800,
}
```

### Parameter Explanation

- **`type: 'server_vad'`**: Uses OpenAI's server-side VAD instead of client-side semantic VAD
  - More robust against background noise
  - Better handling of ambient sounds
  - Reduced false positives from non-speech audio

- **`threshold: 0.65`**: Voice activity detection threshold (0.0 - 1.0)
  - Higher values = more conservative (requires stronger voice signal)
  - Lower values = more sensitive (may trigger on background noise)
  - Default: 0.5, Current: 0.65 (more conservative to reduce interruptions)

- **`prefix_padding_ms: 200`**: Milliseconds of audio to include before detected speech
  - Captures speech that starts before VAD triggers
  - Helps avoid cutting off the beginning of utterances
  - Current: 200ms

- **`silence_duration_ms: 800`**: Milliseconds of silence required before ending turn
  - Longer duration = waits longer before considering speech finished
  - Helps handle pauses in natural speech
  - Current: 800ms (allows for natural pauses)

## Files Modified

1. **`client/src/features/voice-sketch/hooks/useVoiceSession.ts`**
   - Updated turn detection configuration for room sketching

2. **`client/src/features/voice-scope/hooks/useVoiceScopeSession.ts`**
   - Updated turn detection configuration for scope capture

3. **`server/services/voice-session.ts`**
   - Updated server-side session configuration (if supported by OpenAI API)

## Tuning Recommendations

If users still experience issues with background noise:

### Too Sensitive (triggers on background noise):
- Increase `threshold` to 0.7 or 0.75
- Increase `silence_duration_ms` to 1000 or 1200

### Not Sensitive Enough (misses speech):
- Decrease `threshold` to 0.55 or 0.6
- Decrease `silence_duration_ms` to 600 or 700

### Cutting off speech:
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
