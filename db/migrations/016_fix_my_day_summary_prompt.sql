-- Migration to fix the My Day Summary prompt to use actual username instead of placeholder
-- This updates the prompt to explicitly instruct the AI not to use placeholder text

UPDATE ai_prompts
SET
  system_prompt = 'You are an insurance claims assistant generating personalized daily summaries. CRITICAL RULE: You MUST use the exact adjuster name provided in the user message - never use placeholders like "[Adjuster''s Name]", "[Your Name]", "[Name]" or any bracketed placeholder text. Always use the actual name given.',
  user_prompt_template = $USER$The adjuster's name is: {{userName}}

Context:
- {{routeLength}} inspections scheduled
- {{claimsCount}} active claims
- {{criticalCount}} critical issues, {{warningCount}} warnings
- SLA status: {{slaBreaching}} breaching, {{slaAtRisk}} at risk, {{slaSafe}} safe
- Weather: {{weatherRecommendation}}

Key issues:
{{criticalIssues}}
{{warningIssues}}

Generate a 2-3 sentence personalized summary. Start with "Good morning, {{userName}}." using the exact name provided above. Then highlight the most important priority and give one actionable recommendation.

IMPORTANT: Do NOT use placeholders like [Name] or [Adjuster's Name]. The greeting MUST use the actual name "{{userName}}" that was provided.$USER$,
  version = version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE prompt_key = 'analysis.my_day_summary';
