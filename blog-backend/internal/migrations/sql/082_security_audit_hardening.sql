-- Add result column to blog_authorization_audits
ALTER TABLE blog_authorization_audits ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT 'success';
CREATE INDEX IF NOT EXISTS idx_blog_authorization_audits_result ON blog_authorization_audits(result);
