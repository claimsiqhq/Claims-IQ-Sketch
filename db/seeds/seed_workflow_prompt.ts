import { createClient } from '@supabase/supabase-js';

const systemPrompt = `You are an expert property insurance inspection planner.

Your task is to generate a STEP-BY-STEP, EXECUTABLE INSPECTION WORKFLOW for a field adjuster.

This workflow is NOT a narrative.
It is NOT a summary.
It is an ordered execution plan.

You MUST:
- Output structured JSON only
- Follow the schema exactly
- Be peril-aware and endorsement-aware
- Explicitly define required evidence
- Assume rooms may be added dynamically
- Optimize for CAT-scale defensibility

You MUST NOT:
- Make coverage determinations
- Invent policy language
- Collapse steps into vague instructions
- Output prose outside JSON

WORKFLOW REQUIREMENTS (MANDATORY):

1. Workflow MUST be divided into these EXACT ordered PHASES:
   - pre_inspection (Review documents, prepare equipment, plan inspection)
   - initial_walkthrough (Safety assessment, meet homeowner, overview of damage)
   - exterior (Roof, siding, windows, doors, gutters, landscaping - all outside work)
   - interior (Room-by-room inspection - expandable with room template)
   - documentation (Final photos, measurements, sketches, evidence organization)
   - wrap_up (Homeowner discussion, next steps, departure checklist)

   IMPORTANT: Use ONLY these 6 phase values. Do NOT use roof, utilities, mitigation, or closeout - fold those into the phases above.

2. Each phase MUST contain ordered, atomic steps.

3. Each step MUST include:
   - Clear instructions
   - Required flag
   - Estimated time
   - Explicit evidence requirements

4. Endorsements MUST:
   - Modify inspection behavior
   - Add or constrain evidence requirements
   - Never be mentioned abstractly

5. Interior inspections MUST:
   - Use a ROOM TEMPLATE
   - Allow dynamic room creation
   - Define default steps + evidence

6. The workflow MUST:
   - Be editable
   - Preserve human edits
   - Be auditable and defensible

VALIDATION RULES (NON-NEGOTIABLE):
- Missing phases → FAIL
- Missing evidence → FAIL
- Ignored endorsements → FAIL
- Non-JSON output → FAIL
- Vague steps → FAIL

If information is missing:
- Add a step to collect it
- OR add an open question
- Do NOT guess

Return JSON only.`;

const userPromptTemplate = `Generate an INSPECTION WORKFLOW using the inputs below.

### CLAIM CONTEXT
- Claim Number: {{claim_number}}
- Primary Peril: {{primary_peril}}
- Secondary Perils: {{secondary_perils}}
- Property Address: {{property_address}}
- Date of Loss: {{date_of_loss}}
- Loss Description: {{loss_description}}

### POLICY CONTEXT
- Policy Number: {{policy_number}}
- Coverage A (Dwelling): {{coverage_a}}
- Coverage B (Other Structures): {{coverage_b}}
- Coverage C (Contents): {{coverage_c}}
- Coverage D (Additional Living Expense): {{coverage_d}}
- Deductible: {{deductible}}

### ENDORSEMENTS
{{endorsements_list}}

### AI CLAIM BRIEFING SUMMARY
{{briefing_summary}}

### PERIL-SPECIFIC INSPECTION RULES
{{peril_inspection_rules}}

### CARRIER-SPECIFIC REQUIREMENTS
{{carrier_requirements}}

---

OUTPUT FORMAT (STRICT):

Return ONLY valid JSON with this exact structure:

{
  "metadata": {
    "claim_number": "string",
    "primary_peril": "string",
    "secondary_perils": ["array of strings"],
    "property_type": "residential or commercial",
    "estimated_total_time_minutes": number
  },
  "phases": [
    {
      "phase": "pre_inspection or initial_walkthrough or exterior or interior or documentation or wrap_up",
      "title": "string",
      "description": "string",
      "estimated_minutes": number,
      "step_count": number
    }
  ],
  "steps": [
    {
      "step_id": "unique string identifier",
      "phase": "string matching phase above",
      "step_type": "photo or measurement or checklist or observation or documentation or safety_check or equipment or interview",
      "title": "string",
      "instructions": "string with clear actionable instructions",
      "required": true or false,
      "estimated_minutes": number,
      "tags": ["array of strings"],
      "dependencies": ["array of step_ids this depends on"],
      "evidence_required": [
        {
          "type": "photo_required or measurement or sketch or note",
          "label": "string",
          "required": true or false,
          "metadata": {
            "min_count": number,
            "close_up": true or false,
            "requires_ruler": true or false,
            "angle": "overview or detail or comparison"
          }
        }
      ]
    }
  ],
  "room_template": {
    "standard_steps": [
      {
        "step_type": "string",
        "title": "string",
        "instructions": "string",
        "required": true or false,
        "estimated_minutes": number
      }
    ],
    "peril_specific_steps": {
      "hail": [],
      "wind": [],
      "water": [],
      "fire": []
    }
  },
  "tools_and_equipment": [
    {
      "item": "string",
      "required": true or false,
      "purpose": "string"
    }
  ],
  "open_questions": [
    {
      "question": "string",
      "context": "string",
      "priority": "high or medium or low"
    }
  ]
}`;

async function seedWorkflowPrompt() {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Use new key format with fallback to legacy
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    console.error('Set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
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
    temperature: 0.30,
    max_tokens: 8000,
    response_format: 'json_object',
    description: 'Generates step-by-step executable inspection workflows from claim data, policy, endorsements, and briefing. Creates phased, evidence-aware workflows for field adjusters.'
  };

  console.log('Inserting inspection workflow generator prompt...');
  const { error } = await supabase.from('ai_prompts').insert(prompt);
  if (error) {
    console.error('Error inserting:', error.message);
  } else {
    console.log('Inserted: workflow.inspection_generator');
  }

  // Verify total
  const { data } = await supabase.from('ai_prompts').select('prompt_key, category');
  console.log('\nTotal prompts in database:', data?.length || 0);
  console.log('\nAll prompts by category:');
  const byCategory: Record<string, string[]> = {};
  data?.forEach((p: { prompt_key: string; category: string }) => {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p.prompt_key);
  });
  Object.entries(byCategory).forEach(([cat, keys]) => {
    console.log(`  ${cat}: ${keys.join(', ')}`);
  });
}

seedWorkflowPrompt();
