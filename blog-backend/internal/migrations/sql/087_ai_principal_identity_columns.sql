-- Keep legacy text for display/system provenance. New *_principal_id columns
-- are the only columns permitted to carry an authenticated Blog identity.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_skill_versions ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_workflows ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_workflow_versions ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_workflow_runs ADD COLUMN IF NOT EXISTS triggered_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_workflow_runs ADD COLUMN IF NOT EXISTS trigger_kind VARCHAR(24) NOT NULL DEFAULT 'manual';
ALTER TABLE ai_workflow_runs ADD COLUMN IF NOT EXISTS source_ref VARCHAR(180) NOT NULL DEFAULT '';
ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS triggered_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_approvals ADD COLUMN IF NOT EXISTS reviewed_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE workflow_interaction_tasks ADD COLUMN IF NOT EXISTS resolved_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS reviewed_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agents_created_by_principal ON ai_agents(created_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflows_created_by_principal ON ai_workflows(created_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_triggered_by_principal ON ai_workflow_runs(triggered_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_triggered_by_principal ON ai_agent_runs(triggered_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_reviewed_by_principal ON ai_approvals(reviewed_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_workflow_interactions_resolved_by_principal ON workflow_interaction_tasks(resolved_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_media_candidates_reviewed_by_principal ON ai_media_candidates(reviewed_by_principal_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_by_principal ON ai_feedback(created_by_principal_id);
