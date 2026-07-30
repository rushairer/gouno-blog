ALTER TABLE ai_skills
    ADD COLUMN IF NOT EXISTS input_schema JSONB NOT NULL DEFAULT '{"type":"object","additionalProperties":false}'::jsonb,
    ADD COLUMN IF NOT EXISTS allowed_triggers JSONB NOT NULL DEFAULT '["manual","cron"]'::jsonb;

CREATE TABLE IF NOT EXISTS ai_skill_versions (
    id BIGSERIAL PRIMARY KEY,
    skill_id BIGINT NOT NULL REFERENCES ai_skills(id) ON DELETE RESTRICT,
    version INT NOT NULL,
    system_prompt TEXT NOT NULL,
    capabilities JSONB NOT NULL,
    execution_mode VARCHAR(20) NOT NULL,
    max_steps INT NOT NULL,
    max_input_tokens INT NOT NULL,
    max_output_tokens INT NOT NULL,
    daily_run_limit INT NOT NULL,
    monthly_token_budget BIGINT NOT NULL,
    input_schema JSONB NOT NULL,
    allowed_triggers JSONB NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (skill_id, version)
);

INSERT INTO ai_skill_versions (
    skill_id, version, system_prompt, capabilities, execution_mode, max_steps,
    max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget,
    input_schema, allowed_triggers, created_by, created_at
)
SELECT id, version, system_prompt, capabilities, execution_mode, max_steps,
       max_input_tokens, max_output_tokens, daily_run_limit, monthly_token_budget,
       input_schema, allowed_triggers, created_by, updated_at
FROM ai_skills
ON CONFLICT (skill_id, version) DO NOTHING;

ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS skill_version_id BIGINT REFERENCES ai_skill_versions(id) ON DELETE SET NULL;
ALTER TABLE ai_agent_runs
    ADD COLUMN IF NOT EXISTS skill_version_id BIGINT REFERENCES ai_skill_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS workflow_version_id BIGINT;
