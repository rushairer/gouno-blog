# UI migration and functional regression ledger

The JSON ledger is authoritative. Implementation and real browser verification are tracked independently. No production data or credentials belong in evidence.

## Baseline evidence (2026-09-05)

- `@gouno/ui`: `npm run typecheck`, `npm run build`, `npm test` (2 tests) and `npm run showcase:build` pass.
- `blog-frontend`: formatting, UI-contract, CSS-cascade checks, TypeScript, 160 tests and production build pass. The quality command is blocked by the existing global branch-coverage threshold (44.58%, required 45%).
- U01a 已完成：补充公共分类、标签、归档页面及 posts API 参数/空回退测试；`blog-frontend npm run quality` 通过，任务标记 verified。浏览器证据仍未执行。
- `gosso-admin-frontend`: U01b verified. Vitest jsdom now uses `https://sso.dev.local/identity-admin/`; formatting, UI-contract, CSS-cascade checks, TypeScript, 110 tests and production build pass (existing non-blocking lint/Vite/jsdom warnings remain).
- `packages/ui/showcase`: standalone component showcase is available via `npm run showcase:dev` or `npm run showcase:build`.

## U02a evidence (2026-09-06) — verified

- Preconditions: U01d is `verified`; `gouno-blog` and related `gosso-admin` were clean on `main` at start (`607c07b` / `581ae03`).
- Implementation: public taxonomy and archive pages now use `@gouno/ui` `PageHeader`/`Panel` plus shared token utility classes. Existing API calls, canonical links, search/filter/page parameters, and loading/empty/error behavior remain unchanged. No Connector or security/session behavior was touched.
- Verification: `blog-frontend/npm run quality` exit 0 (44 files / 167 tests, branch coverage 45.03%, production build passed). Targeted public regression tests (Home, PublicShell, TaxonomyArchive) exit 0 (3 files / 12 tests).
- Browser: in-app browser visibly rendered `/` and `/categories` at `http://127.0.0.1:5173`; navigation/footer and theme toggle were present. Playwright verified the homepage and `/categories` at 1440×900, 768×1024 and 390×844; each viewport passed both light and dark `documentElement.dataset.theme` checks. Screenshots were captured to `/tmp/u02a-{1440,768,390}-{light,dark}.png`.

## U02b evidence (2026-09-06) — verified

- Preconditions: U02a is `verified`; `gouno-blog` and related `gosso-admin` were clean on `main` at start (`91029fe` / `f9466f3`).
- Implementation: article reading, Markdown/code/image/TOC presentation, custom/About pages, account notification/settings states, 404, error boundary, and Step-Up callback presentation use `@gouno/ui` primitives plus current Tailwind tokens. Inline feedback now exposes like/comment/report failures. Existing API, preview, SEO, permission, authentication, session-restoration, and external identity-management semantics are unchanged; Connector was not touched.
- Verification: targeted reading/public-state regression passed (5 files / 21 tests); ErrorBoundary/Settings regression passed (2 files / 4 tests). Final `blog-frontend npm run quality` passed (47 files / 179 tests; statements 55.81%, branches 45.89%, functions 45.62%, lines 57.96%) with the unchanged coverage thresholds and a successful production build. Existing non-blocking oxlint warnings remain.
- Browser: local Vite visibly rendered `/about` at 1440×900 light and 390×844 dark, `/not-a-real-page` at desktop and 390×844 mobile, and `/?step_up_success=1` at 1440×900 dark. The browser confirmed `data-theme=light/dark`; layout, headings, navigation, callback status, and mobile wrapping were visible.
- Unverified: the local API at `127.0.0.1:8082` was unavailable (`curl` exit 7), so a live data-backed article, authenticated account pages, live interaction submissions, and the 768px tablet viewport were not browser-tested. Automated tests cover Markdown anchors/images/code copy/SEO, preview success/denial, comment/reply, interaction failure, account redirect, notification states, settings URL/error, and callback-window behavior.
- Handoff: U02c may independently review U02a/U02b. With a local backend and authenticated session, prioritize live article/account browser evidence; do not begin Admin implementation during the review.

## U02c public-phase review (2026-09-06) — verified

- Preconditions: U02a and U02b are `verified`; `gouno-blog` and related `gosso-admin` were clean on `main` at review start (`e616b03` / `f9466f3`). Review covered the public-page changes from `607c07b..HEAD` and did not implement Admin pages.
- Static and automated review: public migration entries match their implementation/test/browser evidence. `git diff --check 607c07b..HEAD` exited 0. `blog-frontend npm run quality` exited 0 (47 files / 179 tests; statements 55.74%, branches 45.86%, functions 45.52%, lines 57.91%); UI-contract, CSS-cascade, TypeScript and production build passed with unchanged thresholds. Existing oxlint warnings remain non-blocking. No legacy public-style conflict or unregistered exception was found.
- Browser: standard HTTPS `https://blog.dev.local` rendered the data-backed homepage and a real long-form article. Desktop dark and 390×844 light/dark article checks confirmed title, canonical/meta description, heading anchors, eight code-copy controls and no horizontal overflow. `/categories` rendered at 768×1024 light; `/categories/ai?page=1` preserved its deep link and query at 390×844 dark. Authenticated `/account/settings` and `/account/notifications` rendered at 390×844 dark without an error state. No interaction mutation was submitted.
- Unverified: live `preview=true` authorization branches; live like/comment/reply/report/mark-read mutations; forced live API error/retry states; production-domain flows. Automated regressions cover these contracts where listed in the corresponding entries.
- Conclusion and handoff: U02c is `verified` with no blocker. U03a may begin; preserve the verified public routes and limit work to Admin shell, Dashboard and list templates.

## U03a Admin shell, Dashboard and list templates (2026-09-06) — verified

- Preconditions and scope: U02c was rechecked at clean `main` HEAD `7b773bd` and remained `verified`; related `gosso-admin` was clean at `f9466f3`. Work ran on `codex/u03a-blog-admin-shell` and stayed within AdminShell, Dashboard review, and Posts/Pages/Users list templates. Connector, backend, authentication, session, database and production configuration were not changed.
- Implementation: AdminShell retains existing notification/search/theme/logout and permission filtering while hiding nonessential toolbar content below its responsive breakpoints. Posts, Pages and Users keep their desktop tables and existing API/action predicates, with compact mobile rows built from shared `ListStack`/`ListRow` primitives. Search/filter/query, pagination, selection, bulk actions, previews, edits, deletes and protected member actions keep their previous behavior.
- Automated verification: targeted Admin regressions exited 0 (5 files / 13 tests). The first full quality run exposed one old Pages test that assumed only one rendered responsive row; after updating it to assert both desktop and mobile representations, final `blog-frontend npm run quality` exited 0 (49 files / 185 tests; statements 55.81%, branches 46.42%, functions 45.56%, lines 58.02%). Formatting, oxlint, UI-contract, CSS-cascade, TypeScript, coverage and production build all passed; existing oxlint warnings remain non-blocking. `git diff --check` exited 0, and the local source-compose frontend build/replacement exited 0.
- Browser: authenticated `https://blog.dev.local` used the rebuilt local source image. The Dashboard showed a desktop sidebar/four-column metrics at 1440×900 and 1024×768; 768×1024 used the navigation Sheet, two-column metrics and light theme. At 390×844 dark, Posts and Pages showed compact rows with hidden desktop tables and no document overflow; `/admin/posts?status=draft&page=1` preserved its query and exposed the selection/bulk toolbar after checking a real draft. Users mounted six compact rows behind the unchanged Sudo lock; no privileged mutation was attempted. Browser console error/warning output was empty and the temporary viewport override was reset.
- Unverified and handoff: forced live API error injection, live multi-page pagination, all alternate-role browser sessions, Sudo unlock/member mutations and production-domain flows were not run. Automated tests cover error/empty/retry, permission-filtered navigation, critical actions and selection/bulk contracts. No blocker remains; U03b and U03c are unlocked, with editor internals reserved for U03b and complete support/member overlays reserved for U03c.

## U03b Blog Posts/Pages editors (2026-09-06) — verified

- Preconditions and scope: U03a was `verified`; Blog started from clean `main` HEAD `ababc210f3a5b75a23d0b0fa2d49991567c48518`, related `gosso-admin` from clean `main` HEAD `f9466f3c103cd7a40e24ec90556a359331e2adc8`. Work is limited to Post/Page editor presentation, editor tests, and shared editor CSS. No API, permission, authentication, security, database, session, or Connector behavior changed.
- Implementation: added shared-token responsive editor workspace styling for command bar, outline/history, canvas, inspector, AI panels, suggestions, preview, code blocks and tables. Post/Page editor errors are rendered visibly without changing request or state semantics. Mobile layout stacks the inspector; tablet hides the outline; long code/table content scrolls inside its container.
- Verification commands: targeted editor tests exit 0 (3 files / 15 tests); `blog-frontend npm run quality` exit 0 (50 files / 196 tests; statements 57.06%, branches 47.87%, functions 46.98%, lines 59.32%); `npm run build` exit 0; source-compose build and replacement exit 0; `git diff --check` exit 0. Existing non-blocking oxlint/Vite/jsdom/font/Lightning CSS warnings remain.
- Browser: authenticated standard HTTPS `https://blog.dev.local` on the rebuilt local source image. Desktop showed outline/canvas/inspector; 768×1024 hid the outline while retaining the inspector; 390×844 stacked command bar, editor and inspector. Unsaved title/body remained after viewport reflow; Markdown preview showed code and table content in internal scroll containers. Article and page editor document overflow were false and browser console error/warning count was zero; temporary viewport overrides were reset.
- Unverified: no live browser submission of save/publish/restore/frontsite-preview/409 conflict flows; AI writing/image/SEO/media actions, forced API errors, production domains and all alternate-role sessions were not run. Vitest covers the corresponding UI and permission contracts.
- Handoff: U03c is unlocked. Continue Taxonomy, Comments, Notifications, Media, Settings and Users security/overlay presentation; preserve editor API and permission semantics.

## Phase 0 source inventory

The authoritative machine-readable inventory is `migration.json.phase0Inventory`. The source scan records the following boundaries without changing runtime behavior:

- Blog has public, account, admin and catch-all routes. The account aliases `/notifications` and `/settings` redirect to their canonical paths; `/admin` redirects to `/admin/dashboard`; the media library entry is `/admin/media`.
- Gosso Admin has OIDC/password-recovery routes, authenticated account settings, admin-only system management, canonical redirects for `/account-settings` and `/system-management`, and an `*` fallback.
- Blog state and overlay surfaces include public/mobile navigation, article interaction and reporting, notification read states, CRUD/editor drawers, AI workspace forms and run records, media/taxonomy drawers, Step-up MFA and logout/permission failures. Connector is listed for display-only migration coverage; OAuth, credentials, Sandbox, Outbox and delivery transitions remain out of scope.
- Gosso Admin state and overlay surfaces include login/MFA/Passkey, callback and reset errors, account panels, Sudo verification, client/user/audit/site/system management, confirmation dialogs and management modals.
- Blog API dependencies are `agent`, `analytics`, `comments`, `connectors`, `media`, `members`, `notifications`, `operations`, `pages`, `posts`, `site` and `workflows`. Gosso Admin service dependencies are `accountService`, `auditService`, `clientService`, `siteSettingsService`, `systemService` plus `@gosso/client` authentication/session APIs.

## Shared package and distribution evidence — current boundary (2026-09-12)

- Gosso Admin consumes the external canonical `@gouno/ui@0.3.0` artifact built from `rushairer/gouno-ui@970bc1b0ad49de7b233901a5faf03c63dfa05892`; its vendored tgz SHA-256 is `1b09702168a5e1c46be59bf56c6786bcf49d109b422362192678aae93f42e30f` and its version-aware sync path has been verified as a true no-op when upstream has not changed.
- Gouno Blog now uses the same verified external artifact as canonical `@gouno/ui@0.3.0`, while the historical local `packages/ui@0.1.0` is isolated as explicit `@gouno/ui-legacy` compatibility prior art. Canonical and legacy archives have separate manifests and integrity records; there is no Vite or TypeScript alias redirecting canonical imports to legacy.
- Blog production imports are split by formal ownership. The audited migration boundary contains 52 source files using canonical layer subpaths and 59 files with explicit legacy imports; legacy debt is fixed at 48 symbols / 364 symbol-file pairs by `blog-frontend/scripts/legacy-ui-allowlist.json` and `npm run lint:ui` must reject both new and stale pairs.
- Blog Tailwind scans both canonical and legacy package output while compatibility remains. Local `node scripts/ui/distribute.mjs blog-frontend` updates only `@gouno/ui-legacy`; external canonical updates are owned solely by `.github/workflows/sync-gouno-ui.yml`.
- The 0.3.0 synchronization preserved the Connector hold: Connector behavior was not changed and ConnectorWorkspace regressions remained green through the full frontend quality gate.

## U01c evidence (2026-09-06)

- Preconditions: U01a and U01b are both `verified`; `gouno-blog` started at clean `main` (`b1ee1b70e8214ea98140ffda333de76d6276451a`). Related `gosso-admin` had the expected U01b edits only; its UI manifest was updated in this task.
- `packages/ui`: `npm ci` exit 0; `npm run typecheck` exit 0; `npm test -- --run` exit 0 (1 file / 5 tests); `npm run build` exit 0; `npm pack --json` exit 0; `npm run showcase:build` exit 0. An initial `npm pack -- --json` invocation exited 1 because npm parsed `--json` as an invalid package version; the corrected command passed. Existing font-resolution, Lightning CSS `@theme`, and Node localStorage warnings remain non-blocking.
- Archive/consumer check: both consumer archives are byte-identical and match the updated manifests (`a9ee…29cc`, `sha512-OQGj…ldA==`); package version is `0.1.0`. Both Tailwind entrypoints import shared `tokens.css`/`base.css` and register the shared `@source`; bootstrap and bundled fonts are present in the package output.
- Browser: local showcase at `http://127.0.0.1:5173/` visibly rendered the AdminShell/navigation, page/panel layout, form input, feedback, table and status badges. Theme menu exposed 浅色/深色/跟随系统; selecting light yielded `data-theme=light`, selecting dark yielded `data-theme=dark`, and system resolved to the current dark preference. The showcase uses `blog-admin`; all three brand values are covered by package ThemeProvider tests.
- Not measured: authenticated Blog/gosso-admin application routes, responsive widths, and production-domain browser flows remain outside U01c and were not run. No Connector behavior was changed.

## U01d review (2026-09-06) — verified

- Preconditions and baseline: U01a/U01b/U01c are marked `verified`; `git status --short --branch` exited 0 and both repositories were clean on `main` at review start and remained clean after verification commands.
- Verification commands: `blog-frontend npm run quality` exit 0 (44 files / 167 tests; branches 45.03%); `packages/ui npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run showcase:build` exit 0 (5 tests); `gosso-admin-frontend npm run quality` exit 0 (20 files / 110 tests); `npm pack --json` to a temporary destination exit 0. Existing oxlint, Vite config, jsdom navigation, font-resolution, Lightning CSS `@theme`, and Node localStorage warnings remain non-blocking.
- Archive review finding and resolution: `node scripts/ui/distribute.mjs blog-frontend ../gosso-admin/gosso-admin-frontend` exited 0. `cmp` of the two consumer archives exited 0, and all three archives now match SHA-256 `b86698a7ad7409bed50396f64f5b45acae8e995bcc1dec025bbe24fae2c58630` and integrity `sha512-iwi4xaQLfHQzuWEPVRt/9iMzwx3GwkEElfHzctnOJ8ymxPgQbWByilfFiIY9B266FOByDlzwQQaB6iwlRlKX1g==`.
- Browser evidence: local showcase `http://127.0.0.1:5173/` visibly showed shared shell, navigation, layout, form, feedback, table and status badges; theme menu opened and selecting dark resulted in `document.documentElement.dataset.theme=dark` (brand `blog-admin`). No authenticated routes, responsive widths, production domains, or full three-consumer browser run were measured.
- Conclusion and handoff: U01d is `verified`; `rg -n "localhost:8443" ...` exited 1 as expected (no matches), and `git diff --check` exited 0. U02a may begin.

## Baseline commands and known blockers

| Workspace | Commands / result |
| --- | --- |
| `packages/ui` | `npm run typecheck`, `npm run build`, `npm test -- --run` (2 passed), `npm run showcase:build`: passed; existing font-resolution and Lightning CSS `@theme` warnings |
| `blog-frontend` | formatting, lint, UI-contract, CSS-cascade, `npx tsc -b`, and build passed; 42 files / 160 tests passed; `npm run test:coverage` exits non-zero at 44.58% branches vs 45% threshold |
| `gosso-admin-frontend` | `npm run quality` passed; 19 files / 108 tests passed; coverage 43.89% statements, 39.22% branches, 31.83% functions, 44.63% lines; existing lint/Vite/jsdom warnings |

Known follow-up items are recorded rather than silently fixed: Blog branch coverage is below threshold and existing non-blocking lint/Vite/jsdom warnings remain. U01b's browser evidence covers the standard SSO origin and login route only; no authenticated browser, responsive-width, or light/dark route evidence has been added, so migration entries remain `verification: not-run`.

## U01b evidence (2026-09-06)

- Source: `/Users/aben/Git/gosso-admin/gosso-admin-frontend/vitest.config.ts` now configures jsdom as `https://sso.dev.local/identity-admin/`; `rg -n "localhost:8443" gosso-admin-frontend` returns no matches.
- Targeted test: `npm run test:run -- src/config/__tests__/appPaths.test.ts src/config/__tests__/testUrl.test.ts` — exit 0; 2 files / 3 tests passed, covering app-root and `/identity-admin/` path semantics on the standard origin.
- Quality/build: `npm run quality` — exit 0; 20 files / 110 tests passed; coverage 43.89% statements, 39.22% branches, 31.83% functions, 44.63% lines; build passed.
- Browser: `https://sso.dev.local/` visibly served the GOSSO Admin login page and redirected to the standard-origin `/login?...` route; direct `https://sso.dev.local/identity-admin/` loaded the existing “页面未找到” fallback. Authenticated browser flows were not run.

Automated checks do not replace authenticated browser regression. Entries remain `not-run` until the corresponding route, permission state, responsive width and light/dark mode have captured evidence.

| Surface | Routes / subview | Implementation | Verification |
| --- | --- | --- | --- |
| blog:App.tsx |  | migrated | verified |
| blog:components/ErrorBoundary.tsx |  | migrated | verified |
| blog:components/MarkdownRenderer.tsx |  | migrated | verified |
| blog-admin:components/agent/AdvancedWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/AgentForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/AgentRunRecords.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ArticlePreviewModal.tsx | /admin/ai-ops | not-started | not-run |
| connector:components/agent/ConnectorWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/EmbeddingForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/InboxWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/OperationsWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ProposalPreview.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ProviderForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/SkillForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/StatusPill.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowInputForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowLauncher.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowMediaCandidates.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunDetail.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunOutput.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunRecords.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkspaceOverview.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/DistributionDraftConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/KnowledgeSearchConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/LowEngagementConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/RssFetchConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/StalePostsConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/ToolBindingsEditor.tsx | /admin/ai-ops | not-started | not-run |
| blog:components/auth/GlobalStepUpBoundary.tsx |  | not-started | not-run |
| blog:components/auth/StepUpMfaModal.tsx |  | not-started | not-run |
| blog:components/auth/SudoBanner.tsx |  | not-started | not-run |
| blog:components/auth/SudoGate.tsx |  | not-started | not-run |
| blog-admin:components/editor/AiSuggestionControl.tsx |  | not-started | not-run |
| blog-admin:components/editor/ContentEditorFrame.tsx |  | not-started | not-run |
| blog-admin:components/media/MediaDrawerForms.tsx |  | not-started | not-run |
| blog-admin:components/taxonomy/CategoryForm.tsx |  | not-started | not-run |
| blog-admin:layouts/AdminShell.tsx |  | migrated | verified |
| blog:layouts/PublicShell.tsx |  | migrated | verified |
| blog:pages/About.tsx | /about | migrated | verified |
| blog:pages/AccountNotifications.tsx | /account/notifications, /notifications | migrated | verified |
| blog:pages/Archive.tsx | /archive | migrated | verified |
| blog:pages/ArticleIndex.tsx | /articles, /search, /categories/:slug, /tags/:slug | migrated | verified |
| blog:pages/Categories.tsx | /categories | migrated | verified |
| blog:pages/CustomPageView.tsx | /:slug | migrated | verified |
| blog:pages/Home.tsx | / | migrated | verified |
| blog:pages/NotFound.tsx | * | migrated | verified |
| blog:pages/PostDetail.tsx | /articles/:slug | migrated | verified |
| blog:pages/Settings.tsx | /account/settings, /settings | migrated | verified |
| blog:pages/Tags.tsx | /tags | migrated | verified |
| blog-admin:pages/admin/AIOperations.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:pages/admin/Categories.tsx | /admin/categories | not-started | not-run |
| blog-admin:pages/admin/Comments.tsx | /admin/comments | not-started | not-run |
| blog-admin:pages/admin/Dashboard.tsx | /admin, /admin/dashboard | migrated | verified |
| blog-admin:pages/admin/MediaLibrary.tsx | /admin/medialibrary | not-started | not-run |
| blog-admin:pages/admin/Notifications.tsx | /admin/notifications | not-started | not-run |
| blog-admin:pages/admin/PageEditor.tsx | /admin/pages/new, /admin/pages/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Pages.tsx | /admin/pages | migrated | verified |
| blog-admin:pages/admin/PostEditor.tsx | /admin/posts/new, /admin/posts/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Posts.tsx | /admin/posts | migrated | verified |
| blog-admin:pages/admin/SiteSettings.tsx | /admin/settings | not-started | not-run |
| blog-admin:pages/admin/Tags.tsx | /admin/tags | not-started | not-run |
| blog-admin:pages/admin/Users.tsx | /admin/users | migrated | verified |
| gosso-admin:App.tsx |  | not-started | not-run |
| gosso-admin:components/ErrorBoundary.tsx |  | not-started | not-run |
| gosso-admin:components/auth/LoginPreview.tsx |  | not-started | not-run |
| gosso-admin:components/auth/LoginSurface.tsx |  | not-started | not-run |
| gosso-admin:components/auth/SudoContext.tsx |  | not-started | not-run |
| gosso-admin:components/layout/AdminLayout.tsx |  | not-started | not-run |
| gosso-admin:pages/AccountSettings.tsx | /account-settings, /account-settings/:tab | not-started | not-run |
| gosso-admin:pages/Callback.tsx | /callback | not-started | not-run |
| gosso-admin:pages/ForgotPassword.tsx | /forgot-password | not-started | not-run |
| gosso-admin:pages/Home.tsx | / | not-started | not-run |
| gosso-admin:pages/Login.tsx | /login | not-started | not-run |
| gosso-admin:pages/NotFound.tsx | * | not-started | not-run |
| gosso-admin:pages/ResetPassword.tsx | /reset-password | not-started | not-run |
| gosso-admin:pages/SystemManagement.tsx | /system-management, /system-management/:tab | not-started | not-run |
| gosso-admin:pages/account-settings/EmailChangeModal.tsx | /account-settings/profile | not-started | not-run |
| gosso-admin:pages/account-settings/MFAPanel.tsx | /account-settings/mfa | not-started | not-run |
| gosso-admin:pages/account-settings/PasskeysPanel.tsx | /account-settings/passkeys | not-started | not-run |
| gosso-admin:pages/account-settings/PasswordPanel.tsx | /account-settings/password | not-started | not-run |
| gosso-admin:pages/account-settings/ProfilePanel.tsx | /account-settings/profile | not-started | not-run |
| gosso-admin:pages/account-settings/SessionsPanel.tsx | /account-settings/sessions | not-started | not-run |
| gosso-admin:pages/system-management/AuditLogsTab.tsx | /system-management/audit-logs | not-started | not-run |
| gosso-admin:pages/system-management/ClientsTab.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/SiteSettingsTab.tsx | /system-management/site-settings | not-started | not-run |
| gosso-admin:pages/system-management/SystemStatusTab.tsx | /system-management/system | not-started | not-run |
| gosso-admin:pages/system-management/UsersTab.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/audit/AuditLogDetailModal.tsx | /system-management/audit | not-started | not-run |
| gosso-admin:pages/system-management/clients/ClientEditorModal.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/clients/ClientSecretModal.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/users/AssignRolesModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/CreateUserModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/ResetPasswordModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/UserConsentsModal.tsx | /system-management/users | not-started | not-run |
| blog-admin:site-settings-tabs:basic | /admin/settings / basic | not-started | not-run |
| blog-admin:site-settings-tabs:appearance | /admin/settings / appearance | not-started | not-run |
| blog-admin:site-settings-tabs:hero | /admin/settings / hero | not-started | not-run |
| blog-admin:site-settings-tabs:social | /admin/settings / social | not-started | not-run |
| blog-admin:site-settings-tabs:seo | /admin/settings / seo | not-started | not-run |
| blog-admin:ai-workspaces:overview | /admin/ai-ops / overview | not-started | not-run |
| blog-admin:ai-workspaces:inbox | /admin/ai-ops / inbox | not-started | not-run |
| blog-admin:ai-workspaces:automation | /admin/ai-ops / automation | not-started | not-run |
| blog-admin:ai-workspaces:records:agent | /admin/ai-ops / records:agent | not-started | not-run |
| blog-admin:ai-workspaces:records:workflow | /admin/ai-ops / records:workflow | not-started | not-run |
| blog-admin:ai-workspaces:advanced:agents | /admin/ai-ops / advanced:agents | not-started | not-run |
| blog-admin:ai-workspaces:advanced:skills | /admin/ai-ops / advanced:skills | not-started | not-run |
| blog-admin:ai-workspaces:advanced:tools | /admin/ai-ops / advanced:tools | not-started | not-run |
| blog-admin:ai-workspaces:advanced:knowledge | /admin/ai-ops / advanced:knowledge | not-started | not-run |
| blog-admin:ai-workspaces:advanced:providers | /admin/ai-ops / advanced:providers | not-started | not-run |
| blog-admin:ai-workspaces:advanced:connectors | /admin/ai-ops / advanced:connectors | not-started | not-run |
