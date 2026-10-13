# Dependency alignment and A+ closure gate — 2026-10-13

This batch consolidates the Dependabot updates proposed in #347, #348, #349, #350 and #351 **against the protected, patched main baseline** `019a6dd711c4c97e192f699f78d49b07f20544d7`. This is a dependency-only maintenance change. It does not certify the product as A+ or close Issue #338.

## Provenance and bounded changes

All 13 modified dependency/CI files exactly match their respective Dependabot head blobs; no manual regeneration of hashes, archive URLs or GitHub Action commit pins. A main-versus-#346-base comparison established that these files had not changed during later security batches. The consolidation branch starts directly from the current main and introduces no historical code rollback.

| Source PR | Module | Upgrade |
| --- | --- | --- |
| #347 | `blog-frontend/e2e` | `@playwright/test` / Playwright / playwright-core 1.63.0 → 1.64.0, with npm integrity metadata |
| #348 | `blog-frontend` | lucide-react 1.53.0; react-i18next 17.0.16; `@vitejs/plugin-react` 6.1.2; oxlint 1.87.0; Vite 8.3.4 |
| #349 | `blog-backend` | AWS SDK v2 1.47.2; config 1.33.8; S3 1.114.2; go-redis/v9 9.23.0; x/sync 0.24.0 and Go-resolved indirect dependencies |
| #350 | `seed` | go-redis/v9 9.23.0 with its resolved Go module checksums and transitives |
| #351 | GitHub Actions | Immutable SHA updates of upload-artifact 7.0.2, download-artifact 8.0.2 and setup-node 7.1.0 |

The SHA-pinned GH Actions updates are confined to five existing workflow files. `@gouno/ui` remains exactly `0.4.9`, `@gosso/client` remains exactly `0.9.3` with registry lockfile integrity; TypeScript 7 CLI vs TypeScript 6 AST alias is unchanged, and Prettier remains at its deliberately pinned governance version.

Backend and Seed `go.mod` remain **Go 1.27.2**. Backend `golang.org/x/net` remains at **v0.60.0**, meeting the October HTTP/2 security floor. The updated go-redis 9.23.x introduces a dedicated pipeline pool: BFF `TxPipelined` paths deserve real regression/race testing, not just module-version matching. No Provider retries, Media recovery, Connector, UI composition, OAuth/session or deployment behavior is intentionally changed.

## Merge gate

The combined PR must run against its **final exact head**:

1. **CI**: Go backend/Seed tests, race, vet, module verification, govulncheck; PostgreSQL integration via disposable database with zero skip/missing/failed required tests; Frontend `npm ci`, audit and quality; E2E dependency `npm ci` and audit where the workflow owns them; Compose/deployment and dependency review.
2. **Images**: amd64/arm64 backend, frontend and Seed builds; both Trivy and Grype scans on all three images at the existing fixable HIGH/CRITICAL blocking policy.
3. **BFF Compatibility** and **Blog Showcase Parity**: pass without waiving authentication or canonical Showcase governance.
4. **UI Browser Acceptance**: execute real Playwright acceptance against updated Playwright 1.64, not merely enumerate tests.
5. Read the actual PostgreSQL artifact summary/event data, not just an overall green workflow badge.

If the combined gate fails, fix the specific compatibility defect on the consolidation branch, rerun on its new final head, and merge only after complete acceptance. Previous Dependabot PR workflow successes on outdated bases are supporting context, **not acceptance** for this combination.

## Remaining A+ closure criteria

- Do not equate a green CI or lint exit with warning-free frontend quality. The prior assessment documents 74 oxlint warnings and a large main chunk; measure the post-upgrade state and tackle issues through certified UI governance, not broad unreviewed edits.
- Continue reviewing historical controller error-to-client mapping for sensitive data exposure by capability, preserving the Connector Module Hold.
- Manual media-generation recovery records independent operator attestation and is attempt-fenced; it is not proof of Provider billing or cross-store atomicity. Keep #338 open until residual approval and incident-recovery guarantees are independently assessed.
- Respect `AGENTS.md` and split-domain Confidential BFF security constraints. This batch makes no change to the external Connector module.

Record final GitHub Actions run IDs, exact PR head, database-test evidence, findings and main merge SHA in the PR acceptance record. Do not claim this documentation alone proves those checks passed.
