CREATE TABLE IF NOT EXISTS ai_workflows (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    template_key VARCHAR(80) UNIQUE,
    current_version INT NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_versions (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES ai_workflows(id) ON DELETE RESTRICT,
    version INT NOT NULL,
    input_schema JSONB NOT NULL,
    steps JSONB NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_id, version)
);

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES ai_workflows(id) ON DELETE RESTRICT,
    workflow_version_id BIGINT NOT NULL REFERENCES ai_workflow_versions(id) ON DELETE RESTRICT,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB,
    error_code VARCHAR(80),
    error_message TEXT,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    triggered_by TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_workflow_run_status_check CHECK (
        status IN ('queued','running','awaiting_approval','succeeded','failed','cancelled')
    )
);

CREATE TABLE IF NOT EXISTS ai_workflow_step_runs (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id BIGINT NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
    step_id VARCHAR(80) NOT NULL,
    step_type VARCHAR(30) NOT NULL,
    iteration INT,
    status VARCHAR(30) NOT NULL,
    input JSONB,
    output JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE (workflow_run_id, step_id, iteration)
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_created
    ON ai_workflow_runs (workflow_id, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_agent_runs_workflow_version_fk') THEN
        ALTER TABLE ai_agent_runs ADD CONSTRAINT ai_agent_runs_workflow_version_fk
            FOREIGN KEY (workflow_version_id) REFERENCES ai_workflow_versions(id) ON DELETE SET NULL;
    END IF;
END $$;

WITH templates(name, description, template_key, input_schema, steps) AS (
    VALUES
    ('Pre-publish review', 'Audit a post, retrieve evidence, then run a governed editing Agent.', 'pre_publish_review',
     '{"type":"object","additionalProperties":false,"required":["agent_id","audit_args","search_args"],"properties":{"agent_id":{"type":"integer"},"audit_args":{"type":"object"},"search_args":{"type":"object"}}}'::jsonb,
     '[{"id":"audit","type":"tool","tool_name":"content.audit_post","arguments_pointer":"/input/audit_args"},{"id":"evidence","type":"tool","tool_name":"content.search_knowledge","arguments_pointer":"/input/search_args"},{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/editor"}]'::jsonb),
    ('Weekly operations report', 'Collect aggregate analytics and produce a governed weekly report.', 'weekly_operations',
     '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer"}}}'::jsonb,
     '[{"id":"analytics","type":"tool","tool_name":"analytics.get_summary","arguments":{}},{"id":"report","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/steps/analytics"},{"id":"result","type":"output","output_pointer":"/steps/report"}]'::jsonb),
    ('Stale content refresh', 'Find stale posts and evaluate each through a governed editing Agent.', 'stale_content_refresh',
     '{"type":"object","additionalProperties":false,"required":["agent_id","stale_args"],"properties":{"agent_id":{"type":"integer"},"stale_args":{"type":"object"}}}'::jsonb,
     '[{"id":"stale","type":"tool","tool_name":"content.list_stale_posts","arguments_pointer":"/input/stale_args"},{"id":"refresh_each","type":"for_each","collection_pointer":"/steps/stale/list","max_items":100,"steps":[{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/item"}]},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/refresh_each"}]'::jsonb)
)
INSERT INTO ai_workflows (name, description, enabled, template_key)
SELECT name, description, false, template_key FROM templates
ON CONFLICT (template_key) DO NOTHING;

WITH templates(template_key, input_schema, steps) AS (
    VALUES
    ('pre_publish_review',
     '{"type":"object","additionalProperties":false,"required":["agent_id","audit_args","search_args"],"properties":{"agent_id":{"type":"integer"},"audit_args":{"type":"object"},"search_args":{"type":"object"}}}'::jsonb,
     '[{"id":"audit","type":"tool","tool_name":"content.audit_post","arguments_pointer":"/input/audit_args"},{"id":"evidence","type":"tool","tool_name":"content.search_knowledge","arguments_pointer":"/input/search_args"},{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/input"},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/editor"}]'::jsonb),
    ('weekly_operations',
     '{"type":"object","additionalProperties":false,"required":["agent_id"],"properties":{"agent_id":{"type":"integer"}}}'::jsonb,
     '[{"id":"analytics","type":"tool","tool_name":"analytics.get_summary","arguments":{}},{"id":"report","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/steps/analytics"},{"id":"result","type":"output","output_pointer":"/steps/report"}]'::jsonb),
    ('stale_content_refresh',
     '{"type":"object","additionalProperties":false,"required":["agent_id","stale_args"],"properties":{"agent_id":{"type":"integer"},"stale_args":{"type":"object"}}}'::jsonb,
     '[{"id":"stale","type":"tool","tool_name":"content.list_stale_posts","arguments_pointer":"/input/stale_args"},{"id":"refresh_each","type":"for_each","collection_pointer":"/steps/stale/list","max_items":100,"steps":[{"id":"editor","type":"model","agent_id_pointer":"/input/agent_id","input_pointer":"/item"}]},{"id":"approval","type":"approval_gate"},{"id":"result","type":"output","output_pointer":"/steps/refresh_each"}]'::jsonb)
)
INSERT INTO ai_workflow_versions (workflow_id, version, input_schema, steps)
SELECT w.id, 1, t.input_schema, t.steps FROM templates t JOIN ai_workflows w ON w.template_key=t.template_key
ON CONFLICT (workflow_id, version) DO NOTHING;
