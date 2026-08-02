WITH targets AS (
    SELECT w.id,w.current_version,v.input_schema,v.steps,v.scope_policy,v.created_by
    FROM ai_workflows w
    JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
    WHERE w.template_key IN ('scheduled_post_publish_review','scheduled_reported_comment_review','scheduled_missing_alt_review')
      AND COALESCE((v.steps->1->>'continue_on_error')::boolean,FALSE)=FALSE
), bumped AS (
    UPDATE ai_workflows w
    SET current_version=w.current_version+1,updated_at=NOW()
    FROM targets t
    WHERE w.id=t.id
    RETURNING w.id,w.current_version
)
INSERT INTO ai_workflow_versions(workflow_id,version,input_schema,steps,scope_policy,created_by)
SELECT b.id,b.current_version,t.input_schema,
    jsonb_set(t.steps,'{1,continue_on_error}','true'::jsonb,TRUE),
    t.scope_policy,t.created_by
FROM bumped b
JOIN targets t ON t.id=b.id;
