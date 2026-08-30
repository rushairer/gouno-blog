-- Cross-issuer aliases require an externally verified, operator-recorded map.
-- This table does not rewrite a principal, membership, role binding, audit row,
-- or existing identity. It records the evidence for a separately approved alias.
CREATE TABLE IF NOT EXISTS blog_principal_identity_alias_approvals (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL REFERENCES blog_principals(id) ON DELETE RESTRICT,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    approved_by TEXT NOT NULL,
    evidence_reference TEXT NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer, subject),
    UNIQUE (principal_id, issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_blog_identity_alias_approvals_principal
    ON blog_principal_identity_alias_approvals(principal_id);
