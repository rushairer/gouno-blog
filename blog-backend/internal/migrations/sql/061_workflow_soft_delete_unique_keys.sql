-- Workflow deletion is soft deletion. Names and deterministic template keys
-- must therefore only be unique among active Workflows, otherwise an
-- administrator cannot recreate a deliberately deleted draft.
ALTER TABLE ai_workflows DROP CONSTRAINT IF EXISTS ai_workflows_name_key;
ALTER TABLE ai_workflows DROP CONSTRAINT IF EXISTS ai_workflows_template_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_workflows_active_name
    ON ai_workflows(name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_workflows_active_template_key
    ON ai_workflows(template_key) WHERE deleted_at IS NULL AND template_key IS NOT NULL;
