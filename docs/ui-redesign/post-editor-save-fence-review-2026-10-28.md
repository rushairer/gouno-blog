# PostEditor delayed ACK and autosave — Manual-first review (2026-10-28)

Status: **verified** — 2026-10-28. Manual-first incremental PostEditor save/preview/autosave recertification; not an entire Core Wave 3 re-audit or global A+ release authorization.

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

## Accepted real source candidate and exact artifact evidence

- Source Blog head: `875c5067defc49111b0c0f4e8ff31a54ae30a753` (a true Git merge of patched security main `a0063748d43eb2dfc5b1cf8e79aaa5de44294ded` and PostEditor candidate `d17ab754fcc873a5fb8ae96d2dfc63c07e63e102`). Canonical Gouno UI HEAD: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`; `@gouno/ui` exactly 0.4.9.
- CI [40663300351](https://github.com/rushairer/gouno-blog/actions/runs/40663300351): success — front-end 67 Vitest files, **383 tests**, 66 existing lint warnings/0 errors, no npm audit vulnerabilities, TypeScript, formatter, CSS, strict UI certification, 94 JS chunks <=500kB; backend/seed race/vet and real PostgreSQL passed.
- Images [40663300635](https://github.com/rushairer/gouno-blog/actions/runs/40663300635): success — three images with **six successful** Trivy/Grype scans using patched go-jose/musl baseline, no suppressed vulnerability.
- UI Browser Acceptance [40663300458](https://github.com/rushairer/gouno-blog/actions/runs/40663300458): success — **361 real Chromium tests passed**, no failed, skipped or flaky. Both new desktop and mobile cases verify PUT `/api/posts/101` receives the first and second titles; stale ACK retains later edits and beforeunload, latest ACK reports save and increments server revision. Front-end backend API contract is unchanged.
- Blog Showcase Parity [40663300526](https://github.com/rushairer/gouno-blog/actions/runs/40663300526): success — **86** Product/Canonical paired tests, including Post Editor desktop/light and mobile/dark fixtures.

### Downloaded final source-candidate ZIP artifact SHA-256

| Evidence | Artifact ID | Independently calculated ZIP SHA-256 |
| --- | --- | --- |
| Isolated real PostgreSQL | 12804268781 | `986fbb46e55cdc0287ec65dbe274ba3c2d49f479b9bea74a61273311c3bfd27b` |
| Product Chromium browser | 12803954946 | `b8a83db8679f5ddaed98dd007dbfbeec0c73b1a2bd70d083f549157253e8a376` |
| Paired Showcase parity | 12804773570 | `d594a28e087a5058be612c9e4c24cce302b58f32484a1af4f38231a3e3c493db` |

Database summary JSON: **21 packages**, all required integration tests reported complete; `ok=true`, cleanup exit 0, and three injected false-green failures (missing DSN, unknown DB and invalid migration) correctly returned exit 1. No real database/service skipped or hidden. All three ZIP digests were computed directly from downloaded bytes and matched GitHub artifact digests.

## Manual-first visual inspection — source and rendered browser

- Opened `post-save-stale-desktop.png` and `post-save-stale-mobile.png` from actual Chromium browser artifacts. The visible latest title remains **Newer unsaved post title**, while header clearly says **有未保存的更改**. No erroneous saved timestamp and no old title inserted after the delayed server ACK. Editor actions remain reachable on both 1440 x 900 desktop and 390 x 844 mobile viewports, without document-level horizontal overflow.
- Opened `post-save-current-desktop.png` and `post-save-current-mobile.png`. Only after the deliberate subsequent `更新文章` mutation does the status become **已于 ... 保存**, with a successful `文章已成功发布！` notification; title stays latest on both. Toast is transient and does not obscure editing controls beyond its expected notification layer.
- Opened current exact-source parity `post-editor-desktop-light-product.png`, `post-editor-desktop-light-showcase.png`, `post-editor-mobile-dark-product.png`, and `post-editor-mobile-dark-showcase.png` and compared against baseline main snapshot before the fix. **All four PNGs are byte-for-byte identical** to previously accepted captures. Canonical DocumentEditorShell, editor/outline/history/Inspector composition, typography, spacing, responsive behavior and field-level AI actions unchanged.
- Intentional divergence remains: Product displays actual fixture-backed published `Browser Acceptance Post` with its API-owned revision/authorization/save state, while frozen Showcase uses static editorial draft `每日 AI 资讯` plus FixtureDock; the differences are in data, route/permission, and scenario, not primitives or composition.
- The earlier initial #390 workflow was correctly red because the newly added test intercepted `/api/admin/posts/101` rather than real `PUT /api/posts/101`; previous image scan used a vulnerable backend baseline. Those failures are preserved and not treated as passing. The corrected test and actual repaired main security commit are in the accepted source head, which was rerun and succeeded.

## Limitations and final documentation-head release gate

- This is frontend async ownership for PostEditor Save, Preview and draft autosave. It does not establish Provider-side exactly-once, external billing receipts, post-op live deployment, or revision CAS for external competing operators; genuine HTTP 409 remains server-owned. A lost CREATE response with unknown server outcome still requires separate operator review rather than blind replay.
- PostEditor version-restore overlapping in-flight edits and unrelated admin page states were not a new full Core Wave 3 visual audit; their historical certification evidence remains historical.
- Final documentation-only PR head must pass all four gates again before SHA-guarded merge. Security main `a0063748...` already passed PR security and post-merge CI/BFF/Showcase and published immutable backend+Seed images, but that is not evidence of production deployment.
- Browser plugin unavailable; actual tested path is repo Playwright Chromium and manually opened evidence. #359 and #338 remain OPEN; no global A+ claim.
