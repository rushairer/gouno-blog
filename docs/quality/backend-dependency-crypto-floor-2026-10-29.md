# A+ backend Go dependency group — no JOSE rollback (2026-10-29)

Status: **candidate; exact-head quality/security gates not yet accepted**. Starting main: `bfe28d72761502bfa6072e8454dff8f71c81cabc`. Original [Dependabot #378](https://github.com/rushairer/gouno-blog/pull/378) head `e8e72fa947fc84e5a99a1f2b598ae5de2e18d38f` is stale.

## Findings and safe reconciliation

Read-only comparison against the current main found **21** differing module requirements in that historical PR: **20 valid upgrades and one downgrade**. The obsolete dependency group would have changed `github.com/go-jose/go-jose/v4` **4.1.6 → 4.1.4** in a JWT/OIDC-sensitive chain. This is a confirmed version downgrade, not evidence of a specific reachable CVE. No force-merge or blind overwrite is permitted.

The new candidate reproduces the requested **20 upgrades** from the Dependabot `blog-backend/go.mod`, including miniredis 2.40.0, AWS SDK modules and Tink Go **2.9.0**. It retains `go-jose/v4 v4.1.6` from merged main. `go.sum` is based on the exact Dependabot checksum file plus the two exact existing main checksums for `go-jose v4.1.6`; no values or registry provenance were synthesized. No production Go source, BFF protocol, cookies, authentication, Connector, migration, UI layout or API surface changed.

The new `internal/authbff/crypto_dependency_floor_test.go` reads the actual backend `go.mod` and enforces fail-closed declared minimum versions for JOSE **v4.1.6** and Tink **v2.9.0**. Explicit negative probes reject the stale 4.1.4 downgrade, prior major, absent or duplicate module declarations, malformed/pre-release/unknown version strings, while accepting equal/newer released versions. This is **a minimum-version regression guard only**, not a complete cryptographic API audit or persisted cross-version ciphertext proof.

## Acceptance criteria (not waived)

- Go 1.27.3: `go mod verify`, tests/coverage, race, `go vet`, `govulncheck` with no reachable advisories, authbff >=80% enforced ratchet, signed TLS OIDC and mounted-keyset/AEAD tests, Seed build/quality.
- Disposable PostgreSQL migration and 115 required integration tests with zero fail/skip/missing, plus real BFF/GOSSO compatibility acceptance.
- Build backend/frontend/Seed Docker images and pass six Trivy/Grype scans; dependency-review and production Compose contracts.
- Showcase Parity if triggered; browser acceptance only when workflow path selection requires it.
- Validate against final PR head and current main SHA, then merge; do not close the historical Dependabot #378 until the 20 requested upgrades and protected v4.1.6 baseline are confirmed in merged main. Check main postmerge CI/publish separately.

Remaining A+ obligations include #359 final risk assessment, #338 operator recovery and external exactly-once limitations, frozen Connector transport gaps, residual 61 React/Lint warnings in certified Product UI, frontend dependency PR #384, production UI performance/observability and release go/no-go. Passing this dependency batch does not certify those areas.
