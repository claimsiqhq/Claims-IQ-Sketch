# Claims-IQ-Sketch Codebase Analysis for Photo Integration

## SECTION 4: VOICE & SKETCH UI

### 4.2 Voice UI

#### How does the user start/stop voice?

**Two Voice Interaction Patterns Exist:**

**1. Web Speech API (Simple Voice Input):**
- **File:** `/client/src/hooks/use-voice-input.tsx`
- **Methods:** `startListening()` and `stopListening()`
- Microphone permission requested implicitly by browser
- Usage: Simple text input without AI processing

**2. RealtimeSession (AI Voice Agents):**
- **Files:**
  - `/client/src/features/voice-sketch/hooks/useVoiceSession.ts`
  - `/client/src/features/voice-scope/hooks/useVoiceScopeSession.ts`
- Explicit microphone permission request (lines 50-67 in useVoiceSession.ts):
  ```typescript
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(track => track.stop());
  ```
- Session lifecycle: `startSession()` → `connect()` → `stopSession()` / `close()`
- WebRTC transport for audio streaming

#### Is there push-to-talk or continuous listening?

**Both modes are IMPLEMENTED:**

| Mode | File | Configuration | Behavior |
|------|------|---------------|----------|
| **Push-to-Talk** | `voice-input.tsx` (lines 119-183) | `continuous: false` | User holds/clicks button to record, release to stop |
| **Continuous Listening** | `voice-input.tsx` (lines 21-114) | `continuous: true` | User clicks once to start, must explicitly click to stop |
| **Voice Agents (Semantic VAD)** | `useVoiceSession.ts` (lines 84-88) | `turnDetection: { type: 'semantic_vad' }` | Automatic voice activity detection with turn-taking |

#### How is voice state shown to user?

**Recording Indicator (Web Speech API):**
- **File:** `/client/src/components/workflow/voice-input.tsx` (lines 84-93)
- Visual elements:
  - Pulsing red dot with "Recording" text
  - Animated mic icon that bounces
  - Button variant changes to "destructive" (red) while listening
  - Button text shows "Listening..." when active

```tsx
{isListening && (
  <div className="flex items-center gap-1">
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
    </span>
    <span className="text-xs text-red-600">Recording</span>
  </div>
)}
```

**Voice Waveform Visualization:**
- **File:** `/client/src/features/voice-sketch/components/VoiceWaveform.tsx`
- Canvas-based animated bars showing connection state:
  - **Not Connected** (gray, flat bars at 10% height)
  - **Listening** (green, pulsing bars at 20-40% height)
  - **Speaking** (blue, high-energy animated bars at 30-80% height)
  - **Connected/Idle** (gray, 15% height)
- Status labels with icons: `Mic` icon for listening, `Volume2` icon for speaking, `WifiOff` icon for disconnected

**Voice-Related Components Summary:**

| File Path | Type | Purpose |
|-----------|------|---------|
| `/client/src/hooks/use-voice-input.tsx` | Hook | Web Speech API wrapper |
| `/client/src/components/workflow/voice-input.tsx` | Component | VoiceInput and VoiceButton UI |
| `/client/src/features/voice-sketch/hooks/useVoiceSession.ts` | Hook | RealtimeSession for room sketching |
| `/client/src/features/voice-sketch/components/VoiceSketchController.tsx` | Component | Main voice sketch UI with controls |
| `/client/src/features/voice-sketch/components/VoiceWaveform.tsx` | Component | Animated audio visualization |
| `/client/src/features/voice-scope/hooks/useVoiceScopeSession.ts` | Hook | RealtimeSession for estimate building |
| `/client/src/features/voice-scope/components/VoiceScopeController.tsx` | Component | Main voice scope UI |

---

### 4.3 Canvas Component

#### What renders the sketch?

**Primary Rendering Technology: HTML DIV-based with CSS Transforms** (NOT pure SVG or Canvas)

**Main Sketch Canvas:**
- **File:** `/client/src/components/sketch-canvas.tsx` (lines 558-647)

```tsx
// Canvas Content with Transform (DIV-based rendering)
<div
  className="canvas-content absolute inset-0"
  style={{
    transform: `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`,
    transformOrigin: '0 0'
  }}
>
  {rooms.map((room) => (
    <div
      className={cn(
        "absolute border-2 transition-colors flex items-center justify-center cursor-move shadow-sm touch-none",
        isSelected ? "border-primary bg-primary/5 z-20" : "border-slate-400 bg-white hover:border-primary/50 z-10",
        hasDamage && !isSelected && "border-red-400 bg-red-50/50"
      )}
      style={{
        left: `${room.x * BASE_PIXELS_PER_FOOT}px`,
        top: `${room.y * BASE_PIXELS_PER_FOOT}px`,
        width: `${room.width * BASE_PIXELS_PER_FOOT}px`,
        height: `${room.height * BASE_PIXELS_PER_FOOT}px`,
      }}
    />
  ))}
</div>
```

**Background Grid:** Uses CSS radial gradient:
```tsx
style={{
  backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
  backgroundSize: `${BASE_PIXELS_PER_FOOT * viewState.scale}px ...`,
  backgroundPosition: `${viewState.offsetX}px ${viewState.offsetY}px`,
}}
```

**Secondary Rendering Technologies (Canvas 2D for previews):**
- **FloorPlanPreview:** `/client/src/features/voice-sketch/components/FloorPlanPreview.tsx`
- **RoomPreview:** `/client/src/features/voice-sketch/components/RoomPreview.tsx`

| Component | Rendering | Location |
|-----------|-----------|----------|
| **SketchCanvas** | DIV-based | `/client/src/components/sketch-canvas.tsx` |
| **SketchCanvasWalls** | DIV + State | `/client/src/components/sketch-canvas-walls.tsx` |
| **RoomPreview** | Canvas 2D | `/client/src/features/voice-sketch/components/RoomPreview.tsx` |
| **FloorPlanPreview** | Canvas 2D | `/client/src/features/voice-sketch/components/FloorPlanPreview.tsx` |

#### How are zones displayed?

**In Main Sketch Canvas (DIV-based):**
- **File:** `/client/src/components/sketch-canvas.tsx` (lines 568-596)

Zones displayed as overlays on rooms:
```tsx
// Damage Overlay - semi-transparent red with icon
{hasDamage && (
  <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex items-center justify-center">
    <AlertTriangle className="text-red-500/20 h-12 w-12" />
  </div>
)}
```

**In Canvas-based Previews (RoomPreview):**
- **File:** `/client/src/features/voice-sketch/components/RoomPreview.tsx` (lines 754-910)

Color scheme for zones:
```tsx
const COLORS = {
  damage: {
    water: 'rgba(59, 130, 246, 0.3)',      // Blue
    fire: 'rgba(239, 68, 68, 0.3)',        // Red
    smoke: 'rgba(107, 114, 128, 0.3)',     // Gray
    mold: 'rgba(34, 197, 94, 0.3)',        // Green
    wind: 'rgba(168, 162, 158, 0.3)',      // Beige
    impact: 'rgba(249, 115, 22, 0.3)',     // Orange
  },
}
```

#### Is there photo overlay capability currently?

**NOT IMPLEMENTED** - Photos are managed separately without sketch integration.

Current photo handling (separate from sketch):
- **PhotoAlbum Component:** `/client/src/features/voice-sketch/components/PhotoAlbum.tsx`
- **Photo Capture:** `/client/src/components/workflow/photo-capture.tsx`
- **Photos Page:** `/client/src/pages/photos.tsx`

No photo overlay functionality exists in:
- sketch-canvas.tsx (main component)
- sketch-canvas-walls.tsx (wall editing version)
- FloorPlanPreview
- RoomPreview

---

## SECTION 5: API ENDPOINTS

### Zone CRUD Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| POST | `/api/estimates/:id/structures` | Create structure | `{name, type, ...}` | `{id, estimateId, name, ...}` |
| GET | `/api/structures/:id` | Get structure | - | `{id, estimateId, name, ...}` |
| PUT | `/api/structures/:id` | Update structure | `{name, type, ...}` | `{id, name, ...}` |
| DELETE | `/api/structures/:id` | Delete structure | - | `{success: true}` |
| POST | `/api/structures/:id/areas` | Create area | `{name, type, ...}` | `{id, structureId, name, ...}` |
| POST | `/api/areas/:id/zones` | Create zone | `{name, zoneType, roomType, ...}` | `{id, areaId, name, ...}` |
| GET | `/api/zones/:id` | Get zone | - | `{id, areaId, name, zoneType, ...}` |
| GET | `/api/zones/:id/full` | Get zone with children | - | `{id, missingWalls: [...], subrooms: [...], lineItems: [...]}` |
| PUT | `/api/zones/:id` | Update zone | `{name, zoneType, dimensions, ...}` | `{id, name, ...}` |
| DELETE | `/api/zones/:id` | Delete zone | - | `{success: true}` |

### Photo Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| POST | `/api/photos/upload` | Upload and analyze photo | Multipart: `file, claimId, structureId, roomId, label, latitude, longitude` | `{id, claimId, url, storagePath, ...}` |
| GET | `/api/photos/:storagePath(*)/url` | Get signed URL | - | `{url: "signed-url-string"}` |
| GET | `/api/claims/:claimId/photos` | List photos for claim | Query: `{structureId, roomId, damageZoneId}` | `{photos: [...]}` |
| GET | `/api/photos/:id` | Get photo by ID | - | `{id, claimId, url, label, ...}` |
| DELETE | `/api/photos/:id` | Delete photo | - | `{success: true}` |
| PATCH | `/api/photos/:id` | Update photo metadata | `{label, roomId, damageZoneId}` | `{id, label, ...}` |
| POST | `/api/photos/:id/reanalyze` | Re-analyze photo | - | `{success: true, message: "Analysis started"}` |

### Sketch/Claim Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| GET | `/api/estimates/:id/sketch` | Get sketch geometry | - | `{zones: [...], connections: [...]}` |
| PUT | `/api/estimates/:id/sketch` | Update sketch geometry | `{zones, connections, ...}` | `{zones: [...], connections: [...]}` |
| POST | `/api/estimates/:id/sketch/validate` | Validate sketch | - | `{valid: boolean, errors: [...]}` |
| POST | `/api/estimates/:id/sketch/connections` | Create zone connection | `{fromZoneId, toZoneId, connectionType}` | `{id, fromZoneId, toZoneId, ...}` |
| GET | `/api/sketch/estimates/:estimate_id/state` | Get current sketch state | - | `{data: {zones, rooms, connections, ...}}` |

### AI/Analysis Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| POST | `/api/ai/suggest-estimate` | Generate estimate from damage | `{description, damageType, rooms, peril}` | `{suggestions: [...]}` |
| POST | `/api/voice/session` | Create voice session | `{mode, claimId, context}` | `{session: {id, mode, ...}}` |
| GET | `/api/voice/config` | Get voice config | - | `{config: {...}}` |
| POST | `/api/claims/:id/briefing` | Generate AI briefing | `{forceRegenerate}` | `{briefing: {...}}` |

---

## SECTION 6: DATABASE SCHEMA

### estimate_zones (Primary Zones Table)
**File:** `/shared/schema.ts` (lines 1493-1574)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary Key |
| `areaId` | UUID | FK → estimate_areas.id |
| `name` | VARCHAR(100) | Zone name |
| `zoneType` | VARCHAR(20) | room, elevation, roof, deck, linear |
| `roomType` | VARCHAR(50) | living_room, kitchen, etc. |
| `lengthFt` | DECIMAL(8,2) | Dimensions |
| `widthFt` | DECIMAL(8,2) | Dimensions |
| `heightFt` | DECIMAL(8,2) | Height (default: 8.0) |
| `originXFt` | DECIMAL(8,2) | Floor plan position |
| `originYFt` | DECIMAL(8,2) | Floor plan position |
| `polygonFt` | JSONB | Polygon vertices `[{x, y}, ...]` |
| `shapeType` | VARCHAR(10) | RECT, L, T, POLY |
| `damageType` | VARCHAR(50) | water, fire, smoke, mold, wind |
| `damageSeverity` | VARCHAR(20) | minor, moderate, severe |
| `waterCategory` | INTEGER | Category 1-3 |
| `affectedSurfaces` | JSONB | Array of affected surfaces |
| `photoIds` | JSONB | Array of photo IDs |
| `notes` | TEXT | Zone notes |

### zone_openings (Wall Openings - Doors, Windows)
**File:** `/shared/schema.ts` (lines 1591-1630)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary Key |
| `zoneId` | UUID | FK → estimate_zones.id |
| `openingType` | VARCHAR(30) | door, window, archway, etc. |
| `wallIndex` | INTEGER | 0-based polygon edge index |
| `offsetFromVertexFt` | DECIMAL(8,2) | Position on wall |
| `widthFt` | DECIMAL(6,2) | Opening width |
| `heightFt` | DECIMAL(6,2) | Opening height |
| `sillHeightFt` | DECIMAL(6,2) | Window sill height |
| `connectsToZoneId` | UUID | FK → estimate_zones.id |

### claim_damage_zones (Voice Sketch Damage Zones)
**File:** `/shared/schema.ts` (lines 817-871)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary Key |
| `claimId` | UUID | FK → claims.id |
| `roomId` | UUID | FK → claim_rooms.id |
| `damageType` | VARCHAR(50) | water, fire, smoke, mold, wind |
| `category` | VARCHAR(50) | category_1, category_2, category_3 |
| `affectedWalls` | JSONB | Array of walls `["north", "south"]` |
| `floorAffected` | BOOLEAN | Floor damage flag |
| `ceilingAffected` | BOOLEAN | Ceiling damage flag |
| `extentFt` | DECIMAL(6,2) | Damage extent from wall |
| `polygon` | JSONB | Damage zone boundaries |
| `isFreeform` | BOOLEAN | Irregular zone flag |

### claim_photos (Photos Table)
**File:** `/shared/schema.ts` (lines 877-935)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary Key |
| `claimId` | UUID | FK → claims.id |
| `organizationId` | UUID | Tenant isolation |
| `structureId` | UUID | FK → claim_structures.id |
| `roomId` | UUID | FK → claim_rooms.id |
| `damageZoneId` | UUID | FK → claim_damage_zones.id |
| `storagePath` | VARCHAR(500) | File storage path |
| `publicUrl` | VARCHAR(1000) | Public URL |
| `fileName` | VARCHAR(255) | Original filename |
| `mimeType` | VARCHAR(100) | MIME type |
| `label` | VARCHAR(255) | Photo label |
| `hierarchyPath` | VARCHAR(500) | Hierarchical path |
| `latitude` | DOUBLE | GPS latitude |
| `longitude` | DOUBLE | GPS longitude |
| `aiAnalysis` | JSONB | OpenAI Vision results |
| `qualityScore` | INTEGER | Quality score |
| `damageDetected` | BOOLEAN | Damage detection flag |
| `analysisStatus` | VARCHAR(30) | pending, analyzing, completed, failed |
| `analysisError` | TEXT | Error message |
| `capturedAt` | TIMESTAMP | When photo was taken |
| `analyzedAt` | TIMESTAMP | When AI analysis completed |

### Relationships

```
claims
  ├── claim_structures
  ├── claim_rooms
  ├── claim_damage_zones → claim_rooms
  └── claim_photos
      ├── claim_structures
      ├── claim_rooms
      └── claim_damage_zones

estimates
  ├── estimate_areas
  │   └── estimate_zones
  │       ├── zone_openings
  │       └── zone_connections
```

---

## SECTION 7: INTEGRATION POINTS

### 7.1 Where would a new "capture_photo" voice tool be defined?

**File path:** `/client/src/features/voice-sketch/agents/room-sketch-agent.ts`

**Pattern to follow based on existing tools:**

```typescript
// Existing tool pattern from room-sketch-agent.ts
{
  name: 'capture_photo',
  type: 'function',
  description: 'Capture a photo of the current room or damage zone to document the condition. The user will be prompted to use their camera.',
  parameters: {
    type: 'object',
    properties: {
      target_type: {
        type: 'string',
        enum: ['room', 'damage_zone', 'opening', 'feature', 'overview'],
        description: 'What the photo is documenting'
      },
      target_id: {
        type: 'string',
        description: 'Optional ID of specific room or damage zone'
      },
      label: {
        type: 'string',
        description: 'Descriptive label for the photo (e.g., "Water damage on north wall")'
      },
      suggested_angle: {
        type: 'string',
        description: 'Suggested camera angle or framing instructions'
      }
    },
    required: ['target_type', 'label']
  }
}
```

**Tool handler location:** `/client/src/features/voice-sketch/hooks/useVoiceSession.ts` (handleToolCall function)

### 7.2 Where would photo capture UI be triggered?

**Component to handle camera access:**
- **New component needed:** `/client/src/features/voice-sketch/components/VoicePhotoCapture.tsx`
- **Base implementation exists:** `/client/src/components/workflow/photo-capture.tsx` (can be adapted)

**Camera access pattern (from existing photo-capture.tsx lines 76-100):**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment' }
});
videoRef.current.srcObject = stream;
```

**How to communicate with voice pipeline:**

In `useVoiceSession.ts`, the tool call handler would:
1. Emit an event/set state to trigger camera UI overlay
2. Wait for photo capture or cancellation
3. Return result to voice agent

```typescript
// In handleToolCall function in useVoiceSession.ts
case 'capture_photo':
  onPhotoCaptureTrigger?.({
    targetType: args.target_type,
    targetId: args.target_id,
    label: args.label,
    suggestedAngle: args.suggested_angle
  });
  // Return pending state, actual result comes async
  return { status: 'capture_initiated', message: 'Camera opened for user' };
```

### 7.3 Where would photo-zone linking happen?

**State update location:**
- **Voice sketch state:** `/client/src/features/voice-sketch/stores/voiceSketchStore.ts` (if exists) or within `VoiceSketchController.tsx`
- **Geometry engine:** `/client/src/features/voice-sketch/engines/geometry-engine.ts`

**Database persistence location:**
- **Server route:** `/server/routes.ts` lines 4834-5043 (existing photo upload endpoint)
- **Photo upload endpoint:** `POST /api/photos/upload`

**Request body for zone linking:**
```typescript
{
  file: File,
  claimId: string,
  structureId?: string,
  roomId?: string,          // Links to claim_rooms.id
  damageZoneId?: string,    // Links to claim_damage_zones.id
  label: string,
  latitude?: number,
  longitude?: number
}
```

**API endpoint needed:** The existing `POST /api/photos/upload` already supports zone linking via `roomId` and `damageZoneId` parameters.

### 7.4 Where would AI photo analysis be added?

**Server-side service location:**
- **Existing:** Photo analysis is already implemented during upload
- **File:** `/server/routes.ts` lines 4834-5043 (photo upload with AI analysis)
- **Service file:** `/server/services/photo-analysis.ts` (if exists) or inline in routes

**How to call GPT-4 Vision:**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analyze this photo for property damage. Identify damage type, severity, affected surfaces, and estimated extent.'
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: 'high'
          }
        }
      ]
    }
  ],
  max_tokens: 1000
});
```

**How to return analysis to voice conversation:**

1. Photo analysis result stored in `claim_photos.aiAnalysis` (JSONB)
2. Voice tool callback returns analysis summary:

```typescript
// In tool response
return {
  status: 'analysis_complete',
  photo_id: photoId,
  analysis: {
    damage_detected: true,
    damage_type: 'water',
    severity: 'moderate',
    affected_surfaces: ['wall', 'floor'],
    description: 'Water staining visible on north wall extending 3 feet from baseboard',
    suggested_actions: ['Document moisture readings', 'Check for mold']
  }
};
```

---

## SECTION 8: DEPENDENCIES & PACKAGES

### Voice/Audio (WebRTC, Audio Processing)
| Package | Version | Purpose |
|---------|---------|---------|
| `@openai/agents-realtime` | ^0.3.4 | OpenAI real-time voice agents with WebRTC |

**Note:** No dedicated audio processing libraries (like Tone.js, wavesurfer.js) installed.

### Camera/Media Capture
**NOT IMPLEMENTED** - No specific packages installed. Uses browser's native `getUserMedia()` API.

### Image Handling
**NOT IMPLEMENTED** - No dedicated image handling libraries (sharp, image-js, etc.) installed.
- `puppeteer` (^23.0.0) can handle screenshots but is primarily for browser automation.

### AI/OpenAI Integration
| Package | Version | Purpose |
|---------|---------|---------|
| `openai` | ^6.13.0 | Official OpenAI SDK for API integration |
| `@openai/agents` | ^0.3.4 | OpenAI agents framework |
| `@openai/agents-realtime` | ^0.3.4 | Real-time streaming agents |

### Storage (Supabase, S3 SDK)
| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.89.0 | Supabase JavaScript client |
| `supabase` | ^2.67.1 | Supabase client library |
| `multer` | ^2.0.2 | File upload middleware |

**Note:** No S3 SDK installed (aws-sdk, @aws-sdk/client-s3).

---

## SECTION 9: GAPS IDENTIFIED

### 1. Schema Changes Needed

| Status | Item | Description |
|--------|------|-------------|
| **IMPLEMENTED** | `claim_photos.roomId` | Already links photos to rooms |
| **IMPLEMENTED** | `claim_photos.damageZoneId` | Already links photos to damage zones |
| **IMPLEMENTED** | `claim_photos.aiAnalysis` | JSONB column for GPT-4 Vision results |
| **MAY NEED** | `voice_photo_sessions` table | Track photos captured during voice session |
| **MAY NEED** | `claim_photos.captureContext` | Store voice command context |

### 2. New API Endpoints Needed

| Priority | Endpoint | Purpose |
|----------|----------|---------|
| **LOW** | None critical | Existing `/api/photos/upload` handles zone linking |
| **OPTIONAL** | `POST /api/voice/photos/capture` | Voice-specific photo endpoint with session context |
| **OPTIONAL** | `POST /api/photos/:id/link-zone` | Dedicated endpoint for linking existing photo to zone |

### 3. New Voice Tools Needed

| Priority | Tool | Description |
|----------|------|-------------|
| **HIGH** | `capture_photo` | Trigger camera UI and capture photo |
| **MEDIUM** | `review_photos` | Show photos taken for current room/zone |
| **MEDIUM** | `link_photo_to_damage` | Link existing photo to damage zone |
| **LOW** | `describe_photo` | Get AI description of last captured photo |

### 4. New UI Components Needed

| Priority | Component | Description |
|----------|-----------|-------------|
| **HIGH** | `VoicePhotoCapture.tsx` | Camera overlay triggered by voice |
| **HIGH** | `PhotoCaptureModal.tsx` | Modal wrapper for camera with voice context |
| **MEDIUM** | `PhotoThumbnailOverlay.tsx` | Show captured photos on sketch canvas |
| **MEDIUM** | `VoicePhotoReview.tsx` | Review photos within voice session |
| **LOW** | `PhotoZoneLinkUI.tsx` | Manual photo-to-zone linking interface |

### 5. New Services Needed

| Priority | Service | Description |
|----------|---------|-------------|
| **LOW** | None critical | GPT-4 Vision already integrated in photo upload |
| **OPTIONAL** | `VoicePhotoService.ts` | Client-side service to coordinate voice + camera |
| **OPTIONAL** | Enhanced analysis | Add structured damage assessment prompts |

---

## IMPLEMENTATION SUMMARY

### What's Already IMPLEMENTED:
- Photo upload with AI analysis (`POST /api/photos/upload`)
- Photo-to-room linking (`roomId` column)
- Photo-to-damage-zone linking (`damageZoneId` column)
- GPT-4 Vision analysis stored in `aiAnalysis` JSONB
- Voice agent infrastructure (`useVoiceSession.ts`)
- Voice tool pattern (`room-sketch-agent.ts`)
- Camera access via `getUserMedia()` (`photo-capture.tsx`)

### What's NOT IMPLEMENTED:
- Voice tool to trigger photo capture
- Camera UI overlay during voice session
- Photo thumbnails on sketch canvas
- Voice-initiated photo-zone linking
- Voice feedback of photo analysis results

### Recommended Implementation Order:
1. Add `capture_photo` tool to `room-sketch-agent.ts`
2. Create `VoicePhotoCapture.tsx` component
3. Wire tool handler in `useVoiceSession.ts` to trigger component
4. Pass photo upload result back to voice agent
5. (Optional) Add photo thumbnails to sketch canvas

---

*Generated: 2026-01-11*
*Branch: claude/analyze-photo-integration-D6Vt2*
