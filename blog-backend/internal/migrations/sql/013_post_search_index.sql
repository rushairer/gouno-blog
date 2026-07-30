ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS search_document tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple', concat_ws(' ', title, summary, content, array_to_string(tags, ' ')))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_posts_search_document_published
    ON posts USING GIN (search_document)
    WHERE status = 'published';
