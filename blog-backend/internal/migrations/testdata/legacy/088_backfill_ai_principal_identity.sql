-- Preserve unique subject mappings. Ambiguous and unmapped development rows
-- belong to the earliest active owner so runtime code has one identity model.
CREATE TEMP TABLE ai_identity_backfill_owner ON COMMIT DROP AS
SELECT p.id AS principal_id FROM blog_principals p
JOIN blog_memberships m ON m.principal_id=p.id AND m.status='active'
JOIN blog_role_bindings r ON r.membership_id=m.id AND r.role='owner'
ORDER BY p.created_at,p.id LIMIT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ai_identity_backfill_owner) THEN
    RAISE EXCEPTION 'AI principal migration requires at least one active owner';
  END IF;
END $$;
CREATE TEMP TABLE ai_identity_unique_subject ON COMMIT DROP AS
SELECT subject,MIN(principal_id) principal_id FROM blog_principal_identities
GROUP BY subject HAVING COUNT(DISTINCT principal_id)=1;

UPDATE ai_agents a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;
UPDATE ai_skills a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;
UPDATE ai_skill_versions a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;
UPDATE ai_workflows a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;
UPDATE ai_workflow_versions a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;
UPDATE ai_workflow_runs a SET triggered_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.triggered_by=u.subject AND a.triggered_by_principal_id IS NULL;
UPDATE ai_agent_runs a SET triggered_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.triggered_by=u.subject AND a.triggered_by_principal_id IS NULL;
UPDATE ai_approvals a SET reviewed_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.reviewed_by=u.subject AND a.reviewed_by_principal_id IS NULL;
UPDATE workflow_interaction_tasks a SET resolved_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.resolved_by=u.subject AND a.resolved_by_principal_id IS NULL;
UPDATE ai_media_candidates a SET reviewed_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.reviewed_by=u.subject AND a.reviewed_by_principal_id IS NULL;
UPDATE ai_feedback a SET created_by_principal_id=u.principal_id FROM ai_identity_unique_subject u WHERE a.created_by=u.subject AND a.created_by_principal_id IS NULL;

UPDATE ai_agents SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
UPDATE ai_skills SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
UPDATE ai_skill_versions SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
UPDATE ai_workflows SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
UPDATE ai_workflow_versions SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
UPDATE ai_workflow_runs SET triggered_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE triggered_by_principal_id IS NULL;
UPDATE ai_agent_runs SET triggered_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE triggered_by_principal_id IS NULL;
UPDATE ai_approvals SET reviewed_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE reviewed_by_principal_id IS NULL;
UPDATE workflow_interaction_tasks SET resolved_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE resolved_by_principal_id IS NULL;
UPDATE ai_media_candidates SET reviewed_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE reviewed_by_principal_id IS NULL;
UPDATE ai_feedback SET created_by_principal_id=(SELECT principal_id FROM ai_identity_backfill_owner) WHERE created_by_principal_id IS NULL;
