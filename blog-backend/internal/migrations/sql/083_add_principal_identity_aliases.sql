-- Preserve the original identity columns on blog_principals as durable identity
-- records. New issuer identities are attached additively to the stable Blog
-- principal instead of rewriting or deleting existing identity data.
CREATE TABLE IF NOT EXISTS blog_principal_identities (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL REFERENCES blog_principals(id) ON DELETE CASCADE,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer, subject)
);

INSERT INTO blog_principal_identities (principal_id, issuer, subject, created_at, last_seen_at)
SELECT id, issuer, subject, created_at, last_seen_at
FROM blog_principals
ON CONFLICT (issuer, subject) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_blog_principal_identities_principal
    ON blog_principal_identities(principal_id);
