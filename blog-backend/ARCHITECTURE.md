# Blog Backend Architecture

This document describes the current architectural direction of `blog-backend`.
It is a project convention for this repository, not a requirement imposed by Gouno Core.

## Capability-first organization

`blog-backend` is a complex application and uses **Capability Module** organization:

```text
internal/
  <capability>/
    domain/
    repository/
    service/
    controller/
```

The capability is the primary ownership boundary. Layers are secondary implementation boundaries inside a capability.

A capability MUST contain only the layers it actually needs. Infrastructure capabilities such as encryption, observability, or test support must not create empty `domain`, `repository`, `service`, or `controller` packages merely for symmetry.

## Transitional flat-layer directories

The following directories are legacy migration buckets:

```text
internal/domain/
internal/repository/
internal/service/
internal/controller/
```

Existing code may remain there while it is migrated in coherent capability slices. New business features MUST NOT add new ownership to these flat buckets unless a migration constraint is documented in the same change.

Migration is intentionally incremental:

1. identify a capability and its dependency boundary;
2. extract genuinely shared infrastructure before moving business code;
3. move domain/repository/service/controller code as one coherent capability slice where practical;
4. retain narrow compatibility facades when moving all consumers in the same change would create unnecessary blast radius;
5. update imports and route wiring without changing externally observable behavior;
6. pass the full backend and repository CI gates before merging;
7. only then migrate the next capability.

Do not perform filename-only moves that leave package ownership ambiguous or introduce circular dependencies.

The `page` capability is canonical under `internal/page/{domain,repository,service,controller}`. The application composition root constructs its repository and service directly from the capability packages, `WebRouterOptions.PageSvc` carries the canonical Page service, and active Page routes bind directly to the canonical Page controller. Feed generation, Agent approval handling, Blog Tools, and shared HTTP error mapping also depend on the canonical Page service or its sentinels. The former flat Page repository/service/controller compatibility facades and their duplicate flat service/controller tests have been removed after repository-wide consumer proof and full `go test ./...` / `go vet ./...` verification. Root `internal/domain` Page aliases remain intentionally separate because cross-capability consumers still use those shared content-model symbols; they must not be moved or deleted merely for directory symmetry.

The `community` capability is fully canonical under `internal/community/{domain,repository,service,controller}`. Its composition root, router, moderation Tool integration, and HTTP error mapping now depend on canonical Community packages or narrow capability contracts. The moderation-only `GET /api/posts/:slugOrID/comments/all` route is owned by the Community controller, so all active Community HTTP routes are capability-owned. Shared interaction rate limiting lives under `internal/ratelimit`, not a business service layer.

The duplicate Comment methods previously present on `PostService`, `PostRepository`, and `PostController`, the flat Community service/repository/controller facades, the old service-level rate-limiter facade, and the root `domain.Comment` / `domain.Notification` / `domain.CommunityState` aliases have been removed. Consumers that need only part of Community depend on narrow contracts: Growth requires published-post resolution, while Blog Tools require moderation-list reads.

Category and Tag form the `taxonomy` capability, while site settings belong to the separate `site` capability. Their persistence, business behavior, and HTTP ownership are canonical under `internal/taxonomy/{repository,service,controller}` and `internal/site/{repository,service,controller}`.

The application composition root constructs Taxonomy and Site repositories/services independently, and `WebRouterOptions` carries separate `TaxonomySvc` and `SiteSvc` dependencies. Active Category/Tag routes bind directly to the Taxonomy controller and Site Settings routes bind directly to the Site controller. `FeedController` depends only on the narrow Site Settings read contract it actually uses. Shared HTTP error mapping recognizes canonical Taxonomy/Site service sentinels directly.

The former flat `internal/repository/category_repository.go`, `internal/service/category_service.go`, and `internal/controller/content_controller.go` compatibility facades have been removed after repository-wide consumer proof and full `go test ./...` / `go vet ./...` verification. The legacy `content_settings_test.go` compatibility-wrapper test was removed with them; canonical Site service tests own URL validation coverage. Taxonomy/Site therefore no longer depend on a cross-capability `CategoryService` or `CategoryRepository` aggregate.

Root content models such as `domain.Category`, `domain.TagSummary`, and `domain.Post` are not moved merely for directory symmetry. Their model boundary must be decided from actual ownership and cross-capability usage before any later relocation.

The legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it mixes post recommendations, post-version restore, and analytics. Decomposition follows real ownership. Media-asset persistence, business behavior, and HTTP ownership are fully canonical under `internal/media/{repository,service,controller}`. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts. The former GrowthRepository/GrowthService Media compatibility delegates and legacy Media error shims have been removed after full repository compilation proved no remaining consumers.

Analytics persistence, business behavior, and active HTTP ownership are canonical under `internal/analytics/{repository,service,controller}`. The application composition root constructs the Analytics repository/service directly and reuses that canonical service for runtime consumers. `GrowthRepository` no longer owns, implements, or delegates Analytics persistence. The repository owns `analytics_events` writes and the cross-capability analytics read model spanning posts, comments, reports, notifications, and daily event counts; the service owns view-recording validation and event semantics. The canonical Analytics controller owns both `/api/posts/:slugOrID/view` and `/api/admin/analytics`, and the active `analytics.get_summary` Tool handler is rebound directly to the canonical Analytics service without changing the Tool catalog. `GrowthService` still exposes a narrow, explicitly injected source-level compatibility facade while the remaining router/legacy BlogTools references are removed; it no longer constructs Analytics from `GrowthStore`. Post-version and recommendation behavior remain in the flat Growth bucket until their own seams are established.

Integration database setup discovered during the migration is shared through `internal/testsupport.OpenTestDB`; capability tests must not depend on private helpers owned by another capability's test file.

## Shared HTTP controller primitives

Cross-capability HTTP helpers live under:

```text
internal/controllerutil/
```

This package is an application-level HTTP adapter utility boundary. Capability controllers may depend on it. It must not depend on capability controller packages.

The legacy `internal/controller` package may temporarily expose compatibility facades while other controllers are moved out of the flat bucket. Those facades are migration scaffolding, not a destination for new business controllers.

## Dependency direction

Within a capability, prefer dependencies that point inward:

```text
controller -> service -> repository
                |          |
                +-> domain <-+
```

Cross-capability dependencies must be explicit and should target the narrowest stable package/API available. Do not share business behavior by moving it into a generic global layer bucket.

## Project-owned Codegen

Gouno provides reusable mechanisms and the project-aware Codegen protocol/runtime. This repository owns its architecture and its `.gouno/codegen.yaml` policy.

The Blog backend uses Gouno Codegen v1 and exposes a project-owned `module` generator:

```bash
go run ./cmd gen module <name>
```

The generator creates a minimal Capability Module skeleton under `internal/<capability>/` with `domain`, `repository`, `service`, and `controller` packages. It intentionally does **not** generate database code, routes, dependency injection, cross-capability imports, migrations, or a mandatory `module.go`; those decisions are capability-specific and must be added from real requirements.

The generated four-layer skeleton is a starting shape for business capabilities, not a requirement that every capability retain every layer. Remove unused layers instead of keeping empty architecture for symmetry.

The default `gouno-template` Flat Layered structure remains the reference for simpler applications and is not authoritative for this repository. Existing `suite` semantics are not redefined here; Blog uses the distinct `module` generator for Capability Module creation.

## Security and product boundaries

Architecture refactoring and Codegen must preserve the root `AGENTS.md` security contract, especially the confidential BFF boundary and Connector Module Hold. Structural cleanup is not authorization to change OAuth/OIDC, session, connector, credential, deployment, or security behavior.
