# Gouno Blog Public & Account Showcase Parity Hardening

Status: **In progress.**

This document is the live parity inventory and mismatch ledger for the Public Blog + Blog Account hardening pass started from current GitHub `main` on 2026-09-15. Historical migration reports are background only. Current source, current Showcase fixtures, current package metadata, current tests and current CI are the only acceptance evidence.

## Baseline

- `rushairer/gouno-ui` starting main: `7e8872a4a216191ce56cf34ed3c3827c03645c37`.
- `rushairer/gouno-blog` starting main: `3d41e31aca080321457eed9a79dee5f25dec25c6`.
- `gouno-ui/package.json`: `@gouno/ui` `0.4.1`.
- `blog-frontend/package.json`: exact `@gouno/ui` `0.4.1` dependency.
- Latest Gouno UI GitHub release at baseline: `v0.4.1`.
- No open PR existed in either repository at task start.
- Blog baseline CI and UI Browser Acceptance for the starting Blog main SHA were green.
- Browser plugin is not available in the execution environment. Rendered QA therefore uses the repository Playwright suites and GitHub Actions artifacts. Fixture browser sessions are deterministic mocked sessions and are not production-authenticated E2E evidence.

No published `@gouno/ui` contract change has been identified at inventory time. Showcase/test/workflow changes therefore do not justify a package release by themselves.

## Canonical route inventory

| Family | Showcase owner | Product route / owner | Contract |
| --- | --- | --- | --- |
| Home | `showcase/demos/products/blog/home.tsx` | `/` → `src/pages/Home.tsx` | direct parity + public matrix |
| Article Index | `blog/article-index.tsx` | `/articles` → `ArticleIndex.tsx` | shared route family |
| Search | `blog/article-index.tsx` | `/search?q=...` → `ArticleIndex mode=search` | shared route family; query preserved |
| Category Detail | `blog/article-index.tsx` | `/categories/:slug` → `ArticleIndex mode=category` | shared route family, no duplicate Showcase page |
| Tag Detail | `blog/article-index.tsx` | `/tags/:slug` → `ArticleIndex mode=tag` | shared route family, no duplicate Showcase page |
| Categories Index | `blog/discovery-indexes.tsx` | `/categories` → `Categories.tsx` | discovery grammar |
| Tags Index | `blog/discovery-indexes.tsx` | `/tags` → `Tags.tsx` | discovery grammar |
| Archive | `blog/discovery-indexes.tsx` | `/archive` → `Archive.tsx` | discovery grammar |
| Article Detail | `blog/article-detail.tsx` + `article-community.tsx` | `/articles/:slug` → `PostDetail.tsx` | reading + community grammar |
| About | `blog/document-pages.tsx` | `/about` → `CustomPageView fixedSlug=about` | Blog-local document grammar + Product lifecycle |
| Custom Page | `blog/document-pages.tsx` | `/:slug` → `CustomPageView.tsx` | dynamic document lifecycle; specific routes must win first |
| Account Notifications | `blog/account-pages.tsx` | `/account/notifications` → `AccountNotifications.tsx` | authenticated public-account grammar |
| Account Settings | `blog/account-pages.tsx` | `/account/settings` → `Settings.tsx` | Blog account boundary; no GOSSO security form ownership |
| Not Found | `blog/not-found.tsx` | `*` → `NotFound.tsx` | canonical Result/navigation grammar |

The user's expected “12 families” groups Article Index/Search/category-detail/tag-detail as one family and Categories/Tags/Archive as their discovery families. The concrete route inventory above lists the executable route modes separately so coverage ownership is unambiguous.

### Redirect-only routes

- `/notifications` → `/account/notifications`.
- `/settings` → `/account/settings`.

These are routing compatibility contracts, not additional Showcase pages.

### Product-only contracts

These remain Product-owned and do not receive fabricated 1:1 Showcase pages:

- root `GossoProvider` session restoration;
- `RequireAuth` redirect-target preservation for `/account/*`;
- Step-Up popup callback presentation;
- runtime site metadata/bootstrap;
- runtime custom navigation data;
- unpublished article preview authorization;
- article mutation authorization and backend failures;
- SEO/canonical/social metadata side effects.

Public hardening may change presentation around these states but must not alter OAuth/OIDC, cookie/session, redirect, Step-Up, preview or permission semantics.

## Baseline rendered coverage

`public-matrix.pw.mjs` currently protects 12 loaded public route cases across four viewports (`1440x900`, `1024x768`, `768x1024`, `390x844`) and light/dark themes: **96 cases**. It asserts public shell visibility, H1, brand, theme/brand attributes, no unknown fixture request, no console warning/error/pageerror and no document-level horizontal overflow.

The matrix does not currently include `/account/notifications` or `/account/settings`. Current public interaction coverage contains only five representative flows: mobile discovery navigation, shell search, article-index tag navigation, article related-navigation/mobile containment and runtime custom navigation.

Current direct Showcase parity (`e2e/showcase-parity.pw.mjs`) is Blog Admin only. Current Gouno UI `Blog Consumer Parity` reuses that same harness, so its name currently overstates coverage: it protects Blog Admin but not Public/Account.

## Mismatch ledger

| ID | Route / surface | State | Showcase owner | Product owner | Mismatch / root cause | Severity | Planned fix | Durable guards | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PUB-001 | PublicShell | loaded | `public-shell.tsx` | `layouts/PublicShell.tsx` | Product Admin entry overrides canonical `IconButtonLink` geometry with `!size-9 !rounded-full !p-0` | P1 | remove primitive geometry takeover | public AST + direct header parity | open |
| PUB-002 | Article Index | filters | `article-index.tsx` | `ArticleIndex.tsx` | tag navigation is manually styled as canonical-looking control instead of owned action/link primitive | P1 | converge filter action grammar without changing route semantics | public AST + direct index parity | open |
| PUB-003 | Discovery | loading | `loading.tsx` / `discovery-indexes.tsx` | `Categories.tsx`, `Tags.tsx`, `Archive.tsx` | future structure is known but Product shows generic Spinner; Showcase has route-shaped Skeleton | P1 | route-shaped discovery loading | structural + matrix/direct parity | open |
| PUB-004 | Discovery | failure | `discovery-indexes.tsx` | Categories/Tags/Archive | Product swallows request failures into successful Empty; Showcase has no discovery error scenario | P0 | add explicit recoverable error + retry to reference and Product | state interaction + structural guard | open |
| PUB-005 | Markdown | code | `article-detail.tsx` / Core `CodeBlock` | `MarkdownRenderer.tsx` | Product recreates code frame/copy state/shadow instead of canonical Core `CodeBlock` | P1 | keep syntax adapter Product-owned, delegate frame/copy to Core | public AST + code-copy browser/direct parity | open |
| PUB-006 | Article / document TOC | loaded | `article-detail.tsx` Core `Anchor` | `PostDetail.tsx`, `CustomPageView.tsx` | Product recreates TOC link chrome and behavior | P1 | keep TOC composition Product-owned but use canonical Core `Anchor` | structural + direct parity | open |
| PUB-007 | Article community | comment load | `article-community.tsx` | `PostDetail.tsx` | comment fetch failure becomes `comments=[]`, making fatal/partial failure indistinguishable from successful Empty | P0 | model comment load error separately and preserve reading | browser state interaction | open |
| PUB-008 | Article community | composition | `article-community.tsx` | `PostDetail.tsx` | raw bordered comment cards, outer competing Card and raw reply notice drift from canonical community grammar | P1 | canonical Cards/Alert + Blog-owned orchestration | structural + direct community parity | open |
| PUB-009 | Article community | mutations | `article-community.tsx` | `PostDetail.tsx` | like/comment/report feedback and pending/failure ownership are incomplete; report failure is not presented inside report flow | P1 | separate mutation state, preserve content, local modal failure/pending | rendered interactions | open |
| PUB-010 | Account Notifications | initial loading | `account-pages.tsx` / `loading.tsx` | `AccountNotifications.tsx` | generic Spinner instead of route-shaped Skeleton | P1 | canonical notification loading anatomy | account matrix + direct parity | open |
| PUB-011 | Account Notifications | mutation failure | `account-pages.tsx` | `AccountNotifications.tsx` | mark-read failure reuses page-load `error`, replacing already loaded data with fatal Result | P0 | split persistent load error from transient mutation feedback | rendered mutation test | open |
| PUB-012 | Account Notifications | actions | `account-pages.tsx` | `AccountNotifications.tsx` / `notificationsApi` | API already supports mark-all but Public page omits canonical mark-all action/filter grammar | P1 | expose supported mark-all + unread semantics without Admin-management features | browser + direct parity | open |
| PUB-013 | Account Settings | canonical scope | `account-pages.tsx` | `Settings.tsx` + backend/API inventory | Showcase invents editable Blog profile/preferences state that current Product/Backend does not expose | P0 | correct Showcase to the real identity-boundary surface; do not invent Product APIs | direct parity + route contract | open |
| PUB-014 | Account Settings | primitive ownership | `account-pages.tsx` | n/a | Showcase hand-rolls `<button role=switch>` although Core exports canonical `Switch` | P1 | remove/rewrite fictional preference surface; if retained anywhere use Core `Switch` | Showcase conformance | open |
| PUB-015 | About / Custom Page | loading/error | `document-pages.tsx` / `loading.tsx` | `CustomPageView.tsx` | generic Spinner; generic custom-page transport failure can collapse into NotFound; About grammar has drifted from canonical document surface | P1 | route-shaped loading, separate 404/fatal failure, reconcile Blog-local document surface | structural + interactions + direct parity | open |
| PUB-016 | Public/Account matrix | loaded responsive/themes | canonical corpus | `public-matrix.pw.mjs` | account routes absent; authenticated fixture contract not durable | P0 | add 2 routes × 4 viewports × 2 themes = 16 account cases without reducing existing 96 | Browser Acceptance | open |
| PUB-017 | Public interactions | state/mutation/a11y | canonical corpus | `public-interactions.pw.mjs` | only five interactions; article/community/account failure/success paths unprotected | P0 | add representative high-risk interactions | Browser Acceptance | open |
| PUB-018 | Public structural contract | all | public canonical corpus | Blog scripts | no PublicShell/Article/Document/Account AST contract equivalent to Admin guard | P1 | add `check-public-parity-contracts.mjs` and wire into `lint:ui` | static CI | open |
| PUB-019 | Direct parity | representative rendered surfaces | Blog Showcase | Blog Product | no Public/Account DOM + computed-style + geometry + paired-screenshot gate | P0 | add a public parity test file sharing Admin helpers | Showcase Parity CI | open |
| PUB-020 | Reciprocal parity | candidate Gouno UI | Blog consumer | Gouno UI workflow | `Blog Consumer Parity` currently executes Admin-only testMatch | P1 | make shared parity config run Admin + Public/Account harness | Gouno UI Blog Consumer Parity | open |
| PUB-021 | Parity workflow ownership | CI/artifacts | n/a | Blog workflow | workflow/artifact still named Blog Admin Showcase Parity | P1 | rename to Blog Showcase Parity and retain clear Admin/Public failure files | CI | open |
| PUB-022 | SEO/a11y durability | documents/article/account | canonical semantics | public routes | current matrix proves visibility/overflow but not enough semantic heading/nav/form/hash ownership | P1 | add focused semantic assertions without brittle DOM locking | structural + Playwright | open |

Initial ledger: **P0 = 8, P1 = 14**. P2/P3 will be recorded only if rendered reconciliation identifies a justified small or intentional difference.

## Ownership decisions fixed before implementation

- Public Blog does not use `AppShell` or Admin `PageContainer` grammar.
- `PublicShell`, article/document/community orchestration and TOC composition remain Blog-owned; they are not admitted as new Gouno Pattern/Gouno APIs.
- `CodeBlock`, `Anchor`, controls, feedback, overlays, cards, fields and selection controls remain canonical Core responsibilities where their semantics match.
- Blog Account does not own password, MFA, Passkey, identity session or GOSSO policy forms.
- Literal fixture content is not parity. Structure, semantic responsibility, state presentation, interaction grammar and stable geometry are parity.
- Full-page zero-pixel image equality is not a gate. Paired screenshots are review evidence alongside structural, computed-style and geometry assertions.

## Acceptance target

This document is not complete until the ledger reaches **P0 = 0, P1 = 0**, all existing Admin hardening stays green, the existing 96 public matrix cases are retained, Account adds durable authenticated fixture coverage, representative community/account states are rendered, Public direct parity is active in both repositories, reciprocal candidate-Gouno-UI → current Blog Admin + Public/Account verification is green, and the final accepted commits are merged to both `main` branches with post-merge evidence recorded here.
