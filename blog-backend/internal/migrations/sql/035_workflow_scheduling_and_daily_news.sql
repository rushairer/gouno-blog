ALTER TABLE ai_workflows
    ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(80),
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
    ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

ALTER TABLE ai_workflow_runs ADD COLUMN IF NOT EXISTS schedule_key VARCHAR(160);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_workflow_runs_schedule_key
    ON ai_workflow_runs(workflow_id, schedule_key) WHERE schedule_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_workflows_due
    ON ai_workflows(enabled, next_run_at) WHERE enabled = TRUE AND deleted_at IS NULL;
