ALTER TABLE ai_workflow_events
    ADD COLUMN IF NOT EXISTS batch_prepared BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ai_workflow_events_batch_prepare
    ON ai_workflow_events (batch_prepared, available_at, id) WHERE status='accepted';
