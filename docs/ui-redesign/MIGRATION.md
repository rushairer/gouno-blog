# UI migration and functional regression ledger

The JSON ledger is authoritative. Implementation and real browser verification are tracked independently. No production data or credentials belong in evidence.

## Baseline evidence (2026-09-05)

- `@gouno/ui`: `npm run typecheck`, `npm run build`, `npm test` (2 tests) and `npm run showcase:build` pass.
- `blog-frontend`: formatting, UI-contract, CSS-cascade checks, TypeScript, 160 tests and production build pass. The quality command is blocked by the existing global branch-coverage threshold (44.58%, required 45%).
- U01a 已完成：补充公共分类、标签、归档页面及 posts API 参数/空回退测试；`blog-frontend npm run quality` 通过，任务标记 verified。浏览器证据仍未执行。
- `gosso-admin-frontend`: U01b verified. Vitest jsdom now uses `https://sso.dev.local/identity-admin/`; formatting, UI-contract, CSS-cascade checks, TypeScript, 110 tests and production build pass (existing non-blocking lint/Vite/jsdom warnings remain).
- `packages/ui/showcase`: standalone component showcase is available via `npm run showcase:dev` or `npm run showcase:build`.

## Phase 0 source inventory

The authoritative machine-readable inventory is `migration.json.phase0Inventory`. The source scan records the following boundaries without changing runtime behavior:

- Blog has public, account, admin and catch-all routes. The account aliases `/notifications` and `/settings` redirect to their canonical paths; `/admin` redirects to `/admin/dashboard`; the media library entry is `/admin/media`.
- Gosso Admin has OIDC/password-recovery routes, authenticated account settings, admin-only system management, canonical redirects for `/account-settings` and `/system-management`, and an `*` fallback.
- Blog state and overlay surfaces include public/mobile navigation, article interaction and reporting, notification read states, CRUD/editor drawers, AI workspace forms and run records, media/taxonomy drawers, Step-up MFA and logout/permission failures. Connector is listed for display-only migration coverage; OAuth, credentials, Sandbox, Outbox and delivery transitions remain out of scope.
- Gosso Admin state and overlay surfaces include login/MFA/Passkey, callback and reset errors, account panels, Sudo verification, client/user/audit/site/system management, confirmation dialogs and management modals.
- Blog API dependencies are `agent`, `analytics`, `comments`, `connectors`, `media`, `members`, `notifications`, `operations`, `pages`, `posts`, `site` and `workflows`. Gosso Admin service dependencies are `accountService`, `auditService`, `clientService`, `siteSettingsService`, `systemService` plus `@gosso/client` authentication/session APIs.

## Shared package and distribution evidence

- Both consumers resolve `@gouno/ui@0.1.0` from `vendor/gouno-ui-0.1.0.tgz`.
- The two `vendor/ui-manifest.json` files agree with the checked-in consumer archive: SHA-256 `b86698a7ad7409bed50396f64f5b45acae8e995bcc1dec025bbe24fae2c58630` and npm integrity `sha512-iwi4xaQLfHQzuWEPVRt/9iMzwx3GwkEElfHzctnOJ8ymxPgQbWByilfFiIY9B266FOByDlzwQQaB6iwlRlKX1g==`.
- Both consumer Tailwind entrypoints import the shared tokens/base CSS and register `@source "../../node_modules/@gouno/ui/dist"`.
- `packages/ui/showcase` builds independently with `npm run showcase:build`; its page visibly includes shell, layout, form, feedback, table and status-badge combinations.

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
| blog:App.tsx |  | not-started | not-run |
| blog:components/ErrorBoundary.tsx |  | not-started | not-run |
| blog:components/MarkdownRenderer.tsx |  | not-started | not-run |
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
| blog-admin:layouts/AdminShell.tsx |  | not-started | not-run |
| blog:layouts/PublicShell.tsx |  | not-started | not-run |
| blog:pages/About.tsx | /about | not-started | not-run |
| blog:pages/AccountNotifications.tsx | /account/notifications, /notifications | not-started | not-run |
| blog:pages/Archive.tsx | /archive | not-started | not-run |
| blog:pages/ArticleIndex.tsx | /articles, /search, /categories/:slug, /tags/:slug | not-started | not-run |
| blog:pages/Categories.tsx | /categories | not-started | not-run |
| blog:pages/CustomPageView.tsx | /:slug | not-started | not-run |
| blog:pages/Home.tsx | / | not-started | not-run |
| blog:pages/NotFound.tsx | * | not-started | not-run |
| blog:pages/PostDetail.tsx | /articles/:slug | not-started | not-run |
| blog:pages/Settings.tsx | /account/settings, /settings | not-started | not-run |
| blog:pages/Tags.tsx | /tags | not-started | not-run |
| blog-admin:pages/admin/AIOperations.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:pages/admin/Categories.tsx | /admin/categories | not-started | not-run |
| blog-admin:pages/admin/Comments.tsx | /admin/comments | not-started | not-run |
| blog-admin:pages/admin/Dashboard.tsx | /admin, /admin/dashboard | not-started | not-run |
| blog-admin:pages/admin/MediaLibrary.tsx | /admin/medialibrary | not-started | not-run |
| blog-admin:pages/admin/Notifications.tsx | /admin/notifications | not-started | not-run |
| blog-admin:pages/admin/PageEditor.tsx | /admin/pages/new, /admin/pages/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Pages.tsx | /admin/pages | not-started | not-run |
| blog-admin:pages/admin/PostEditor.tsx | /admin/posts/new, /admin/posts/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Posts.tsx | /admin/posts | not-started | not-run |
| blog-admin:pages/admin/SiteSettings.tsx | /admin/settings | not-started | not-run |
| blog-admin:pages/admin/Tags.tsx | /admin/tags | not-started | not-run |
| blog-admin:pages/admin/Users.tsx | /admin/users | not-started | not-run |
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
