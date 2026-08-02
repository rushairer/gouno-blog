ALTER TABLE ai_workflow_runs
    ADD COLUMN IF NOT EXISTS retry_of_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retry_step_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS retry_iterations JSONB NOT NULL DEFAULT '[]'::jsonb;
