# 2026-10-30 A+ frontend npm dependency reconciliation and quality-contract defense

**State: review candidate; not a merged or A+ certified release.** Base main `313679f786f79131851ba20529d670c6b1159fc5`, historical Dependabot [#384](https://github.com/rushairer/gouno-blog/pull/384) head `41272183741d68fa76b2eabe622fc0a9491537d7`.

## Verified source and constraint

The historical Dependabot head currently reports 12 green checks, including Chromium 363/363 and Showcase 86/86. However its frontend job explicitly measured **65/65 Oxlint warnings**, so it is **not** a valid exact-head pass for the currently merged **61-warning** ratchet (#397). Its `package.json` scripts were subsequently reconciled to match main, but that old candidate was tested before the latest A+ tooling cleanup. Applying an older snapshot blindly cannot satisfy the current-main source and test identity.

This candidate copies **only** `blog-frontend/package.json` and the full npm integrity-bearing `package-lock.json` byte-for-byte from Dependabot's current checked head, leaving all other main files intact. The two manifest/script surfaces have been compared: `lint`, `lint:budget:test`, `quality`, `check`, Gouno UI **0.4.9**, pinned GOSSO client, TypeScript's dual CLI/AST aliases, and Prettier 3.8.5 remain unchanged. Upgrade surface: React/React DOM 19.3.1, i18next 26.5.11, react-i18next 17.1.9, Lucide 1.61.0, @testing-library/user-event 14.6.8, @types/node 24.19.2, @vitest/coverage-v8 5.0.5, jsdom 30.1.3, Oxlint 1.89.0, Vite 8.3.5 and integrity-locked transitive packages.

React runtime/DOM, icon catalogue, i18n and jsdom changes can affect layout or behavior even with **zero JSX/CSS changes**. This batch therefore triggers exact-new-head Product Chromium and Showcase style-pair checks, not an automatic manual visual certification.

## Root-cause prevention for future stale dependency PRs

`.github/workflows/ci.yml` now invokes a Python standard-library script **before any npm scripts** to assert the exact existing `lint`, `lint:budget:test`, `check`, and `quality` command chain and a monotone `maxAllowedWarnings <= 61`. Nine independently executed test cases with positive/negative subcases prove failure on lost probes, direct Oxlint bypass, missing check/quality coverage, old 65 budget, duplicate/missing limit and malformed manifests. The original Node native six-case false-green tests and the real Lint budget remain intact. This is a structural guard against accidental PR regression, not immunity from deliberate modification of both CI and its own guard.

## Required exact-head acceptance

- Node 24 LTS, integrity checked `npm ci` + `npm audit --audit-level=moderate`, all independent script probes, all six Node lint-guard tests, **no more than 61 Oxlint warnings and zero errors**, typecheck, Vitest/coverage, CSS/UI canonical contracts and 94 JS chunk budgets.
- **363/363** rendered Product Chromium scenarios + **86/86** Showcase paired style/fixtures. A real manually reviewed UI certification remains a separate requirement for any observed difference; automated comparison is not a replacement for design review.
- Backend + Seed Go tests/race/vet/vulnerability checks and real PostgreSQL **115** required tests with zero fail/skip/missing, plus GOSSO BFF Compatibility, production image contracts, three image builds and all six Trivy/Grype scans.
- Only after all check runs are green for the candidate **exact head** and main still equals the reviewed base, squash merge. Re-read main manifest and locked dependency versions. Close #384 with a linked supersession proof only if the merged files are identical to its head. Observe postmerge workflows separately.

**Still outside this scope:** 61 residual React/Hook warnings, #338 approval-recovery operator drills, the Connector product freeze and known raw JSON binding-error transport paths, final full HTTP transport/data-flow assurance, real-user CWV, production rollback drills, #359 A+ go/no-go. No A+ label is claimed by this dependency batch.
