# A+ dependency patch and non-Product Lint ratchet — 2026-10-29

Status: **candidate until exact-head CI, image scans and browser gates pass**. Base: `3597c5bd148a5ac972c0586c7aae301d1a319269`.

## Exact dependency provenance

- [Dependabot #374](https://github.com/rushairer/gouno-blog/pull/374) supplies **exactly** its `seed/go.mod` and matching `seed/go.sum` blobs: `golang.org/x/crypto` 0.57.0 → 0.58.0, plus transitive `x/sync` 0.24.0, `x/sys` 0.49.0, `x/text` 0.43.0. No edits to Seed application logic.
- [Dependabot #370](https://github.com/rushairer/gouno-blog/pull/370) supplies **exactly** its `blog-frontend/e2e/package.json` and matching integrity-bearing `package-lock.json`: `@playwright/test`, `playwright`, `playwright-core` 1.64.0 → 1.64.1. Product runtime and `@gouno/ui` version unchanged.
- The historical Dependabot PR heads are not directly merged into current main. They can be closed as superseded **only after** this batch's exact updates pass all gates and are merged. #378 backend-Go/Tink and #384 frontend React/Oxlint remain separate.

## Four proven non-Product warnings

The prior merged main had an enforced **65-warning** Oxlint budget. The following four warnings were isolated outside the certified React Product ownership:
1. Remove one unused `rect = node.getBoundingClientRect()` read inside the Playwright `layoutFingerprint` callback. Its return value is **not** used, and fingerprints still record the identical computed CSS fields.
2. In the UI-contract regex character class, use `[,)]` instead of `[,\\)]`, which matches exactly the same set of comma/right-parenthesis characters.
3. Remove two unnecessary `\\"` quote escapes inside one template string used to check direct `@radix-ui` imports; its evaluated string is unchanged.

The cap is tightened **65 → 61**, without suppressing any lint rule, reducing tests, or promoting outstanding React warnings as fixed. CI must reproduce **61 warnings / 0 errors**; a discrepancy fails the existing summary-verified monotone gate. UI-contract/Showcase/Chromium parity must stay green so a parser change cannot silently weaken canonical checks.

No production JSX/CSS, component, Connector module, OAuth BFF, token handling, policy or migrations changed.

## Acceptance evidence to record after final-head checks

- Verify `go mod verify` for Seed and backend; Go tests, race, vet and govulncheck; 21-packages/115-required disposable PostgreSQL integration (zero fail/skip/missing).
- Verify the exact Playwright lockfile with `npm ci`; all real Product Chromium tests plus Showcase parity's 86 comparisons.
- Verify frontend quality: six lint-budget false-green probes, warning count 61/61, TypeScript/Vitest/coverage/chunk/contract gates.
- Require all three image builds and all **six** Trivy/Grype scan steps.
- Separate premerge exact-head acceptance from main postmerge CI/publish status and live production deployment.

Remaining project A+ blockers: 61 actual React/Product lint warnings (most need manual-first UX parity before refactor), frozen Connector JSON error transport, #338 exact-once/approval operator recovery, full indirect HTTP error analysis, outstanding dependency refreshes, release security/risk signoff, and production CWV/RUM evidence. Do not close #359 or #338 based only on this narrow batch.
