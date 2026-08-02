ALTER TABLE ai_workflows
    ADD COLUMN IF NOT EXISTS resource_query_preview JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS resource_query_preview_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resource_query_last_count INT,
    ADD COLUMN IF NOT EXISTS resource_query_last_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resource_query_empty_policy VARCHAR(20) NOT NULL DEFAULT 'succeed';

UPDATE ai_workflows
SET resource_query_empty_policy='succeed'
WHERE resource_query_empty_policy IS NULL OR resource_query_empty_policy NOT IN ('succeed','fail');

ALTER TABLE ai_workflows
    DROP CONSTRAINT IF EXISTS ai_workflows_resource_query_empty_policy_check;
ALTER TABLE ai_workflows
    ADD CONSTRAINT ai_workflows_resource_query_empty_policy_check
    CHECK (resource_query_empty_policy IN ('succeed','fail'));
