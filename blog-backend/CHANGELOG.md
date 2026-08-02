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
- Added structured Workflow resource inputs for posts, comments, media, operational suggestions, categories, and tags, with resource-page launch shortcuts.
- Added deterministic `resource_query` steps and immutable per-run resource snapshots for audit and retry reproducibility.
- Added persisted resource-query previews, last-match counts, and configurable empty-result handling.
- Added disabled starter Workflows for post-publish review, reported-comment review, and missing-Alt media checks.
- Added opt-in per-resource partial-failure aggregation for `for_each` steps; legacy steps retain fail-fast behavior.
- Added per-resource retry API and run-record action for failed `for_each` iterations, preserving the original input and dynamic-resource snapshot.

### Changed

- Workflow inputs are now compiled and validated with JSON Schema when saved and queued; resource Workflows default to strict run scope.

### Security

- Allowed public HTTPS Provider upstreams by default while requiring explicit authorization for private hosts; DNS, resolved IPs, redirects, and forbidden network ranges remain fail-closed.
- Recognized proxy-generated `198.18.0.0/15` Fake-IP results for domain-based Provider URLs without allowing literal benchmark-range URLs by default.
- Required all Agent content changes to pass through conflict-aware human approval.
- Restricted Workflow-derived Tool calls to snapshotted run resources; explicitly discovered resources are read-only and cannot become proposal targets.

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
