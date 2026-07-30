ALTER TABLE post_versions ADD COLUMN IF NOT EXISTS category_id BIGINT;
ALTER TABLE post_versions ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE post_versions ADD COLUMN IF NOT EXISTS cover_alt VARCHAR(255);
ALTER TABLE post_versions ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
ALTER TABLE post_versions ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE OR REPLACE FUNCTION capture_post_version() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD.title, OLD.slug, OLD.summary, OLD.content, OLD.tags, OLD.category_id, OLD.cover_url, OLD.cover_alt, OLD.seo_title, OLD.seo_description, OLD.status, OLD.published_at, OLD.scheduled_at)
       IS DISTINCT FROM
       ROW(NEW.title, NEW.slug, NEW.summary, NEW.content, NEW.tags, NEW.category_id, NEW.cover_url, NEW.cover_alt, NEW.seo_title, NEW.seo_description, NEW.status, NEW.published_at, NEW.scheduled_at) THEN
        INSERT INTO post_versions (
            post_id, title, slug, summary, content, tags, category_id, cover_url, cover_alt,
            seo_title, seo_description, status, published_at, scheduled_at
        )
        VALUES (
            OLD.id, OLD.title, OLD.slug, COALESCE(OLD.summary, ''), OLD.content, OLD.tags,
            OLD.category_id, OLD.cover_url, OLD.cover_alt, OLD.seo_title, OLD.seo_description,
            OLD.status, OLD.published_at, OLD.scheduled_at
        );
        DELETE FROM post_versions
        WHERE post_id = OLD.id AND id NOT IN (
            SELECT id FROM post_versions WHERE post_id = OLD.id ORDER BY created_at DESC, id DESC LIMIT 50
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

