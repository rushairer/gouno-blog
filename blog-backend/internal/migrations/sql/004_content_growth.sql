CREATE TABLE IF NOT EXISTS post_versions (
    id BIGSERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL,
    published_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_versions_post_created
ON post_versions (post_id, created_at DESC);

CREATE OR REPLACE FUNCTION capture_post_version() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD.title, OLD.slug, OLD.summary, OLD.content, OLD.tags, OLD.status, OLD.published_at, OLD.scheduled_at)
       IS DISTINCT FROM
       ROW(NEW.title, NEW.slug, NEW.summary, NEW.content, NEW.tags, NEW.status, NEW.published_at, NEW.scheduled_at) THEN
        INSERT INTO post_versions (post_id, title, slug, summary, content, tags, status, published_at, scheduled_at)
        VALUES (OLD.id, OLD.title, OLD.slug, COALESCE(OLD.summary, ''), OLD.content, OLD.tags, OLD.status, OLD.published_at, OLD.scheduled_at);
        DELETE FROM post_versions
        WHERE post_id = OLD.id AND id NOT IN (
            SELECT id FROM post_versions WHERE post_id = OLD.id ORDER BY created_at DESC, id DESC LIMIT 50
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capture_post_version ON posts;
CREATE TRIGGER trg_capture_post_version
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION capture_post_version();

CREATE TABLE IF NOT EXISTS media_assets (
    id BIGSERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    storage_name VARCHAR(255) UNIQUE NOT NULL,
    url TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    alt_text VARCHAR(255) NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets (created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    post_id INT REFERENCES posts(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    actor_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_post_created
ON analytics_events (post_id, created_at DESC);
