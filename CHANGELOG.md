# Changelog

All notable changes to the complete Gouno Blog distribution are documented in
this file. The format follows Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- Add AI provider, agent, workflow, connector, media, search, and custom-page capabilities accumulated since 1.0.0.
- Add a production deployment contract based on immutable image digests and required secrets.

### Changed
- Prepare the backend and browser consumers for `gouno` 1.2 and
  `@gosso/client` 0.4; the dependency switch remains gated on their stable
  releases.
- Keep HttpOnly Cookie Session explicit until the browser SDK 0.4 dependency
  becomes available from the registry.
- Upgrade `gin-contrib/timeout` to 1.2.1 to remove a race in timeout handling.

### Security
- Add root licensing and disclosure policy, neutralize personal defaults, harden containers and browser response headers, and publish signed images with SBOM and provenance.

## [1.0.0] - 2026-05-31

### Added
- Initial integrated Blog, Gosso, Admin, database, cache, and gateway distribution.
