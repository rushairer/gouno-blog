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

The `page` capability is the first fully migrated reference slice. Its canonical implementation lives under `internal/page/`; legacy Page symbols in the flat packages are temporary compatibility facades.

The `community` capability owns its domain, persistence, service, and HTTP controller under `internal/community/{domain,repository,service,controller}`. The moderation-only `GET /api/posts/:slugOrID/comments/all` route is also owned by the Community controller, so all active Community HTTP routes are capability-owned. Shared interaction rate limiting lives under `internal/ratelimit`, not a business service layer.

The duplicate Comment methods and contracts that previously remained on `PostService`, `PostRepository`, and `PostController` have been removed after active routes and tests moved to Community. Compatibility aliases that still serve real cross-package callers remain in the Community/domain facades and must be removed only after those callers migrate to canonical capability packages.

## Shared HTTP controller primitives

Cross-capability HTTP helpers live under:

```text
internal/controllerutil/
```

This package is an application-level HTTP adapter utility boundary. Capability controllers may depend on it. It must not depend on capability controller packages.

The legacy `internal/controller` package may temporarily expose compatibility facades while controllers are moved out of the flat bucket. Those facades are migration scaffolding, not a destination for new business controllers.

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
