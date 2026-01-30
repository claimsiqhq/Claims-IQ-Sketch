# Flow Guidance Integration (Tips & TTS Text)

## Overview

Flow definitions contain guidance information for each movement:
- **`guidance.instruction`**: Main instruction text displayed in UI
- **`guidance.tips`**: Array of helpful tips shown to adjusters
- **`guidance.tts_text`**: Text-to-speech content for voice-guided inspections

## Current Integration Points

### 1. **Flow Engine Service** (`server/services/flowEngineService.ts`)

**Dynamic Movement Creation** (Line 1443-1446):
```typescript
guidance: template.guidance ? {
  ...template.guidance,
  instruction: template.guidance.instruction?.replace(/\{\{room\}\}/g, roomName),
  tts_text: template.guidance.tts_text?.replace(/\{\{room\}\}/g, roomName)
} : undefined,
```

- When creating dynamic movements (e.g., room-specific movements), guidance is copied from the template
- Room name placeholders (`{{room}}`) are replaced with actual room names
- Both `instruction` and `tts_text` are preserved

### 2. **Flow Engine Core** (`server/services/flowEngine/index.ts`)

**TTS Guidance Generation** (Line 588-622):
```typescript
export async function generateMovementGuidance(
  movement: FlowMovement,
  context: { phase, perilType, propertyType, adjusterExperience }
): Promise<any>
```

- Uses `movement.tips` array (line 607): `tips: movement.tips?.join('. ') || ''`
- Incorporates tips into AI-generated TTS prompts via the `flow.movement_guidance_tts` prompt template
- Tips are joined with periods and included in the prompt context

**Note**: This function exists but may not be fully integrated yet - it generates guidance prompts but needs to be called from the voice inspection routes.

### 3. **Flow Definition Validation** (`server/services/flowDefinitionService.ts`)

**TTS Text Validation** (Line 475-476):
```typescript
if (!movement.guidance.tts_text) {
  warnings.push({ 
    path: `${movementPath}.guidance.tts_text`, 
    message: `Movement ${movement.id || mIndex + 1} is missing TTS text`, 
    severity: 'warning' 
  });
}
```

- Validates that movements have TTS text (warns if missing)
- Ensures flows are complete for voice-guided inspections

## Missing Integration Points

### ❌ **UI Display of Tips**

**Current Status**: Tips are stored but NOT displayed in the workflow UI

**Where They Should Appear**:
- `client/src/components/flow/FlowProgressBar.tsx` - Current movement display
- `client/src/components/flow/FlowSketchCapture.tsx` - Movement instructions
- `client/src/components/flow/ClaimFlowSection.tsx` - Flow overview

**What's Needed**:
```typescript
// Example: Display tips in movement card
{movement.guidance?.tips && movement.guidance.tips.length > 0 && (
  <div className="mt-2">
    <h4 className="text-sm font-medium">Tips:</h4>
    <ul className="list-disc list-inside text-sm text-muted-foreground">
      {movement.guidance.tips.map((tip, idx) => (
        <li key={idx}>{tip}</li>
      ))}
    </ul>
  </div>
)}
```

### ❌ **Voice Inspection TTS Integration**

**Current Status**: TTS text exists but may not be used in voice inspection

**Where It Should Be Used**:
- `server/routes/flowEngineRoutes.ts` - Voice inspection endpoints
- `server/routes/voiceInspectionRoutes.ts` - Voice session management
- `client/src/components/flow/VoiceGuidedInspection.tsx` - Voice UI component

**What's Needed**:
```typescript
// When starting a movement, speak the TTS text
const movement = getCurrentMovement(flowInstance);
if (movement?.guidance?.tts_text) {
  await speakText(movement.guidance.tts_text);
}
```

### ❌ **API Endpoints for Movement Guidance**

**Current Status**: No dedicated endpoints to fetch movement guidance

**What's Needed**:
```typescript
// GET /api/flow-instances/:id/current-movement/guidance
// Returns: { instruction, tips, tts_text }
```

## Recommended Implementation

### Phase 1: UI Display
1. Update `FlowProgressBar.tsx` to show tips in a collapsible section
2. Update `FlowSketchCapture.tsx` to display tips below instructions
3. Add tooltip/hover hints for quick tip access

### Phase 2: Voice Integration
1. Call `generateMovementGuidance()` when starting a movement
2. Use `guidance.tts_text` directly for TTS playback
3. Fall back to `guidance.instruction` if `tts_text` is missing
4. Include tips in voice prompts for context-aware guidance

### Phase 3: API Enhancement
1. Add `/api/flow-instances/:id/current-movement/guidance` endpoint
2. Return structured guidance object with all fields
3. Support room name substitution in TTS text

## Example Flow Definition Structure

```json
{
  "phases": [{
    "id": "exterior",
    "movements": [{
      "id": "exterior_01",
      "name": "Roof Inspection",
      "guidance": {
        "instruction": "Inspect the roof for damage. Look for missing shingles, dents, or visible damage.",
        "tips": [
          "Use binoculars for hard-to-reach areas",
          "Check around vents and chimneys",
          "Document all damage with photos"
        ],
        "tts_text": "Please inspect the roof for damage. Look for missing shingles, dents, or visible damage. Use binoculars for hard-to-reach areas and check around vents and chimneys."
      }
    }]
  }]
}
```

## Testing Checklist

- [ ] Tips display in Flow Progress Bar
- [ ] Tips display in Movement Details
- [ ] TTS text plays when starting movement
- [ ] Room name substitution works in TTS text
- [ ] Tips are included in AI-generated guidance
- [ ] Missing TTS text shows warning in validation
- [ ] Guidance API endpoint returns all fields
