# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- Capture bounded upstream request/account correlation evidence for governed image attempts: OpenAI request/organization IDs, Anthropic request/organization/workspace IDs, and Gemini GenerateContent response IDs when returned. Forward the local dispatch ID as `X-Client-Request-Id` only to the official OpenAI API host; do not treat any captured identifier as a generic idempotency key or retry permission.
- Persist bounded, non-secret Provider profile/configuration and local dispatch evidence for governed image attempts; persist an exact object locator before object-store mutation so ACK-loss cases remain independently traceable without enabling replay or cleanup.
- Select exactly one Gemini image endpoint before dispatch and remove error-driven `predict`/GenerateContent fallback; model-based auto selection is pre-dispatch only, with real HTTP request-count regressions.
- Select the OpenAI-compatible image protocol before dispatch and remove error-driven endpoint fallback. Auto/empty image protocol now uses Responses once; Chat-only gateways must explicitly select `chat_completions`. Preserve text-generation negotiation and existing image stream-mode semantics; add real HTTP request-count regressions.
- Preserve stored bytes after any unconfirmed initial Media metadata creation in AI candidate generation, direct editor generation and ordinary uploads, including committed INSERT acknowledgements lost before an asset ID is returned. Add full generation and multipart-upload PostgreSQL/local-storage fault-injection tests without introducing automatic cleanup, replay or recovery.
- Fail closed when a configured BFF Secret file cannot be read; optional
  historical AEAD key files remain intentionally empty on first deployment.
- Enforce an absolute BFF session lifetime, make Redis session deletion atomic,
  surface logout-store failures, and require recent explicitly typed
  Back-Channel Logout tokens.

### Added

- Added an S3-compatible media storage backend for uploads and AI-generated images, selected through environment configuration.
- Added a read-only Google Search Console connector with encrypted OAuth refresh credentials and aggregate metrics queries.
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
- Added bounded `for_each` concurrency and per-resource-type query quotas; existing Workflows remain sequential unless concurrency is explicitly configured.
- Added idempotent Workflow domain events, signed external webhook intake, database event triggers, and exponential replay backoff.
- Added batch retry controls for failed Workflow resource iterations in run records.
- Added sandbox-only connector profiles, encrypted credentials, mock OAuth completion, approval-gated Outbox delivery, idempotency, audit, retry state, and revocation.
- Added per-connector sandbox rate limiting and retryable backoff audit states.
- Added versioned Workflow Intent parsing, deterministic capability templates, dependency matching, and server-compiled standard Workflow drafts.
- Added preflight checks for intent/template contracts, Tool authorization, approval paths, Provider purpose, and image-generation Provider readiness.

### Changed

- Adopt Capability Module as the backend ownership model for complex business areas; the legacy global layer directories are migration buckets rather than destinations for new business ownership.
- Add project-owned Gouno Codegen v1 `module` generation and retain upstream/default `suite` semantics unchanged.
- Move the Page canonical implementation under `internal/page/{domain,repository,service,controller}` while retaining narrow flat-layer compatibility facades.
- Complete the Community Capability Module migration under `internal/community/{domain,repository,service,controller}`: move composition/root consumers to canonical packages or narrow interfaces, extract interaction rate limiting to shared `internal/ratelimit`, route moderation comment reads through Community, remove duplicate Post Comment ownership, remove flat Community facades and root Community domain aliases, and centralize integration DB setup in `internal/testsupport.OpenTestDB`.
- Begin decomposing the mixed content flat bucket by moving Category/Tag persistence to canonical `internal/taxonomy/repository` and Site Settings persistence to `internal/site/repository`; keep `internal/repository/category_repository.go` only as a transitional composite facade until service/controller ownership is migrated.
- Workflow inputs are now compiled and validated with JSON Schema when saved and queued; resource Workflows default to strict run scope.
- Standard Workflow drafts are now compiled from server-owned templates; image Brief drafts carry `format=image_brief` and do not imply real image generation.

### Security

- Require a sufficiently strong workflow webhook secret before production starts with AI Agents enabled.
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
