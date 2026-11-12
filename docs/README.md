# Gouno Blog documentation — canonical navigation

This directory contains **current contracts** and **historical evidence**. They are deliberately distinct. Code, dependency manifests and deployment configurations are authoritative when describing current behavior; dated records retain the state observed at their capture time.

## Current architecture and security contracts

- [As-Is system architecture, annotated flow and SVG](architecture/README.md) — Public Blog + Blog Admin (one React SPA), Go backend embedding Confidential BFF, separate GOSSO and GOSSO Admin, Caddy, PostgreSQL/Redis.
- [Identity/SDK/transport boundary](auth-client-boundary.md) — current BFF mode, session and local-authorization rules.
- [OIDC/BFF architecture decision](oidc-bff-split-adr.md) — normative split-origin and OAuth client constraints.
- [AI workflow design](ai-workbench-automation-plan.md) — compare with current code before implementing changes.
- [Agent approval incident recovery](quality/agent-approval-in-doubt-recovery.md) and [manual media recovery](quality/media-generation-manual-recovery.md) — operational runbooks; do not replace them with dated incident reports.
- [Current release's immutable manifest](releases/release-manifest-v1.6.0.md) and root [Release Checklist](../RELEASE_CHECKLIST.md). Release publication is not evidence of Staging or production deployment.

## Historical plans and evidence — not today's work queue

- [September A+ quality roadmap](quality/roadmap.md), [original quality baseline](quality/baseline.md), and [Q task cards](quality/tasks/) preserve the 2026-09 execution plan; their pre-merge states do **not** re-open already shipped features.
- [Original UI redesign plan](ui-redesign/PLAN.md), [stage task cards](ui-redesign/tasks/), [phase prompts](ui-redesign/PHASE-PROMPTS.md) and [migration ledger](ui-redesign/migration.json) preserve earlier UI migration scope. Current parity certification is tracked in [showcase-parity-certifications.json](ui-redesign/showcase-parity-certifications.json) and the Gouno UI canonical owner; completion of a historical stage is not manual product certification.
- `quality/*-2026-*.md`, `ui-redesign/*-review*.md`, dated recertifications and machine-readable JSON receipts are **point-in-time audit evidence**. Preserve their original findings, even when later releases have changed status. Use current release manifests or source code to evaluate the present.
- [November 2026 release exception](quality/release-exception-2026-11-11.md): publication was permitted while manual Showcase and external Staging remained unverified; do not turn a waiver into a passing result.

## Hygiene rules

- Use **`docs/` only** for handwritten current documentation. The former `doc/` has been consolidated into `docs/releases/`.
- Keep release-specific manifests and immutable evidence versioned; do not rewrite `CHANGELOG` history to represent current branch state.
- Separate **current tasks** from **dated task receipts**. Before recycling an old TODO, confirm the feature is actually absent in current code and that no newer certification supersedes it.
- When moving documentation, update Markdown relative links, README entrypoints, scripts and CODEOWNERS as needed.
