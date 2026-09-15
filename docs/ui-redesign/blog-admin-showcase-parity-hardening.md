# Blog Admin Showcase Parity Hardening

Status: in progress

This document is the live parity inventory and mismatch ledger for the hardening pass started from the current GitHub `main` branches on 2026-09-15. Historical migration claims are not acceptance evidence for this pass.

## Baseline

- `rushairer/gouno-ui` baseline main: `d890ae3fc2cf2d736f724eb3d51a84f39e39ca71`.
- `rushairer/gouno-blog` baseline main: `de5068dd69dbc9377b4e5d25d0d5233955c136ca`.
- `gouno-ui/package.json`: `@gouno/ui` `0.4.1`.
- `blog-frontend/package.json`: exact registry dependency `@gouno/ui` `0.4.1`.
- Blog CI already verifies that the lockfile entry is an npm registry tarball with integrity.
- Browser plugin is not available in the current execution environment. Rendered verification therefore uses the repository Playwright suite and GitHub Actions artifacts. These are deterministic fixture sessions unless a test explicitly says otherwise; they are not described as production-authenticated validation.

## Route inventory

| Showcase owner | Product route | Real product owner | Long-term gate |
| --- | --- | --- | --- |
| `blog-admin/dashboard.tsx` | `/admin/dashboard` | `src/pages/admin/Dashboard.tsx` | required |
| `blog-admin/posts.tsx` | `/admin/posts` | `src/pages/admin/Posts.tsx` | required |
| `blog-admin/post-editor.tsx` | `/admin/posts/new`, `/admin/posts/:id/edit` | `src/pages/admin/PostEditor.tsx` | required |
| `blog-admin/pages.tsx` | `/admin/pages` | `src/pages/admin/Pages.tsx` | required |
| `blog-admin/page-editor.tsx` | `/admin/pages/new`, `/admin/pages/:id/edit` | `src/pages/admin/PageEditor.tsx` | required |
| `blog-admin/categories.tsx` | `/admin/categories` | `src/pages/admin/Categories.tsx` | retained |
| `blog-admin/tags.tsx` | `/admin/tags` | `src/pages/admin/Tags.tsx` | retained |
| `blog-admin/comments.tsx` | `/admin/comments` | `src/pages/admin/Comments.tsx` | retained |
| `blog-admin/notifications.tsx` | `/admin/notifications` | `src/pages/admin/Notifications.tsx` | retained |
| `blog-admin/media-library.tsx` | `/admin/media` | `src/pages/admin/MediaLibrary.tsx` | retained |
| `blog-admin/site-settings.tsx` | `/admin/settings` | `src/pages/admin/SiteSettings.tsx` | retained |
| `blog-admin/users.tsx` | `/admin/users` | `src/pages/admin/Users.tsx` | retained |
| `blog-admin/ai/operations/` | `/admin/ai-ops` | `src/pages/admin/AIOperations.tsx` | retained |
| `blog-admin/ai/settings/` | `/admin/ai-settings` | `src/pages/admin/AISettings.tsx` | retained |

## Binding composition grammar

Normal Admin task pages keep the route-level stack in this order:

```text
PageHeader
PageFeedback (fatal/non-fatal page state only)
Filter/Toolbar surface when present
BulkActionBar when selection exists
Loaded | Loading | Empty | Error content state
Modal/Drawer overlays
```

Transient operation success/failure is Notification-owned. A transient result must not be implemented as a page Alert merely because Alert is a canonical primitive.

Editors are the explicit workspace exception:

```text
ContentEditorFrame
  PageFeedback (outside the editor Card)
  EditorCard
    CommandBar
    Workspace
      Outline / Canvas / Inspector as applicable
```

`ContentEditorFrame` owns the editor Card boundary. Feature CSS may own workspace layout but must not restyle canonical control geometry.

## State matrix

The durable core matrix covers all four requested viewports (`1440x900`, `1024x768`, `768x1024`, `390x844`) and both light/dark themes for the loaded state. Representative interaction/state tests additionally cover fatal load error + retry, filtered/no-result, selection/bulk toolbar, modal state, new editor, existing editor, validation/save failure, notification feedback, long content and narrow viewport behavior where deterministic fixture support exists.

Support-page coverage remains in the existing support matrix and interaction suite. AI route-family coverage remains in the existing AI workspace matrix and interaction suite.

## Mismatch ledger

| ID | Page / state | Mismatch | Severity | Root cause | Ownership | Planned / applied guard | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAR-001 | Pages / copy-delete mutation | Product stores transient results in local `notice` and renders page `Alert`; the app already has canonical Notification feedback. | P0 | semantic drift | Blog | static semantic guard + browser notification assertion | open |
| PAR-002 | Comments / moderation mutation | Product retains a local Notice/Alert path instead of the app Notification contract for transient operation feedback. | P0 | semantic drift | Blog | static semantic guard + support interaction assertion | open |
| PAR-003 | Dashboard / Top Posts actions | Real product uses text ButtonLinks while Showcase uses the compact ghost icon action grammar used by dense tables. | P1 | composition drift | Blog | structural/source contract + browser geometry | open |
| PAR-004 | Core route browser coverage | Dashboard, Posts, Pages, PostEditor and PageEditor are absent from `e2e/playwright.config.mjs`; only support/public/AI suites are durable. | P0 | test-gap / state drift risk | Blog | core admin matrix + interactions | open |
| PAR-005 | Browser acceptance delivery | Browser workflow runs on pull requests/dispatch but not `main`, so merged rendered regressions lack a durable main-branch evidence run. | P1 | CI gap | Blog | push-to-main browser gate | open |
| PAR-006 | Consumer primitive recreation | Existing AST guard blocks native button/select and several legacy classes, but visible native input/radio/checkbox rules are not consistently scoped across all Admin/editor consumers. | P1 | static-contract gap | Blog | AST ownership checks with file/hidden exceptions | open |
| PAR-007 | Product overlays / notification stacks | Existing CSS/data-slot guards are strong, but there is no AST rule preventing product-level fixed overlay/notification stack recreation. | P1 | static-contract gap | Blog | AST fixed-overlay ownership rule | open |
| PAR-008 | Core page composition | No durable structural contract currently asserts PageHeader/PageFeedback/filter/collection ordering or editor feedback outside the editor Card. | P1 | structural-contract gap | Blog | dedicated AST structural parity checker | open |
| PAR-009 | Showcase fixture transient notices | Several Showcase Blog Admin fixtures use `Alert` for simulated navigation/mutation notice state, mixing transient feedback with page-level feedback semantics. | P1 | semantic drift in reference | Gouno UI Showcase | canonical fixture notification scope + conformance test | open |
| PAR-010 | Visual parity | Current screenshots prove rendered health but do not compare or fingerprint Showcase-vs-product composition/style. | P0 | visual-contract gap | both | cross-repo structural/style parity gate + retained screenshots | open |
| PAR-011 | Notification appearance | Core Notification is opaque `bg-popover` with semantic overlay elevation; any observed translucency must be diagnosed as theme/cascade/build drift, not solved with product CSS. | P1 | potential rendered/token drift | both | computed-style browser assertion + no consumer data-slot override | open |
| PAR-012 | Current documentation | Migration docs contain historical completion/status data and cannot be treated as current parity evidence. | P2 | stale evidence | Blog | this live contract + final audit update | open |

## Existing guardrails retained

- TypeScript-AST import/JSX checks already reject direct Radix imports, native browser dialogs, native buttons/selects, legacy Gouno entrypoints and retired compatibility classes.
- Source CSS already rejects product `[data-slot]` overrides, canonical primitive selectors, concrete colors and `!important`.
- Admin product source already rejects raw shadow-size utilities.
- Showcase design-language tests already constrain edge-axis spacing, semantic elevation, Card anatomy, PageHeader-before-Tabs and tab budgets.
- Existing support browser matrix already covers Categories, Tags, Comments, Notifications, Media, Settings and Users at the four target viewports in light/dark with console/pageerror/overflow checks and screenshots.

## Acceptance rule

Hardening is complete only when the ledger has no P0/P1 open items, P2 items are fixed or explicitly justified, both repositories' required CI is green for the final commits, rendered evidence is retained by CI, temporary debug artifacts are absent, and all accepted changes are on `main`.
