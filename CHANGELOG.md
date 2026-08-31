# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

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
