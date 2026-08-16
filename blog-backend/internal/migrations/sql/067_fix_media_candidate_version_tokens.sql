-- PostgreSQL's numeric-to-bigint cast rounds, while Go's Time.Unix truncates.
-- Use the same truncation rule for existing candidates that were certainly
-- created after the article's latest update; these candidates reference the
-- current article and were previously reported as stale by a rounding error.
UPDATE ai_media_candidates AS candidate
SET post_version_token = FLOOR(EXTRACT(EPOCH FROM post.updated_at))::bigint::text
FROM posts AS post
WHERE candidate.post_id = post.id
  AND candidate.applied_at IS NULL
  AND candidate.created_at >= post.updated_at
  AND candidate.post_version_token IS NOT NULL;
