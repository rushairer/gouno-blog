# PostEditor historical restore in-flight edit fence — Manual-first review (2026-10-29)

Status: **verified** — 2026-10-29. Manual-first targeted PostEditor history-restore state certification; no global A+ signoff or full Core Wave 3 re-audit.

## Problem and bounded scope

- Base main `21cf2bd25a9c254f8a8de0691b301fda7c176e5a` (PR #390 PostEditor save fence). Canonical Gouno UI `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9` and @gouno/ui 0.4.9, unchanged.
- Existing PostEditor `restoreVersion()` sent a business mutation without the shared `savingRef`, and unconditionally called `setPost(restored); dirty.current=false; setSavedAt(now)`. A user could dismiss the modal and edit before the request resolved. The old response discarded new local edits and falsely showed saved.
- Restore also accepted a dirty local draft even though the UI implied current content would be retained as historical version; only **server-persisted** content could be versioned. This could erase genuinely unsaved local work before the request even began.
- Fixed Product-owned behavior: a dirty draft cannot submit restore (the dialog explains save first), restore shares the save/preview/autosave in-flight fence, and a delayed response is applied only when the edit generation still matches. Otherwise, accept server revision/identity metadata, retain newer draft/title/intent and beforeunload protection, and prevent autosaving that exact in-flight generation without explicit user intent. Existing 409 and BFF permission checks remain untouched.
- No Canonical UI package/Showcase composition changes, no CSS/typography/spacing moves, no backend/DB/SSO/Connector changes; strictly real Product state and test coverage.

## Manual-first design review

- Inspected current PostEditor Product rendering, canonical `DocumentEditorShell` / `MarkdownEditor` / outline-history navigator and the last accepted desktop-light/mobile-dark Product/Showcase captures recorded in `docs/ui-redesign/post-editor-save-fence-review-2026-10-28.md`.
- The expected distinction is dynamic Product-only restore/dirty/status/notification behavior and server revision semantics. Showcase simulates history and save state; do not invent provider/API semantics in Canonical fixtures.
- The existing `Modal` composition is unchanged; when local edits are dirty, its description accurately says to save first and its Restore action becomes disabled. During a restore, the command bar displays `正在恢复…`. The follow-up manual rendered comparison is recorded below and passed for the changed PostEditor state; the frozen Canonical baseline remains unchanged.

## Acceptance gates — accepted against exact source candidate

- Actual PostEditor Vitest: delayed version-restore response while edits continue, preservation of user text and beforeunload/dirty state, next explicit PUT with the new revision; block restore of already-unsaved local drafts; normal history restore and 409 remain operational.
- Actual Chromium desktop 1440x900 and mobile 390x844: open history, start a delayed `POST /api/admin/posts/101/versions/11/restore`, dismiss dialog during request, edit title, then release acknowledgement. Title and dirty feedback must survive. Next explicit save must send server's new revision exactly once. Capture stale/current screenshots, inspect responsiveness, console and overlays.
- Exact source-candidate four gates: CI, 3 image builds and 6 Trivy/Grype security scans, UI Browser Acceptance, Showcase paired test. Real mandatory PostgreSQL suite with no skips and artifact SHA-256 inspection; then fresh manual paired screenshot review before setting sole `blog-admin-core-wave3` row back to `verified`.
- Final documentation-only head must run all four gates again; only then lease-guarded squash merge. Post-merge main gates and immutable image publish must be observed separately.

## Limits

- Frontend concurrency and truthful status only; this does not prove server-side exactly-once restore after lost HTTP acknowledgement, Provider billing idempotency, approval action atomicity, cross-operator concurrency or production rollout.
- Browser plugin not available, use repository real Playwright Chromium acceptance and manual screenshot inspection. #359 global A+ and #338 external-effect recovery stay open.

## Final source-candidate evidence and actual screenshot inspection

- Source candidate (Product): `41f73bb4e59181d42332518411a7c4092a173dae`, based on published secure main `21cf2bd25a9c254f8a8de0691b301fda7c176e5a`. Frozen Canonical: `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`, npm `@gouno/ui` exactly 0.4.9.
- [CI #40845726829](https://github.com/rushairer/gouno-blog/actions/runs/40845726829) **success**: frontend **67 Vitest files / 385 tests**, 66 pre-existing lint warnings and 0 errors, zero npm audit vulnerabilities; Prettier/TypeScript/UI/CSS contracts and Vite 94 chunk budget passed. Backend/Seed quality, Go race/vet/security, 21 real PostgreSQL packages with 115 required tests passed, no skipped tests; three fail-closed database probes reported nonzero and cleanup returned zero.
- [Images #40845726797](https://github.com/rushairer/gouno-blog/actions/runs/40845726797) **success**: backend, frontend, Seed image builds, 6 successful Trivy+Grype checks with patched go-jose/musl security baseline. No scan threshold or dependency-policy change.
- [UI Browser Acceptance #40845726992](https://github.com/rushairer/gouno-blog/actions/runs/40845726992) **success**: **363 actual Chromium cases**, no failed/flaky/skipped, including both newly added desktop (1440x900) and mobile (390x844) delayed historical-restore ACK tests; saved title and server revision 4 in the subsequent explicit PUT, no horizontal overflow.
- [Showcase Parity #40845726701](https://github.com/rushairer/gouno-blog/actions/runs/40845726701) **success**: **86** Product/Showcase rendered paired cases; no JS/CSS/canonical component changes.

### Independently downloaded source-candidate ZIP artifact SHA-256

| Artifact | ID | Verified ZIP SHA-256 |
| --- | --- | --- |
| PostgreSQL integration (21 packages, 115 required) | 12885485329 | `db18a5fa69ca440ed7ab6fa9d30b263c51ddaaa4d730b4169b13b1ecffde99d7` |
| Chromium actual Product browser | 12885092250 | `00076d854ef6f949db18883260f408fd5c091e4b837a3bae5cf4eb21af93c092` |
| Canonical Showcase paired browser | 12885231418 | `77e8a564a9afc8357392e8af0c49ac1774765adb2a46d3ee8895a31eea5d1345` |

Downloaded ZIP bytes were separately SHA-256 hashed and exactly matched GitHub artifact SHA-256; DB `summary.json` independently opened: `ok=true`, 21 packages / 115 required / zero failures-skips-missing, cleanup=0, three negative tests exit=1.

### Manual rendered visual checks — actual screenshots

- Opened `post-restore-stale-desktop.png` and `post-restore-stale-mobile.png` from the accepted **Product** Chromium artifact after releasing the delayed server acknowledgement. Both retain the exact newer user-entered title **`Newer unsaved after restore`** and visible header **`有未保存的更改`**. A success Notification truthfully says **`历史版本已恢复；编辑期间的新修改尚未保存。`**; no false saved timestamp. The saved Article title remains on the server as older restored snapshot until the next deliberate user Save.
- Opened `post-restore-current-desktop.png` and `post-restore-current-mobile.png` after a separate explicit `更新文章` action. Both retain the newest local title, replace dirty status with **`已于 08:59 保存`**, show **`文章已成功发布！`**. The previous restore Notification briefly coexists with newer save Notification, an expected transient toast stack. Both viewports show editor controls and Inspector clearly without horizontal overflow.
- Opened the accepted current actual Product vs frozen Canonical Showcase paired screenshots: `post-editor-desktop-light-{product,showcase}.png`, `post-editor-mobile-dark-{product,showcase}.png`. Compared against previous accepted baseline screenshot rasters, **all four are pixel-for-pixel unchanged** (0 changed pixels) at their fixed viewports. No extra JSX/CSS/component hierarchy/spacing/typography drift. Product live API fixture vs Canonical static editorial draft/FixtureDock are intentional data and runtime differences, not parity defects.
- Existing historical Core Wave 3 pages were not newly manually reviewed. The restored `verified` state applies to this bounded PostEditor version-restore increment, not a new blanket Product/Showcase or project-wide A+ certification.

### Prior red intermediate runs, exact-head closeout and remaining risks

- Temporary targeted preflight initially red because the test attempted to type through an open modal; corrected the test to dismiss the modal while leaving the already dispatched Restore request pending. Passed pinned Prettier/typecheck and 16/16 PostEditor Vitest, then removed temporary CI workflow.
- First full browser run **#40844775276** was red from a **test locator** which incorrectly expected a single Notification while two legitimate notifications were stacked; both desktop/mobile tests were fixed to filter for save-confirmation content. Final source candidate browser #40845726992 passed all 363; no Product behavior weakened to make test green.
- This certification/document-only commit follows the exact source SHA `41f73bb...`. **Final documentation-head CI, Images, Chromium and Showcase must pass again before SHA-guarded merge**, and post-merge main CI/image-publish should be checked separately. Production deployment not verified.
- External Provider idempotency/billing, cross-operator server revision guarantees, multi-client restore ACK ambiguity and authorized recovery drill remain unproven. Leave #338 and project A+ #359 open. No Connector Hold changes.
