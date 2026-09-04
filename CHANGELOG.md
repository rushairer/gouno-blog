# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [1.5.26] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize inline status list and rows (`.inline-status-list`, `.inline-status-row`).
- Standardize semantic inline icon badges (`.inline-icon`, `--success`, `--danger`, `--warning`, `--info`).
- Standardize setup cards and health status cards (`.setup-card`, `.health-card`, `.setup-title`, `.health-icon`).

## [1.5.25] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize editor sticky command bar layout and elements (`.editor-commandbar`, `.editor-back`, `.editor-save-state`).
- Standardize preformatted JSON and code block viewer typography and border tokens (`.code-block-viewer`, `pre.code-block-viewer`).

## [1.5.24] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: unify post and page editor workspace multi-column grid (`.editor-workspace`, `.editor-workspace:not(:has(.editor-outline))`).
- Align canvas (main editor) and inspector (right sidebar) layout dimensions across 3-column (articles with outline/history) and 2-column (standalone pages) editor variants so that standalone pages match article canvas and right sidebar proportions seamlessly.

## [1.5.23] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize page header anatomy (`.admin-page-header`, `.page-header`, `.admin-page-heading`, `.admin-page-actions`, `.admin-page-count`).
- Standardize taxonomy and tag admin cards grid (`.tag-admin-grid`, `.tag-admin-card`, `.tag-admin-card__content`, `.tag-admin-card__actions`).
- Standardize media grid and media cards (`.media-grid`, `.media-card`, hover elevation and action layout).
- Standardize editor AI prompt box, result container, and candidate preview (`.editor-ai-prompt-box`, `.editor-ai-result-box`, `.editor-ai-result-header`, `.editor-ai-result-preview`).

## [1.5.22] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: redesign table filter bar to a single-row horizontal layout with unified 36px control height (search input, select dropdowns, clear button and actions).
- Fix admin sidebar section heading spacing and indentation alignment (`padding: 10px 12px 6px`, consistent rhythm with nav links).
- Add floating bulk action bar styling (`.bulk-action-bar`, `.table-bulk-actions`) and empty state normalization (`.filter-empty-state`, `.data-table-empty-wrap`).

## [1.5.21] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize 404 / Not Found page layout and card (`.not-found-page`, `.not-found-card`, `.not-found-title`, `.not-found-subtitle`).
- Normalize 2-column form grid (`.form-grid-2`) and card grid (`.card-grid`) with mobile breakpoints.
- Standardize semantic status dots (`.status-dot`, `--success`, `--warning`, `--danger`, `--brand`).
- Normalize section and modal dividers (`.modal-section-divider`, `.section-divider`).
- Standardize security MFA secret boxes and backup codes grid (`.mfa-secret-box`, `.mfa-secret-code`, `.mfa-backup-codes-grid`, `.mfa-backup-code`).

## [1.5.20] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize list stacks and item rows (`.list-stack`, `.list-row`, `.list-row-main`, `.list-icon`, `.list-title`, `.list-meta`).
- Align data table header and row hover states across `.admin-table`, `.content-table`, and `.dashboard-table` (uppercase tracking headers, hover row highlighting, text-right action columns, nested strong/small typography).
- Standardize plain sections (`.plain-section`, `.plain-section-title`).
- Normalize button group alignment variants (`.button-group-left`, `.button-group-right`, `.button-group-between`) and link buttons (`.btn-link`).

## [1.5.19] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize form input affix wrapper (`.input-affix-wrapper`, `.input-prefix-icon`, `.input-suffix-icon`, `.input-icon-button`, `.has-prefix`, `.has-suffix`).
- Normalize multiline text input (`.textarea-field`, `textarea.ui-control`, `textarea.input-field`): 88px min-height, vertical resize, 1.5 line-height.
- Standardize form field metadata (`.field__label` / `.form-label`, `.field__required` / `.form-label-required`, `.field__hint` / `.form-hint`, `.field__error` / `.form-error`, `.field--invalid`).
- Normalize checkbox and checkbox group (`.checkbox-field`, `.checkbox-group`, `.ui-checkbox`).
- Align metric strips and field summary cards (`.metric-strip`, `.metric-item`, `.field-card`, `.field-label`, `.field-value`).

## [1.5.18] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: normalize panel/card header anatomy (`.panel-heading`, `.panel-header`, `.card-header`, `.card-title`, `.card-description`, `.panel-heading__action`, `.panel-header__action`).
- Align panel body and card content (`.panel-body`, `.card-content`, `.flush` modifier) and card footer (`.card-footer`).
- Add definition list alignment (`.detail-list`, `.detail-row`, `.detail-label`, `.detail-value`) with cross-alias `.definition-*` variants.
- Add form action bar alignment (`.form-submit-bar`, `.is-sticky` modifier, `.form-submit-bar__status`) with cross-alias `.form-action-bar`.

## [1.5.17] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: normalize loading spinner geometry and animation (`.spinner`, `.loading-spinner`, `--sm/md/lg` variants, `.page-loading`).
- Align sidebar nav link geometry (`.admin-nav-group a`, `.admin-nav-link`, `.sidebar-link`): 40px min-height, 12px padding, token-based hover/active colors.
- Align sidebar section label (`.admin-nav-group h2`, `.admin-nav-section-title`): uppercase, 12px, 0.08em tracking.
- Align avatar component (`.admin-avatar`, `.avatar`, `--circle`, `--sm`, `--lg`): 34px, 8px radius, brand background.
- Normalize admin profile strip (`.admin-profile`, `.admin-profile div/strong/small`).
- Add breadcrumb alignment (`.breadcrumb`, `.page-breadcrumb`).
- Anchor reading progress bar to brand token (`.reading-progress-bar`).
- Normalize `:focus-visible` ring across buttons, nav links and tabs.

## [1.5.16] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize notice cards and informational banners (`.notice-card`, `.notice-card--info`, `.notice-card--stacked`, `.notice-card.success`, `.notice-card--success`).
- Align inline status indicators and metric labels (`.inline-status-title`, `.inline-status-value`, `.inline-status-value--success`, `.inline-status-value--danger`, `.system-link`).

## [1.5.15] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize inline code chips and URI copy chips (`.inline-code`, `.client-id-code`, `.uri-copy-chip`, `.uri-copy-text`, `.uri-copy-btn`).
- Align error retry banners (`.error-retry-banner`) and sticky section navigation bars (`.section-nav`).

## [1.5.14] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize Drawer slide-over panels and backdrop blur overlays (`.drawer-backdrop`, `.drawer-overlay`, `.drawer`, `.drawer-panel`, `.drawer > header`, `.drawer-header`, `.drawer-actions`, `.drawer-footer`).
- Standardize Confirm Dialog modal components (`.confirm-dialog`, `.confirm-dialog-title`, `.confirm-dialog-icon`, `.confirm-dialog-message`).

## [1.5.13] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize table pagination bar layout (`.pagination`, `.pagination-compact`, `.table-pagination`, `.pagination__info`, `.table-pagination-info`).
- Align table filter bars and search field wrappers (`.filter-bar`, `.table-filter-bar`, `.filter-bar__actions`, `.table-filter-actions`, `.search-field`).
- Standardize skeleton and shimmer placeholder variants (`.skeleton--text`, `.skeleton-text`, `.skeleton--circular`, `.skeleton-circular`, `.skeleton--rectangular`, `.skeleton-rectangular`, `.skeleton--card`, `.skeleton-card`, `.table-skeleton-wrap`).

## [1.5.12] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: normalize form controls (`.ui-control`, `.input-field`), compact control variants, and select wrappers.
- Standardize Switch and Checkbox component styling (`.ui-switch-label`, `.switch-field`, `.ui-switch__text`, `.ui-switch__label`).
- Harmonize Empty and Error states (`.state`, `.empty-state`, `.state__actions`, `.empty-state-actions`) with unified 40px icon sizing, typography, and spacing.
- Align Feedback banner styles (`.feedback--error`, `.feedback-error`, `.feedback--success`, `.feedback-success`).
- Standardize Tab button height (34px), active states, and Toast notification container/card cross-project aliases.

## [1.5.11] - 2026-09-04

### Changed

- Align UI/UX design system with GOSSO Admin: standardize table action container (`.table-actions`, `.button-group`, `.row-actions`, `.action-group`) with unified 8px gap (`gap-2`) and right alignment.
- Standardize table action button dimensions to 34px (`--control-h-sm`), with 34px × 34px icon buttons and 34px compact text buttons.
- Refine danger button styling (`.btn-danger`, `.icon-button--danger`) with subtle 28% translucent border and soft background, eliminating heavy solid red border.
- Add cross-project class aliases (`.icon-btn`, `.btn-icon`, `.modal-footer`, `.glass-card`).

## [1.5.10] - 2026-09-04

### Fixed

- Send OpenID Connect `login_hint` (bound to active session's `preferred_username` or `Subject`) in `BeginStepUp` authorization requests to prevent cross-account identity mismatch errors during Sudo Mode step-up authentication (`blog-backend/internal/authbff/client.go`).

## [1.5.9] - 2026-09-04

### Fixed

- Add MFA Step-Up modal challenge (`StepUpMfaModal`) to blog admin Site Settings (`/admin/settings`), automatically intercepting `recent_mfa_required` API errors during settings updates.
- Persist pending site settings in `sessionStorage` across SSO Step-Up redirections to prevent form draft loss.
- Unify notification design language across admin settings by eliminating duplicate simultaneous page `<Feedback>` and floating `<Toast>` banners.
- Extract unified `isMfaError` helper in frontend auth module shared between user membership and site settings.
- Fix Radix Dialog overlay and content z-index hierarchy conflict with admin sticky topbar by removing conflicting `z-50` utility classes, ensuring dialog overlay (`z-index: 1000`) cleanly masks the topbar (`z-index: 80`).
- Log detailed error diagnostics in BFF authentication callback handler when callback validation fails.

## [1.5.8] - 2026-09-03

### Changed

- Refactor admin management views (comments, categories, tags, notifications) to use `AsyncState` with structured table skeletons and dedicated error-retry handling, eliminating layout shifts and state collision bugs.
- Introduce reusable `Card` primitive (`Card`, `CardHeader`, `CardContent`, `CardFooter`) in UI component library with variant and interactive hover/active feedback.
- Replace full-page reloads on article detail error recovery with in-place reactive re-fetch.
- Standardize version history drawer empty state and notification action bar styling.

## [1.5.7] - 2026-09-02

### Fixed

- Add explicit `type="submit"` attribute to action buttons in media upload (`MediaUploadForm`), category (`CategoryForm`), and tag management (`Tags`) modal/drawer forms so form submissions execute properly under UI component defaults.
- Surface upload error feedback directly within the media upload drawer and display toast notifications on upload failures.
- Add test coverage verifying media library drawer form submission and API dispatch.

## [1.5.6] - 2026-09-02

### Fixed

- Associate AI workspace starter pack bootstrap agents, workflows, and workflow versions with the earliest active owner principal to avoid not-null constraint errors on startup.
- Use dynamic site title in the article detail page for accurate browser title and OpenGraph metadata.
- Format frontend authentication and MFA modal components to maintain code quality standards.

## [1.5.5] - 2026-09-02

### Changed
- Complete AI and Community identity hard cutover to `blog_principal_id`, removing legacy bare subject columns and parameters across database schema, repositories, controllers, tools, and background tasks.
- Backfill unmapped legacy development rows to the earliest active owner principal.
- Enforce AAL2 baseline and 10-minute transaction MFA step-up requirements on sensitive AI, ownership, and management routes.

### Added
- Add same-origin Step-Up MFA endpoint (`/api/auth/mfa/step-up`) in the Blog BFF to handle multi-factor verification server-to-server and refresh session claims within the confidential BFF boundary.
- Database migrations 085 (Connector PKCE), 086 (Community principal identity), 087 (AI principal columns), 088 (AI principal backfill), and 089 (drop legacy identity columns).

## [1.5.4] - 2026-09-01

### Security

- Restrict the production `blog-bff` RP-Initiated Logout registration to its
  exact, state-validated Blog callback URI.

### Fixed

- Make Caddy the single Content-Security-Policy authority for Blog responses,
  eliminating conflicting policy headers from the frontend and backend.

## [1.5.3] - 2026-09-01

### Fixed

- Make the production Compose deployment compatible with rootful Podman and
  persisted legacy data: writable service initialization, file-secret mounts,
  and Nginx temporary directories now start correctly.
- Pass the required runtime variables to Caddy and GOSSO, including the RSA
  key ID and SMTP sender configuration.
- Restore the internal Mailpit SMTP capture service used by the existing
  deployment; external SMTP settings continue to override its defaults.

## [1.5.2] - 2026-09-01

### Fixed

- Align the single-page editor's draft, publish, update, and unpublish actions
  with the article editor so the selected publishing intent always matches the
  action that is submitted.
- Restore frontend quality gates by formatting affected UI files and keeping
  the shared profile hook compliant with React Hook ordering rules.

### Changed

- Upgrade the Blog frontend to `@gosso/client` 0.9.2 for the current
  cookie-session and OAuth flow handling fixes.
- Update the production image template to use GOSSO Admin `v0.7.4`.

## [1.5.1] - 2026-09-01

### Fixed

- Unify AI Operations overview metrics with Dashboard standard `.admin-metrics` Panel cards and typography.
- Fix approval queue item tag wrapping by maintaining horizontal distribution.
- Separate member account ID into a dedicated table column with standard compact copy action.
- Fix MFA security verification modal input icon overlap.
- Fix role card radio alignment in member edit modal.
- Fix workflow table title and description cell overflow and text wrapping.
- Redesign workflow input resource selector into structured cards with control, title, status badges, and description.


### Changed

- Standardize the Blog frontend on shared Button, ButtonLink, IconButton,
  ChoiceButton, Tabs, form-control, pagination, and overlay interaction
  contracts. Icons now render through fixed component-owned slots with
  consistent loading, disabled, compact, and accessible states.
- Migrate portal, administration, workflow, editor, table, and AI-operation
  actions away from page-local button markup and styling.

### Added

- Enforce UI contracts against raw application buttons, raw button classes,
  direct button-child SVGs, and native selects outside shared UI primitives.

## [1.4.3] - 2026-09-01

### Security

- Enforce the Blog BFF's 12-hour session limit as an absolute lifetime instead
  of extending Redis sessions after token refresh, preventing copied session
  handles from renewing beyond the browser Cookie lifetime.
- Fail closed when local logout cannot read or atomically delete the Redis
  session, and keep subject/SID index cleanup in the same Redis transaction.
- Require explicitly typed, recently issued Back-Channel Logout tokens and
  align the production template with GOSSO `v1.5.4` logout-token hardening.

## [1.4.2] - 2026-09-01

### Security

- Scope Blog BFF Redis subject and SID session indexes to the verified issuer,
  preventing a Back-Channel Logout token from one issuer from deleting a
  same-value identity session belonging to another issuer.
- Require production S3 static credentials to arrive only through non-empty
  Docker Secret files; reject raw credential environment variables whenever
  S3 media storage is enabled.

### Fixed

- Standardize admin action buttons and navigation links on fixed icon/label
  slots for consistent alignment and accessible UI behavior.

## [1.4.1] - 2026-08-31

### Security
- Extend production Docker Secret-only injection to PostgreSQL, Redis, GOSSO
  database/Redis/SMTP credentials, and the GOSSO Admin and Blog seed jobs;
  configured Secret files now fail closed when unreadable or empty.
- Make the local GOSSO container trust the development CA for HTTPS
  Back-Channel Logout delivery, and enforce that mount in the authentication
  deployment contract.

### Fixed
- Canonicalize active local OAuth/OIDC documentation, Compose defaults,
  OpenAPI examples, Caddy policy, and test origins to `*.dev.local` without
  an explicit default HTTPS port.

## [1.4.0] - 2026-08-31

### Changed
- **Breaking:** Production Blog database, Redis, visitor-session, and workflow
  webhook secrets must now be supplied through Docker Secret files. Raw Blog
  secret environment variables are no longer accepted by the production
  deployment contract.
- Require the Blog callback, logout callback, and API resource to remain on the
  exact Blog origin, while every discovered OIDC endpoint must remain on the
  exact HTTPS issuer origin.
- Make the locally configured issuer and subject the only Blog owner-bootstrap
  identity; provider roles and scopes no longer grant Blog authorization.

### Security
- Prevent refresh/logout races from resurrecting deleted Redis sessions and
  make back-channel logout replay claims atomic.
- Strictly verify refreshed ID tokens and preserve issuer, subject, SID,
  authentication time, AMR, and claim continuity.
- Fail closed when the configured owner account is missing and disable seeded
  consent in production.
- Pin every default application image and the backend builder image to immutable
  digests.
- Add the 2026-08-31 split-domain OAuth/OIDC baseline audit and production
  acceptance gates.

## [1.3.5] - 2026-08-30

### Fixed
- Pin `@gosso/client` to the immutable registry release `0.9.1`.

## [1.3.4] - 2026-08-30

### Changed
- Make the confidential Blog BFF client and split-domain callback endpoints the
  only seed and source-override defaults.
- State explicitly that the split-domain topology is permanent; remove the
  obsolete identity-transition contingency runbook, ADR language, and CI gate.

### Removed
- Remove the retired identity-transition readiness checker.

## [1.3.3] - 2026-08-30

### Security
- Retire the superseded deployment repository in favor of the distinct local
  SSO, Blog, and CMS origins maintained by this distribution.

### Fixed
- Align the production runbook with the required GOSSO TOTP key and verification
  pepper secret files.

## [1.3.2] - 2026-08-30

### Security
- Stop inferring that identities with the same subject on different issuers belong
  to the same Blog principal. Cross-issuer aliases now require an explicitly
  approved, auditable mapping with an evidence reference before they are used.

### Security
- **BFF Multi-Replica Distributed Lock**: Add Redis distributed mutex and double-checked expiration validation for BFF session token refresh to prevent concurrent token rotation and false-positive reuse detection (`internal/authbff/store.go`, `internal/authbff/client.go`).
- **Read-Only Authorization Integrity Check**: Add `VerifyIntegrity` audit method to verify Blog principals, issuer aliases, active memberships, and role owner consistency without side effects (`internal/access/service.go`).

### Changed
- **Local Compose and Caddy Alignment**: Align default `docker-compose.yml` and `Caddyfile` with the `.dev.local` split-identity topology.

## [1.3.1] - 2026-08-30

### Fixed
- Pin `@gosso/client` to the immutable registry release `0.9.0`.

## [1.3.0] - 2026-08-30

### Changed
- Move legacy issuer preservation to an additive database alias migration; runtime Blog authorization accepts only the configured SSO issuer.
- Route RP-initiated logout through a same-origin callback that consumes the one-time logout state.

### Security
- Refresh expiring BFF OAuth sessions only on the server and clear invalid sessions before application authorization runs.
- Validate every declared production Compose image reference for digest pinning, including interpolated values.

### Security
- **Logout URI SSRF/XSS Prevention**: Validate front-channel and back-channel logout URIs at registration/update time (HTTPS-only, no loopback/private IPs, no fragments/credentials). HTML-escape front-channel iframe URIs to prevent stored XSS.
- **GET Logout CSRF Prevention**: GET `/oidc/logout` now shows a confirmation page; actual session logout only occurs via POST.
- **Legacy Logout Session Isolation**: ID token hints without `sid` no longer trigger full account session revocation; the OP resolves the current session from the cookie and logs out only it.
- **RFC 8707 Resource Enforcement**: Blog seed now persists `allowed_resources` to the database; the OP rejects `resource` requests from clients with no registered allowed resources.

## [1.2.1] - 2026-08-29

### Security
- **RFC 7009 Token Revocation Authentication**: Update `authbff/client.go` to authenticate revocation requests using HTTP Basic Auth (`client_secret_basic`).
- **RFC 10017 BFF Boundary Isolation**: Upgrade `@gosso/client` to `0.8.8` to strictly confine browser requests to same-origin endpoints.

### Fixed
- **Container Health Check**: Add healthcheck probe to `blog-backend` in `docker-compose.production-split.yml`.

## [1.2.0] - 2026-08-29

### Added
- **OIDC Back-Channel Logout Hardening**: Add `iat` / `jti` claim validation, Redis `SETNX` token replay prevention, and targeted SID deletion to prevent multi-device session destruction.
- **Topology & Docker Compose Hardening**: Configure `SSO_TOKEN_AUDIENCE`, `SSO_CLIENT_ID`, and `BLOG_OAUTH_ALLOWED_RESOURCES` for RFC 8707 audience binding; enforce PKCE for confidential clients (`GOUNO_AUTH_ENFORCE_PKCE_FOR_CONFIDENTIAL=true`); restrict CORS origins to SSO domain.
- **Database Initialization Idempotency**: Update `init.sql` to conditionally create application databases without startup errors on existing volumes.

### Security
- Remove `id_token_hint` from front-channel logout URLs in `internal/authbff/client.go` to prevent ID token leakage via browser history, referrer headers, and access logs.

## [1.1.0] - 2026-08-24

### Added
- Add AI provider, agent, workflow, connector, media, search, and custom-page capabilities accumulated since 1.0.0.
- Add a production deployment contract based on immutable image digests and required secrets.

### Changed
- Validate the backend with stable `gouno` 1.2.0 and the browser consumers with
  registry-published `@gosso/client` 0.4.0 before stable Blog publication.
- Use the SDK's default HttpOnly Cookie Session behavior and retain explicit
  origin and CSRF policy at each application boundary.
- Upgrade `gin-contrib/timeout` to 1.2.1 to remove a race in timeout handling.

### Fixed
- Initialize the persistent media volume with the backend's fixed non-root
  UID/GID before startup so uploads remain writable after a hardened-image
  upgrade without changing host-directory permissions.

### Security
- Add root licensing and disclosure policy, neutralize personal defaults, harden containers and browser response headers, and publish signed images with SBOM and provenance.

## [1.0.0] - 2026-05-31

### Added
- Initial integrated Blog, Gosso, Admin, database, cache, and gateway distribution.

[Unreleased]: https://github.com/rushairer/gouno-blog/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/rushairer/gouno-blog/compare/v1.4.1...v1.4.2
[1.4.0]: https://github.com/rushairer/gouno-blog/compare/v1.3.5...v1.4.0
[1.3.5]: https://github.com/rushairer/gouno-blog/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/rushairer/gouno-blog/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/rushairer/gouno-blog/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/rushairer/gouno-blog/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/rushairer/gouno-blog/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/rushairer/gouno-blog/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/rushairer/gouno-blog/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/rushairer/gouno-blog/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/rushairer/gouno-blog/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rushairer/gouno-blog/releases/tag/v1.0.0
