# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Added database-backed OpenAI and Anthropic Provider Profile management with encrypted API keys.
- Added versioned Provider secret keyrings for online master-key rotation.
- Added configurable AI Agents, Blog Tool capability controls, manual and Cron runs, usage budgets, run history, and approval-only content proposals.
- Added the AI Agent management console and three built-in blog operations templates.

### Security

- Restricted Provider upstreams to configured hosts, rejected unsafe URLs and redirects, and kept Provider secrets out of API responses and run logs.
- Required all Agent content changes to pass through conflict-aware human approval.

## [1.0.1] - 2026-06-13

### Changed

- Include complete module requirements and checksums so rendered projects can run Go tooling immediately.
- Return configuration load and validation errors from `ConfigManager` instead of exiting inside the config package.
- Add baseline configuration validation for generated projects.
- Strengthen template verification to cover downloaded module checksums.

## [1.0.0] - 2026-05-31

### Added

- Complete DDD project scaffold: `cmd/`, `config/`, `internal/` (domain, repository, service, task), `router/`, `middleware/`, `utility/`.
- Cobra CLI with `web` and `generator` commands.
- Viper multi-environment configuration (`development.yaml`, `test.yaml`, `production.yaml`).
- `ConfigManager` thread-safe configuration singleton.
- Gin web server with graceful shutdown.
- `Makefile` with build, run, dev, test targets.
- `.air.toml` for hot-reload development.
- Code generation templates (`domain.tmpl`, `repository.tmpl`, `service.tmpl`, `controller.tmpl`, `task.tmpl`).
- Bilingual README (English / Chinese).
