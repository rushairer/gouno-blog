# Blog Admin Showcase Parity Hardening

Status: PR verification complete; main merge and reverse Gouno UI consumer gate remain before task closure.

This document is the live parity contract for the hardening pass started from GitHub `main` on 2026-09-15. Historical migration reports are background only; current source, contracts, rendered tests and CI are the acceptance evidence for this pass.

## Baseline and verified reference

- `rushairer/gouno-ui` starting main: `d890ae3fc2cf2d736f724eb3d51a84f39e39ca71`.
- `rushairer/gouno-blog` starting main: `de5068dd69dbc9377b4e5d25d0d5233955c136ca`.
- Gouno UI Showcase/reference hardening merged main: `bc274ccf40dae6ed340566b71143c17a69b2e3b2`.
- `gouno-ui/package.json` declares `@gouno/ui` `0.4.1`.
- `blog-frontend/package.json` and lockfile use the exact npm registry dependency `@gouno/ui` `0.4.1`; Blog CI verifies registry tarball integrity.
- The Gouno UI hardening changed Showcase/reference composition and tests, not the published primitive API, so no new package release or Blog dependency bump was required.
- Browser plugin was not available in the execution environment. Rendered verification therefore uses repository Playwright suites and GitHub Actions artifacts. Admin sessions are deterministic fixture sessions with a mocked admin profile/API unless explicitly stated; they are not production-authenticated system-session validation.

## Route inventory

All 14 current Blog Admin Showcase route families have real-product owners and a parity/audit mapping.

| Showcase owner | Product route | Real product owner | Durable coverage |
| --- | --- | --- | --- |
| `blog-admin/dashboard.tsx` | `/admin/dashboard` | `src/pages/admin/Dashboard.tsx` | core matrix + parity |
| `blog-admin/posts.tsx` | `/admin/posts` | `src/pages/admin/Posts.tsx` | core matrix + parity |
| `blog-admin/post-editor.tsx` | `/admin/posts/new`, `/admin/posts/:id/edit` | `src/pages/admin/PostEditor.tsx` | core matrix + parity |
| `blog-admin/pages.tsx` | `/admin/pages` | `src/pages/admin/Pages.tsx` | core matrix + parity |
| `blog-admin/page-editor.tsx` | `/admin/pages/new`, `/admin/pages/:id/edit` | `src/pages/admin/PageEditor.tsx` | core matrix + parity |
| `blog-admin/categories.tsx` | `/admin/categories` | `src/pages/admin/Categories.tsx` | support matrix |
| `blog-admin/tags.tsx` | `/admin/tags` | `src/pages/admin/Tags.tsx` | support matrix |
| `blog-admin/comments.tsx` | `/admin/comments` | `src/pages/admin/Comments.tsx` | support matrix + interaction |
| `blog-admin/notifications.tsx` | `/admin/notifications` | `src/pages/admin/Notifications.tsx` | support matrix |
| `blog-admin/media-library.tsx` | `/admin/media` | `src/pages/admin/MediaLibrary.tsx` | support matrix + interaction |
| `blog-admin/site-settings.tsx` | `/admin/settings` | `src/pages/admin/SiteSettings.tsx` | support matrix + interaction |
| `blog-admin/users.tsx` | `/admin/users` | `src/pages/admin/Users.tsx` | support matrix + interaction |
| `blog-admin/ai/operations/` | `/admin/ai-ops` | `src/pages/admin/AIOperations.tsx` | AI matrix + interactions |
| `blog-admin/ai/settings/` | `/admin/ai-settings` | `src/pages/admin/AISettings.tsx` | AI matrix + interactions |

## Binding composition and semantic grammar

Normal Admin task pages keep the route-level stack in this order:

```text
PageHeader
PageFeedback (persistent/recoverable page state only)
Filter/Toolbar surface when present
BulkActionBar when selection exists
Loaded | Loading | Empty | Error content state
Modal/Drawer overlays
```

Transient operation success/failure is Notification-owned. Persistent failure that preserves recoverable page state may remain an Alert. Field validation belongs to field/form feedback. Dialog/Modal owns destructive confirmation and overlay/focus behavior.

Editors are the explicit workspace exception:

```text
ContentEditorFrame
  PageFeedback (outside the editor Card)
  EditorCard
    CommandBar
    Workspace
      Outline / Canvas / Inspector as applicable
```

`ContentEditorFrame` owns the editor Card boundary. Feature CSS may own workspace layout, long-content containment and responsive rearrangement, but not canonical control geometry.

## State and rendered coverage

The durable core matrix covers 7 core route cases at all requested viewport/theme combinations:

- `1440x900`, `1024x768`, `768x1024`, `390x844`.
- light and dark.
- Dashboard, Posts, Pages, PostEditor new/edit and PageEditor new/edit.

That is 56 core Admin loaded-state cases. The existing support matrix contributes another 56 loaded-state cases for Categories, Tags, Comments, Notifications, Media, Settings and Users, giving 112 explicit core/support Admin viewport-theme cases.

Representative rendered interactions additionally cover fatal load error + retry, selection/bulk toolbar, canonical opaque Notification, editor validation feedback, existing editor loading, modal open/destructive confirmation, long content, narrow viewport behavior and responsive containment. Existing AI/public suites remain enabled.

Final PR browser evidence:

- workflow run `34954854327`.
- **309/309 Playwright tests passed**.
- browser artifact `10391220840`, including screenshots/report/test-results, retained 14 days.
- each Admin matrix case asserts brand/theme, meaningful visible identity, no permission overlay, no console warning/error, no pageerror, no document horizontal overflow and expected canonical page/editor structure.

## Direct Showcase/Product parity gate

The cross-repository parity workflow checks out the current `rushairer/gouno-ui/main` and starts Showcase and Blog side by side. It compares computed style/geometry and retains paired screenshots rather than requiring brittle full-page zero-pixel difference.

Compared style roles include display/position, gap, all padding edges, border widths, radius, background, shadow and opacity. High-risk geometry checks include checkbox/action sizes and modal width.

Direct paired coverage, light + dark:

1. Dashboard Top Posts surface and dense action geometry.
2. Posts filter surface and checkbox geometry.
3. Posts destructive Modal, body and overlay.
4. Posts `390x844` mobile filter/list-card hierarchy and horizontal containment.
5. Pages filter surface.
6. PostEditor Card and command bar.
7. PageEditor Card and command bar.

Final reference rerun:

- workflow run `34954854076`, rerun job `104335010796`.
- log explicitly checked out `gouno-ui/main` at `bc274ccf40dae6ed340566b71143c17a69b2e3b2`.
- **14/14 direct parity tests passed**.
- paired evidence artifact `10390898497`, retained 14 days.

## Mismatch ledger

| ID | Page / state | Severity | Root cause | Resolution / guard | Status |
| --- | --- | --- | --- | --- | --- |
| PAR-001 | Pages copy/delete mutation used local Alert-like notice | P0 | semantic drift | app-level Notification + AST semantic guard + rendered notification assertion | fixed |
| PAR-002 | Comments moderation mutation used local Notice/Alert | P0 | semantic drift | Notification for transient result; recoverable partial-batch failure remains page Alert | fixed |
| PAR-003 | Dashboard Top Posts actions diverged from compact Showcase grammar | P1 | composition drift | ghost icon action grammar + direct geometry parity | fixed |
| PAR-004 | Core routes absent from durable browser matrix | P0 | state/test coverage gap | 56-case core route viewport/theme matrix + interactions | fixed |
| PAR-005 | Browser acceptance did not run after merge to main | P1 | CI ownership gap | workflow now runs on relevant PR and main pushes, retaining evidence | fixed |
| PAR-006 | Consumer primitive recreation was incompletely guarded | P1 | static-contract gap | AST ownership checks reject native button/select/textarea/visible input; hidden file bridge is explicit exception | fixed |
| PAR-007 | Product-level fixed overlay/notification recreation was not guarded | P1 | static-contract gap | AST rejects product fixed positioning; existing CSS guard rejects canonical data-slot/primitive overrides | fixed |
| PAR-008 | Core page/editor composition lacked durable structural assertions | P1 | structural-contract gap | AST Admin-stack + editor frame/command-bar contracts | fixed |
| PAR-009 | Showcase transient fixture notices used Alert | P1 | reference semantic drift | canonical FixtureNotification/NotificationProvider + AST fixture conformance | fixed |
| PAR-010 | No direct Showcase-vs-product rendered parity gate | P0 | visual-contract gap | 14 light/dark computed-style/geometry pair tests + paired screenshots | fixed |
| PAR-011 | Notification could visually regress toward translucent consumer presentation | P1 | rendered/token drift risk | canonical owner retained; computed-style assertion requires opaque rendered background; consumer data-slot override prohibited | fixed |
| PAR-012 | Historical migration docs could be mistaken for current completion evidence | P2 | stale evidence | this live contract and current CI/source supersede historical status claims | closed/documented |

Current ledger: **P0 = 0, P1 = 0**.

## New and retained guardrails

- `check-admin-parity-contracts.mjs` is part of `lint:ui` and uses the TypeScript AST for Admin stack ordering, editor structure, feedback semantics, primitive ownership and fixed-overlay ownership.
- Existing UI checks continue to reject direct Radix imports, legacy/unsupported Gouno UI entrypoints, native browser dialogs, retired compatibility classes and raw Admin elevation.
- Existing CSS checks continue to reject product `[data-slot]` overrides, canonical primitive selectors, concrete colors, `!important` and cascade violations.
- Gouno UI Showcase now has its own AST conformance guard against transient notice Alerts and product-fixture native primitive recreation.
- Browser acceptance stores rendered screenshots/traces/reports instead of testing only “page did not crash”.
- Cross-repository parity runs on Blog changes and scheduled checks against current Gouno UI main.
- Before task closure, Gouno UI receives the reciprocal consumer parity workflow so a Showcase/UI PR is tested against current Blog main before it can be accepted.

## Intentional differences

- Hidden/screen-reader-only native `input[type=file]` is retained as a nonvisual browser file-picker bridge; the visible trigger and visual controls remain canonical Gouno UI.
- Showcase FixtureDock and fixture-only scenario controls are outside product flow and are not required in Blog Admin.
- Fixture data strings, timestamps, IDs and API state differ from real product data. Parity compares semantic structure, component ownership and rendered presentation, not literal business content.
- Showcase may use a normal anchor to simulate navigation while Blog uses React Router links. Navigation semantics and rendered contract are what bind.
- Full-page pixel identity is intentionally not a hard gate. DOM/structural assertions + computed style/geometry + paired screenshots are used to detect meaningful design drift without turning dynamic text/font rasterization into CI flakiness.

## Remaining limits / risks

- This environment does not provide a Browser plugin or a production authenticated deployment. The 309-test evidence is deterministic fixture/mocked-API browser QA, not a production login/session E2E claim.
- The direct visual parity suite intentionally targets representative high-risk surfaces and states rather than every combinatorial state of every route.
- Dynamic business content is not pixel-normalized and compared as a full-screen image; retained screenshots support review while automated parity binds structure and computed presentation.
- Dependency installation in CI reports pre-existing audit findings in the Blog/isolated Playwright dependency graphs. This hardening does not change those dependencies and does not claim to close unrelated dependency-security work.

## Acceptance rule

This hardening is complete only after the verified Blog changes are merged to `main`, the reciprocal Gouno UI consumer parity gate is merged to `main`, and final main-branch CI/rendered checks are green. No temporary migration/codemod workflows, debug files or vendored Gouno UI assets may remain.