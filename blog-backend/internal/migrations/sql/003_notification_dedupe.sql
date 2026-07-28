CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_reply_once
ON notifications (recipient_subject, type, comment_id)
WHERE comment_id IS NOT NULL;
