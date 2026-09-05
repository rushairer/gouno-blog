## Summary

Describe what changes and why. Keep the scope focused.

## Risk / boundary review

- [ ] No authentication, authorization, Cookie, CSRF, OAuth/OIDC, MFA, secret, SSRF, webhook, media-active-content, or CSP boundary changes.
- [ ] If a security/identity boundary changes, I updated the relevant tests and `doc/auth-client-boundary.md` / threat model / ADR as applicable.
- [ ] No provider token, API key, client secret, session identifier, personal data, or production credential is added to code, fixtures, logs, screenshots, or docs.

## Data and compatibility

- [ ] No database migration or persistent schema change.
- [ ] If migrations changed, clean-install and upgrade-path behavior were tested; released migrations were not edited in place.
- [ ] No public API, OpenAPI, Workflow schema, SDK contract, or deployment contract change.
- [ ] If a public/cross-repo contract changed, backward compatibility and release notes were addressed.

## UI / accessibility

- [ ] No user-facing UI change.
- [ ] If UI changed, shared primitives/tokens are used and UI contract checks pass.
- [ ] Keyboard, focus, labels, loading/error/empty states, mobile layout, and dark/light behavior were reviewed where relevant.

## Verification

- [ ] Backend: `go test ./...`
- [ ] Backend: `go test -race ./...`
- [ ] Backend: `go vet ./...`
- [ ] Backend: `go run golang.org/x/vuln/cmd/govulncheck@v1.6.0 ./...`
- [ ] Database integration (isolated Docker): `python3 scripts/check-db-integration.py` from repository root; required tests executed, with no missing or skipped cases.
- [ ] Frontend: `npm run quality` (includes UI and CSS contracts).
- [ ] Compose / authentication deployment contract checked when deployment or auth config changes.

## Architecture

- [ ] This change does not introduce a new oversized component/service/router/CSS patch layer.
- [ ] Architectural changes include or reference an ADR.
- [ ] AI Tool / Workflow / Connector changes preserve capability, approval, budget, idempotency, and audit boundaries as applicable.

## Release notes

User-visible or operator-visible impact:

<!-- Add CHANGELOG/release-note text, or write "None" with a short reason. -->
