# Confidential BFF protocol-verification hardening — 2026-10-14

This batch continues [A+ quality gate #359](https://github.com/rushairer/gouno-blog/issues/359) after the exact OIDC logout callback and redaction fix [#360](https://github.com/rushairer/gouno-blog/pull/360).

## Problem and scope

The BFF already had useful Redis/middleware mocks and OAuth utility assertions, but `internal/authbff` measured **56.2%** in accepted CI #38386234532, below the **80% A+ target**. In particular, assertions on `SafeReturnTo`, signed-test-header formatting or fixtureless Redis credentials alone cannot prove the **combined** discovery → PKCE → code exchange → ID-token validation → BFF cookie/MFA evidence → step-up → refresh/logout boundary.

The change adds a **local TLS OIDC issuer fixture** implemented in the `authbff` test package. It serves discovery metadata, dynamically generated RSA JWKS, real RS256 ID/logout JWTs, token exchanges and token revocation. The fixture connects via a pinned local TLS test client and disposable in-process Redis; no provider credentials or public network endpoints are used. Production implementation and the GOSSO release compatibility contract remain unmodified.

## Verified behaviors that tests must establish

1. Discovery rejects missing RFC 9207 issuer support, mismatched issuer, non-HTTPS or cross-origin authorization/token/JWKS/logout/revocation endpoints; valid issuer metadata is accepted.
2. A full signed callback requires **OAuth S256 PKCE**, exact state and authorization-response issuer, one-time flow consumption, verified issuer/audience/nonce, nonempty subject and strong ACR/AMR. Rejected callbacks cannot exchange a token before state/issuer validation or create a Redis session on a bad ID token.
3. A callback establishes only a server-side encrypted session, bound to an opaque Host-only Secure/HttpOnly cookie. Recent MFA evidence is written only after an interactive signed callback; `/api/auth/me` and the projected middleware claims expose neither provider access/refresh nor raw ID tokens.
4. A fresh signed step-up preserves the original absolute session creation timestamp, rotates handles atomically and invalidates both old session and old-handle MFA evidence. A step-up signed for another subject cannot rotate the original session.
5. Refresh against real signed replacement ID tokens cannot resurrect a session deleted by an interleaved logout; the would-be replacement token is revoked. A new ID token with a different subject cannot change the existing session identity. The refresh HTTP response remains limited to `ok` and `expires_at`.
6. Signed back-channel logout deletes only sessions matching the verified issuer/SID (or fallback issuer/subject), rejects replay, rejects malformed event/type/nonce/timestamp/audience/issuer and reports Redis persistence failures through a stable bounded HTTP error.
7. The CI `authbff` ratchet increases from **50% to 55%**, based on the already independently measured 56.2% floor. The A+ target stays at 80%. A further increase requires a final-head measurement, not an estimate.

## Merge gate

Complete checks on the exact final PR head, including Go 1.27.2 `go test ./...`, `go test -race ./...`, `go vet ./...`, `go mod verify`, `govulncheck`, real disposable PostgreSQL without skipped required tests and without failed false-green probes, Seed and frontend quality, Compose/dependency review, all three multiarch images with Trivy/Grype, Gosso Release BFF Compatibility, and Blog Showcase Parity.

Treat unexpected failures as potential fixture/implementation or policy problems and correct them on the PR branch; never relax production verification or accept insecure mocks to meet a coverage number. Record the actual final-head coverage and downloaded database artifact before merging. No automatic change to production Go OAuth client behavior is implied by a passing test.
