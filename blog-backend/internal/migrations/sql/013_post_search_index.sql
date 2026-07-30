ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS search_document TSVECTOR;

CREATE OR REPLACE FUNCTION update_post_search_document() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_document := to_tsvector(
        'simple',
        concat_ws(' ', NEW.title, NEW.summary, NEW.content, array_to_string(NEW.tags, ' '))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE posts SET search_document = to_tsvector(
    'simple',
    concat_ws(' ', title, summary, content, array_to_string(tags, ' '))
);

ALTER TABLE posts ALTER COLUMN search_document SET NOT NULL;

DROP TRIGGER IF EXISTS posts_search_document_update ON posts;
CREATE TRIGGER posts_search_document_update
BEFORE INSERT OR UPDATE OF title, summary, content, tags ON posts
FOR EACH ROW EXECUTE FUNCTION update_post_search_document();

CREATE INDEX IF NOT EXISTS idx_posts_search_document_published
    ON posts USING GIN (search_document)
    WHERE status = 'published';
