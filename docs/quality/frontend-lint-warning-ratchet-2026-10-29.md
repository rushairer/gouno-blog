# Frontend React/Oxlint warning monotone ratchet — 2026-10-29

Status: **candidate pending exact-head CI and source review**. Baseline `main`: `90d35256783ffeda9f4c546b3ea2784d64b0e45c`.

## Why

The prior A+ main passed Oxlint despite **66 warnings** (0 errors), including React effect/render/Hook correctness findings, Fast Refresh mixed exports and a demonstrably unused import. CI did not enforce a numerical warning budget, allowing warning growth while remaining green. Blanket lint suppression or blindly modifying certified Product-owned React components would violate manual-first Showcase parity and could introduce behavioral regressions.

## Bounded correction

- Remove only the unused `SUDO_MAX_AGE_MS` import from `src/hooks/__tests__/useSudoMode.test.ts`, preserving the actual public Sudo hook, MFA contract and all test assertions. Expect the next measured warning count to drop **66 -> 65**; this is a measured target requiring CI confirmation, not a hand-waved claim.
- Wire `npm run lint` through a fail-closed script invoking the same pinned local `oxlint` binary with unchanged default target selection. Require exactly one recognizable warning/error count, successful tool exit and at most 65 warnings. Retain all diagnostic output. `npm run quality` and `npm run check` both exercise this guard and the native Node parser/false-green unit probes.
- Treat 65 as a **ceiling, not a completion threshold**. Lower monotonically as independently validated fixes land. Never increase the cap to make unrelated CI green. Existing React warnings in `verified` Product ownership remain pending real behavior fixes and manual-first Canonical Showcase/Product recertification; no such owned path is changed in this batch.
- No dependency changes, UI JSX/CSS, Connector product, BFF, API, database migration or published frontend visual changes.

## Acceptance / explicit limitations

Require final PR head Go/backend/Seed quality, real PostgreSQL required integration with zero skips, npm format/lint/ratchet unit/TypeScript/Vitest/build, three image builds plus Trivy+Grype, GOSSO BFF and 86 Showcase parity contracts. Product UI visual certification is not reasserted merely because the code and linter pass. This moves a measurable frontend quality gate but **does not close** the outstanding 65 warnings or project-wide #359/#338. Production RUM, response taint analysis, operator drills and complete A+ risk signoff remain pending.
