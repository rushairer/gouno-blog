-- Evidence for explicit governed Agent text HTTP dispatches. No historical
-- backfill: a logical run/usage row cannot establish how many HTTP calls occurred.
CREATE TABLE ai_text_dispatch_audits (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES ai_agent_runs(id) ON DELETE SET NULL,
    source_run_id BIGINT NOT NULL CHECK (source_run_id > 0),
    agent_id BIGINT NOT NULL CHECK (agent_id > 0),
    turn_request_id VARCHAR(160) NOT NULL CHECK (length(turn_request_id) > 0),
    sequence INT NOT NULL CHECK (sequence > 0),
    provider_profile_id BIGINT NOT NULL CHECK (provider_profile_id > 0),
    provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('openai','anthropic','gemini')),
    vendor VARCHAR(40) NOT NULL CHECK (length(vendor) > 0),
    model VARCHAR(120) NOT NULL CHECK (length(model) > 0),
    config_fingerprint TEXT NOT NULL CHECK (config_fingerprint ~ '^[0-9a-f]{64}$'),
    operation TEXT NOT NULL CHECK (operation IN ('openai.responses','openai.chat_completions','anthropic.messages','gemini.generate_content')),
    stream_flag TEXT NOT NULL CHECK (stream_flag IN ('unspecified','true','false')),
    status TEXT NOT NULL DEFAULT 'started',
    http_status INT,
    upstream_request_id TEXT CHECK (upstream_request_id IS NULL OR octet_length(upstream_request_id) BETWEEN 1 AND 512),
    upstream_account_id TEXT CHECK (upstream_account_id IS NULL OR octet_length(upstream_account_id) BETWEEN 1 AND 512),
    upstream_workspace_id TEXT CHECK (upstream_workspace_id IS NULL OR octet_length(upstream_workspace_id) BETWEEN 1 AND 512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE(source_run_id,turn_request_id,sequence),
    CHECK (run_id IS NULL OR run_id=source_run_id),
    CHECK (
        (status='started' AND finished_at IS NULL AND http_status IS NULL)
        OR (status='transport_unknown' AND finished_at IS NOT NULL AND http_status IS NULL)
        OR (status='response_received' AND finished_at IS NOT NULL AND http_status IS NOT NULL AND http_status BETWEEN 200 AND 299)
        OR (status='http_error' AND finished_at IS NOT NULL AND http_status IS NOT NULL AND (http_status BETWEEN 100 AND 199 OR http_status BETWEEN 300 AND 599))
    )
);

CREATE INDEX idx_ai_text_dispatch_audits_run ON ai_text_dispatch_audits(run_id)
    WHERE run_id IS NOT NULL;
