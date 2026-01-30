# Offline Mode, Retry, and Photo Analysis

## Are these functions asynchronous? Does the app retry when offline?

### Asynchronous behavior

- **Photo upload**: Upload is synchronous from the user’s perspective (we wait for the server response). **OpenAI photo analysis** runs **asynchronously** in the background after the photo is saved: the photo is stored with `analysisStatus: 'pending'`, then `runBackgroundAnalysis` is started without `await`, so the API returns immediately and analysis continues on the server. The client can poll or refetch to see when `analysisStatus` becomes `completed`, `concerns`, or `failed`.
- **Voice notes**: Upload is synchronous (user waits for save). There is no separate background analysis step for audio in the same way as photos; transcription/processing is triggered by the audio upload API.
- **Document uploads**: Handled by the **upload queue** (`client/src/lib/uploadQueue.ts`): uploads are queued, run with concurrency limits, and the queue **retries** failed uploads (manual retry and retry count tracked).
- **Flow completion (movement “Complete”)**: When the user completes a movement with photos, the app either uploads immediately (if online) or **queues evidence and completion for later** (if offline).

### Offline mode and retry

**Offline mode is supported for inspection flow evidence and completions.**

1. **Detection**: The app uses `syncManager.getIsOnline()`, which is driven by the browser’s `navigator.onLine` (and any future network layer you plug in).
2. **When offline (no reception)**:
   - **Movement completion with photos**: Photos and the completion are written to **IndexedDB** (offline storage) and not sent to the server. The user can continue the flow.
   - **Voice notes**: If the user saves a voice note while offline, the recording is queued to the same offline store and will be uploaded when back online.
   - **Completions**: Movement completions are also queued and replayed when online.
3. **When back online**: **SyncManager** listens for the `online` event and runs **syncAll()**, which:
   - Uploads **pending evidence** (photos and voice notes) from IndexedDB to the server.
   - Calls **attachMovementEvidence** for each uploaded item.
   - Sends **pending completions** (e.g. `completeFlowMovement`).
   - Updates the sync queue (attempts, errors). Failed sync items remain in the queue for the next sync (no infinite retry limit; user can retry manually or on next online).

So: **yes, the app retries when it has no reception**, by treating the state as “offline,” queueing evidence and completions, and syncing them when reception returns.

**Caveats:**

- **“Online” but poor reception**: If `navigator.onLine` is true but requests fail or time out, the current flow does **not** automatically queue those requests to offline storage. Only when the app is considered offline do we queue. So very poor connectivity can still result in a one-off failure until the user retries (e.g. “Complete” again) or we add “on upload failure, queue for sync” logic.
- **React Query**: The app’s query client uses `retry: false` for queries and mutations, so failed API calls are not retried automatically by the data layer; offline queue + sync is the main retry story for flow evidence and completions.
- **Document upload queue**: Separate from the flow; it has its own retry (e.g. retry failed) and persistence.

---

## Are photos analyzed by OpenAI? Does that analysis feed into step requirements?

### Yes – photos are analyzed by OpenAI

- On **photo upload** (e.g. movement evidence or claim photos), the server:
  1. Saves the photo to storage and DB with `analysisStatus: 'pending'`.
  2. Starts **background OpenAI Vision analysis** (`runBackgroundAnalysis` → `analyzePhotoWithVision`) without blocking the response.
- The model returns structured JSON: quality score, issues, suggestions, content description, damage detected, damage types/locations, materials, recommended label, concerns (e.g. staging, authenticity), and metadata (lighting, focus, angle, coverage).
- The server stores that in `claim_photos` (`ai_analysis`, `qualityScore`, `damageDetected`, `description`, etc.) and sets `analysisStatus` to `completed`, `concerns`, or `failed`.
- **Retry**: If the first analysis attempt fails (e.g. OpenAI error or timeout), the server **retries once** after a short delay (2s); if the retry fails, the photo is marked `analysisStatus: 'failed'`. Users can also trigger **re-analyze** from the UI where available.

### Yes – that analysis is used to validate step requirements

- **Evidence validation** (e.g. “Does this movement have the right evidence?”) is done by **validateEvidenceWithAI** in the flow engine.
- It loads the movement’s evidence, including **claim_photos** with `ai_analysis` (and description, etc.).
- For each photo it builds a “captured” item that includes:
  - `description` (from the photo, set by OpenAI),
  - `metadata: photo.ai_analysis` (the full OpenAI analysis).
- That **captured** list (with descriptions and metadata) is passed into the **flow.evidence_validation** prompt, so the AI that validates the step **does** see:
  - What was required for the step.
  - What was captured (photos, audio, etc.).
  - For each photo: description and full OpenAI analysis (quality, damage, concerns, etc.).
- The validator can therefore **flag or confirm** step requirements using the photo analysis (e.g. “photo is blurry,” “damage not clearly shown,” “quality acceptable,” “step requirements met”).

So: **photos are analyzed by OpenAI as intended, and that analysis is used as feedback to flag or confirm step requirements** in the flow’s evidence validation.

---

## Summary table

| Area                    | Async? | Offline queue? | Retry when back online? | Retry on failure (e.g. timeout)? |
|-------------------------|--------|----------------|--------------------------|-----------------------------------|
| Photo upload            | No (waits) | Yes (if offline) | Yes (SyncManager)        | No (only if we later add “queue on failure”) |
| Photo OpenAI analysis   | Yes (background) | N/A (server) | N/A                      | Yes (one automatic retry on server) |
| Voice note save         | No (waits) | Yes (if offline) | Yes (SyncManager)        | No                                |
| Movement completion     | No (waits) | Yes (if offline) | Yes (SyncManager)        | No                                |
| Document upload queue   | Queued/background | Via queue state | Yes (retry failed)       | Yes (queue retry)                 |
| Evidence validation (AI)| No (waits) | N/A             | N/A                      | No (caller can retry)             |
