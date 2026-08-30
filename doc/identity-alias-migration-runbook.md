# Cross-issuer Blog identity alias release runbook

This runbook applies when moving Blog authentication from one OIDC issuer to
another. It does not authorize a production change by itself.

## Safety model

An OIDC identity is `(issuer, subject)`. Equal subject strings, email addresses,
usernames, and display names are not mapping evidence. Preserve the existing
Blog principal, membership, role bindings, and audits; add an alias only after a
reviewer verifies a one-to-one mapping from an authoritative GOSSO account
export.

## Pre-release checks

1. Take and verify a database backup according to the production runbook.
2. On an offline copy, apply the new backend migrations and compare principal,
   membership, role-binding, and audit counts before and after.
3. Produce a reviewed mapping containing legacy issuer/subject, new
   issuer/subject, immutable GOSSO account identifier, reviewer, and evidence
   reference. Reject duplicate source or target identities.
4. Do not infer or bulk-create aliases from matching subject values.

## Approval operation

For every reviewed mapping, use the backend image locally in the operations
environment. This is intentionally not an HTTP endpoint.

```bash
gouno identity-alias-approve \
  --legacy-issuer 'https://io84.com' \
  --legacy-subject '<legacy-subject>' \
  --new-issuer 'https://sso.io84.com' \
  --new-subject '<authoritatively-mapped-subject>' \
  --approved-by '<reviewer-id>' \
  --evidence-reference '<immutable-ticket-or-export-reference>' \
  --confirm
```

The command atomically records the approval, inserts the alias, and writes a
Blog authorization audit. A target identity already attached to another
principal fails without changing either principal.

## Release gate queries

Run these read-only queries after approvals and before routing production Blog
traffic to the release.

```sql
-- Every cross-issuer alias must have a corresponding reviewed approval.
SELECT i.issuer, i.subject, i.principal_id
FROM blog_principal_identities AS i
LEFT JOIN blog_principal_identity_alias_approvals AS a
  ON a.principal_id = i.principal_id
 AND a.issuer = i.issuer
 AND a.subject = i.subject
WHERE i.issuer = 'https://sso.io84.com'
  AND EXISTS (
    SELECT 1 FROM blog_principal_identities AS legacy
    WHERE legacy.principal_id = i.principal_id
      AND legacy.issuer = 'https://io84.com'
  )
  AND a.id IS NULL;

-- No identity may be attached to more than one Blog principal.
SELECT issuer, subject, COUNT(DISTINCT principal_id)
FROM blog_principal_identities
GROUP BY issuer, subject
HAVING COUNT(DISTINCT principal_id) > 1;
```

Both result sets must be empty. Finally, compare the saved pre-release counts
for principals, memberships, role bindings, and audits, and test an approved
alias against the isolated local HTTPS topology before production routing.
