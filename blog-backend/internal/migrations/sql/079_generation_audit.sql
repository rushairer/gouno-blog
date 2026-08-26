CREATE TABLE IF NOT EXISTS ai_generation_audits (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(40) NOT NULL,
    operation VARCHAR(120) NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1,
    provider VARCHAR(40) NOT NULL DEFAULT '',
    model VARCHAR(160) NOT NULL DEFAULT '',
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    error_code VARCHAR(80) NOT NULL DEFAULT '',
    agent_run_id BIGINT REFERENCES ai_agent_runs(id) ON DELETE SET NULL,
    workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE SET NULL,
    media_candidate_id BIGINT REFERENCES ai_media_candidates(id) ON DELETE SET NULL,
    media_asset_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_generation_audit_source_check CHECK (source IN ('editor', 'agent_candidate')),
    CONSTRAINT ai_generation_audit_status_check CHECK (status IN ('succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_audits_created ON ai_generation_audits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_audits_source ON ai_generation_audits (source, created_at DESC);
