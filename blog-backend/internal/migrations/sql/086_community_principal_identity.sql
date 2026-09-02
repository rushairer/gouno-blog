ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_principal_id BIGINT REFERENCES blog_principals(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_principal_id BIGINT REFERENCES blog_principals(id);

CREATE TEMP TABLE community_identity_owner ON COMMIT DROP AS
SELECT p.id AS principal_id FROM blog_principals p
JOIN blog_memberships m ON m.principal_id=p.id AND m.status='active'
JOIN blog_role_bindings r ON r.membership_id=m.id AND r.role='owner'
ORDER BY p.created_at,p.id LIMIT 1;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM community_identity_owner) THEN
        RAISE EXCEPTION 'community principal migration requires at least one active owner';
    END IF;
END $$;
CREATE TEMP TABLE community_unique_subject ON COMMIT DROP AS
SELECT subject,MIN(principal_id) principal_id FROM blog_principal_identities
GROUP BY subject HAVING COUNT(DISTINCT principal_id)=1;

UPDATE comments c SET author_principal_id=i.principal_id FROM community_unique_subject i
WHERE c.author_subject=i.subject AND c.author_type='user' AND c.author_principal_id IS NULL;
UPDATE notifications n SET recipient_principal_id=i.principal_id FROM community_unique_subject i
WHERE n.recipient_subject=i.subject AND n.recipient_principal_id IS NULL;
UPDATE comments SET author_principal_id=(SELECT principal_id FROM community_identity_owner)
WHERE author_type='user' AND author_principal_id IS NULL;
UPDATE notifications SET recipient_principal_id=(SELECT principal_id FROM community_identity_owner)
WHERE recipient_principal_id IS NULL;

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
