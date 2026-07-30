CREATE TABLE IF NOT EXISTS ai_link_health_jobs (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    version_key TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_link_health_job_status_check CHECK (status IN ('queued','running','succeeded','failed')),
    UNIQUE (post_id, version_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_link_health_jobs_claim
    ON ai_link_health_jobs (status, available_at, id);

CREATE TABLE IF NOT EXISTS ai_link_health_snapshots (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    url_hash VARCHAR(64) NOT NULL,
    status_code INT,
    ok BOOLEAN NOT NULL,
    error_code VARCHAR(80),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_link_health_broken
    ON ai_link_health_snapshots (ok, checked_at DESC);

CREATE OR REPLACE FUNCTION enqueue_ai_link_health_job() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' THEN
        INSERT INTO ai_link_health_jobs (post_id, version_key)
        VALUES (NEW.id, encode(digest(concat_ws('|', NEW.id::text, NEW.updated_at::text, NEW.content), 'sha256'), 'hex'))
        ON CONFLICT (post_id, version_key) DO NOTHING;
    ELSE
        DELETE FROM ai_link_health_snapshots WHERE post_id=NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_ai_link_health_enqueue ON posts;
CREATE TRIGGER posts_ai_link_health_enqueue
AFTER INSERT OR UPDATE OF content, status, updated_at ON posts
FOR EACH ROW EXECUTE FUNCTION enqueue_ai_link_health_job();

INSERT INTO ai_link_health_jobs (post_id, version_key)
SELECT id, encode(digest(concat_ws('|', id::text, updated_at::text, content), 'sha256'), 'hex')
FROM posts WHERE status='published'
ON CONFLICT (post_id, version_key) DO NOTHING;
