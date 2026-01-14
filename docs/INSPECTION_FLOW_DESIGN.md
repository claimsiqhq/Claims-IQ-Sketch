# Inspection Flow Design: Claims-IQ Sketch MVP

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
