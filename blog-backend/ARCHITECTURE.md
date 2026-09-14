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

The remaining legacy migration boundaries are:

```text
internal/domain/       # deliberate shared-model boundary; classify before moving
internal/repository/   # transitional repository/facade bucket
internal/controller/   # transitional HTTP/controller bucket
```

The former `internal/service/` bucket has been retired. Existing code may remain in the boundaries above only while it is migrated in coherent capability slices. New business features MUST NOT add new ownership to these flat buckets unless a migration constraint is documented in the same change.

The live ownership, dependency, transaction, compatibility-facade, and removal-condition inventory is maintained in [ARCHITECTURE_CONVERGENCE.md](./ARCHITECTURE_CONVERGENCE.md). Treat that map as the migration Source of Truth and update it with every architecture slice.

Migration is intentionally incremental:

1. identify a capability and its dependency boundary;
2. extract genuinely shared infrastructure before moving business code;
3. move domain/repository/service/controller code as one coherent capability slice where practical;
4. retain narrow compatibility facades when moving all consumers in the same change would create unnecessary blast radius;
5. update imports and route wiring without changing externally observable behavior;
6. pass the full backend and repository CI gates before merging;
7. only then migrate the next capability.

Do not perform filename-only moves that leave package ownership ambiguous or introduce circular dependencies.

The `page` capability is canonical under `internal/page/{domain,repository,service,controller}`. The application composition root constructs its repository and service directly from the capability packages, `WebRouterOptions.PageSvc` carries the canonical Page service, and active Page routes bind directly to the canonical Page controller. Feed generation, Agent approval handling, Blog Tools, and shared HTTP error mapping also depend on the canonical Page service or its sentinels. The former flat Page repository/service/controller compatibility facades and their duplicate flat service/controller tests have been removed after repository-wide consumer proof and full gates. Root `internal/domain` Page aliases are also retired: Access policy, Agent approval, and Tool consumers that need Page values import `internal/page/domain` directly, while behavior continues to flow through the canonical Page service. `internal/page/domain/ownership_test.go` rejects reintroduction of Page symbols through the root domain boundary.

The `community` capability is fully canonical under `internal/community/{domain,repository,service,controller}`. Its composition root, router, moderation Tool integration, and HTTP error mapping now depend on canonical Community packages or narrow capability contracts. The moderation-only `GET /api/posts/:slugOrID/comments/all` route is owned by the Community controller, so all active Community HTTP routes are capability-owned. Shared interaction rate limiting lives under `internal/ratelimit`, not a business service layer.

The duplicate Comment methods previously present on `PostService`, `PostRepository`, and `PostController`, the flat Community service/repository/controller facades, the old service-level rate-limiter facade, and the root `domain.Comment` / `domain.Notification` / `domain.CommunityState` aliases have been removed. Consumers that need only part of Community depend on narrow contracts: Recommendation and Analytics require published-post resolution, while Blog Tools require moderation-list reads.

Category and Tag form the `taxonomy` capability, while site settings belong to the separate `site` capability. Their persistence, business behavior, and HTTP ownership are canonical under `internal/taxonomy/{repository,service,controller}` and `internal/site/{repository,service,controller}`.

The application composition root constructs Taxonomy and Site repositories/services independently, and `WebRouterOptions` carries separate `TaxonomySvc` and `SiteSvc` dependencies. Active Category/Tag routes bind directly to the Taxonomy controller and Site Settings routes bind directly to the Site controller. RSS and sitemap transport are capability-owned under `internal/feed/controller`; Feed owns no persistence and consumes only narrow Post listing, published Page listing, and Site Settings read contracts. The public `/feed.xml`, `/rss`, and `/sitemap.xml` routes retain their existing behavior while no longer depending on the transitional flat controller bucket. Shared HTTP error mapping recognizes canonical Taxonomy/Site service sentinels directly.

The former flat `internal/repository/category_repository.go`, `internal/service/category_service.go`, and `internal/controller/content_controller.go` compatibility facades have been removed after repository-wide consumer proof and full `go test ./...` / `go vet ./...` verification. The legacy `content_settings_test.go` compatibility-wrapper test was removed with them; canonical Site service tests own URL validation coverage. Taxonomy/Site therefore no longer depend on a cross-capability `CategoryService` or `CategoryRepository` aggregate.

`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. `PostVersion` is likewise owned by `internal/postversion/domain`, and its `Status` field references the Post-owned status contract under `internal/post/domain`. `PostStatus`, `Post`, `PostSearchResult`, and `AdminPostFilter` are Post-owned values under `internal/post/domain`; their historical root declarations are retired after repository-wide consumer proof. Cross-capability readers import the leaf Post domain contract directly rather than treating root `internal/domain` as a shared kernel. Workflow definitions, scope/event configuration, run/step/resource snapshots, dispatch claims, interactions, and run events are Workflow-owned values under `internal/workflow/domain`; the historical root `internal/domain/workflow.go` bucket is retired after repository-wide consumer proof. Agent, Workflow planner, Starter Pack, and other consumers import that leaf contract directly. Provider profile identity/configuration values (`ProviderType` and `ProviderProfile`) are Provider-owned under `internal/provider/domain`; Agent management/runtime and Workflow planning import that leaf contract directly while credential validation, encryption and upstream runtime behavior remain in canonical Provider/Agent services.

The former flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket has been fully decomposed instead of being promoted into a fake `growth` capability. It historically mixed recommendations, post-version restore, analytics, and media behavior; each responsibility now has a real owner. The legacy Growth repository, service, controller, migrated integration tests, compatibility tests, Router dependency, and composition-root construction have all been removed. No active runtime component constructs or depends on a Growth object.

Media-asset domain values, persistence, business behavior, and HTTP ownership are fully canonical under `internal/media/{domain,repository,service,controller}`. `MediaAsset`, `MediaFilter`, and `MediaReference` are Media-owned contracts; Access policy and Agent/Operations consumers import that leaf domain package without importing Media service behavior. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts.

Analytics is fully canonical under `internal/analytics/{repository,service,controller}`. The application composition root constructs the Analytics repository/service directly and reuses that canonical service for every active runtime consumer. `WebRouterOptions.AnalyticsSvc` carries the service explicitly to the canonical Analytics controller, while `BindAnalytics` connects the public `analytics.get_summary` Tool definition directly to the same service. The unbound Tool placeholder fails closed instead of falling back to another capability. The Analytics repository owns `analytics_events` writes and the cross-capability read model spanning posts, comments, reports, notifications, and daily event counts; the Analytics service owns view-recording validation and event semantics; the Analytics controller owns both `/api/posts/:slugOrID/view` and `/api/admin/analytics`.

Analytics read-model values are capability-owned under `internal/analytics/domain`: `AnalyticsSummary`, `SystemAlert`, and `DailyEventCount`. The summary remains a cross-capability projection and its `TopPosts` field references the Post-owned leaf domain contract directly. Tool consumers import the Analytics read-model contract rather than root `internal/domain`.

Recommendation persistence, business behavior, and active HTTP ownership are fully canonical under `internal/recommendation/{repository,service,controller}`. The repository owns the tag-overlap query and related-post row mapping used by `/api/posts/:slugOrID/related`, with direct integration coverage under the capability. The service owns source-post validation, the empty-tag fast path, and the bounded related-post query limit. The application composition root constructs the canonical Recommendation service directly, `WebRouterOptions.RecommendationSvc` carries it explicitly, and the public related-post route binds to the canonical Recommendation controller. Shared HTTP error mapping recognizes the Recommendation not-found sentinel directly.

Post Version persistence, business behavior, and active HTTP ownership are fully canonical under `internal/postversion/{repository,service,controller}`. Version listing and snapshot reads remain PostVersion-owned. Restore is coordinated by `postversion.RestoreCoordinator`, which owns the shared `dbtx.Transactor` scope, reads the immutable version snapshot through `GetVersionTx`, and applies it through the Post-owned `RestoreSnapshotTx` port. PostVersion persistence no longer starts the restore transaction or writes the `posts` table, while restore remains atomic. The service owns identifier validation and missing-version error semantics. The application composition root constructs the canonical Post Version service and restore coordinator from the shared transaction infrastructure and canonical Post repository, `WebRouterOptions.PostVersionSvc` carries the service explicitly, and both `/api/admin/posts/:id/versions` and `/api/admin/posts/:id/versions/:versionID/restore` bind to the canonical Post Version controller while preserving the existing `PostPolicy` authorization checks and response shape. Shared HTTP error mapping recognizes canonical Post Version sentinels. Agent Approval depends only on a narrow `postVersionReader` contract for the version lookup it actually needs instead of depending on an aggregate service.

Post persistence, business behavior, scheduled publishing, and HTTP ownership are fully canonical under `internal/post/{domain,repository,service,controller}`. The application composition root constructs the canonical Post repository/service directly, active Post routes bind to the canonical Post controller, shared HTTP error mapping recognizes canonical Post service sentinels, and Agent/Tool/Operations consumers depend on the canonical Post service instead of the legacy flat service package. The former flat Post repository/service/controller facades and duplicate tests have been removed. As a result, the transitional `internal/service/` bucket is no longer needed and has been eliminated.

Blog Tools no longer store or depend on any Growth service. `NewBlogRegistry` exposes only its real dependencies: Post, Community, Page, and Knowledge services. The former ignored Growth-shaped constructor slot has been removed, so there is no residual call-shape compatibility artifact from the Growth decomposition.

Integration database setup discovered during the migration is shared through `internal/testsupport.OpenTestDB`; capability tests must not depend on private helpers owned by another capability's test file.

## Shared HTTP controller primitives

Cross-capability HTTP helpers live under:

```text
internal/controllerutil/
```

This package is an application-level HTTP adapter utility boundary. Capability controllers may depend on it. It must not depend on capability controller packages.

The legacy `internal/controller` package is now frozen to the stable Access security boundary, the Connector-held transitional shell/transport, and the small response/pagination compatibility facades still required by those held paths. `internal/controllerutil/flat_controller_boundary_test.go` enforces this allowlist. No new business controller or unrelated ownership test may be added to the flat bucket; new transport belongs to its capability-local controller package.

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


## Agent HTTP ownership boundary

Agent HTTP transport is capability-owned under `internal/agent/controller`. Provider administration, Agent/Skill management, Runs, Approvals, Agent-owned MediaCandidate/image-generation transport, editor generation, and Agent Skill drafting are wired through the capability controller.

- The canonical Agent controller consumes only Agent services, Tool registry, and the narrow Workflow lifecycle/reconciliation port needed for approval/media coordination.
- Knowledge transport is capability-owned under `internal/knowledge/controller` and is composed independently from Agent transport.
- Connector transport remains on the transitional flat shell without behavioral changes under Connector Module Hold; the router names this dependency `LegacyAICtrl` to prevent accidental Agent/Knowledge ownership.
- Existing URLs, response contracts, ManageAI/author permissions, AAL2, recent-MFA, audit middleware, BFF behavior, and timeout policy are unchanged.
- Shared HTTP error/parameter behavior comes directly from `internal/controllerutil`; no new flat-controller dependency is introduced.

## Knowledge HTTP ownership boundary

Knowledge HTTP transport is capability-owned under `internal/knowledge/controller`. Embedding-profile administration and index status/rebuild/retry/evaluation endpoints are wired through the Knowledge controller while the Knowledge service retains its existing persistence and transaction model.

- The controller depends only on `*knowledge.Service` plus shared HTTP primitives from `internal/controllerutil`; it does not import Agent or Connector.
- Strict JSON decoding, positive-ID validation, status codes and response envelopes preserve the previous transport contract.
- `router.WebRouterOptions` receives Knowledge and Connector controllers separately; existing `/api/admin/embedding-profiles*` and `/api/admin/ai-index/*` paths remain under the same ManageAI, AAL2, recent-MFA and audit middleware chain.
- Connector routes, OAuth/callback state, credentials, delivery/outbox behavior and Sandbox semantics remain untouched under Connector Module Hold. The transitional flat controller is now Connector-only.

## Operations HTTP ownership boundary

Operations HTTP transport is capability-owned under `internal/operations/controller`; the flat `AgentController` no longer receives `*operations.Service` or owns suggestion, editorial-task, candidate-set, feedback, or outcome-metrics endpoints.

- `router.WebRouterOptions` receives a separate Operations controller while preserving the existing `/api/admin/ai-*` URLs and the existing AI-management permission, AAL2, recent-MFA and audit middleware chain.
- Strict JSON decoding, positive-ID validation, local `blog_principal_id` attribution and response envelopes retain the existing transport semantics.
- Agent-owned MediaCandidate/image-generation endpoints intentionally remain with Agent HTTP ownership; route proximity under the AI Operations UI does not transfer business ownership to the Operations capability.
- Operations remains service-local for persistence/orchestration; this HTTP convergence does not introduce an artificial repository layer or move transaction ownership.
- Connector routes and behavior remain untouched under the Connector Module Hold.

## Operations domain ownership boundary

Operations-owned model values live under `internal/operations/domain`: `OperationalSuggestion`, `EditorialTask`, `ContentCandidate`, `ContentCandidateSet`, and `AIFeedback`.

- These values describe Operations persistence/API concepts and are not a shared kernel merely because Agent approval can propose one of them.
- Agent approval consumes `OperationalSuggestion` through the existing narrow `ApprovalEffectWriter` contract by importing the leaf Operations domain package; Operations behavior and persistence remain owned by `internal/operations`.
- The former root `internal/domain/operations.go` migration boundary is retired. `internal/operations/domain/ownership_test.go` rejects reintroduction of these symbols through the root domain package.
- JSON fields, database schema/queries, approval action types, HTTP routes/responses, authorization/MFA/audit middleware, BFF behavior, and Connector behavior are unchanged.

## Workflow HTTP ownership boundary

Workflow HTTP transport is capability-owned under `internal/workflow/controller`; the legacy flat `AgentController` is no longer the transport owner for Workflow CRUD, Runs, events, interactions, resource discovery, metrics, planning, or the signed public Workflow webhook.

- `router.WebRouterOptions` receives a separate Workflow controller and preserves the existing paths, permission middleware, AAL2/recent-MFA requirements, audit middleware, response envelopes and webhook HMAC/idempotency contract.
- Human-interaction HTTP operations use Workflow's `InteractionService` over the canonical `InteractionRepository`; the previous controller path through Agent `ApprovalService` is retired. Resolve/cancel still resume/cancel the linked Workflow Run with the historical `sql.ErrNoRows` tolerance.
- Workflow planning consumes Agent provider/Agent catalog and Tool catalog through narrow controller-facing interfaces. Agent Skill drafting and Agent-owned MediaCandidate actions remain with Agent HTTP ownership even when their route is nested under a Workflow path.
- The canonical Agent controller depends on Workflow only through a narrow lifecycle/reconciliation port used by Agent approval and MediaCandidate orchestration; the transitional Knowledge/Connector shell has no Workflow dependency.
- Connector routes and behavior remain untouched under the Connector Module Hold.

## Workflow read-model boundary

Workflow query persistence is classified by projection instead of being folded into a generic repository aggregate.

- `RunReadModel` / `RunReadRepository` owns the read-only admin projections for Run history, Step detail and persisted Run resource snapshots. Admission, lifecycle and execution repositories keep their operation-specific reads and writes.
- `MetricsReadModel` / `MetricsRepository` is a separate cross-Run aggregate projection; it is intentionally not a method on the Run repository.
- Definition/version reads used during execution remain with the canonical `DefinitionRepository`, including version-step loading and resource-query empty-policy lookup. Service owns error/policy decisions, not SQL.
- `ResourceCatalog` remains a separate resource-discovery adapter because it resolves Post/Page/Media/Operations resources across capability boundaries; it is not a Workflow Run read model.
- The Workflow Service no longer owns raw SQL or a raw database handle. The composition root wires definition persistence, Run queries, metrics queries and the resource catalog explicitly. HTTP routes and response contracts are unchanged.

## Workflow dispatch / execution persistence boundary

Workflow trigger dispatch and execution checkpoints are application consistency boundaries rather than Service-local SQL.

- `DispatchCoordinator` owns cron due-row claiming through `dbtx.Transactor`: due Workflow rows are locked with `FOR UPDATE SKIP LOCKED` and their next schedule is advanced in the same transaction before in-memory queueing.
- Event persistence is behind the same consumer-owned dispatch port. Zero-window emitter preparation and due-event claims both reserve a short persisted lease while the row remains `accepted`, so multiple web instances do not process the same event concurrently and a crashed worker becomes retryable without a new status value or schema migration.
- `ExecutionCoordinator` owns Run state transitions, Step checkpoints, query-scope persistence and the atomic human-interaction + Workflow-run-event write. `ExecutionRepository` persists only Workflow-owned tables.
- Workflow no longer queries Agent-owned `ai_approvals` directly. Workflow Service consumes the narrow `ExecutedApprovalTargetReader` contract, canonically backed by Agent `ApprovalRepository.ListExecutedTargets`; that cross-capability read is not folded into the execution persistence coordinator.
- Workflow Service retains execution policy, Agent invocation, resource discovery and read-model APIs. HTTP routes, auth/BFF, Connector behavior and external API contracts are unchanged.

## Workflow Run admission / retry / recovery boundary

Workflow Run admission is an application consistency boundary, not a collection of Service-local SQL statements.

- `RunAdmissionCoordinator` owns atomic creation of a queued Run together with its initial manual resource snapshots through `dbtx.Transactor`.
- Scheduled-run idempotency is resolved under the same transaction: the repository uses the `(workflow_id, schedule_key)` uniqueness contract, locks the existing scheduled Run, and only the coordinator decides whether a failed Run may be requeued.
- Partial `for_each` retry is one snapshot transaction: source Run state and failed iterations are revalidated while locked, then the retry Run, manual/query resource snapshots, and successful resource-query checkpoints are copied atomically.
- Startup recovery and user resume are exposed through the same narrow Run-admission persistence port. Scheduler dispatch and execution policy remain in Workflow Service.
- Workflow repositories stay persistence-only. They never call another repository and never start the application transaction.
- Event scheduling, due-Workflow claiming, execution checkpoints and Workflow read models remain separate convergence work; this boundary does not claim those responsibilities.

## Workflow / Agent Media Candidate boundary

`ai_media_candidates` is Agent-owned persistence. Workflow code must not query that table directly.
Workflow run resumption/reconciliation uses `MediaRunCoordinator`, which owns the cross-capability transaction through `dbtx.Transactor`: Agent's Media Candidate repository supplies only consumer-sized tx-aware state reads, while Workflow's `MediaRunRepository` writes only `ai_workflow_runs`. Candidate-event lookup is orchestrated by Agent ApprovalService: it resolves the candidate through the Agent store, then calls Workflow's run-event port with the resolved Workflow Run ID.

This boundary is guarded by tests so Workflow production packages cannot reintroduce direct `ai_media_candidates` SQL.

## Workflow cancellation and deletion

`internal/workflow.RunLifecycle` is the application transaction owner for run cancellation/deletion across Workflow and Agent state. Consumer-owned ports are defined beside the coordinator; Workflow lifecycle persistence lives in `internal/workflow/repository`, while Agent Run and MediaCandidate repositories own Agent writes. `cmd/gouno/web.go` explicitly composes these dependencies and injects the coordinator into Workflow Service. Repositories neither call each other nor commit caller-owned transactions. Other Workflow execution persistence remains a separate, documented migration slice.
