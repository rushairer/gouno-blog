-- Read-only operator triage: candidates, not proof of abandonment or replay safety.
-- Run in a read-only transaction with a short statement timeout (see runbook).
WITH candidates AS MATERIALIZED (
    SELECT id, workflow_id, workflow_version_id, started_at, created_at,
           retry_of_run_id, input_tokens, output_tokens
    FROM ai_workflow_runs
    WHERE status = 'running'
      AND (started_at IS NULL OR started_at <= statement_timestamp() - INTERVAL '15 minutes')
    ORDER BY COALESCE(started_at, created_at), id
    LIMIT 100
)
SELECT c.id, c.workflow_id, c.workflow_version_id, c.started_at, c.created_at,
       c.retry_of_run_id, c.input_tokens, c.output_tokens,
       (SELECT COUNT(*) FROM ai_workflow_step_runs s WHERE s.workflow_run_id = c.id) AS checkpoint_count,
       (SELECT COUNT(*) FROM ai_agent_runs a WHERE a.workflow_run_id = c.id) AS child_agent_count,
       (SELECT COUNT(*) FROM ai_agent_runs a WHERE a.workflow_run_id = c.id
          AND a.status IN ('queued', 'running', 'awaiting_approval')) AS active_child_count,
       (SELECT COUNT(*) FROM workflow_interaction_tasks t WHERE t.workflow_run_id = c.id
          AND t.status = 'pending') AS pending_interaction_count,
       (SELECT COUNT(*) FROM ai_workflow_retry_admissions a WHERE a.source_run_id = c.retry_of_run_id
          AND a.retry_run_id = c.id) AS owned_retry_indices
FROM candidates c
ORDER BY COALESCE(c.started_at, c.created_at), c.id;
