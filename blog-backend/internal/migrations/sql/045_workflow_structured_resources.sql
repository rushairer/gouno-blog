ALTER TABLE ai_workflow_versions
    ADD COLUMN IF NOT EXISTS scope_policy JSONB NOT NULL
    DEFAULT '{"mode":"unscoped","discovery_tools":[]}'::jsonb;

ALTER TABLE ai_agent_runs
    ADD COLUMN IF NOT EXISTS workflow_run_id BIGINT REFERENCES ai_workflow_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_workflow_run
    ON ai_agent_runs(workflow_run_id) WHERE workflow_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_workflow_run_resources (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id BIGINT NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
    resource_type VARCHAR(40) NOT NULL,
    resource_key TEXT NOT NULL,
    source VARCHAR(20) NOT NULL,
    access_level VARCHAR(20) NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    version_token TEXT NOT NULL DEFAULT '',
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_workflow_run_resource_type_check CHECK (
        resource_type IN ('post','comment','media_asset','operational_suggestion','category','tag')
    ),
    CONSTRAINT ai_workflow_run_resource_source_check CHECK (
        source IN ('manual','query','discovery')
    ),
    CONSTRAINT ai_workflow_run_resource_access_check CHECK (
        access_level IN ('target','read')
    ),
    UNIQUE (workflow_run_id, resource_type, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_run_resources_run
    ON ai_workflow_run_resources(workflow_run_id, resource_type, access_level);

-- NULL values are distinct in the original unique constraint, so top-level
-- steps could be recorded more than once during recovery. Internally -1 means
-- "not in a for_each"; API readers translate it back to null.
DELETE FROM ai_workflow_step_runs a USING ai_workflow_step_runs b
WHERE a.iteration IS NULL AND b.iteration IS NULL
  AND a.workflow_run_id=b.workflow_run_id AND a.step_id=b.step_id AND a.id>b.id;
UPDATE ai_workflow_step_runs SET iteration=-1 WHERE iteration IS NULL;
ALTER TABLE ai_workflow_step_runs ALTER COLUMN iteration SET DEFAULT -1;
ALTER TABLE ai_workflow_step_runs ALTER COLUMN iteration SET NOT NULL;
