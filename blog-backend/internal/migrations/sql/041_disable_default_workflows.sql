-- System Workflow templates require an explicit operator review before use.
UPDATE ai_workflows
SET enabled=FALSE, next_run_at=NULL, updated_at=NOW()
WHERE template_key IN ('daily_news','weekly_operations','stale_content_refresh','low_engagement')
  AND deleted_at IS NULL;
