-- Development-stage hard cutover: principal ids are the only human identity.
UPDATE ai_workflow_runs SET trigger_kind=CASE
  WHEN schedule_key IS NOT NULL THEN 'scheduler'
  WHEN triggered_by LIKE 'event:%' THEN 'event'
  WHEN retry_of_run_id IS NOT NULL THEN 'retry'
  ELSE 'manual' END,
  source_ref=CASE WHEN triggered_by LIKE 'event:%' THEN substring(triggered_by FROM 7) ELSE source_ref END;

ALTER TABLE ai_agents ALTER COLUMN created_by_principal_id SET NOT NULL;
ALTER TABLE ai_skills ALTER COLUMN created_by_principal_id SET NOT NULL;
ALTER TABLE ai_skill_versions ALTER COLUMN created_by_principal_id SET NOT NULL;
ALTER TABLE ai_workflows ALTER COLUMN created_by_principal_id SET NOT NULL;
ALTER TABLE ai_workflow_versions ALTER COLUMN created_by_principal_id SET NOT NULL;
ALTER TABLE ai_feedback ALTER COLUMN created_by_principal_id SET NOT NULL;

ALTER TABLE ai_feedback DROP CONSTRAINT IF EXISTS ai_feedback_target_type_target_id_created_by_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_principal_once
  ON ai_feedback(target_type,target_id,created_by_principal_id);
ALTER TABLE ai_workflow_runs DROP CONSTRAINT IF EXISTS ai_workflow_runs_trigger_kind_check;
ALTER TABLE ai_workflow_runs ADD CONSTRAINT ai_workflow_runs_trigger_kind_check
  CHECK (trigger_kind IN ('manual','retry','scheduler','event'));

ALTER TABLE ai_agents DROP COLUMN IF EXISTS created_by;
ALTER TABLE ai_skills DROP COLUMN IF EXISTS created_by;
ALTER TABLE ai_skill_versions DROP COLUMN IF EXISTS created_by;
ALTER TABLE ai_workflows DROP COLUMN IF EXISTS created_by;
ALTER TABLE ai_workflow_versions DROP COLUMN IF EXISTS created_by;
ALTER TABLE ai_workflow_runs DROP COLUMN IF EXISTS triggered_by;
ALTER TABLE ai_agent_runs DROP COLUMN IF EXISTS triggered_by;
ALTER TABLE ai_approvals DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE workflow_interaction_tasks DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE ai_media_candidates DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE ai_feedback DROP COLUMN IF EXISTS created_by;
ALTER TABLE media_assets DROP COLUMN IF EXISTS created_by;

ALTER TABLE blog_authorization_audits ADD COLUMN IF NOT EXISTS acr TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_authorization_audits ADD COLUMN IF NOT EXISTS amr JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE blog_authorization_audits ADD COLUMN IF NOT EXISTS auth_time TIMESTAMPTZ;
