# PageEditor save acknowledgement race — manual-first review (2026-10-28)

Status: **needs-manual-recertification**

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
