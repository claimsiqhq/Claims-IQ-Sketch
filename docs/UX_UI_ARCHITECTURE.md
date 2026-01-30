# Claims IQ Sketch — UX & UI Architecture

This document describes the **user interface, screens, workflows, and UX patterns** across the application so the architecture can be handed off or copied (e.g. for redesign, rebuild, or documentation). It is derived from the current codebase and reflects actual routes, tabs, and flows.

---

## 1. Application overview

- **Product:** Claims IQ Sketch — a property inspection application for insurance field adjusters.
- **Delivery:** Responsive web app (React + Vite). Mobile-first; adapts to desktop with a sidebar.
- **Layout:** Adaptive layout switches by viewport:
  - **Mobile / tablet** (<1024px): Bottom navigation bar (Claims, Calendar, Photos, Map, More).
  - **Desktop** (≥1024px): Left sidebar with nav links and organization switcher.
- **Auth:** Session-based; unauthenticated users are redirected to `/auth`. After login, user lands on `/` (All Claims / Home).

---

## 2. Routes and pages

| Route | Page | Purpose |
|-------|------|---------|
| `/auth` | Auth | Login (username, password, remember me). Redirects to `/` when authenticated. |
| `/` | Home | Dashboard: claim list (cards), filters, search, optional claim upload wizard. |
| `/claim/:id` | Claim Detail | Single-claim hub with tabs: Info, Briefing, Workflow, Checklist, Documents, Sketch, Scope, Estimate, Photos. |
| `/flows/:flowId` | Flow Progress | Inspection flow: phases and movements; user picks a movement to execute. |
| `/flows/:flowId/movements/:movementId` | Movement Execution | Single movement: instructions, evidence capture (photos, voice, sketch), complete. |
| `/flow-builder` | Flow Builder | List of flow definitions (templates). |
| `/flow-builder/:id` | Flow Builder (edit) | Create/edit flow definition: phases, movements, validation. |
| `/photos` | Photos | Global photo view: filter by claim; grid and album; upload/capture. |
| `/voice-sketch` | Voice Sketch | Standalone sketch: select claim or start without claim. |
| `/voice-sketch/:claimId` | Voice Sketch (claim) | Sketch in context of a claim. |
| `/calendar` | Calendar | Calendar view of claims / inspections. |
| `/map` | Claims Map | Map view of claim locations. |
| `/settings` | Settings | App/organization settings. |
| `/profile` | Profile | User profile. |
| (no match) | NotFound | 404 page. |

---

## 3. Global layout and navigation

### 3.1 Desktop (sidebar)

- **Header:** Logo (Claims IQ wordmark).
- **Organization switcher:** Dropdown at top of sidebar; user selects current organization.
- **Nav links:** All Claims (`/`), Calendar, Photos, Map, Voice Sketch, Flow Builder, Settings.
- **User menu:** Avatar + dropdown (profile, logout).
- **Main content:** Renders to the right of the sidebar; scrollable.

### 3.2 Mobile (bottom nav)

- **Header:** Logo; notifications icon; user avatar (opens menu).
- **Bottom bar:** Claims, Calendar, Photos, Map, More (opens sheet with Voice Sketch, Flow Builder, Settings, Profile, Log out).
- **Main content:** Full width; scrollable; optional `pb-nav-safe` for safe area above bottom bar.

### 3.3 Shared patterns

- **Skip link:** “Skip to main content” for accessibility.
- **Protected routes:** All app routes except `/auth` require authentication; otherwise redirect to `/auth`.
- **Upload status bar:** Shown when uploads are in progress (e.g. documents).
- **Offline banner:** Shown when app detects offline; flow evidence can be queued and synced later.

---

## 4. Home page (`/`)

- **Purpose:** List and access claims; optionally start claim creation.
- **Content:**
  - **Claim cards:** Each card shows claim number, insured name, address (truncated), status badge, peril (e.g. wind/hail, fire), date of loss, optional weather. Cards are clickable → `/claim/:id`. Visual treatment (border/background) can vary by peril.
  - **Filters / search:** Filter by status, date range, search by claim number or insured (implementation may use Select, Input, or similar).
  - **Stats (optional):** Claim counts or summary stats (e.g. from `getClaimStats`).
  - **Claim upload wizard (optional):** “Add claim” or “Upload” opens a wizard (e.g. `ClaimUploadWizard`) for creating/importing claims.
- **User actions:** Click claim → claim detail; use filters/search; optionally add/upload claim.

---

## 5. Claim detail page (`/claim/:id`)

Central hub for one claim. **Tabs** drive the content; desktop shows a horizontal tab bar, mobile may show the same or a scrollable tab list.

### 5.1 Tab list (order)

1. **Info** — FNOL and claim context.
2. **Briefing** — AI-generated pre-inspection briefing.
3. **Workflow** — Inspection flow (start or continue).
4. **Checklist** — Checklist panel for the claim.
5. **Documents** — Claim documents (upload, list, view).
6. **Sketch** — Floor plan / voice sketch.
7. **Scope** — Scope items (line items, quantities).
8. **Estimate** — Estimate builder (hierarchy, line items, totals).
9. **Photos** — Claim photo album.

### 5.2 Info tab

- **Header:** Policyholder name, claim ID, peril badge(s), claim status badge.
- **Peril advisory banner:** Coverage/warnings for certain perils (e.g. flood, mold).
- **Inspection tips:** Collapsible panel; peril-specific inspection guidance.
- **Carrier guidance:** Collapsible; carrier-specific requirements (read-only).
- **Weather on date of loss:** If available: temperature, conditions, wind, precip, etc.; shown between tips and FNOL.
- **FNOL information card:** Claim ID, policyholder, property address, date of loss, peril/cause of loss, **loss description** (single block; no duplicate “loss description” box).
- **Insured information (optional):** Extracted insured details.
- **Master claim timer (optional):** “Open since X” / “Closed after X”; inspection “started X ago” / “completed in X.”

### 5.3 Briefing tab

- **Content:** AI-generated briefing for the claim (priorities, what to look for, photo requirements, etc.). Rendered from briefing data; may be collapsible sections.

### 5.4 Workflow tab

- **Purpose:** Start or continue the inspection flow for this claim.
- **When no active flow:** “Inspection Flow” card with **Start flow** button. User picks a flow definition (e.g. standard wind/hail); starting creates a flow instance and navigates to `/flows/:flowId`.
- **When active flow exists:** **Flow status card** showing:
  - Flow name and status.
  - **Progress:** e.g. “X / Y movements, Z% complete.”
  - **Continue** button → `/flows/:flowId`.
  - Optional **Cancel flow** (with confirmation).
- **Design note:** Workflow is a co-pilot: track coverage and progress, but allow free movement between phases/movements.

### 5.5 Checklist tab

- **Content:** Checklist panel for the claim (tasks, completion state). Implementation may use `ClaimChecklistPanel` or equivalent.

### 5.6 Documents tab

- **Header:** “Claim Documents”; count of documents; **Upload Documents** button (file input: PDF, images, etc.).
- **List:** Documents in a list or grid; each item: type, name, optional thumbnail. Click to open **document viewer** (e.g. PDF with page previews).
- **Empty state:** “No documents yet” with upload CTA.

### 5.7 Sketch tab

- **Purpose:** Create and edit floor plans (structures, rooms, openings, damage zones).
- **UI:** Sketch canvas + **Voice Sketch** controller (voice-guided creation: “Add a 12×15 kitchen”) and/or **Sketch toolbar** (manual: add room, add opening, mark damage, etc.). Room list/hierarchy; dimensions (width, length, ceiling height) per room.
- **Actions:** Save (persist rooms/damage zones to claim), Load (when opening claim with saved rooms), Reset (with confirmation).
- **Data:** Rooms map to `claim_rooms`; structures, openings, damage zones to related tables. Same data can feed Scope/Estimate.

### 5.8 Scope tab

- **Purpose:** Manage scope line items (repairs, quantities) for the claim.
- **Structure:** Hierarchy or flat list of scope items; each item: code, description, quantity, unit, price, optional room name.
- **Actions:** Add item, edit, delete; optional “Generate from template” or “From sketch dimensions.”
- **Optional:** Voice scope (“Add 180 sq ft drywall”) that resolves to line items.

### 5.9 Estimate tab

- **Purpose:** Build the estimate (structures → areas → zones → line items); pricing and totals.
- **UI:** Hierarchical tree or panels (structures, areas, zones, line items). Per line item: quantity, unit, unit price; totals per zone/estimate.
- **Actions:** Add/edit line items, generate estimate from scope, lock estimate, optional export (e.g. PDF, ESX).
- **Generate Estimate button:** Often in header; runs calculation and updates totals.

### 5.10 Photos tab

- **Purpose:** Claim-level photo album.
- **Content:** Grid of photos; each card can show thumbnail, label, **photo analysis badge** (Analyzing / Needs rework / Analysis failed / OK). Click photo → **photo detail** (full analysis: quality score, damage detected, issues/suggestions, re-analyze).
- **Actions:** Upload/capture; filter by room/elevation/type; delete; re-analyze (when failed or concerns).

---

## 6. Inspection flow workflow

End-to-end flow: **Claim detail (Workflow tab)** → **Flow progress** → **Movement execution** → back to flow progress or claim.

### 6.1 Start flow (Claim detail → Flow progress)

- User is on **Claim detail → Workflow**.
- Clicks **Start flow**, selects a flow definition (e.g. “Standard wind/hail inspection”). System creates an active flow instance and navigates to **`/flows/:flowId`**.

### 6.2 Flow progress page (`/flows/:flowId`)

- **Purpose:** Show phases and movements; let user open the next or any movement.
- **Header:** Back to claim (or breadcrumb); flow name; optional progress bar (X/Y movements, %).
- **Content:**
  - **Phases:** Listed in order (e.g. Arrival, Orientation, Exterior Documentation, Interior Documentation, Synthesis, Departure). Each phase can expand to show **movements**.
  - **Movement:** Name, description snippet, status (pending / in progress / completed). **Open** or **Continue** → `/flows/:flowId/movements/:movementId`.
  - **Next movement:** Optional highlight or “Continue with next” button.
- **Optional:** Voice-guided inspection toggle or entry point.

### 6.3 Movement execution page (`/flows/:flowId/movements/:movementId`)

- **Purpose:** Complete one inspection movement: follow instructions and capture evidence.
- **Header:** Back to flow (`/flows/:flowId`); movement name; phase badge; required badge (if required); optional room name.
- **Content:**
  - **Instructions card:** Movement description (what to do).
  - **Evidence capture card:**
    - **Take Photo:** Opens file input or camera; photos added to “Captured this step” and (when complete) uploaded and attached to movement.
    - **Voice Note:** Start/stop recording; timer; Save (upload + attach) or Discard.
    - **Sketch:** Opens sketch capture (inline or modal); link sketch to movement.
  - **Previously captured:** Grid of existing evidence (photos, voice notes). **Photos show analysis badges** (Analyzing / Needs rework / Analysis failed / OK) so rework is visible without leaving the step. Polling while any photo is analyzing.
  - **Evidence requirements (optional):** List of required/optional evidence; validation may block “Complete” until met.
  - **Notes:** Free-text notes for the movement.
- **Actions:** **Complete movement** (submit completion + evidence); optional **Skip** (if allowed). On complete, user can return to flow progress or go to next movement.

### 6.4 Offline behavior

- When offline, evidence (photos, voice) and completions can be **queued** locally and **synced** when back online. Offline banner informs the user.

---

## 7. Flow builder (`/flow-builder`, `/flow-builder/:id`)

- **Purpose:** Create and edit **flow definitions** (templates) that define phases and movements for inspections.
- **List view (`/flow-builder`):** List of flow definitions; name, peril type, version; create new or edit existing.
- **Edit view (`/flow-builder/:id`):** Tabs or sections for: metadata (name, peril), **phases** (add/remove/reorder), **movements** per phase (name, description, evidence requirements, required flag). JSON or form-based editing. Save publishes the definition for use when starting a flow.

---

## 8. Photos page (`/photos`)

- **Purpose:** See all photos across claims or filtered by claim.
- **UI:** Claim selector (dropdown or list); then grid of photos (same card and detail behavior as Claim detail → Photos tab). Upload/capture; filters (e.g. by room, type); delete; re-analyze.
- **Photo detail:** Same as in claim: quality, damage, issues, suggestions, re-analyze.

---

## 9. Voice sketch (standalone)

- **Routes:** `/voice-sketch` (claim selector or no claim), `/voice-sketch/:claimId` (sketch in context of claim).
- **Purpose:** Build floor plans via voice (“Add a 12×15 kitchen”) and/or toolbar (add room, openings, damage zones).
- **UI:** Canvas + voice controller (mic, feedback) + sketch toolbar; room list; save/load when claim is set. Same data model as Claim detail → Sketch tab.

---

## 10. Calendar and map

- **Calendar (`/calendar`):** Calendar view of claims/inspections; navigate by date; click to open claim or see list for day.
- **Map (`/map`):** Map of claim locations; pins or list; click to open claim.

---

## 11. Auth flow

- **Entry:** User visits any protected route while unauthenticated → redirect to **`/auth`**.
- **Login screen:** Logo; “Welcome Back”; username and password fields; remember me; Sign in button; error message if login fails.
- **Success:** Login stores session; redirect to **`/`** (Home).
- **Logout:** From user menu (desktop or mobile “More” sheet); clears session; redirect to **`/auth`**.

---

## 12. Key user journeys (summary)

| Journey | Steps |
|---------|--------|
| **View and filter claims** | Home → use filters/search → click claim → Claim detail (Info or other tab). |
| **Run an inspection** | Claim detail → Workflow → Start flow → Flow progress → open movement → Movement execution → capture photos/voice/sketch → Complete → repeat or finish. |
| **Add room dimensions (sketch)** | Claim detail → Sketch → add rooms by voice or toolbar; save. Optionally use same rooms in Scope/Estimate. |
| **Manage documents** | Claim detail → Documents → Upload or open document → view in viewer. |
| **Build scope and estimate** | Claim detail → Scope (add line items) → Estimate (generate from scope or edit) → lock/export. |
| **Review photos and analysis** | Claim detail → Photos (or Photos page) → click photo → view analysis; re-analyze if needed. Same badges visible on Movement execution for “Previously captured” photos. |
| **Create flow template** | Flow Builder → create or edit definition → add phases and movements → save. |

---

## 13. UI patterns and components

- **Cards:** Used for sections (e.g. FNOL info, flow status, evidence capture). Typically `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- **Badges:** Status (claim, flow, movement); peril; analysis (photo); required/optional.
- **Tabs:** Claim detail uses a single `Tabs` component; value drives which `TabsContent` is visible.
- **Buttons:** Primary for main actions (e.g. Start flow, Complete); outline for secondary (e.g. Voice note, Sketch). Destructive for delete/cancel.
- **Lists:** ScrollArea for long lists (phases, movements, documents, photos). Optional empty state (illustration + message + CTA).
- **Modals/dialogs:** Confirmations (e.g. cancel flow, reset sketch); photo detail; document viewer; optional camera/upload modals.
- **Toasts:** Success/error feedback (e.g. “Flow started,” “Photo uploaded,” “Save failed”).
- **Loading:** Skeleton loaders or spinners for async content (claim, flow, evidence).
- **Responsive:** Layout, nav, and density adapt by breakpoint (e.g. bottom nav vs sidebar; stacked vs grid).

---

## 14. File references (for implementers)

| Area | Key files |
|------|-----------|
| Routes | `client/src/App.tsx` |
| Layout | `client/src/components/layout.tsx`, `layouts/MobileLayout.tsx`, `layouts/DesktopLayout.tsx` |
| Home | `client/src/pages/home.tsx` |
| Claim detail | `client/src/pages/claim-detail.tsx` |
| Flow progress | `client/src/pages/flow-progress.tsx` |
| Movement execution | `client/src/pages/movement-execution.tsx` |
| Flow builder | `client/src/pages/flow-builder.tsx` |
| Workflow section | `client/src/components/flow/ClaimFlowSection.tsx`, `FlowStatusCard.tsx`, `StartFlowButton.tsx` |
| Evidence capture | `client/src/components/flow/EvidenceGrid.tsx`, movement-execution evidence UI |
| Sketch | `client/src/features/voice-sketch/`, Claim detail Sketch tab |
| Photos | `client/src/pages/photos.tsx`, `client/src/features/voice-sketch/components/PhotoAlbum.tsx` |
| Auth | `client/src/pages/auth.tsx` |

---

This document describes the UI and workflows as implemented in the codebase and is intended for handoff, copying, or redesign. **The sections below (Parts B, C, D) add inspection flow design, API reference, and database schema so this file is a single complete handoff.**

---

# PART B — INSPECTION FLOW DESIGN (PHILOSOPHY AND PHASES)

> **Design Philosophy**: The inspection workflow should feel like a skilled co-pilot, not a demanding checklist. It tracks what you've covered, surfaces what's missing, and adapts to discoveries—but never stands between you and documenting what's in front of you.

---

## 1. Canonical Inspection Flow Phases

The inspection flow is organized into **six phases**, but these are mental anchors—not gates. An adjuster can jump between phases freely; the system tracks coverage, not sequence.

### Phase Overview

| Phase | Purpose | Typical Duration | When "Sufficiently Covered" |
|-------|---------|------------------|----------------------------|
| **Arrival** | Establish context, confirm access, safety assessment | 2-5 min | Property identified, access confirmed, hazards noted |
| **Orientation** | Understand property layout, identify damage zones | 5-10 min | Major structures identified, preliminary damage areas marked |
| **Exterior Documentation** | Capture all exterior damage and context | 15-40 min | All exterior faces documented, roof covered, detached structures included |
| **Interior Documentation** | Capture all interior damage and context | 20-60 min | All affected rooms documented, damage sources traced |
| **Synthesis** | Connect evidence, verify completeness, capture supplementary | 10-15 min | All damage connected to source, measurements complete, no orphaned evidence |
| **Departure** | Final verification, policyholder interaction, export readiness | 5-10 min | Export validation passes, all blocking requirements met |

---

### Phase 1: ARRIVAL

**Purpose**: Ground the inspection in reality. Confirm you're at the right property, assess safety, and establish the claim context before touching anything.

**Primary User Action**:
- Drive up, visually confirm address
- Take establishing photos (street view, address marker)
- Walk perimeter for hazards (downed lines, unstable structure, active water)
- Brief mental inventory: "What did FNOL say? What do I see?"

**Secondary System Responsibility**:
- Auto-capture GPS coordinates on first photo
- Cross-reference address against claim data
- Surface any FNOL red flags (e.g., "reported gas smell", "partial collapse")
- Pre-load policy endorsements that affect inspection (roof schedule, ordinance/law)

**Data Typically Captured**:
- 2-4 establishing photos (front, address, street context)
- Safety assessment (binary: safe to proceed / hazards present)
- Arrival timestamp
- Weather conditions (if relevant to claim)

**Completion Criteria**:
- Property address visually confirmed
- At least one establishing photo captured
- No unacknowledged safety hazards

---

### Phase 2: ORIENTATION

**Purpose**: Build a mental map before diving into details. Understand the property geometry, identify where damage is concentrated, and plan your movement.

**Primary User Action**:
- Walk the full perimeter (exterior)
- Identify all structures (main dwelling, garage, shed, fence)
- Note obvious damage zones (e.g., "north roof slope has missing shingles", "water stain on ceiling in kitchen")
- Mentally prioritize: worst damage first, or systematic sweep?

**Secondary System Responsibility**:
- Track which structures have been visually acknowledged
- Surface policy coverage for each structure (main dwelling vs. other structures)
- Begin building the "damage geography" map
- Suggest workflow mutations based on discoveries (e.g., adjuster notes detached garage → system adds garage documentation requirements)

**Data Typically Captured**:
- Overview photos of each structure (not detail shots yet)
- Rough damage zone notes (voice or text)
- Structure inventory (confirm/add/remove from FNOL-reported list)

**Completion Criteria**:
- All structures on property identified
- Preliminary damage zones noted
- Movement plan established (even if implicit)

---

### Phase 3: EXTERIOR DOCUMENTATION

**Purpose**: Systematically document all exterior damage and context. This is where most wind/hail evidence lives.

**Primary User Action**:
- Photograph each elevation (N, S, E, W)
- Document roof (ground-level, ladder, drone—whatever access allows)
- Capture detail shots of damage (hail hits, missing shingles, impact marks)
- Measure where needed (e.g., test squares for hail)
- Document detached structures with same rigor as main dwelling

**Secondary System Responsibility**:
- Track cardinal coverage (has each elevation been photographed?)
- Track roof coverage (overall + detail + measurement)
- Enforce roof schedule requirements if endorsement present
- Surface detached structures that haven't been documented
- Track test square locations if hail claim

**Data Typically Captured**:
- 4 elevation photos (minimum)
- 8-20 roof photos (depending on complexity)
- Damage detail photos (3-10 per damage area)
- Test square photos with measurements
- Gutter, downspout, soffit, fascia documentation
- Detached structure documentation (mirrors main dwelling requirements)

**Completion Criteria**:
- All elevations photographed
- Roof documented (method depends on access)
- All detached structures documented
- Roof schedule requirements met (if applicable)
- Test squares documented (if hail claim)

---

### Phase 4: INTERIOR DOCUMENTATION

**Purpose**: Document interior damage and trace it to source. Interior tells the story of *consequence*—where exterior damage let water in, where impact caused cracking, etc.

**Primary User Action**:
- Document each affected room
- Trace damage to source (ceiling stain → where's the roof damage above?)
- Photograph damage, context, and affected materials
- Measure affected areas
- Note material types (for estimate accuracy)

**Secondary System Responsibility**:
- Track rooms that have been documented
- Surface connections between interior damage and exterior source
- Flag interior damage that lacks exterior explanation (could indicate pre-existing)
- Enforce documentation of damage propagation path
- Adapt workflow when new rooms discovered (e.g., adjuster enters basement, finds water damage not in FNOL)

**Data Typically Captured**:
- Room overview photo (each affected room)
- Damage detail photos (per damage area)
- Material documentation (flooring type, ceiling type, wall covering)
- Measurements (affected square footage)
- Source tracing notes (interior damage X relates to exterior damage Y)

**Completion Criteria**:
- All FNOL-reported interior damage documented
- All discovered interior damage documented
- Damage sources traced and documented
- Room measurements captured
- Materials identified

---

### Phase 5: SYNTHESIS

**Purpose**: Connect the dots. Ensure evidence tells a complete story. Fill gaps. This is where the adjuster shifts from "capturing" to "reviewing."

**Primary User Action**:
- Review captured evidence (thumbnail scan)
- Verify damage connections (does interior damage X have corresponding exterior source Y?)
- Capture supplementary photos for anything that looks thin
- Add clarifying notes
- Complete any measurements that were deferred

**Secondary System Responsibility**:
- Surface coverage gaps (e.g., "North elevation has 1 photo, others have 3+")
- Highlight orphaned damage (evidence without clear source connection)
- Display policy requirements that aren't fully satisfied
- Show "soft warnings" for thin areas (not blocking, but suggestive)
- Pre-compute export validation status

**Data Typically Captured**:
- Supplementary photos (filling gaps)
- Clarifying notes
- Damage relationship confirmations
- Final measurements

**Completion Criteria**:
- No critical coverage gaps
- All damage has source attribution
- Export validation pre-check passes (or issues acknowledged)

---

### Phase 6: DEPARTURE

**Purpose**: Finalize and exit cleanly. Ensure export readiness, handle policyholder interaction, and close the inspection.

**Primary User Action**:
- Brief policyholder on next steps (if present)
- Run final export validation
- Address any blocking issues
- Confirm nothing was forgotten
- Depart

**Secondary System Responsibility**:
- Run full export validation
- Clearly display blocking vs. advisory issues
- Provide one-tap access to any missing requirements
- Capture departure timestamp
- Lock inspection state (prevent accidental modification post-departure)

**Data Typically Captured**:
- Policyholder signature (if required by carrier)
- Departure timestamp
- Final notes
- Export package generated

**Completion Criteria**:
- Export validation passes (all blocking requirements met)
- Departure timestamp recorded
- Inspection state finalized

---

## 2. Phase Definitions: Actions, Responsibilities, and Completion

### Summary Matrix

| Phase | Primary User Action | System Responsibility | Completion Definition |
|-------|---------------------|----------------------|----------------------|
| **Arrival** | Confirm location, assess safety | Validate address, surface FNOL context | Address confirmed, safety assessed |
| **Orientation** | Survey property, identify structures | Build structure inventory, track acknowledgment | All structures identified |
| **Exterior** | Document all exterior damage | Track coverage, enforce endorsements | All elevations, roof, and structures documented |
| **Interior** | Document affected rooms | Track rooms, connect to sources | All affected rooms documented, sources traced |
| **Synthesis** | Review and fill gaps | Surface gaps, pre-validate export | No critical gaps, damage connected |
| **Departure** | Finalize and exit | Validate export, lock state | Export ready, inspection closed |

### Completion is COVERAGE, Not Steps

The key insight: **completion is about coverage, not task completion**.

**Wrong model** (step-based):
```
☑ Take front photo
☑ Take back photo
☑ Take left photo
☑ Take right photo
→ "Exterior complete"
```

**Right model** (coverage-based):
```
Coverage: Exterior Elevations
├── North: 3 photos, 1 damage note ✓
├── South: 2 photos ✓
├── East: 4 photos, 2 damage notes ✓
└── West: 0 photos ⚠ (not yet documented)
→ "75% coverage, West elevation missing"
```

Coverage-based completion means:
- More evidence is always welcome (no "step already done" friction)
- Gaps are visible without being gates
- Quality matters more than checkbox status

---

## 3. Conceptual Definitions: Step vs. Evidence vs. Requirement

### STEP (Atomic Task)

A **step** is a single, discrete action that captures or confirms something.

**Characteristics**:
- Has a clear verb: "Photograph", "Measure", "Note", "Verify"
- Can be completed in one action
- May or may not produce evidence
- Has a defined scope (not "document roof"—too broad; "photograph north slope overview"—good)

**Examples**:
- "Photograph front elevation"
- "Measure test square A dimensions"
- "Note shingle manufacturer"
- "Verify address matches policy"

**Non-examples** (too broad):
- "Document exterior damage" (this is a phase, not a step)
- "Complete roof inspection" (this is an outcome, not an action)

### EVIDENCE (Photos, Notes, Measurements)

**Evidence** is the artifact produced by a step. Evidence is what survives the inspection—it's what gets exported, reviewed, and used to support the claim.

**Types of Evidence**:
| Type | Purpose | Quality Markers |
|------|---------|-----------------|
| **Photo** | Visual documentation | Clear, properly exposed, relevant subject, appropriate angle |
| **Measurement** | Dimensional data | Accurate, properly unitized, contextual photo if complex |
| **Note** | Observation, context, explanation | Specific, factual, timestamped |
| **Checklist** | Structured confirmation | All items addressed |
| **Document** | External artifact capture | Legible, complete |

**Evidence Attributes**:
- Type (photo, measurement, note, etc.)
- Timestamp
- Location (GPS, room, zone)
- Context (what step produced it, what damage it relates to)
- Metadata (for photos: angle, direction, subject)

### REQUIREMENT (Constraint)

A **requirement** is a rule that mandates certain evidence or coverage. Requirements come from three sources:

**1. Carrier Requirements** (from carrier rules/preferences):
- "All claims require 4 elevation photos"
- "Hail claims require test square documentation"
- "Interior water damage requires source tracing"

**2. Policy Requirements** (from endorsements/coverage):
- Roof Schedule endorsement → must document roof age, material, condition
- Ordinance/Law coverage → must document code compliance issues
- Other Structures coverage → must document detached structures separately

**3. Defensibility Requirements** (professional standards):
- Damage must be photographed with scale reference
- Before/after or cause/effect relationships must be documented
- Measurements must be independently verifiable

**Requirement Enforcement Levels**:
| Level | Meaning | Export Impact |
|-------|---------|---------------|
| **Blocking** | Cannot export without satisfying | Hard stop |
| **Advisory** | Should satisfy, but can proceed | Warning displayed |
| **Conditional** | Blocking only if condition true | Context-dependent |

---

## 4. Workflow UI Principles: NEVER Force vs. MUST Quietly Enforce

### What the Workflow UI Should NEVER Force

**1. NEVER force sequential phase completion**
- Adjuster should be able to jump from exterior to interior and back
- Discovery-driven flow is natural; rigid phases are not
- "You must complete Exterior before starting Interior" = wrong

**2. NEVER require confirmation modals for routine actions**
- Taking a photo should be instant, not "Are you sure you want to take this photo?"
- Adding a note should be instant
- Modal fatigue kills field productivity

**3. NEVER block evidence capture**
- If adjuster wants to take a photo, let them
- Never say "This step is already complete, do you want to replace?"
- More evidence is always acceptable

**4. NEVER require explicit step selection before capture**
- Adjuster shouldn't have to tap "Photograph north elevation" before taking the photo
- Capture first, categorize after (or let system infer)
- "Select a step" gates are productivity killers

**5. NEVER hide the escape hatch**
- Adjuster must always be able to add freeform photos/notes
- "None of these steps match what I'm capturing" must have an answer
- Uncategorized evidence > no evidence

**6. NEVER display irrelevant requirements**
- Interior water damage requirements shouldn't appear for a wind-only exterior claim
- Roof schedule requirements shouldn't appear if no roof schedule endorsement
- Context-awareness is mandatory

**7. NEVER punish discoveries**
- Finding new damage should be celebrated, not create "you're off-script" friction
- Workflow mutation is a feature, not a failure
- "I found something not in the workflow" = workflow adapts

### What the Workflow UI MUST Quietly Enforce

**1. MUST track coverage silently**
- As photos are taken, coverage map updates
- No user action required; system watches and learns
- Adjuster sees coverage status, not coverage tasks

**2. MUST bind evidence to context automatically**
- Photo taken while in "Kitchen" → auto-tagged to kitchen
- Photo taken after tapping "North elevation" → auto-tagged
- GPS + claim context → inferred location tagging

**3. MUST surface gaps without blocking**
- "West elevation has no photos yet" = visible indicator
- Not a modal, not a gate, just information
- Adjuster decides when/if to address

**4. MUST enforce requirements at export, not capture**
- During inspection: full freedom
- At export: "These 3 requirements aren't met. Address or acknowledge."
- Blocking happens at the boundary, not in the flow

**5. MUST adapt workflow to discoveries**
- Adjuster enters a room not in FNOL → room added to workflow
- Adjuster notes damage type not in FNOL → relevant requirements activated
- Workflow mutation is automatic and transparent

**6. MUST maintain evidence chain integrity**
- Every photo has timestamp, GPS, context
- Relationships between evidence items are preserved
- Export package is self-documenting

**7. MUST respect policy context throughout**
- Roof schedule endorsement → roof-specific requirements active
- Other structures coverage → detached structure requirements active
- Endorsements shape requirements, silently and automatically

**8. MUST provide escape velocity at export**
- If adjuster truly cannot satisfy a requirement (e.g., roof not accessible), there must be a "cannot complete + reason" option
- Blocking requirements can be acknowledged with explanation
- Never truly stuck

---

## 5. Example Walkthrough: Wind/Hail Claim with Complications

### Claim Context

**FNOL Summary**:
- Peril: Wind/Hail
- Property: Single-family home + detached 2-car garage
- Reported damage: Missing shingles on main roof, dented gutters
- Date of loss: 3 days ago
- Weather verified: Hail event confirmed in area

**Policy Context**:
- Dwelling coverage: $350,000
- Other structures: $35,000 (10%)
- **Roof Schedule Endorsement**: Present (roof is 15 years old, asphalt shingle, 20-year rated)
- Ordinance/Law: Not present
- Deductible: $2,500 (wind/hail specific)

**Endorsement Implications**:
- Roof Schedule means: Must document roof age, material, and condition
- Must capture evidence of pre-existing wear vs. storm damage
- Depreciation calculation will be affected by roof age documentation

---

### Arrival Phase

**Adjuster Actions**:
1. Parks on street, visually confirms address: 1247 Maple Drive ✓
2. Takes establishing photos:
   - Street view showing house in context
   - Close-up of address numbers
   - Front of property from sidewalk
3. Walks perimeter for safety:
   - No downed lines ✓
   - No structural instability ✓
   - Notes: "Standing water in backyard from recent rain, will be careful"
4. Taps "Safe to proceed" in app

**System Activity** (silent):
- GPS captured on first photo: matches claim address ✓
- FNOL context loaded: "Reported missing shingles, dented gutters"
- Policy endorsements parsed: Roof Schedule requirements activated
- Weather data auto-attached: "Hail event 3 days prior confirmed"
- Arrival timestamp: 10:32 AM

**Coverage Status After Arrival**:
```
Arrival Phase: ✓ Complete
├── Address confirmed: ✓
├── Establishing photos: 3 captured
├── Safety assessment: Clear
└── Timestamp: 10:32 AM
```

---

### Orientation Phase

**Adjuster Actions**:
1. Walks full perimeter, makes mental notes
2. Opens app, sees structure inventory from FNOL:
   - Main Dwelling: ✓ (confirmed)
   - Detached Garage: ✓ (confirmed, sees it in backyard)
3. Takes overview photos:
   - Main dwelling from southwest corner
   - Detached garage from near fence
4. Dictates voice note: "Main roof has visible damage on north slope, at least 6-8 missing shingles visible from ground. Garage roof appears intact from ground. Will need ladder for detail."
5. Notices: Kitchen window has tape on it (not in FNOL)

**System Activity** (silent):
- Structure inventory confirmed: Main dwelling + garage tracked
- Voice note transcribed and tagged to Orientation phase
- Roof Schedule requirements scoped to main dwelling roof
- Detached structure coverage confirmed ($35,000 limit)
- New observation detected: "Kitchen window tape" → potential discovery flagged

**Coverage Status After Orientation**:
```
Orientation Phase: ✓ Complete
├── Structures identified: 2/2 confirmed
├── Overview photos: 2 captured
├── Damage zones noted: Main roof (north slope)
└── Discovery flag: Kitchen window (unplanned)
```

---

### Exterior Documentation Phase

**Adjuster Actions**:

**Elevation Documentation**:
1. North elevation: Takes 4 photos (clear view of roof damage)
2. East elevation: Takes 3 photos (includes garage in background)
3. South elevation: Takes 3 photos
4. West elevation: Takes 3 photos (includes dented gutter)

**Roof Documentation** (Main Dwelling):
1. Ground-level shots of all visible roof planes
2. Sets up ladder on north side
3. Takes close-up of missing shingles:
   - Overview of damage area
   - Detail of each missing/damaged shingle (6 shingles)
   - Scale reference (credit card in frame)
4. Performs test square:
   - Marks 10x10 area with chalk
   - Photographs test square
   - Counts hits: "14 hail hits in test square, consistent with threshold"
   - Measures 3 representative hits with calipers
5. Documents roof condition (Roof Schedule requirement):
   - Overall roof photo showing age/wear
   - Close-up of granule loss in non-damage area
   - Photo of shingle manufacturer stamp (GAF Timberline)
   - Note: "Roof shows normal wear consistent with 15-year age, no pre-existing failure"

**Gutter Documentation**:
1. North gutter: 3 dents photographed with scale
2. Downspout at NE corner: Impact damage photographed

**Detached Garage**:
1. All 4 elevations photographed
2. Roof inspected from ladder:
   - No visible damage
   - Documents "No damage found" with photos
   - Test square: "2 hits found, below threshold, documenting as undamaged"

**System Activity** (silent):
- Coverage tracking updated with each photo
- Roof Schedule requirements being satisfied:
  - ✓ Roof material documented (GAF Timberline)
  - ✓ Roof condition documented
  - ✓ Age-related wear vs. storm damage distinguished
- Test square analysis: 14 hits recorded, pattern logged
- Detached structure documentation: Complete
- Time in phase: 35 minutes

**Coverage Status After Exterior**:
```
Exterior Phase: ✓ Complete
├── Main Dwelling Elevations: 4/4 ✓
│   ├── North: 4 photos, damage documented
│   ├── East: 3 photos
│   ├── South: 3 photos
│   └── West: 3 photos, gutter damage
├── Main Roof: ✓ Complete
│   ├── Overview: 6 photos
│   ├── Damage detail: 12 photos
│   ├── Test square: ✓ (14 hits documented)
│   └── [Roof Schedule]: ✓ All requirements met
├── Detached Garage: ✓ Complete
│   ├── Elevations: 4/4
│   ├── Roof: Inspected, no damage
│   └── Test square: 2 hits, below threshold
└── Gutters/Downspouts: ✓ Damage documented
```

---

### Interior Documentation Phase

**Adjuster Actions**:

**Starting Interior Sweep**:
1. Enters through front door
2. Policyholder mentions: "There's a stain on the kitchen ceiling that appeared after the storm"
3. Adjuster: "That wasn't in the original report—let me document that"

**DISCOVERY MOMENT**: Interior water staining not in FNOL

**System Behavior on Discovery**:
- Adjuster taps "+ Add Damage" or simply goes to kitchen and starts documenting
- System detects: Interior water damage being documented
- **Workflow mutation triggered**:
  - Water intrusion requirements activated
  - Interior-to-exterior source tracing requirement added
  - Recommendation surfaced: "Water stain detected—ensure exterior penetration point is documented"

**Kitchen Documentation**:
1. Room overview photo
2. Ceiling stain photos:
   - Wide shot showing stain in context
   - Detail shot of stain edges
   - Measurement: "Stain approximately 18" x 24""
3. Opens drywall note: "Stain is soft to touch, indicates active or recent moisture"

**Source Tracing**:
1. Adjuster thinks: "Kitchen is under north roof slope where shingles are missing"
2. Goes back outside, photographs area directly above kitchen
3. Adds note: "Ceiling stain in kitchen directly below north roof slope damage. Water intrusion path confirmed: missing shingles → underlayment failure → ceiling stain"
4. System auto-links: Kitchen ceiling damage ↔ North roof slope damage

**Taped Window Follow-up**:
1. Asks policyholder about kitchen window tape
2. Response: "That's been there for months, not storm related"
3. Documents: Photo + note: "Pre-existing window damage per policyholder, not claimed"

**System Activity** (silent):
- Kitchen added to affected rooms list (wasn't in FNOL)
- Interior water damage requirements now active
- Source tracing requirement: ✓ Satisfied (roof damage linked)
- Pre-existing condition documented and excluded
- Workflow mutation logged: "Discovery: Interior water damage added during inspection"

**Coverage Status After Interior**:
```
Interior Phase: ✓ Complete
├── Affected Rooms: 1
│   └── Kitchen: ✓ Complete
│       ├── Overview: 1 photo
│       ├── Damage (ceiling stain): 3 photos
│       ├── Measurement: 18" x 24"
│       ├── Source traced: North roof slope ✓
│       └── Pre-existing noted: Window tape (excluded)
└── Discovery documented: ✓
```

---

### Synthesis Phase

**Adjuster Actions**:
1. Opens coverage summary in app
2. Reviews: All areas green except one advisory:
   - Advisory: "Consider attic inspection to verify moisture extent"
3. Decides: Will not do attic inspection (not accessible without cutting)
4. Adds note: "Attic access not available without destructive entry. Moisture extent estimated from ceiling stain size."
5. Reviews damage chain:
   - Hail impact → Missing shingles → Water intrusion → Ceiling stain ✓
   - Hail impact → Gutter dents ✓
6. Adds final measurement: Total affected ceiling area for estimate
7. Reviews photo thumbnails: All damage adequately documented

**System Activity** (silent):
- Export pre-validation running
- Blocking requirements: All satisfied ✓
- Advisory requirements: 1 (attic inspection, acknowledged with note)
- Damage chain integrity: ✓ All damage has source attribution
- Roof Schedule compliance: ✓ All requirements documented

**Coverage Status After Synthesis**:
```
Synthesis Phase: ✓ Complete
├── Coverage gaps: None
├── Orphaned damage: None
├── Damage chains: ✓ All connected
├── Blocking requirements: ✓ All met
├── Advisory items: 1 (acknowledged)
└── Export pre-check: ✓ Ready
```

---

### Departure Phase

**Adjuster Actions**:
1. Briefs policyholder:
   - "I've documented the roof damage and the interior water stain. An estimate will be prepared and sent to your carrier."
   - "You should get temporary repairs done on the roof to prevent further damage."
2. Taps "Validate for Export"
3. System shows:
   ```
   EXPORT VALIDATION: READY ✓

   Blocking Requirements: 3/3 met
   ├── Address documentation: ✓
   ├── Roof damage documentation: ✓
   └── Roof schedule compliance: ✓

   Advisory Items: 1
   └── Attic inspection: Skipped (noted)

   Evidence Summary:
   ├── Photos: 47
   ├── Measurements: 6
   ├── Notes: 8
   └── Voice notes: 2

   Ready to export.
   ```
4. Taps "Complete Inspection"
5. Departure timestamp recorded: 11:48 AM
6. Inspection locked

**System Activity** (silent):
- Full export package generated
- All evidence relationships preserved
- Audit trail complete
- Inspection duration: 1 hour 16 minutes
- Phase time breakdown logged

**Final Coverage Status**:
```
INSPECTION COMPLETE ✓

Phases:
├── Arrival: ✓ (6 min)
├── Orientation: ✓ (8 min)
├── Exterior: ✓ (38 min)
├── Interior: ✓ (14 min)
├── Synthesis: ✓ (6 min)
└── Departure: ✓ (4 min)

Evidence:
├── Photos: 47
├── Measurements: 6
├── Notes: 8
└── Voice: 2

Structures: 2/2 documented
Damage Areas: 3 (roof, gutters, ceiling)
Discoveries: 1 (interior water stain)
Workflow Mutations: 1

Export: Ready
```

---

## 6. Design Summary: Key Principles

### The Inspection Flow is NOT:
- A checklist to be completed
- A sequence of gates
- A compliance exercise during capture
- A limitation on what can be documented

### The Inspection Flow IS:
- A coverage map that fills as you work
- An intelligent assistant that surfaces gaps
- A context engine that knows what matters
- A quality assurance system that validates at the boundary

### The Three Laws of Inspection UX:
1. **Never block capture**: The ability to take a photo or note is sacred
2. **Infer before asking**: If system can figure it out, don't ask the adjuster
3. **Enforce at export, not during**: Freedom during, validation after

### MVP Success Criteria:
- Adjuster can complete inspection without modal fatigue
- Discoveries don't break the workflow—they enhance it
- Export validation catches gaps without being a surprise
- Time-on-site is reduced vs. clipboard-based process
- Evidence quality is improved through silent guidance

---

## Appendix A: Workflow Mutation Scenarios

| Discovery | Mutation | New Requirements |
|-----------|----------|------------------|
| Interior water damage (not in FNOL) | Add water intrusion rules | Source tracing, moisture extent |
| Additional structure found | Add structure to inventory | Structure-specific documentation |
| Different peril observed | Add peril-specific rules | Peril-appropriate evidence |
| Roof access not possible | Mark roof as inaccessible | Ground-level alternatives, notation |
| Pre-existing damage found | Add pre-existing documentation | Clear exclusion documentation |
| Code violation observed (with O&L) | Add code compliance rules | Violation documentation |

## Appendix B: Blocking vs. Advisory Requirements

| Requirement Type | Blocking? | Rationale |
|-----------------|-----------|-----------|
| Address confirmation | Yes | Fundamental claim validity |
| Safety assessment | Yes | Liability protection |
| Primary damage documentation | Yes | Claim cannot be processed without |
| Elevation photos | Advisory | Important but not blocking |
| Test square (hail) | Conditional | Blocking only if hail claimed |
| Roof schedule compliance | Conditional | Blocking only if endorsement present |
| Attic inspection | Advisory | Best practice, not required |
| Source tracing (water) | Yes (if water damage present) | Required for defensibility |
| Policyholder signature | Carrier-dependent | Some require, some don't |

## Appendix C: Evidence Quality Indicators

**Photo Quality Signals**:
- ✓ Clear focus (not blurry)
- ✓ Proper exposure (not over/under)
- ✓ Relevant subject (damage visible)
- ✓ Scale reference present (when needed)
- ✓ Context clear (can tell where this is)

**Measurement Quality Signals**:
- ✓ Units specified
- ✓ Photo shows what was measured
- ✓ Reasonable precision (not false precision)
- ✓ Multiple independent measurements for critical dimensions

**Note Quality Signals**:
- ✓ Specific (not vague)
- ✓ Factual (observations, not conclusions)
- ✓ Timestamped
- ✓ Attributed (what does this relate to?)

---

# PART C — API REFERENCE

Complete API reference for Claims IQ backend.

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

Most endpoints require authentication. Include session cookie or Authorization header.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123",
  "rememberMe": false
}
```

**Response**:
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

### Logout

```http
POST /api/auth/logout
```

### Check Auth

```http
GET /api/auth/me
```

---

## Claims

### List Claims

```http
GET /api/claims?status=draft&limit=50&offset=0
```

**Query Parameters**:
- `status` (optional): Filter by status
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "claims": [
    {
      "id": "uuid",
      "claimId": "CLM-001",
      "insuredName": "John Doe",
      "propertyAddress": "123 Main St",
      "status": "draft",
      "primaryPeril": "wind_hail",
      "dateOfLoss": "2024-01-15"
    }
  ],
  "total": 100
}
```

### Get Claim

```http
GET /api/claims/:id
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "CLM-001",
  "insuredName": "John Doe",
  "propertyAddress": "123 Main St",
  "status": "draft",
  "primaryPeril": "wind_hail",
  "dateOfLoss": "2024-01-15",
  "structures": [...],
  "rooms": [...],
  "damageZones": [...],
  "photos": [...]
}
```

### Create Claim

```http
POST /api/claims
Content-Type: application/json

{
  "claimId": "CLM-001",
  "insuredName": "John Doe",
  "propertyAddress": "123 Main St",
  "primaryPeril": "wind_hail",
  "dateOfLoss": "2024-01-15"
}
```

### Update Claim

```http
PUT /api/claims/:id
Content-Type: application/json

{
  "status": "in_progress",
  "notes": "Updated notes"
}
```

### Delete Claim

```http
DELETE /api/claims/:id
```

### Get Claim Briefing

```http
GET /api/claims/:id/briefing
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "uuid",
  "peril": "wind_hail",
  "briefingJson": {
    "peril_overview": {...},
    "inspection_strategy": {...},
    "photo_requirements": [...]
  }
}
```

### Generate Briefing

```http
POST /api/claims/:id/briefing/generate?force=true
```

**Query Parameters**:
- `force` (optional): Force regeneration even if cached

### Get Claim Workflow

```http
GET /api/claims/:id/workflow
```

**Response**:
```json
{
  "workflow": {
    "id": "uuid",
    "claimId": "uuid",
    "status": "in_progress",
    "steps": [
      {
        "id": "uuid",
        "stepIndex": 0,
        "phase": "exterior",
        "title": "Inspect Roof",
        "status": "pending",
        "evidenceRequirements": {
          "photos": {
            "minCount": 5,
            "types": ["overview", "detail"]
          }
        }
      }
    ]
  }
}
```

### Generate Workflow

```http
POST /api/claims/:id/workflow/generate
```

### Get Scope Context

```http
GET /api/claims/:id/scope-context
```

Returns briefing, workflow, and peril information for voice scope agent.

---

## Documents

### Upload Document

```http
POST /api/documents
Content-Type: multipart/form-data

file: <file>
claimId: uuid (optional)
type: fnol|policy|endorsement|photo|estimate|correspondence|auto
```

**Response**:
```json
{
  "id": "uuid",
  "name": "document.pdf",
  "type": "fnol",
  "processingStatus": "pending",
  "extractedData": {}
}
```

### Get Document

```http
GET /api/documents/:id
```

### Download Document

```http
GET /api/documents/:id/download
```

Returns file stream.

### List Documents

```http
GET /api/documents?claimId=uuid&type=fnol
```

### Delete Document

```http
DELETE /api/documents/:id
```

### Process Document Queue

```http
POST /api/documents/process
```

Processes queued documents in background.

---

## Photos

### Upload Photo

```http
POST /api/photos
Content-Type: multipart/form-data

file: <image file>
claimId: uuid (optional)
structureId: uuid (optional)
roomId: uuid (optional)
label: string (optional)
hierarchyPath: string (optional)
latitude: number (optional)
longitude: number (optional)
```

**Response**:
```json
{
  "id": "uuid",
  "publicUrl": "https://...",
  "analysisStatus": "pending",
  "aiAnalysis": {}
}
```

### Get Photo

```http
GET /api/photos/:id
```

### Update Photo

```http
PUT /api/photos/:id
Content-Type: application/json

{
  "label": "Kitchen Damage",
  "hierarchyPath": "Interior/Kitchen"
}
```

### Delete Photo

```http
DELETE /api/photos/:id
```

### Re-analyze Photo

```http
POST /api/photos/:id/reanalyze
```

Triggers new AI analysis.

### Get Claim Photos

```http
GET /api/claims/:id/photos
```

---

## Estimates

### List Estimates

```http
GET /api/estimates?claimId=uuid&status=draft
```

### Get Estimate

```http
GET /api/estimates/:id
```

**Response**:
```json
{
  "id": "uuid",
  "claimId": "uuid",
  "status": "draft",
  "structures": [...],
  "lineItems": [...],
  "totals": {
    "rcvTotal": 50000,
    "acvTotal": 40000,
    "depreciationTotal": 10000
  }
}
```

### Create Estimate

```http
POST /api/estimates
Content-Type: application/json

{
  "claimId": "uuid",
  "regionId": "US-NATIONAL",
  "carrierProfileId": "uuid"
}
```

### Update Estimate

```http
PUT /api/estimates/:id
Content-Type: application/json

{
  "status": "in_progress"
}
```

### Calculate Estimate

```http
POST /api/estimates/:id/calculate
```

Recalculates all totals.

### Submit Estimate

```http
POST /api/estimates/:id/submit
```

Locks estimate and validates for submission.

### Export ESX

```http
GET /api/estimates/:id/export/esx
```

Returns ESX file download.

### Get Estimate Hierarchy

```http
GET /api/estimates/:id/hierarchy
```

Returns full structure/area/zone hierarchy.

---

## Estimate Hierarchy

### Create Structure

```http
POST /api/estimates/:id/structures
Content-Type: application/json

{
  "name": "Main House",
  "description": "Primary dwelling"
}
```

### Create Area

```http
POST /api/estimates/:id/areas
Content-Type: application/json

{
  "structureId": "uuid",
  "name": "First Floor",
  "areaType": "floor"
}
```

### Create Zone

```http
POST /api/estimates/:id/zones
Content-Type: application/json

{
  "areaId": "uuid",
  "name": "Kitchen",
  "roomType": "kitchen",
  "lengthFt": 12,
  "widthFt": 15
}
```

### Add Line Item

```http
POST /api/estimates/:id/line-items
Content-Type: application/json

{
  "zoneId": "uuid",
  "lineItemCode": "DRYWALL",
  "quantity": 180,
  "unit": "SF"
}
```

### Update Line Item

```http
PUT /api/estimates/:id/line-items/:itemId
Content-Type: application/json

{
  "quantity": 200
}
```

### Delete Line Item

```http
DELETE /api/estimates/:id/line-items/:itemId
```

---

## Workflows

### Get Workflow

```http
GET /api/workflow/:id
```

### Update Step

```http
PATCH /api/workflow/:id/steps/:stepId
Content-Type: application/json

{
  "status": "completed",
  "notes": "Completed inspection",
  "actualMinutes": 30
}
```

### Expand Workflow for Rooms

```http
POST /api/workflow/:id/expand-rooms
Content-Type: application/json

{
  "roomNames": ["Kitchen", "Living Room"]
}
```

Adds room-specific steps to workflow.

---

## Voice Sessions

### Create Voice Session

```http
POST /api/voice/session
Content-Type: application/json

{
  "type": "sketch" | "scope",
  "claimId": "uuid" (optional, for scope)
}
```

**Response**:
```json
{
  "sessionId": "uuid",
  "websocketUrl": "wss://..."
}
```

### Get Session Info

```http
GET /api/voice/session/:id
```

---

## Line Items

### Search Line Items

```http
GET /api/line-items/search?q=drywall&category=interior
```

**Query Parameters**:
- `q`: Search query
- `category`: Filter by category
- `limit`: Results limit

### Get Line Item

```http
GET /api/line-items/:code
```

Returns Xactimate item details.

### Calculate Price

```http
POST /api/pricing/calculate
Content-Type: application/json

{
  "lineItemCode": "DRYWALL",
  "quantity": 180,
  "unit": "SF",
  "regionId": "US-NATIONAL"
}
```

**Response**:
```json
{
  "unitPrice": 2.50,
  "subtotal": 450.00,
  "materialCost": 180.00,
  "laborCost": 270.00
}
```

---

## Organizations

### List Organizations

```http
GET /api/organizations
```

### Get Organization

```http
GET /api/organizations/:id
```

### Create Organization

```http
POST /api/organizations
Content-Type: application/json

{
  "name": "Acme Insurance",
  "slug": "acme-insurance",
  "type": "carrier"
}
```

### Update Organization

```http
PUT /api/organizations/:id
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Switch Organization

```http
POST /api/organizations/:id/switch
```

Sets active organization for session.

---

## Users

### Get Profile

```http
GET /api/users/profile
```

### Update Profile

```http
PUT /api/users/profile
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Change Password

```http
PUT /api/users/password
Content-Type: application/json

{
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

---

## Prompts

### Get Prompt

```http
GET /api/prompts/:key
```

**Example**: `GET /api/prompts/voice.scope`

**Response**:
```json
{
  "key": "voice.scope",
  "name": "Voice Scope Agent",
  "systemPrompt": "...",
  "userPromptTemplate": "...",
  "model": "gpt-4o",
  "temperature": 0.3
}
```

### Update Prompt

```http
PUT /api/prompts/:key
Content-Type: application/json

{
  "systemPrompt": "Updated prompt..."
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE" (optional),
  "details": {} (optional)
}
```

**Status Codes**:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

Some endpoints have rate limiting:
- Document upload: 10 requests/minute
- AI generation: 5 requests/minute
- General API: 100 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## WebSocket API

### Voice Sessions

Connect to voice session WebSocket:

```
wss://your-domain/api/voice/session/:sessionId
```

**Message Format**:
```json
{
  "type": "audio",
  "data": "base64-encoded-audio"
}
```

**Response Format**:
```json
{
  "type": "transcript" | "tool_call" | "audio",
  "data": "..."
}
```

---

For implementation details, see server code in `server/routes.ts` and `server/services/`.

---

# PART D — DATABASE SCHEMA

Complete database schema reference for Claims IQ.

## Overview

Claims IQ uses PostgreSQL with Drizzle ORM. The schema is defined in `shared/schema.ts`.

## Core Tables

### Organizations (Multi-Tenancy)

**Table**: `organizations`

Multi-tenant isolation. Every claim, document, and estimate belongs to an organization.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | varchar(255) | Organization name |
| slug | varchar(100) | URL-friendly identifier (unique) |
| type | varchar(50) | carrier, tpa, contractor, adjuster_firm |
| email | varchar(255) | Contact email |
| phone | varchar(50) | Contact phone |
| address | text | Physical address |
| settings | jsonb | Organization settings |
| status | varchar(30) | active, suspended, trial |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Users

**Table**: `users`

User accounts with authentication.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| username | text | Unique username |
| email | varchar(255) | Email address |
| password | text | Hashed password |
| first_name | varchar(100) | First name |
| last_name | varchar(100) | Last name |
| role | varchar(30) | super_admin, org_admin, adjuster, viewer |
| current_organization_id | uuid | Active organization |
| preferences | jsonb | User preferences |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Organization Memberships

**Table**: `organization_memberships`

Links users to organizations with roles.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to users |
| organization_id | uuid | Foreign key to organizations |
| role | varchar(30) | owner, admin, adjuster, viewer |
| status | varchar(30) | active, invited, suspended |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Claims Tables

### Claims

**Table**: `claims`

Main claim records.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | varchar | Human-readable claim ID |
| assigned_user_id | uuid | Assigned adjuster |
| carrier_id | uuid | Insurance carrier |
| insured_name | varchar | Insured party name |
| property_address | text | Property address |
| property_city | varchar | City |
| property_state | varchar | State |
| property_zip | varchar | ZIP code |
| property_latitude | numeric | GPS latitude |
| property_longitude | numeric | GPS longitude |
| date_of_loss | date | Loss date |
| primary_peril | varchar | Primary peril type |
| secondary_perils | jsonb | Array of secondary perils |
| status | varchar | draft, in_progress, completed, closed |
| total_rcv | numeric | Total replacement cost value |
| total_acv | numeric | Total actual cash value |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Structures

**Table**: `claim_structures`

Structures on the property (house, garage, shed, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| name | varchar | Structure name |
| structure_type | varchar | main_dwelling, garage, shed, etc. |
| description | text | Description |
| stories | integer | Number of stories |
| year_built | integer | Year built |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Rooms

**Table**: `claim_rooms`

Rooms within structures.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| structure_id | uuid | Foreign key to claim_structures |
| name | varchar | Room name |
| room_type | varchar | kitchen, bathroom, bedroom, etc. |
| floor_level | varchar | 1, 2, basement, etc. |
| shape | varchar | rectangular, l_shape, t_shape |
| width_ft | numeric | Width in feet |
| length_ft | numeric | Length in feet |
| ceiling_height_ft | numeric | Ceiling height |
| polygon | jsonb | Geometric polygon data |
| openings | jsonb | Array of openings (doors, windows) |
| features | jsonb | Array of features (cabinets, etc.) |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Damage Zones

**Table**: `claim_damage_zones`

Damage areas within rooms.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| room_id | uuid | Foreign key to claim_rooms |
| damage_type | varchar | Water, Fire, Smoke, etc. |
| category | varchar | Damage category |
| associated_peril | varchar | Related peril |
| affected_walls | jsonb | Array of affected walls |
| floor_affected | boolean | Floor damage |
| ceiling_affected | boolean | Ceiling damage |
| extent_ft | numeric | Damage extent |
| severity | varchar | Low, Medium, High, Total |
| polygon | jsonb | Geometric polygon |
| notes | text | Notes |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Photos

**Table**: `claim_photos`

Photos with AI analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| structure_id | uuid | Foreign key to claim_structures |
| room_id | uuid | Foreign key to claim_rooms |
| damage_zone_id | uuid | Foreign key to claim_damage_zones |
| storage_path | varchar | Supabase storage path |
| public_url | varchar | Public URL |
| file_name | varchar | Original filename |
| mime_type | varchar | MIME type |
| file_size | integer | File size in bytes |
| label | varchar | Photo label |
| hierarchy_path | varchar | Location path |
| ai_analysis | jsonb | AI analysis results |
| quality_score | integer | Quality score (0-10) |
| damage_detected | boolean | Damage detected |
| analysis_status | varchar | pending, analyzing, completed, failed |
| latitude | double precision | GPS latitude |
| longitude | double precision | GPS longitude |
| captured_at | timestamp | Capture timestamp |
| analyzed_at | timestamp | Analysis timestamp |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Briefings

**Table**: `claim_briefings`

AI-generated claim briefings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| peril | varchar | Peril type |
| secondary_perils | jsonb | Secondary perils |
| source_hash | varchar | Source data hash (for caching) |
| briefing_json | jsonb | Briefing content |
| status | varchar | generated, failed |
| model | varchar | AI model used |
| prompt_tokens | integer | Prompt tokens |
| completion_tokens | integer | Completion tokens |
| total_tokens | integer | Total tokens |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Document Tables

### Documents

**Table**: `documents`

Document metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| name | varchar | Document name |
| type | varchar | fnol, policy, endorsement, etc. |
| category | varchar | Document category |
| file_name | varchar | Original filename |
| file_size | integer | File size |
| mime_type | varchar | MIME type |
| storage_path | varchar | Supabase storage path |
| extracted_data | jsonb | Extracted data |
| processing_status | varchar | pending, processing, completed, failed |
| full_text | text | Extracted text |
| page_texts | jsonb | Per-page text |
| uploaded_by | varchar | User ID |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Policy Form Extractions

**Table**: `policy_form_extractions`

Extracted policy data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| document_id | uuid | Foreign key to documents |
| policy_form_code | varchar | Policy form code |
| policy_form_name | varchar | Policy form name |
| extraction_data | jsonb | Extracted policy data |
| policy_structure | jsonb | Policy structure |
| section_i | jsonb | Section I (Property) |
| section_ii | jsonb | Section II (Liability) |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Endorsement Extractions

**Table**: `endorsement_extractions`

Extracted endorsement data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| document_id | uuid | Foreign key to documents |
| form_code | varchar | Endorsement form code |
| title | varchar | Endorsement title |
| extraction_data | jsonb | Extracted data |
| modifications | jsonb | Policy modifications |
| applies_to_coverages | jsonb | Affected coverages |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Estimate Tables

### Estimates

**Table**: `estimates`

Estimate records.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| claim_number | varchar | Claim number |
| status | varchar | draft, in_progress, submitted, locked |
| version | integer | Estimate version |
| region_id | varchar | Pricing region |
| carrier_profile_id | uuid | Carrier profile |
| total_rcv | numeric | Total RCV |
| total_acv | numeric | Total ACV |
| total_depreciation | numeric | Total depreciation |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Structures

**Table**: `estimate_structures`

Structures in estimate.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| name | varchar | Structure name |
| description | text | Description |
| total_sf | numeric | Total square footage |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Areas

**Table**: `estimate_areas`

Areas within structures (floors, sections).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| structure_id | uuid | Foreign key to estimate_structures |
| name | varchar | Area name |
| area_type | varchar | floor, section, etc. |
| total_sf | numeric | Total square footage |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Zones

**Table**: `estimate_zones`

Zones within areas (rooms, damage areas).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| area_id | uuid | Foreign key to estimate_areas |
| name | varchar | Zone name |
| zone_type | varchar | room, elevation, roof, etc. |
| room_type | varchar | kitchen, bathroom, etc. |
| length_ft | numeric | Length |
| width_ft | numeric | Width |
| height_ft | numeric | Height |
| damage_type | varchar | Damage type |
| damage_severity | varchar | Severity |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Line Items

**Table**: `estimate_line_items`

Individual work items.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| zone_id | uuid | Foreign key to estimate_zones |
| line_item_code | varchar | Xactimate code |
| line_item_description | text | Description |
| category_id | varchar | Category |
| quantity | numeric | Quantity |
| unit | varchar | Unit (SF, LF, EA) |
| unit_price | numeric | Unit price |
| subtotal | numeric | Subtotal |
| material_cost | numeric | Material cost |
| labor_cost | numeric | Labor cost |
| equipment_cost | numeric | Equipment cost |
| rcv | numeric | Replacement cost value |
| acv | numeric | Actual cash value |
| depreciation_amount | numeric | Depreciation |
| coverage_code | varchar | Coverage (A, B, C, D) |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Zone Openings

**Table**: `zone_openings`

Openings (doors, windows) in zones.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| zone_id | uuid | Foreign key to estimate_zones |
| opening_type | varchar | door, window, etc. |
| wall_index | integer | Wall index (0-3) |
| offset_from_vertex_ft | numeric | Offset from wall vertex |
| width_ft | numeric | Width |
| height_ft | numeric | Height |
| connects_to_zone_id | uuid | Connected zone |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Zone Connections

**Table**: `zone_connections`

Connections between zones.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| from_zone_id | uuid | Source zone |
| to_zone_id | uuid | Target zone |
| connection_type | varchar | opening, hallway, etc. |
| opening_id | uuid | Related opening |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Workflow Tables

### Inspection Workflows

**Table**: `inspection_workflows`

Workflow definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| version | integer | Workflow version |
| status | varchar | draft, in_progress, completed |
| primary_peril | varchar | Primary peril |
| secondary_perils | jsonb | Secondary perils |
| workflow_json | jsonb | Workflow definition |
| total_steps | integer | Total steps |
| completed_steps | integer | Completed steps |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Inspection Workflow Steps

**Table**: `inspection_workflow_steps`

Individual workflow steps.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| workflow_id | uuid | Foreign key to inspection_workflows |
| step_index | integer | Step order |
| phase | varchar | exterior, interior, documentation |
| step_type | varchar | inspection, photo, measurement |
| title | varchar | Step title |
| description | text | Description |
| instructions | text | Instructions |
| status | varchar | pending, in_progress, completed, skipped |
| required | boolean | Required step |
| room_id | uuid | Related room |
| checklist_items | jsonb | Checklist items |
| started_at | timestamp | Start timestamp |
| completed_at | timestamp | Completion timestamp |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Inspection Workflow Assets

**Table**: `inspection_workflow_assets`

Evidence/assets for workflow steps.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| step_id | uuid | Foreign key to inspection_workflow_steps |
| asset_type | varchar | photo, measurement, note |
| label | varchar | Asset label |
| required | boolean | Required |
| min_count | integer | Minimum count |
| status | varchar | pending, provided |
| document_id | uuid | Related document |
| photo_id | uuid | Related photo |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Indexes

Key indexes for performance:

- `claims(organization_id, status)`
- `claim_rooms(claim_id, structure_id)`
- `claim_photos(claim_id, room_id)`
- `documents(organization_id, claim_id, type)`
- `estimates(organization_id, claim_id)`
- `estimate_line_items(estimate_id, zone_id)`

---

## Relationships

### Claim Hierarchy

```
claims
├── claim_structures
│   └── claim_rooms
│       └── claim_damage_zones
└── claim_photos (can link to structure, room, or zone)
```

### Estimate Hierarchy

```
estimates
├── estimate_structures
│   └── estimate_areas
│       └── estimate_zones
│           ├── estimate_line_items
│           ├── zone_openings
│           └── zone_connections
└── estimate_coverages
    └── estimate_line_items
```

### Workflow Hierarchy

```
inspection_workflows
└── inspection_workflow_steps
    └── inspection_workflow_assets
```

---

## Row Level Security (RLS)

Supabase RLS policies enforce organization-level isolation:

- Users can only access data from their organization
- Service role bypasses RLS for admin operations
- Policies defined in Supabase dashboard

---

For schema definitions, see `shared/schema.ts`.

---

This handoff document is complete and self-contained. It contains all UX/UI, inspection flow design, API, and database schema in one place.
