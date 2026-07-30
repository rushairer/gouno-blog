CREATE TABLE IF NOT EXISTS ai_provider_profiles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    provider_type VARCHAR(20) NOT NULL,
    base_url TEXT NOT NULL,
    model VARCHAR(120) NOT NULL,
    api_key_ciphertext BYTEA,
    api_key_nonce BYTEA,
    api_key_last4 VARCHAR(4) NOT NULL DEFAULT '',
    key_version SMALLINT NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT true,
    request_timeout_seconds INT NOT NULL DEFAULT 60,
    max_output_tokens INT NOT NULL DEFAULT 2000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_provider_type_check CHECK (provider_type IN ('openai', 'anthropic')),
    CONSTRAINT ai_provider_timeout_check CHECK (request_timeout_seconds BETWEEN 1 AND 600),
    CONSTRAINT ai_provider_tokens_check CHECK (max_output_tokens BETWEEN 1 AND 100000)
);

CREATE TABLE IF NOT EXISTS ai_agents (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    provider_profile_id BIGINT NOT NULL REFERENCES ai_provider_profiles(id) ON DELETE RESTRICT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    cron_expression VARCHAR(100),
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'advisory',
    max_steps INT NOT NULL DEFAULT 6,
    max_input_tokens INT NOT NULL DEFAULT 16000,
    max_output_tokens INT NOT NULL DEFAULT 2000,
    daily_run_limit INT NOT NULL DEFAULT 10,
    monthly_token_budget BIGINT NOT NULL DEFAULT 1000000,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_agent_trigger_check CHECK (trigger_type IN ('manual', 'cron')),
    CONSTRAINT ai_agent_mode_check CHECK (execution_mode IN ('advisory', 'approval')),
    CONSTRAINT ai_agent_cron_check CHECK (
        (trigger_type = 'manual' AND cron_expression IS NULL) OR
        (trigger_type = 'cron' AND cron_expression IS NOT NULL)
    ),
    CONSTRAINT ai_agent_limits_check CHECK (
        max_steps BETWEEN 1 AND 20 AND
        max_input_tokens > 0 AND
        max_output_tokens > 0 AND
        daily_run_limit > 0 AND
        monthly_token_budget > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_due
ON ai_agents (enabled, next_run_at)
WHERE deleted_at IS NULL AND trigger_type = 'cron';

CREATE TABLE IF NOT EXISTS ai_agent_runs (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES ai_agents(id) ON DELETE RESTRICT,
    trigger_type VARCHAR(20) NOT NULL,
    triggered_by TEXT,
    schedule_key VARCHAR(160),
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_summary TEXT NOT NULL DEFAULT '',
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(120) NOT NULL,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    error_code VARCHAR(80),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_agent_run_trigger_check CHECK (trigger_type IN ('manual', 'cron')),
    CONSTRAINT ai_agent_run_status_check CHECK (
        status IN ('queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_runs_schedule_key
ON ai_agent_runs (agent_id, schedule_key)
WHERE schedule_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_agent_created
ON ai_agent_runs (agent_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_runs_one_active
ON ai_agent_runs (agent_id)
WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS ai_tool_calls (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    provider_call_id VARCHAR(160),
    tool_name VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_tool_risk_check CHECK (risk_level IN ('read', 'propose', 'write')),
    CONSTRAINT ai_tool_status_check CHECK (
        status IN ('requested', 'executed', 'rejected', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_run
ON ai_tool_calls (run_id, created_at);

CREATE TABLE IF NOT EXISTS ai_approvals (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    tool_call_id BIGINT NOT NULL UNIQUE REFERENCES ai_tool_calls(id) ON DELETE CASCADE,
    action_type VARCHAR(80) NOT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_id BIGINT,
    proposed_payload JSONB NOT NULL,
    before_snapshot JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    review_note TEXT,
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_approval_status_check CHECK (
        status IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_approvals_pending
ON ai_approvals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    request_id VARCHAR(160) NOT NULL UNIQUE,
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(120) NOT NULL,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_run
ON ai_usage_events (run_id, completed_at);
