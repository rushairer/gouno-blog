# Confidential BFF fail-closed cases and 80% ratchet — 2026-10-14

Preceding [#361](https://github.com/rushairer/gouno-blog/pull/361) merged signed TLS OIDC contract tests and measured `internal/authbff` **76.5%** against its 80% A+ package target. [A+ checklist #359](https://github.com/rushairer/gouno-blog/issues/359) remains the project-wide release decision, while [#338](https://github.com/rushairer/gouno-blog/issues/338) independently tracks AI approval/media recovery limitations.

## Additional security evidence

- **Mounted keyset**: missing and malformed Tink secret JSON must fail closed; a real valid AES-256-GCM keyset round-trips without exposing plaintext, and rejects wrong associated data.
- **Login and MFA Step-Up**: malicious `return_to`, missing/guessed flow cookie, absent/wrong-issuer/expired session and unregistered local destination may never allocate a new flow or trigger an upstream token call. A valid flow must issue an opaque Secure/HttpOnly Host-only cookie, S256 challenge and server-side flow record.
- **RP-initiated logout**: a real confidential session is removed before registered callback navigation, the browser cookie is cleared, no token is emitted in the OP logout URL, and logout state is accepted exactly once then rejected on replay with `Cache-Control: no-store`.
- **Session middleware**: nonexistent, wrong-issuer, expired-absolute-TTL and unrefreshable sessions must not install trusted claims; invalid cookies are securely cleared, and expired session records are deleted. A missing cookie never creates a session.
- **Redis storage input validation**: invalid sessions, missing handles, duplicate OAuth flow state, nonexistent session replacement/rotation, same-handle rotation and malformed replay/lease input all fail without recreating a logged-out session.
- **Refresh**: missing session, expired absolute lifetime and missing refresh token cannot dispatch any upstream token-exchange request. Retired direct MFA submission cannot reappear.

## Acceptance

The batch raises the `internal/authbff` ratchet from verified **55%** to the original **80% A+ target**, without changing the other coverage guards. This is intentionally a *failing gate* until all final-head tests prove the target is met; do not lower it to force acceptance.

Before merge, record the actual coverage, Go 1.27.2 backend and Seed tests/race/vet/module verification/govulncheck, disposable PostgreSQL required test inventory (zero missing/fail/skip; false-green probes), frontend/Compose/dependency-review, all three multiarch image builds with Trivy and Grype, Gosso Release BFF Compatibility and Showcase Parity. No Connector/UI/authorization/Provider production behavior, session refresh algorithm or image/media recovery logic is changed.

Even if `authbff >= 80%`, full-project A+ is not established until frontend lint/performance, controller exposure, manual operator recovery and final release assessment are independently accepted in #359.
