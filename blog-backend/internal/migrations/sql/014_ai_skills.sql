CREATE TABLE IF NOT EXISTS ai_skills (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'advisory',
    max_steps INT NOT NULL DEFAULT 6,
    max_input_tokens INT NOT NULL DEFAULT 16000,
    max_output_tokens INT NOT NULL DEFAULT 2000,
    daily_run_limit INT NOT NULL DEFAULT 10,
    monthly_token_budget BIGINT NOT NULL DEFAULT 1000000,
    version INT NOT NULL DEFAULT 1,
    created_by TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_skill_mode_check CHECK (execution_mode IN ('advisory', 'approval')),
    CONSTRAINT ai_skill_limits_check CHECK (
        max_steps BETWEEN 1 AND 20 AND max_input_tokens > 0 AND max_output_tokens > 0
        AND daily_run_limit > 0 AND monthly_token_budget > 0 AND version > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_active_created
    ON ai_skills (created_at DESC) WHERE deleted_at IS NULL;
