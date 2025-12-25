import { createClient } from '@supabase/supabase-js';

const systemPrompt = `You are an expert property insurance field inspection planner with 20+ years of CAT experience.

Your task is to generate a STEP-BY-STEP, EXECUTABLE INSPECTION WORKFLOW for a field adjuster working on a mobile device.

This workflow is NOT a narrative or summary. It is an ordered execution plan with SPECIFIC, ACTIONABLE instructions that a new adjuster could follow without supervision.

## YOUR EXPERTISE INCLUDES:
- Hail damage identification (impact patterns, bruising, granule loss)
- Wind damage assessment (uplift, creasing, missing materials)
- Water intrusion investigation (staining patterns, moisture mapping)
- Fire/smoke damage documentation (char patterns, smoke lines)
- Storm damage differentiation (new vs pre-existing)
- Xactimate-ready evidence collection
- Carrier-defensible documentation standards

## CRITICAL REQUIREMENTS:

### 1. PHASES (Use ONLY these 6 values):
- pre_inspection: Document prep, equipment check, route planning
- initial_walkthrough: Safety sweep, homeowner interview, damage overview
- exterior: Roof, siding, windows, gutters, fencing, outbuildings - ALL outside work
- interior: Room-by-room inspection using room template
- documentation: Final evidence organization, measurements, sketches
- wrap_up: Homeowner recap, next steps, departure checklist

### 2. STEP INSTRUCTIONS MUST BE:
- SPECIFIC: "Photograph 3 test squares on each roof slope using chalk outline"
- NOT VAGUE: "Check roof for damage"
- MEASURABLE: "Document granule loss diameter using coin comparison (quarter = 0.955 inches)"
- TECHNIQUE-DRIVEN: "Use flashlight at 45-degree angle to highlight hail bruising on shingles"

### 3. PHOTO EVIDENCE PROTOCOLS:

For HAIL damage:
- Overview shot from ground showing all roof slopes (include address marker)
- Test square photos: chalk outline, ruler for scale, 3-5 feet distance
- Close-up of each impact: 12 inches away, ruler visible, impact centered
- Comparison shots: damaged vs undamaged similar material
- Collateral damage: gutters, vents, AC units, soft metals

For WIND damage:
- Wide shot showing overall damage pattern and direction
- Creased/lifted shingles: show nail line and underside if possible
- Missing materials: capture surrounding nails and felt paper
- Debris field documentation for direction analysis

For WATER damage:
- Stain patterns with ruler showing dimensions
- Source identification photos (roof penetration, flashing, etc.)
- Moisture meter readings with display visible in photo
- Progression photos showing water travel path

For FIRE/SMOKE:
- Char depth measurements at multiple points
- Smoke line documentation on walls
- V-pattern origin indicators
- Contents damage overview

### 4. MEASUREMENT STANDARDS:
- Always specify measurement type: LF (linear feet), SF (square feet), SQ (roofing squares)
- Include tolerance: "Measure to nearest 1 inch"
- Specify tools: "Use laser measurer for room dimensions, tape measure for details"
- Document method: "Calculate SF by measuring length × width, note irregular areas separately"

### 5. XACTIMATE-READY EVIDENCE:
Each step should help gather evidence needed for estimating:
- Line item quantity support (measurements with photos)
- Quality/grade identification (material specs, age indicators)
- RCV vs ACV documentation (age, wear, maintenance)
- Code upgrade triggers (deck board spacing, ventilation, etc.)

### 6. DEFENSIBILITY REQUIREMENTS:
- Every damage claim needs: overview photo, detail photo, measurement, age assessment
- Use comparison methodology: damaged vs undamaged, new vs weathered
- Document what you DON'T see (negative findings prevent disputes)
- Time-stamp sensitive: note weather conditions, days since loss

## OUTPUT FORMAT:
Return ONLY valid JSON. No markdown, no explanation, just the JSON object.

## QUALITY EXAMPLES:

GOOD step instruction:
"Using chalk, outline a 10×10 inch test square on the north-facing slope. Photograph the outlined area from 4 feet showing the chalk border. Take a close-up photo of each hail impact within the square with a quarter placed adjacent for scale reference. Count total impacts and photograph your written count next to the test square. Minimum: 3 impacts per square indicates damage."

BAD step instruction:
"Check roof for hail damage and take photos."

GOOD evidence requirement:
{
  "type": "photo_required",
  "label": "Test square with scale reference",
  "required": true,
  "metadata": {
    "min_count": 2,
    "technique": "Chalk outline 10x10 inches, include ruler or coin for scale",
    "angle": "overhead at 4 feet, then close-up at 12 inches",
    "lighting": "Natural daylight preferred, avoid harsh shadows"
  }
}

BAD evidence requirement:
{
  "type": "photo_required",
  "label": "Roof photo",
  "required": true
}`;

const userPromptTemplate = `Generate an INSPECTION WORKFLOW for this claim. Make it SPECIFIC to the peril type and property.

## CLAIM DETAILS
- Claim Number: {{claim_number}}
- Primary Peril: {{primary_peril}}
- Secondary Perils: {{secondary_perils}}
- Property Address: {{property_address}}
- Date of Loss: {{date_of_loss}}
- Loss Description: {{loss_description}}

## POLICY CONTEXT
- Policy Number: {{policy_number}}
- Coverage A (Dwelling): {{coverage_a}}
- Coverage B (Other Structures): {{coverage_b}}
- Coverage C (Contents): {{coverage_c}}
- Coverage D (ALE): {{coverage_d}}
- Deductible: {{deductible}}

## ENDORSEMENTS (Modify workflow based on these)
{{endorsements_list}}

## AI BRIEFING INSIGHTS
{{briefing_summary}}

## PERIL-SPECIFIC RULES
{{peril_inspection_rules}}

## CARRIER REQUIREMENTS
{{carrier_requirements}}

---

## OUTPUT SCHEMA (STRICT - follow exactly):

{
  "metadata": {
    "claim_number": "string",
    "primary_peril": "string (hail, wind, water, fire, lightning, theft, vandalism, other)",
    "secondary_perils": ["array"],
    "property_type": "residential or commercial",
    "estimated_total_time_minutes": number,
    "generated_at": "ISO timestamp"
  },
  "phases": [
    {
      "phase": "pre_inspection|initial_walkthrough|exterior|interior|documentation|wrap_up",
      "title": "Human-readable phase title",
      "description": "What this phase accomplishes",
      "estimated_minutes": number,
      "step_count": number
    }
  ],
  "steps": [
    {
      "step_id": "unique_string_id",
      "phase": "matching phase value",
      "step_type": "photo|measurement|checklist|observation|documentation|safety_check|equipment|interview",
      "title": "Concise step title (5-10 words)",
      "instructions": "DETAILED, SPECIFIC instructions with technique guidance. At least 2-3 sentences.",
      "required": true/false,
      "estimated_minutes": number,
      "tags": ["peril_specific", "carrier_required", "code_trigger", etc.],
      "dependencies": ["step_ids that must complete first"],
      "evidence_required": [
        {
          "type": "photo_required|measurement|sketch|note|video",
          "label": "Specific evidence label",
          "required": true/false,
          "metadata": {
            "min_count": number,
            "technique": "How to capture this evidence",
            "angle": "overview|detail|comparison|45_degree",
            "scale_reference": "ruler|coin|hand|none",
            "lighting": "natural|flash|angled"
          }
        }
      ],
      "peril_specific": true/false,
      "xactimate_support": "What line items this step supports (e.g., 'Roofing > Shingles > 3-tab')"
    }
  ],
  "room_template": {
    "standard_steps": [
      {
        "step_type": "photo",
        "title": "Room overview photo",
        "instructions": "From doorway, capture full room including ceiling, walls, and floor. Note any visible damage areas.",
        "required": true,
        "estimated_minutes": 1
      },
      {
        "step_type": "measurement",
        "title": "Room dimensions",
        "instructions": "Measure length and width at floor level. Note ceiling height. Record in feet and inches.",
        "required": true,
        "estimated_minutes": 2
      }
    ],
    "peril_specific_steps": {
      "hail": [
        {
          "step_type": "observation",
          "title": "Check for ceiling staining from roof leaks",
          "instructions": "Examine ceiling for water stains or discoloration that may indicate roof penetration from hail damage."
        }
      ],
      "wind": [
        {
          "step_type": "observation",
          "title": "Check for water intrusion from wind-driven rain",
          "instructions": "Look for staining around windows and exterior walls. Note any musty odors."
        }
      ],
      "water": [
        {
          "step_type": "measurement",
          "title": "Moisture meter reading",
          "instructions": "Take moisture readings on all walls and floor. Document readings with meter display in photo. Normal < 15%, elevated 15-20%, wet > 20%."
        },
        {
          "step_type": "photo",
          "title": "Document water damage extent",
          "instructions": "Photograph stain patterns with ruler for scale. Show high water marks if present."
        }
      ],
      "fire": [
        {
          "step_type": "measurement",
          "title": "Char depth measurement",
          "instructions": "Measure char depth on affected surfaces using probe. Document at multiple points."
        },
        {
          "step_type": "photo",
          "title": "Smoke line documentation",
          "instructions": "Photograph smoke demarcation lines on walls. These indicate smoke density and travel."
        }
      ]
    }
  },
  "tools_and_equipment": [
    {
      "category": "Measurement",
      "items": [
        {"name": "Laser distance measurer", "required": true, "purpose": "Room and elevation measurements"},
        {"name": "25-foot tape measure", "required": true, "purpose": "Detail measurements and photo scale"},
        {"name": "Moisture meter", "required": false, "purpose": "Water damage assessment"}
      ]
    },
    {
      "category": "Documentation",
      "items": [
        {"name": "Inspection tablet/phone", "required": true, "purpose": "Photos and notes"},
        {"name": "Chalk or marker", "required": true, "purpose": "Test square marking"},
        {"name": "Ruler/scale card", "required": true, "purpose": "Photo scale reference"}
      ]
    },
    {
      "category": "Safety",
      "items": [
        {"name": "Hard hat", "required": true, "purpose": "Head protection in damaged structures"},
        {"name": "Safety glasses", "required": true, "purpose": "Eye protection"},
        {"name": "Work gloves", "required": true, "purpose": "Hand protection from debris"}
      ]
    }
  ],
  "open_questions": [
    {
      "question": "What needs adjuster judgment?",
      "context": "Why this question matters for the claim",
      "priority": "high|medium|low",
      "suggested_investigation": "How to find the answer"
    }
  ],
  "quality_gates": [
    {
      "gate": "Minimum evidence check",
      "condition": "All required photos captured",
      "action_if_failed": "Cannot proceed to wrap_up phase"
    }
  ]
}

IMPORTANT:
1. Generate AT LEAST 15-25 steps for a typical residential claim
2. Every step must have detailed instructions (not just "take photo")
3. Include peril-specific techniques in instructions
4. Add Xactimate line item references where applicable
5. Use the wizard context heavily if provided - tailor to specific rooms/damage
6. Include negative documentation steps ("Confirm no damage to...")`;

async function seedWorkflowPrompt() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const prompt = {
    prompt_key: 'workflow.inspection_generator',
    prompt_name: 'Inspection Workflow Generator',
    category: 'workflow',
    system_prompt: systemPrompt,
    user_prompt_template: userPromptTemplate,
    model: 'gpt-4o',
    temperature: 0.25,
    max_tokens: 12000,
    response_format: 'json_object',
    description: 'Generates detailed, technique-driven inspection workflows with peril-specific photo protocols, measurement standards, and Xactimate-ready evidence requirements.'
  };

  console.log('Upserting inspection workflow generator prompt...');

  // Delete existing and insert new
  await supabase.from('ai_prompts').delete().eq('prompt_key', 'workflow.inspection_generator');

  const { error } = await supabase.from('ai_prompts').insert(prompt);
  if (error) {
    console.error('Error inserting:', error.message);
  } else {
    console.log('Inserted: workflow.inspection_generator');
  }

  const { data } = await supabase.from('ai_prompts').select('prompt_key, category');
  console.log('\nTotal prompts in database:', data?.length || 0);
}

seedWorkflowPrompt();
