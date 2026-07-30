CREATE TABLE IF NOT EXISTS ai_operational_suggestions (
    id BIGSERIAL PRIMARY KEY,
    source_type VARCHAR(40) NOT NULL,
    source_key VARCHAR(160) NOT NULL,
    source_run_id BIGINT REFERENCES ai_agent_runs(id) ON DELETE SET NULL,
    workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    ignored_reason TEXT,
    dedupe_key VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_operational_suggestion_priority_check CHECK (priority IN ('low','medium','high')),
    CONSTRAINT ai_operational_suggestion_status_check CHECK (status IN ('new','ignored','converted','selected')),
    UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_operational_suggestions_status
    ON ai_operational_suggestions (status, priority, created_at DESC);

ALTER TABLE ai_editorial_tasks ALTER COLUMN source_approval_id DROP NOT NULL;
ALTER TABLE ai_editorial_tasks
    ADD COLUMN IF NOT EXISTS source_suggestion_id BIGINT UNIQUE REFERENCES ai_operational_suggestions(id) ON DELETE RESTRICT;
ALTER TABLE ai_editorial_tasks
    ADD CONSTRAINT ai_editorial_task_source_check CHECK (
        (source_approval_id IS NOT NULL)::int + (source_suggestion_id IS NOT NULL)::int = 1
    );
