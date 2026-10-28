# PostEditor delayed ACK and autosave — Manual-first review (2026-10-28)

Status: **needs-manual-recertification**

## Defect and scope

- Base main: `d068ecd554384ae10947db910c2c014eb8a7de9d` (#389 PageEditor closure). Canonical UI frozen ref: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`, npm `@gouno/ui` = 0.4.9.
- In PostEditor, prior `setPost(current => { ... dirty.current = ... })` mutated a ref from a React state updater. The save ACK then unconditionally called `setSavedAt(new Date())` even if the user had made further edits; UI prioritized savedAt over dirty. A delayed preview ACK blindly replaced newer content and opened the older post. The new-Post branch navigated even if post-dispatch edits existed and did not reliably retain the created identity. Autosave on uncertain failure could silently retry the same revision when `saving` returned false.
- Fix is Product-owned state/async only. A synchronous user-edit generation fences save results; React committed `isDirty` drives the visible status, and `dirty.current` only protects beforeunload. Stale ACK keeps local changes and server-generated id/revision but cannot show a saved timestamp or cause create navigation; subsequent explicit Save or latest-generation draft autosave issues PUT. Preview with stale ACK does not open older content.
- Autosave remains for existing dirty drafts with publish intent `draft`, after a 1.8-second idle interval; each specific revision may be attempted once automatically or manually. An ambiguous failure requires new edit generation or explicit user retry; no automatic replay of the same operation. A publish/scheduled intent never auto-reverts via draft autosave.

## Canonical source comparison — Manual-first protocol

- Compared Product `blog-frontend/src/pages/admin/PostEditor.tsx` with Gouno UI `showcase/demos/products/blog-admin/post-editor.tsx` at the frozen canonical ref. Both own the same DocumentEditorShell, MarkdownEditor, Article outline/history navigator, field-level AI suggestions, metadata inspector, media controls, status header and responsive shell. Showcase supplies its own static Post/FixtureDock and simulated status; Product binds real Blog revisions, APIs, scheduled publishing and BFF permissions. This is an intentional binding difference, not license to change Canonical composition.
- No JSX, CSS, spacing, typography, icons, editor hierarchy or Gouno UI package changes in this batch. Fresh Product desktop/mobile stale/current screenshot and frozen Showcase paired screenshot review is still required before `verified`.

## Acceptance requirements (pending)

- Vitest controlled delayed save/preview, newer edits and `beforeunload`, next PUT with server revision, CREATE identity preservation, no automatic retry of a failed autosave, and existing published/409/read-only flows.
- Real Playwright Chromium rendered `/admin/posts/101/edit`: desktop 1440x900 and mobile 390x844, delayed PUT ACK, newest title and dirty message survive, exact revision on second request, save success only after current ACK, no document overflow, no console/runtime overlay; capture both states.
- Fresh Product/Showcase paired visual check (desktop light/mobile dark), classify meaningful differences as drift or intentional Product fixture behavior. Keep existing frozen UI and strict ledger checks.
- Final PR source SHA: CI, all Images builds with six scans, rendered browser acceptance, paired Showcase, PostgreSQL required suite and artifact ZIP SHA-256 independently verified. Update this report/sole certification ledger with evidence and rerun all gates on the final doc SHA before SHA-guarded squash merge. No green-by-assumption.

## Boundaries and unresolved work

- No changes to Blog backend, OIDC confidential BFF, GOSSO, Connector Hold, provider or Media recovery. This change does not establish cross-user revision CAS; 409 conflicts remain server-owned. Version-restore overlapping edits and unrelated external recovery require distinct follow-up verification.
- Browser plugin not available; use repository's pinned real Chromium Playwright with controlled intercepted API and manually inspect image evidence. Passing fixture-backed tests does not prove live deployment or real provider effects. Keep global A+ #359 and recovery #338 open.
