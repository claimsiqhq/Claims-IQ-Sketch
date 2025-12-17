-- AI Prompts Table Migration
-- Stores all OpenAI prompts for easy editing without code changes

-- Create the ai_prompts table
CREATE TABLE ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifier and categorization
    prompt_key VARCHAR(100) NOT NULL UNIQUE,
    prompt_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,

    -- Prompt content
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT,

    -- Model configuration
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    temperature DECIMAL(3,2) DEFAULT 0.3,
    max_tokens INTEGER,
    response_format VARCHAR(50) DEFAULT 'text',

    -- Metadata
    description TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    avg_tokens_used INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX idx_ai_prompts_key ON ai_prompts(prompt_key);
CREATE INDEX idx_ai_prompts_category ON ai_prompts(category);
CREATE INDEX idx_ai_prompts_active ON ai_prompts(is_active);

-- Add comments for documentation
COMMENT ON TABLE ai_prompts IS 'Stores AI prompts for OpenAI API calls, allowing easy editing without code changes';
COMMENT ON COLUMN ai_prompts.prompt_key IS 'Unique identifier for the prompt (e.g., document.extraction.fnol)';
COMMENT ON COLUMN ai_prompts.category IS 'Category grouping (document, briefing, estimate, voice, analysis)';
COMMENT ON COLUMN ai_prompts.system_prompt IS 'The system message sent to OpenAI';
COMMENT ON COLUMN ai_prompts.user_prompt_template IS 'User message template with {{variable}} placeholders';
COMMENT ON COLUMN ai_prompts.response_format IS 'Expected response format: text, json_object';
