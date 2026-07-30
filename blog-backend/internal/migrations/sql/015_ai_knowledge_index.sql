CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_embedding_profiles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    model VARCHAR(160) NOT NULL,
    dimensions INT NOT NULL,
    api_key_ciphertext BYTEA,
    api_key_nonce BYTEA,
    api_key_last4 VARCHAR(4) NOT NULL DEFAULT '',
    key_version INT NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    request_timeout_seconds INT NOT NULL DEFAULT 60,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_embedding_dimensions_check CHECK (dimensions BETWEEN 64 AND 4096),
    CONSTRAINT ai_embedding_timeout_check CHECK (request_timeout_seconds BETWEEN 1 AND 600)
);

CREATE TABLE IF NOT EXISTS ai_content_index_jobs (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    action VARCHAR(16) NOT NULL DEFAULT 'upsert',
    version_key TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_content_index_job_action_check CHECK (action IN ('upsert', 'delete')),
    CONSTRAINT ai_content_index_job_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    UNIQUE (post_id, action, version_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_content_index_jobs_claim
    ON ai_content_index_jobs (status, available_at, id);

CREATE TABLE IF NOT EXISTS ai_content_chunks (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    embedding_profile_id BIGINT NOT NULL REFERENCES ai_embedding_profiles(id) ON DELETE RESTRICT,
    version_key TEXT NOT NULL,
    chunk_index INT NOT NULL,
    heading TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    start_offset INT NOT NULL,
    end_offset INT NOT NULL,
    search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector,
    embedding VECTOR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, embedding_profile_id, version_key, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_content_chunks_search
    ON ai_content_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_ai_content_chunks_post
    ON ai_content_chunks (post_id, embedding_profile_id, chunk_index);

CREATE OR REPLACE FUNCTION update_ai_content_chunk_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', concat_ws(' ', NEW.heading, NEW.content));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_content_chunks_search_vector_update ON ai_content_chunks;
CREATE TRIGGER ai_content_chunks_search_vector_update
BEFORE INSERT OR UPDATE OF heading, content ON ai_content_chunks
FOR EACH ROW EXECUTE FUNCTION update_ai_content_chunk_search_vector();

ALTER TABLE ai_agent_runs
    ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION enqueue_ai_content_index_job() RETURNS TRIGGER AS $$
DECLARE
    next_action TEXT;
    next_version TEXT;
BEGIN
    next_action := CASE WHEN NEW.status = 'published' THEN 'upsert' ELSE 'delete' END;
    next_version := encode(digest(
        concat_ws('|', NEW.id::text, NEW.status, NEW.updated_at::text, NEW.title, NEW.summary, NEW.content),
        'sha256'
    ), 'hex');
    INSERT INTO ai_content_index_jobs (post_id, action, version_key)
    VALUES (NEW.id, next_action, next_version)
    ON CONFLICT (post_id, action, version_key) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_ai_content_index_enqueue ON posts;
CREATE TRIGGER posts_ai_content_index_enqueue
AFTER INSERT OR UPDATE OF title, summary, content, status, updated_at ON posts
FOR EACH ROW EXECUTE FUNCTION enqueue_ai_content_index_job();

INSERT INTO ai_content_index_jobs (post_id, action, version_key)
SELECT id, 'upsert', encode(digest(
    concat_ws('|', id::text, status, updated_at::text, title, summary, content), 'sha256'
), 'hex')
FROM posts WHERE status = 'published'
ON CONFLICT (post_id, action, version_key) DO NOTHING;
