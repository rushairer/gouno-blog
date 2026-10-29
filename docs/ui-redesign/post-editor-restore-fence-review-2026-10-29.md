# PostEditor historical restore in-flight edit fence — Manual-first review (2026-10-29)

Status: **needs-manual-recertification**

## Problem and bounded scope

- Base main `21cf2bd25a9c254f8a8de0691b301fda7c176e5a` (PR #390 PostEditor save fence). Canonical Gouno UI `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9` and @gouno/ui 0.4.9, unchanged.
- Existing PostEditor `restoreVersion()` sent a business mutation without the shared `savingRef`, and unconditionally called `setPost(restored); dirty.current=false; setSavedAt(now)`. A user could dismiss the modal and edit before the request resolved. The old response discarded new local edits and falsely showed saved.
- Restore also accepted a dirty local draft even though the UI implied current content would be retained as historical version; only **server-persisted** content could be versioned. This could erase genuinely unsaved local work before the request even began.
- Fixed Product-owned behavior: a dirty draft cannot submit restore (the dialog explains save first), restore shares the save/preview/autosave in-flight fence, and a delayed response is applied only when the edit generation still matches. Otherwise, accept server revision/identity metadata, retain newer draft/title/intent and beforeunload protection, and prevent autosaving that exact in-flight generation without explicit user intent. Existing 409 and BFF permission checks remain untouched.
- No Canonical UI package/Showcase composition changes, no CSS/typography/spacing moves, no backend/DB/SSO/Connector changes; strictly real Product state and test coverage.

## Manual-first design review

- Inspected current PostEditor Product rendering, canonical `DocumentEditorShell` / `MarkdownEditor` / outline-history navigator and the last accepted desktop-light/mobile-dark Product/Showcase captures recorded in `docs/ui-redesign/post-editor-save-fence-review-2026-10-28.md`.
- The expected distinction is dynamic Product-only restore/dirty/status/notification behavior and server revision semantics. Showcase simulates history and save state; do not invent provider/API semantics in Canonical fixtures.
- The existing `Modal` composition is unchanged; when local edits are dirty, its description accurately says to save first and its Restore action becomes disabled. During a restore, the command bar displays `正在恢复…`. Follow-up manual rendered comparison required before promoting the certification.

## Acceptance gates — pending

- Actual PostEditor Vitest: delayed version-restore response while edits continue, preservation of user text and beforeunload/dirty state, next explicit PUT with the new revision; block restore of already-unsaved local drafts; normal history restore and 409 remain operational.
- Actual Chromium desktop 1440x900 and mobile 390x844: open history, start a delayed `POST /api/admin/posts/101/versions/11/restore`, dismiss dialog during request, edit title, then release acknowledgement. Title and dirty feedback must survive. Next explicit save must send server's new revision exactly once. Capture stale/current screenshots, inspect responsiveness, console and overlays.
- Exact source-candidate four gates: CI, 3 image builds and 6 Trivy/Grype security scans, UI Browser Acceptance, Showcase paired test. Real mandatory PostgreSQL suite with no skips and artifact SHA-256 inspection; then fresh manual paired screenshot review before setting sole `blog-admin-core-wave3` row back to `verified`.
- Final documentation-only head must run all four gates again; only then lease-guarded squash merge. Post-merge main gates and immutable image publish must be observed separately.

## Limits

- Frontend concurrency and truthful status only; this does not prove server-side exactly-once restore after lost HTTP acknowledgement, Provider billing idempotency, approval action atomicity, cross-operator concurrency or production rollout.
- Browser plugin not available, use repository real Playwright Chromium acceptance and manual screenshot inspection. #359 global A+ and #338 external-effect recovery stay open.
