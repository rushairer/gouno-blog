# Owner/membership transaction and error-boundary hardening — 2026-10-13

## Why this is an A+ release blocker

Read-only review of current `main` after #357 identified two high-trust authorization defects in `internal/access`:

1. `Service.SetMember` wrote `blog_principals.display_name`, and could INSERT a new membership, **before** rejecting a non-Owner actor's attempt to modify an existing Owner or grant the Owner role. The denial path then inserted its audit and explicitly `Commit`ted the transaction. A nominally rejected request could therefore persist target business changes. A rejection event must never launder prior writes into a commit.
2. `Service.TransferOwner` used `GROUP BY ... FOR UPDATE` on an aggregate membership/roles query. PostgreSQL does not permit row locking of the grouped result. The path also trusted an Owner snapshot after acquiring the transaction lock without re-reading the actor's current role; a concurrent Owner transfer could make the snapshot stale.
3. Privileged `UpdateMember` and `TransferOwner` handlers returned raw service `err.Error()`. A failed PostgreSQL/audit transaction was mapped to 400/403 and could expose SQL or infrastructure details to HTTP clients rather than reporting a safe 5xx.

## Trusted boundary and implementation

- Keep `BlogAccess` / exact issuer + subject / fresh authenticated local identity and recent MFA unchanged. No Provider-supplied role or scope becomes a Blog permission.
- Both mutations acquire the same PostgreSQL authorization advisory lock and **check its error**. `SetMember` reloads active actor status and current roles inside the locked transaction; `TransferOwner` locks real target/actor membership rows and then queries roles separately. The live actor must still have Owner before any transfer write.
- `SetMember` reads target state without side effects, checks the Owner restriction, and only then writes display-name, new membership and roles. A denied Owner operation may commit its denial audit, but never a business write. Audit INSERT/COMMIT failure is returned, not suppressed.
- Unexpected service/storage failures go through `controllerutil.WriteDomainError` and its fixed internal-server-error HTTP envelope and trusted logging. Only explicit typed Access sentinels produce fixed HTTP 400/403 messages. Wrapped private service details are never reflected.
- Existing successful behavior, Owner safety invariant (at least one active Owner), audit success record and full transaction rollback semantics remain unchanged.

## Required regression evidence

- `internal/access/membership_mutation_integration_test.go` must execute on the repository's migrated, disposable PostgreSQL gate (no skip). It verifies **a denied Admin cannot change Owner display-name or roles/status**, nor create a new membership while trying to grant Owner; separately committed denial audits remain correct.
- The same real PostgreSQL test verifies successful Owner transfer using valid row locks, one transfer audit, correct role demotion/promotion and a **stale former-Owner snapshot rejected** both for subsequent Owner transfer and attempted Owner grant.
- `internal/access/controller/controller_security_test.go` verifies HTTP 400/403/500 classification and redaction even if errors are wrapped with an attacker-controlled/secret diagnostic marker. Raw SQL and credentials must not appear in responses.
- Re-run full CI (Go module verify/test/race/vet/govulncheck, Seed, frontend, PostgreSQL audit artifacts), the backend/frontend/seed image builds and both scanners, Gosso BFF Compatibility and Blog Showcase Parity on the exact PR final head. No Connector behavior changes and no quality gate waivers.

## Explicit limitations

This patch resolves the specific authorization/commit and response-redaction defect; it does **not** prove global protection from arbitrary stale sessions in other capabilities, rollback across remote stores, or overall A+ certification. Owner transfers and their PostgreSQL COMMIT acknowledgements remain operationally significant; never automatically replay a transfer after an ambiguous response. Security operations should consult independently persisted current membership/audit state before attempting another transfer.

Before claiming full A+ readiness, evaluate remaining `authbff` coverage gap (51.9% against stated 80% target), 74 frontend lint warnings, render/bundle performance and Issue #338's remaining operational recovery scope.
