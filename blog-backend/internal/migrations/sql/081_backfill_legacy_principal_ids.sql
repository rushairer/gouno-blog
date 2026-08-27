DO $$
DECLARE
    owner_principal_id BIGINT;
BEGIN
    SELECT p.id INTO owner_principal_id
    FROM blog_principals p
    JOIN blog_memberships m ON m.principal_id = p.id
    JOIN blog_role_bindings r ON r.membership_id = m.id
    WHERE r.role = 'owner'
    ORDER BY p.id ASC
    LIMIT 1;

    IF owner_principal_id IS NOT NULL THEN
        UPDATE posts SET created_by_principal_id = owner_principal_id WHERE created_by_principal_id IS NULL;
        UPDATE posts SET updated_by_principal_id = owner_principal_id WHERE updated_by_principal_id IS NULL;
        UPDATE media_assets SET created_by_principal_id = owner_principal_id WHERE created_by_principal_id IS NULL;
        UPDATE media_assets SET updated_by_principal_id = owner_principal_id WHERE updated_by_principal_id IS NULL;
        UPDATE pages SET created_by_principal_id = owner_principal_id WHERE created_by_principal_id IS NULL;
        UPDATE pages SET updated_by_principal_id = owner_principal_id WHERE updated_by_principal_id IS NULL;
    END IF;
END $$;
