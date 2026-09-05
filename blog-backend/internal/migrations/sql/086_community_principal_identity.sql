ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_principal_id BIGINT REFERENCES blog_principals(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_principal_id BIGINT REFERENCES blog_principals(id);

SELECT blog_identity_apply('comments');
SELECT blog_identity_apply('notifications');

CREATE INDEX IF NOT EXISTS idx_comments_author_principal ON comments(author_principal_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_principal ON notifications(recipient_principal_id, read_at, created_at DESC);
DROP INDEX IF EXISTS idx_notifications_recipient;
DROP INDEX IF EXISTS idx_notifications_reply_once;
DROP INDEX IF EXISTS idx_notifications_system_dedupe;
CREATE UNIQUE INDEX idx_notifications_reply_once ON notifications(recipient_principal_id,type,comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_notifications_system_dedupe ON notifications(recipient_principal_id,type,event_key) WHERE event_key IS NOT NULL;
ALTER TABLE notifications ALTER COLUMN recipient_principal_id SET NOT NULL;
ALTER TABLE comments DROP COLUMN IF EXISTS author_subject;
ALTER TABLE notifications DROP COLUMN IF EXISTS recipient_subject;
