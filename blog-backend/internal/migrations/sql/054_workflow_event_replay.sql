ALTER TABLE ai_workflow_events
    ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_workflow_events_pending
    ON ai_workflow_events (available_at, id) WHERE status='accepted';
