-- Re-run the latest published-post checks once with the current checker. This
-- refreshes historical HEAD-only results without deleting link or suggestion
-- audit rows.
UPDATE ai_link_health_jobs j
SET status='queued', attempts=0, available_at=NOW(), claimed_at=NULL,
    finished_at=NULL, error_code=NULL
FROM posts p
WHERE j.post_id=p.id
  AND p.status='published'
  AND j.status='succeeded'
  AND j.version_key=encode(digest(concat_ws('|', p.id::text, p.updated_at::text, p.content), 'sha256'), 'hex');
