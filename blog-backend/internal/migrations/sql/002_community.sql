ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_subject TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_type VARCHAR(20) NOT NULL DEFAULT 'anonymous';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
UPDATE comments SET status = CASE WHEN is_visible THEN 'visible' ELSE 'pending' END
WHERE status = 'pending';
ALTER TABLE comments ADD CONSTRAINT comments_status_check
CHECK (status IN ('pending', 'visible', 'hidden')) NOT VALID;

CREATE TABLE IF NOT EXISTS post_reactions (
    id BIGSERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    actor_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, actor_key)
);

CREATE TABLE IF NOT EXISTS bookmarks (
    subject TEXT NOT NULL,
    post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject, post_id)
);

CREATE TABLE IF NOT EXISTS comment_reports (
    id BIGSERIAL PRIMARY KEY,
    comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    actor_key TEXT NOT NULL,
    reason VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (comment_id, actor_key)
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_subject TEXT NOT NULL,
    type VARCHAR(40) NOT NULL,
    post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    comment_id INT REFERENCES comments(id) ON DELETE CASCADE,
    actor_name VARCHAR(100) NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports (comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_subject, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_subject_created ON bookmarks (subject, created_at DESC);
