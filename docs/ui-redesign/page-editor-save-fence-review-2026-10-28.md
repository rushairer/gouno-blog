# PageEditor save acknowledgement race — manual-first review (2026-10-28)

Status: **verified** — 2026-10-28. Manual-first targeted review of PageEditor concurrency state, not a full Core Wave 3 re-audit. Exact source head evidence recorded below; final documentation-head CI and PR merge still required.

## Scope and reproduced source-level defect

- Base Blog main: `2aacaf4983cbfddfdd1626b884323b7e064bea70` (#387 complete). Canonical Gouno UI main: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`; package `@gouno/ui` 0.4.9 remains unchanged.
- Product changes only in `PageEditor.tsx` state/async lifecycle, actual unit/browser tests and admin guard documentation. No canonical JSX/CSS/typography edits; no backend, API contract, BFF, OAuth, Connector or automatic mutation replay.
- Prior `persist` and preview-before-open unconditionally installed a stale server response with `setPage(result)` and cleared `dirty.current`, even if the user edited after dispatch. It could discard newer fields, falsely report all changes saved, or preview an old version. React also read `dirty.current` during render.
- For newly created pages, an acknowledged POST could navigate to the edit route and rehydrate stale values, or lose the generated page ID before the next explicit save.

## Manual-first design source and baseline screenshot review

Inspected canonical `showcase/demos/products/blog-admin/page-editor.tsx`, the real Product `PageEditor.tsx`, and actual prior-main paired Playwright PageEditor snapshots: desktop/light Product + Showcase and mobile/dark Product + Showcase.

Both use canonical DocumentEditorShell (command header, editor canvas, Inspector), MarkdownEditor, FieldActionHeader, and established action/status placement. Desktop uses paired editor/Inspector columns; mobile stacks sections with consistent controls. Product publishes a fixture page, Showcase models draft/about-page state; different sidebar, data, title, release intent and shell chrome are intentional Product/Fixture differences. This behavior fix should not rearrange layout or republish canonical components.

The fix uses synchronous ref for beforeunload protection and React state for status rendering. Every user edit increments an edit revision. A save ACK can reset the draft only if its revision matches. If an already-committed POST has newer local edits, preserve returned Page identity/metadata, do not navigate/reload over newer edits, and use PUT on the next explicit save. In-flight preview returns without opening stale content. Request gating prevents overlapping save/preview mutations; stale Page reads after route changes/unmount do not update retired state.

These are frontend concurrency invariants, not multi-operator server version-CAS proofs, Provider exactly-once assurances, or permissions.

## Acceptance gate — pending

- Unit tests with controlled delayed PUT/preview and new-page POST, explicit second save, preserved dirty/beforeunload, no duplicate CREATE.
- Real desktop/mobile Chromium with delayed PUT response and two distinct user edits; check stale ACK, dirty feedback, current second save, console health, no overflow; inspect both before/after screenshots.
- Confirm full CI, Images (3 builds, Trivy + Grype), UI Browser Acceptance, and paired frozen Gouno UI Showcase parity on one exact PR source SHA with digest-verified artifacts. No relaxed security/lint/parity rules.
- After manual visual review, refresh the sole `blog-admin-core-wave3` certification's reviewed refs, current run IDs and verified artifact hashes, then rerun all required final-document-head checks. No merge or `verified` status before proof.

## Evidence boundary

Browser plugin not installed; use the repository's actual Playwright Chromium rendered acceptance plus manually inspect retained screenshots. Test API fixture is not production, live backend execution, MFA or an operator recovery rehearsal. Global #359 and #338 remain open.

## Accepted source-candidate evidence and real manual visual check

- Candidate Blog SHA: `b497435bd5d66e772b56307040269d5ace956159`; Gouno UI SHA `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`, npm `@gouno/ui` 0.4.9. Candidate differs from baseline only in PageEditor lifecycle, tests, admin invariants and certification governance.
- Exact-source CI [40615328947](https://github.com/rushairer/gouno-blog/actions/runs/40615328947): Prettier, security packages, TypeScript, CSS/UI contracts, build, 67 Vitest files / **379 tests passed**, existing lint warnings **67 -> 66** with 0 errors, npm audit 0 vulnerabilities, 94 JS chunks <=500 kB, backend race/vet/govulncheck, Seed and real PostgreSQL mandatory checks passed.
- Images [40615329101](https://github.com/rushairer/gouno-blog/actions/runs/40615329101): 3 image builds and 6 successful Trivy/Grype scans. No dependency, image publication or security threshold changes.
- Browser [40615328938](https://github.com/rushairer/gouno-blog/actions/runs/40615328938): 359 real Chromium tests passed, including two new desktop/mobile Page Editor delayed PUT ACK/second Save tests, with no failures/skips/flaky. Screenshots `page-save-stale-{desktop,mobile}.png` and `page-save-current-{desktop,mobile}.png` manually opened and checked.
- Showcase Parity [40615329178](https://github.com/rushairer/gouno-blog/actions/runs/40615329178): 86 paired Product/Showcase checks passed, unchanged canonical controls.

### Independent artifact SHA-256 checks (downloaded ZIP bytes)

| Evidence | Artifact ID | Downloaded SHA-256 |
| --- | --- | --- |
| Real PostgreSQL integration | 12784429662 | `fe38ba4b50dfa07677e6e86a76feba171f68ffd2aebcaaee99471ee14079a79c` |
| Chromium Product browser | 12785440521 | `9a93bc2b6b8c9ed61f46752e4d62b93d56c0f381a84fe19f2f0f0a8e5c92e456` |
| Canonical Showcase paired browser | 12785580057 | `5fc4c1b25cd12e718ae5c71de000e2a658fcf708441ac6acfb33d5523b596c3a` |

PostgreSQL summary: **21 packages, 115 required integration cases, no failed/skipped/missing, cleanup exit=0**. No skipped test, disabling audit, reclassifying failures or blanket lint waiver.

### Visual review observations (manual, not source-only or green-CI inference)

- Desktop (1440x900 viewport; full-page image) stale ACK: header reads **有未保存的更改**, title remains `Newer unsaved title`, primary `更新单页` action remains available. This rules out falsely rendering a saved state or replacing new text. A later explicit save shows **已于 01:33 保存** and success Notification while retaining the new title.
- Mobile (390x844 viewport; full-page image): same stale/current state transitions and edited title; action buttons remain reachable above canvas; editor, inspector and SEO section stack without horizontal overflow. A success Notification is shown only after the current explicit save.
- Manually opened exact source-candidate Product/Showcase paired screenshots for desktop/light and mobile/dark, compared with previous-main screenshots. Product and Showcase match their prior captures structurally; mobile and desktop Showcase images were byte-for-byte unchanged. The only desktop Product raster differences were minor anti-alias pixels (85 changed pixels of 1,725,120; max delta 2), not a component, gap, typography or hierarchy change. Canonical PageEditor shell, Page lead, inspector, Markdown editor, status and bottom action grammar remain intact.
- Intentional Product/Showcase divergence: Product shows a real published Browser Acceptance fixture and concrete save state; Canonical Showcase uses its editorial draft/about example and Fixture controls. Real Page APIs and queued responses are Product-owned. The stale/delayed-ACK feature state is not present in the canonical static fixture; do not fabricate fixture semantics or introduce product-specific concurrency into the UI library.
- Existing Core Wave 3 Post Editor/Notifications/Media/Site/Users historical certification evidence remains historical; no claim they were re-reviewed. BFF, external Provider billing, live post revisions, cross-client write conflicts, Connector and production deploy remain out of scope.

## Final PR and main checkpoint

Only the certification JSON and this review document should change after source SHA `b497435`. Strict final-head CI, Images, Browser and Showcase must pass again before SHA-guarded merge to `main`. Independently check final PR-head artifacts and observe main CI/Publish Images separately. Global A+ #359 and external-effects recovery #338 remain open.
