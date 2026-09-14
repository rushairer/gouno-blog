-- Content revisions are independent of interaction counters. The trigger also
-- covers taxonomy updates, scheduling, and FK-driven category changes.
ALTER TABLE posts ADD COLUMN revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE FUNCTION advance_post_revision() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(OLD.title, OLD.slug, OLD.summary, OLD.content, OLD.tags, OLD.category_id,
           OLD.cover_url, OLD.cover_alt, OLD.seo_title, OLD.seo_description,
           OLD.status, OLD.published_at, OLD.scheduled_at, OLD.revision)
       IS DISTINCT FROM
       ROW(NEW.title, NEW.slug, NEW.summary, NEW.content, NEW.tags, NEW.category_id,
           NEW.cover_url, NEW.cover_alt, NEW.seo_title, NEW.seo_description,
           NEW.status, NEW.published_at, NEW.scheduled_at, NEW.revision) THEN
        NEW.revision := OLD.revision + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER advance_post_revision BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION advance_post_revision();
