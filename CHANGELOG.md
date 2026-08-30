# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

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

### Fixed
- **Rollback Documentation**: Add database/Redis/secret backup, recovery verification, 10-minute rollback timing template, and browser compatibility matrix to the production deployment runbook.

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

[Unreleased]: https://github.com/rushairer/gouno-blog/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/rushairer/gouno-blog/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rushairer/gouno-blog/releases/tag/v1.0.0
