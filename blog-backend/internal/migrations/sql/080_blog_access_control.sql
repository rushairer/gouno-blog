CREATE TABLE IF NOT EXISTS blog_principals (
    id BIGSERIAL PRIMARY KEY,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS blog_memberships (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL UNIQUE REFERENCES blog_principals(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
    authorization_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_role_bindings (
    membership_id BIGINT NOT NULL REFERENCES blog_memberships(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'author', 'moderator')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (membership_id, role)
);

CREATE TABLE IF NOT EXISTS blog_authorization_audits (
    id BIGSERIAL PRIMARY KEY,
    actor_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL,
    target_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    session_id TEXT NOT NULL DEFAULT '',
    request_id TEXT NOT NULL DEFAULT '',
    source_ip TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_memberships_status ON blog_memberships(status);
CREATE INDEX IF NOT EXISTS idx_blog_authorization_audits_target_created ON blog_authorization_audits(target_principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_authorization_audits_created ON blog_authorization_audits(created_at DESC);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS updated_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS updated_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL;
