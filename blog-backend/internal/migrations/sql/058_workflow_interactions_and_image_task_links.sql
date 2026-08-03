CREATE TABLE IF NOT EXISTS workflow_interaction_tasks (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
    agent_run_id BIGINT REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    workflow_step_id VARCHAR(160),
    interaction_type VARCHAR(32) NOT NULL,
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    resume_token VARCHAR(128) NOT NULL UNIQUE,
    response JSONB,
    expires_at TIMESTAMPTZ,
    resolved_by VARCHAR(160),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workflow_interaction_type_check CHECK (interaction_type IN ('approval','choice','input','preview_confirm')),
    CONSTRAINT workflow_interaction_status_check CHECK (status IN ('pending','resolved','cancelled','expired')),
    CONSTRAINT workflow_interaction_source_check CHECK (workflow_run_id IS NOT NULL OR agent_run_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_workflow_interaction_run ON workflow_interaction_tasks(workflow_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_interaction_pending ON workflow_interaction_tasks(status, created_at DESC);

ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS workflow_step_id VARCHAR(160);
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS interaction_task_id BIGINT REFERENCES workflow_interaction_tasks(id) ON DELETE SET NULL;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS post_version_token VARCHAR(128);
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS generation_attempt INT NOT NULL DEFAULT 0;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS applied_version_id BIGINT;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS error_code VARCHAR(80);
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS error_message TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_media_candidates_workflow_run ON ai_media_candidates(workflow_run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_run_events (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
    agent_run_id BIGINT REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    workflow_step_id VARCHAR(160),
    interaction_task_id BIGINT REFERENCES workflow_interaction_tasks(id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workflow_run_event_source_check CHECK (workflow_run_id IS NOT NULL OR agent_run_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_workflow_run_events_run ON workflow_run_events(workflow_run_id, created_at, id);
