-- Preserve existing Blog principals while moving the trusted runtime issuer.
-- This migration is additive and idempotent: memberships, roles and audit rows
-- remain attached to their existing principal IDs. A subject that is already
-- associated with a different principal under the new issuer is unsafe to
-- merge automatically, so abort before making any partial changes.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM blog_principal_identities AS legacy
        JOIN blog_principal_identities AS current
          ON current.issuer = 'https://sso.io84.com'
         AND current.subject = legacy.subject
        WHERE legacy.issuer = 'https://io84.com'
          AND current.principal_id <> legacy.principal_id
    ) THEN
        RAISE EXCEPTION
            'cannot add SSO issuer aliases: a subject is mapped to different principals';
    END IF;
END $$;

INSERT INTO blog_principal_identities (principal_id, issuer, subject)
SELECT principal_id, 'https://sso.io84.com', subject
FROM blog_principal_identities
WHERE issuer = 'https://io84.com'
ON CONFLICT (issuer, subject) DO NOTHING;
