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
4. update imports and route wiring without changing externally observable behavior;
5. pass the full backend and repository CI gates before merging;
6. only then migrate the next capability.

Do not perform filename-only moves that leave package ownership ambiguous or introduce circular dependencies.

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

## Gouno relationship

Gouno provides reusable mechanisms and the project-aware Codegen protocol/runtime. This repository owns its architecture and any future `.gouno/codegen.yaml` policy.

For this backend:

- Capability Module is the project architecture convention.
- A future `module` generator may encode this convention after the migration shape is proven in real capabilities.
- The default `gouno-template` Flat Layered structure is a reference for simpler applications and is not authoritative for this repository.
- Existing `suite` semantics must not be silently redefined to mean Capability Module generation.

## Security and product boundaries

Architecture refactoring must preserve the root `AGENTS.md` security contract, especially the confidential BFF boundary and Connector Module Hold. Structural cleanup is not authorization to change OAuth/OIDC, session, connector, credential, deployment, or security behavior.
