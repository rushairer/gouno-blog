-- System notifications are not necessarily attached to a community post.
ALTER TABLE notifications ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(180);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS href VARCHAR(300);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_system_dedupe
    ON notifications (recipient_subject, type, event_key)
    WHERE event_key IS NOT NULL;
