ALTER TABLE ai_workflow_runs DROP CONSTRAINT IF EXISTS ai_workflow_run_status_check;
ALTER TABLE ai_workflow_runs ADD CONSTRAINT ai_workflow_run_status_check
    CHECK (status IN ('queued','running','waiting_for_user','awaiting_approval','succeeded','failed','cancelled'));
