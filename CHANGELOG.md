# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

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
