# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- Add AI provider, agent, workflow, connector, media, search, and custom-page capabilities accumulated since 1.0.0.
- Add a production deployment contract based on immutable image digests and required secrets.

### Changed
- Validate the backend with `gouno` 1.2.0-rc.1 and the browser consumers with
  registry-published `@gosso/client` 0.4.0-rc.2; stable Blog publication remains
  gated on their corresponding stable releases.
- Use the SDK's default HttpOnly Cookie Session behavior and retain explicit
  origin and CSRF policy at each application boundary.
- Upgrade `gin-contrib/timeout` to 1.2.1 to remove a race in timeout handling.

### Security
- Add root licensing and disclosure policy, neutralize personal defaults, harden containers and browser response headers, and publish signed images with SBOM and provenance.

## [1.0.0] - 2026-05-31

### Added
- Initial integrated Blog, Gosso, Admin, database, cache, and gateway distribution.
