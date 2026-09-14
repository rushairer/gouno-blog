# Blog Backend Architecture Convergence Map

This document is the migration Source of Truth for Capability convergence. `ARCHITECTURE.md` defines the project convention; this map records the current ownership, dependency, transaction, compatibility, and retirement state. A capability is not complete merely because files have moved.

## Capability ownership and convergence

| Capability / boundary | Owned domain concepts / tables | Canonical implementation | Dependencies and cross-capability contracts | Transaction ownership | Legacy / migration state |
| --- | --- | --- | --- | --- | --- |
| **Agent** | Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates and Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits` | `internal/agent` and `internal/agent/repository` | Outbound to Provider, Workflow, Media, Post, Page, PostVersion, Notification and Tool through consumer-sized service dependencies or ports. | Repository-local transactions for owned aggregates; `RunLifecycle` coordinates Run/MediaCandidate lifecycle and Starter Pack uses its application coordinator. | **Service dependency model and HTTP ownership are converged.** Scheduler, GenerationService, ApprovalService, ManagementService and Runner consume canonical repositories/ports, while Agent transport is capability-owned under `internal/agent/controller`. |
| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow`, `internal/workflow/repository` | Uses Agent Runner/Management and Tool registry. Agent consumes canonical Workflow interaction/event/scope contracts; Workflow consumes Agent-owned Media Candidate state only through the consumer-sized `MediaCandidateRunStore`. | `RunLifecycle` owns cancellation/deletion; `MediaRunCoordinator` owns MediaCandidate-to-Workflow decisions at Serializable isolation; `RunAdmissionCoordinator` owns queued-run admission/retry snapshots; `DispatchCoordinator` owns due-schedule claims; `ExecutionCoordinator` owns interaction/event atomicity and execution-state persistence through `dbtx.Transactor` where multi-write consistency is required. Repositories receive coordinator transactions. | **Definition/version, lifecycle, MediaCandidate boundary, Run admission/retry/recovery, dispatch claiming, execution checkpoint persistence, read-model classification, and HTTP ownership are converged.** |
| **Operations** | Operational suggestions, health evidence, candidate sets, feedback, editorial/reply/news work; `ai_operational_suggestions`, `ai_link_health_jobs`, `ai_link_health_snapshots`, `ai_content_candidate_sets`, `ai_content_candidates`, `ai_feedback`, `ai_editorial_tasks`, `ai_comment_reply_drafts`, `ai_daily_news_jobs`, `ai_daily_news_runs`, `ai_daily_news_sources` | `internal/operations` service; no artificial repository/controller layer | Narrow `GovernanceToolCallWriter` -> Agent Run persistence and `GovernanceApprovalWriter` -> Agent Approval persistence; canonical Post service. | Operations service owns governance transactions through `dbtx.Transactor`. | **Service dependency, approval-effect ownership, and HTTP ownership are converged.** Governance uses narrow Agent writers, approved candidate/task/reply/suggestion effects are persisted by Operations rather than Agent ApprovalRepository, and Operations transport is capability-owned under `internal/operations/controller`. |
| **Knowledge** | Embedding profiles, index jobs/chunks, retrieval metrics/evaluation; `ai_embedding_profiles`, `ai_content_index_jobs`, `ai_content_chunks`, `ai_retrieval_metrics`, `ai_retrieval_eval_cases` | `internal/knowledge` service and `internal/knowledge/controller`; cohesive service-local persistence is intentional today | Provider HTTP/runtime boundary; Tool consumers through Knowledge service API. | Knowledge service owns multi-write index transactions through `dbtx.Transactor`. | **Service and HTTP ownership are converged.** Embedding/index transport is capability-owned; persistence/transaction behavior is unchanged. |
| **Media** | Media assets; `media_assets` | `internal/media/{repository,service,controller}` | Agent generation/approval uses narrow Media contracts. | Media repository/service. | **Canonical implementation; remaining contracts tracked below.** |
| **Post** | Post lifecycle and post-owned relationships; principally `posts` plus owned relationship writes | `internal/post/{repository,service,controller}` | Community, Recommendation, Analytics, Tool and Agent use canonical service or narrow readers. | Post service/repository. | **Canonical implementation; remaining contracts tracked below.** Flat Post facades and the old flat service bucket are retired. |
| **Page** | Pages; `pages` | `internal/page/{domain,repository,service,controller}` | Feed, Agent and Tool use canonical service. | Page service/repository. | **Canonical implementation; remaining contracts tracked below.** Shared root Page model aliases remain only where cross-capability model sharing is real. |
| **Community** | Comments, reactions, reports and community notification behavior; `comments`, `post_reactions`, `comment_reports`, community-origin rows in `notifications` | `internal/community/{domain,repository,service,controller}` | Narrow published-Post resolution; Tool moderation reads. | Community service/repository. | **Canonical implementation; remaining contracts tracked below.** The physical `notifications` table is shared with the system-notification persistence boundary; shared storage does not imply duplicate business ownership. |
| **Taxonomy** | Categories, Tags and taxonomy relationships; `categories`, `tags`, association writes | `internal/taxonomy/{repository,service,controller}` | Post/feed consumers use canonical taxonomy API. | Taxonomy service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Site** | Site settings; `site_settings` | `internal/site/{repository,service,controller}` | Feed uses a narrow settings-read contract. | Site service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Analytics** | Analytics events and summary read model; `analytics_events` | `internal/analytics/{repository,service,controller}` | Cross-capability read model; Tool binds directly to canonical Analytics service. | Analytics service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Recommendation** | Related-post read model; no owned write table | `internal/recommendation/{repository,service,controller}` | Narrow published-Post resolution and tag-overlap reads. | Read-only; no cross-capability write transaction. | **Canonical implementation; remaining contracts tracked below.** |
| **PostVersion** | Post version history/restore; `post_versions` | `internal/postversion/{repository,service,controller}` plus `internal/postversion.RestoreCoordinator` | Approval uses narrow `postVersionReader`; restore writes Post state only through the Post-owned `RestoreSnapshotTx` port. | `RestoreCoordinator` owns the atomic snapshot-read/Post-write transaction through `dbtx.Transactor`; repositories receive the caller transaction. | **Canonical implementation; restore ownership converged.** |
| **Provider** | AI Provider profiles and encrypted credential metadata; `ai_provider_profiles` | `internal/provider`, `internal/provider/repository` | Agent ManagementService consumes the canonical Provider repository through a narrow provider-store contract. | Provider repository for owned writes. | **Management consumer converged.** The flat Provider facade is retired; credential validation/encryption/security behavior is unchanged. |
| **Notification** | Operator/system notification persistence in `notifications` | `internal/notification/repository` | Agent ManagementService and Runner consume the canonical Notification writer directly. | Single notification write operations; no cross-capability transaction required today. | **Agent consumers converged.** Flat notification delegates are retired. |
| **Access** | Blog principals, identity aliases, memberships/roles and access policy; includes `blog_principals`, `blog_principal_identities` and access-control tables | `internal/access` | Middleware/controllers consume access snapshots. Identity key is `(issuer, subject)`. | Access service owns security-sensitive SQL transaction boundaries. | **Stable security boundary.** Do not opportunistically refactor during Capability migration. |
| **Auth BFF** | Confidential OAuth/OIDC session state in Redis; no Blog SQL ownership | `internal/authbff` | Browser only receives Blog-origin session cookie; exchange/refresh/userinfo/revoke remain server-side. | BFF client/store boundary. | **Stable security boundary.** Behavior frozen unless explicitly requested. |
| **Tool** | Tool registry/contracts/bindings; no owned persistence table | `internal/tool` | Calls capability services/ports; must not become a generic business bucket. | Transaction ownership stays with the called application/capability service. | **Stable boundary.** |
| **Shared DB infrastructure** | Transaction execution and SQL error classification; no business tables | `internal/dbtx`, `internal/dberror` | Capabilities depend directly on these infrastructure packages. | Application/service coordinators decide transaction scope; `dbtx` only executes it. | **Canonical after Phase B.** The flat Transactor alias remains only for Connector Hold. |
| **Connector (HOLD)** | Connector profiles/outbox/audits; `ai_connector_profiles`, `ai_connector_outbox`, `ai_connector_delivery_audits` | Existing `internal/connector` implementation | No architecture migration is authorized while Hold is active. | Existing behavior preserved. | **Deferred by Connector Module Hold.** Its `repository.Transactor` consumer is the explicit blocker for deleting that alias. |

## Composition-root convergence

`cmd/gouno/web.go` is the sole application composition root. Canonical Post, Page, Taxonomy, Site, Community, Media, Analytics, Recommendation and PostVersion dependencies are constructed there. Shared transaction infrastructure is constructed as `dbtx.Transactor` and injected into non-Connector application services.

Agent composition is now canonical at the service-dependency layer: the root constructs Provider, Definition, Skill, Notification, Starter Pack, Run, Approval, Media Candidate, Workflow Scope and GenerationAudit dependencies explicitly. `Runner` receives consumer-sized ports plus a narrow `RunLifecycle`; no flat `repository.AgentRepository` remains in the application graph.

## Transaction ownership map

- **Knowledge / Operations:** services own their transactions, using both raw `BeginTx` and injected `dbtx.Transactor`; do not assume the infrastructure cutover removed all manual transactions.
- **Workflow:** `RunLifecycle` owns cancellation/deletion. `MediaRunCoordinator` owns Agent Media Candidate read + Workflow Run write decisions through `dbtx.Transactor` at Serializable isolation. `RunAdmissionCoordinator` owns atomic queued-run creation + manual scope, failed scheduled-run reuse, and partial retry snapshots. `DispatchCoordinator` locks due schedules and advances `next_run_at` in one transaction. `ExecutionCoordinator` owns human-interaction + run-event atomicity while the execution repository owns Run/Step/resource checkpoint writes. Repositories receive caller-owned transactions and never call each other.
- **Connector:** still receives the flat compatibility alias solely because the module is under Hold. Removal condition: explicit Hold lift, direct `dbtx` cutover, unchanged Connector behavior, and Connector tests green.
- **Starter Pack application coordinator:** `internal/starterpack.Coordinator` owns the `dbtx.Transactor` boundary and `ai_workspace_bootstrap` coordination state; Provider, Skill, Agent Definition and Workflow repositories expose only narrow transaction-aware operations over their owned tables.
- **Approval -> Media Candidate -> Workflow event:** Media Candidate state is Agent-owned; Workflow event persistence is Workflow-owned. ApprovalService now owns the best-effort orchestration through `MediaGenerationStore` and `WorkflowEventPort`; repositories remain persistence-only and no cross-capability transaction is implied.
- **Operations governance:** Operations owns the transaction while Agent Run and Approval repositories expose narrow transaction-aware writers. This is the current reference shape for cross-capability coordination.
- **PostVersion restore:** `internal/postversion.RestoreCoordinator` owns the `dbtx.Transactor` scope. The PostVersion repository locks/reads only its `post_versions` snapshot through `GetVersionTx`; the Post repository applies the Post-owned `RestoreSnapshotTx` command. Repositories do not call each other and the restore remains atomic.

## Compatibility facade inventory

| Facade / boundary | Classification | Current consumer(s) | Removal condition |
| --- | --- | --- | --- |
| `internal/repository.Transactor` and `NewTransactor` | Shared-infrastructure alias | **Connector only after Phase B** | Deferred by Connector Module Hold. Delete immediately after explicitly authorized Connector direct-`dbtx` cutover. |
| `internal/controller.AgentController` Connector-only transitional shell | Explicit Connector Hold | Connector routes/callback only; Agent, Workflow, Operations and Knowledge transport are capability-local | Retain unchanged until explicit Connector Hold lift; then move Connector transport with dedicated security review/tests. |
| `internal/domain` Agent/Workflow/Operations/Post/Page models | Deliberate model migration boundary, not automatically a facade | Multiple capabilities | Classify each model as capability-owned, shared kernel, cross-capability contract or transport DTO before moving. Never move solely for directory symmetry. |

## Flat-layer classification

The remaining flat files are not all equivalent debt:

- **A — migrate to capability / retire facade:** Agent, Workflow, Operations and Knowledge HTTP ownership are canonical under capability controllers; flat Agent repository delegates are retired. Remaining non-held facades require consumer proof before deletion.
- **B — shared infrastructure:** generic DB transaction execution belongs in `internal/dbtx`; generic SQL error classification belongs in `internal/dberror`; shared HTTP primitives belong in `internal/controllerutil` when/where proven.
- **C — intentionally shared pending model-boundary decision:** root `internal/domain` types with real cross-capability consumers. These must not be duplicated or moved just to empty the directory.
- **D — explicit hold:** Connector-related controller/dependency paths. Record the dependency but do not modify it while Connector Module Hold remains active.

## Migration debt priority

1. **Transitional layer retirement:** retire remaining non-held compatibility facades only after consumer proof and full gates; Connector controller/transactor compatibility remains explicitly blocked by Connector Module Hold.
2. **Shared-model classification:** classify remaining root `internal/domain` models only where a real capability/shared-kernel decision is needed; never move them for directory symmetry.

Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, **Starter Pack application coordination**, **Runner dependency/lifecycle convergence**, **Workflow Definition/Version persistence extraction**, **Workflow Run lifecycle coordination**, **Agent MediaCandidate / Workflow Run boundary convergence**, and **Workflow Run admission/retry/recovery convergence**, **Workflow dispatch/execution persistence convergence**, and **Workflow read-model classification**, and **Workflow HTTP ownership convergence**, and **Operations HTTP ownership convergence**, and **Agent HTTP ownership convergence**, and **Knowledge HTTP ownership convergence**, and **PostVersion restore ownership convergence** now use canonical ownership boundaries and explicit composition-root wiring. The flat `repository.AgentRepository` aggregate and its Agent/Workflow/Notification delegates are retired; `internal/repository` remains only for the Connector-held Transactor alias until that Hold is explicitly lifted.


### PostVersion restore ownership convergence — 2026-09-14

- `internal/postversion.RestoreCoordinator` owns the atomic restore transaction through the shared `dbtx.Transactor`.
- `internal/postversion/repository` now reads/locks only `post_versions`; it no longer starts restore transactions or writes `posts`.
- `internal/post/repository.PostRepository.RestoreSnapshotTx` owns the Post write and receives a Post-owned restore command rather than a PostVersion repository dependency.
- Composition root reuses the canonical Post repository and shared transactor. Existing routes, `PostPolicy` authorization, service errors and restore response shape are unchanged.
- Connector, Access, Auth BFF and shared-domain placement are unchanged.


### Knowledge HTTP ownership convergence — 2026-09-14

- `internal/knowledge/controller` owns embedding-profile and index status/rebuild/retry/evaluation HTTP transport. Existing URLs, response envelopes and AI-management middleware are unchanged.
- Strict JSON binding and positive-ID validation preserve the previous flat-controller behavior.
- Composition root constructs Knowledge service/controller explicitly; router receives `KnowledgeCtrl` separately from the Connector-held `LegacyAICtrl`.
- The flat `AgentController` is now Connector-only. Connector OAuth/callback/credentials/outbox/delivery/Sandbox code is unchanged under Connector Module Hold.


### Operations HTTP ownership convergence — 2026-09-14

- `internal/operations/controller` owns suggestion, editorial-task, candidate-set selection, feedback and outcome-metrics HTTP transport. Existing URLs and AI-management middleware are unchanged.
- The flat Agent controller no longer imports or stores `*operations.Service`; composition root constructs Operations service and Operations controller separately.
- Agent-owned MediaCandidate/image-generation endpoints remain under Agent HTTP ownership, including Workflow-run media candidate actions.
- Operations service retains its existing SQL/transaction model; no artificial repository layer or transaction rewrite was introduced by this transport slice.
- Connector routes/OAuth/credentials/delivery remain unchanged under Connector Module Hold.


### Workflow HTTP ownership convergence — 2026-09-14

- `internal/workflow/controller` now owns Workflow CRUD/version/Run/event/interaction/resource/metrics/planning and signed public webhook transport. Existing URLs, response contracts and AI-management middleware are unchanged.
- Workflow human-interaction reads and resolve/cancel orchestration no longer pass through Agent `ApprovalService`; `InteractionService` consumes the Workflow-owned `InteractionRepository` and keeps linked Run resume/cancel semantics inside the Workflow capability.
- Agent Skill draft generation and Agent-owned MediaCandidate routes intentionally remain on Agent HTTP ownership even where route naming is Workflow-oriented.
- The canonical Agent controller consumes only a narrow Workflow lifecycle/reconciliation port for approval/media cross-capability coordination; the transitional Knowledge/Connector shell has no Workflow dependency.
- Composition root constructs the Workflow service, interaction application service and Workflow controller explicitly, then injects the controller into the router separately from `AgentController`.
- Connector controller/routes/OAuth/credentials/delivery remain unchanged under Connector Module Hold.

### Workflow read-model classification — 2026-09-13

- `RunReadModel` and `RunReadRepository` own the admin/query projections for Run history, Step detail and persisted Run resource snapshots. They are read-only and remain separate from admission, execution and lifecycle persistence.
- `MetricsReadModel` and `MetricsRepository` own only cross-Run Workflow metrics, preventing the Run read repository from becoming a generic Workflow query aggregate.
- Execution-time definition reads are classified under the existing canonical `DefinitionRepository`: version steps are loaded by version ID and resource-query empty policy is read there. Service keeps execution policy/error mapping but no SQL.
- `ResourceCatalog` remains a distinct cross-capability discovery adapter and is explicitly not merged into Run read models.
- Workflow Service no longer stores `*sql.DB` or issues raw SQL. `cmd/gouno/web.go` wires the definition repository, Run read model, metrics read model and resource catalog explicitly.
- Ownership tests reject reintroduction of Service-local read SQL. HTTP routes/response shapes, Connector, auth/BFF and external API behavior are unchanged.
- Remaining Workflow work moves to HTTP/controller ownership together with Agent/Operations/Knowledge after a fresh controller-boundary baseline.

### Workflow dispatch / execution persistence — 2026-09-13

- `DispatchCoordinator` is the trigger-dispatch application boundary. It uses one caller-owned transaction to lock due cron rows with `FOR UPDATE SKIP LOCKED` and advance each `next_run_at`, removing the previous claim-then-reschedule gap in Service.
- Due `ai_workflow_events` are atomically leased for 30 seconds while retaining `accepted` status. Zero-window emitter preparation reserves the same lease before synchronous processing; batching and exponential failure backoff keep their existing semantics without an emitter/scheduler double-claim window.
- `ExecutionCoordinator` and `ExecutionRepository` own Workflow Run status transitions, Step checkpoints, query-scope upserts/statistics and execution replay reads. Service keeps execution policy and external Agent/resource calls; the Agent-owned executed-approval reader remains a separate narrow Service dependency rather than joining the persistence coordinator.
- Human-interaction task creation and its `human_interaction_created` run event now commit or roll back together under `dbtx.Transactor` using the canonical `InteractionRepository` transaction-aware methods.
- Workflow no longer reads `ai_approvals` directly. `ApprovalRepository.ListExecutedTargets` exposes only the Agent-owned executed-target data required to enrich approved model output.
- `service.go` ownership tests reject reintroduction of dispatch/execution write SQL and Agent approval SQL. No compatibility facade, Connector change, auth/BFF change, route change or external API change was introduced.
- Remaining Workflow work is read-model classification (`ListRuns`, `RunSteps`, `Metrics`, resource listings and definition reads) followed by HTTP/controller ownership after service contracts are stable.


### Workflow Run admission / retry / recovery — 2026-09-13

- `RunAdmissionCoordinator` is the application transaction owner for queued Run admission, scheduled failed-run reuse, partial `for_each` retry snapshots, startup recovery, and user resume transitions.
- Fresh Run creation and initial manual resource snapshots now commit atomically; the previous insert-then-compensating-delete path is retired.
- Scheduled idempotency uses the existing partial unique index on `(workflow_id, schedule_key)`, then locks the existing row before any failed-run reset. Query snapshots remain preserved while non-query scope is replaced atomically.
- Partial retry re-locks the source Run, revalidates selected failed iterations, creates the retry Run, and copies manual/query resource snapshots plus successful resource-query checkpoints in one `dbtx.Transactor` transaction.
- `RunAdmissionRepository` owns only Workflow persistence and accepts caller-owned transactions for multi-write operations. Service owns validation, Workflow-structure policy, scheduler dispatch and execution policy, but no longer calls `BeginTx`.
- Startup interrupted-run reset, queued-run enumeration and user resume persistence are behind the same narrow port. Event scheduling, due-Workflow claims, execution checkpoints and read models remain the next Workflow persistence slice.
- Composition root wires one canonical RunAdmission repository/coordinator; no compatibility facade or parallel graph was added. HTTP, auth/BFF, Connector and external API behavior are unchanged.


### Agent MediaCandidate / Workflow Run boundary — 2026-09-13

- `ai_media_candidates` remains Agent-owned persistence. No production file under `internal/workflow` may query it directly; `ownership_test.go` enforces this boundary.
- `MediaRunCoordinator` is the Workflow-side application coordinator. It defines the consumer-owned `MediaCandidateRunStore` and `MediaWorkflowRunStore` ports and owns cross-capability transactions.
- Agent `MediaCandidateRepository` exposes only the candidate existence, aggregate run-state summary, and pending-state reads required by Workflow. Workflow `MediaRunRepository` writes only `ai_workflow_runs`.
- ApprovalService resolves `candidate_id -> workflow_run_id` through the Agent store before calling the Workflow run-event port; Workflow event persistence no longer reaches into Agent tables.
- Resume-after-approval and media reconciliation use a shared Serializable transaction so the Agent-state decision and Workflow-state write are one application-owned consistency boundary.
- Composition root wires the canonical Agent repository and Workflow repository directly into the coordinator; no compatibility facade or parallel dependency graph was introduced.
- HTTP routes, auth/BFF behavior, Connector behavior, and external API contracts are unchanged.


## Definition of done for a capability

A capability is Complete only when ownership, persistence ownership, service dependencies, cross-capability contracts, transaction ownership, composition-root wiring, HTTP ownership, tests, CI/security gates, and architecture documentation all agree. Any retained compatibility facade must identify its current consumer and concrete removal condition.


## Verified baseline and this slice (2026-09-13)

Baseline: GitHub default branch `main`, `eb78d165be73f38240a2041cc268b1b8dc501fff`.
No open Capability PR existed at inspection (open PRs were dependency updates).
[Branch audit](./ARCHITECTURE_BRANCH_AUDIT.md) distinguishes merged PRs, post-merge branch commits, closed proposals and unassociated heads. A branch is not active merely because GitHub retains it. Re-run this audit before another slice; this is dated evidence, not a live branch oracle.

This slice completes **Workflow Run cancellation/deletion**, not Workflow as a whole:

- Application coordinator: `internal/workflow.RunLifecycle` owns the transaction and the completed-status deletion rule.
- Consumer-owned ports: `LifecycleWorkflowStore`, `LifecycleAgentRunStore`, `LifecycleMediaCandidateStore` in `workflow/run_lifecycle.go`.
- Workflow repository: cancel eligible run + pending interactions; lock status; delete run. It never writes Agent state.
- Agent repositories: cancel unapplied eligible candidates; delete candidates linked directly or through Agent runs; delete Agent runs. They never write Workflow state.
- Composition: `cmd/gouno/web.go` constructs one lifecycle coordinator from the existing canonical Agent repositories and `workflow/repository.RunLifecycleRepository`, then injects it into Workflow Service.
- HTTP Service methods remain the public application API and delegate to the coordinator. These are not legacy facades and have no retirement requirement. No constructor fallback or parallel dependency graph was introduced.
- Preserved transaction contract: default Read Committed, original lock/update ordering, `sql.ErrNoRows` for missing/non-cancellable runs, `ErrInvalid` for deleting active runs, unchanged cancellation eligibility and error text. Agent execution itself is not cancelled by Workflow cancellation. FK cascades remain unchanged.
- Verification belongs to `workflow/run_lifecycle_integration_test.go`: real migrations/database, public Service entrypoints, status eligibility, applied/inactive candidates, direct/Agent-only candidate links, missing rows, and rollback after writes in both capabilities.
- No legacy facade was added or deleted in this slice. Existing HTTP/shared aliases remain for the explicitly listed consumers below.

### Dependency and composition index

This index lists direct production Go imports (not tests). Interface implementations are wired in `cmd/gouno/web.go`; an interface edge may therefore be absent from the import index. The ownership table above and named ports below describe those runtime edges.

| Boundary | Direct inbound package roots | Direct outbound internal package roots |
| --- | --- | --- |
| `agent` | cmd/gouno, controller, controllerutil, workflow | dberror, dbtx, domain, media, page, post, provider, secretbox, tool |
| `workflow` | cmd/gouno, controller, controllerutil | agent, dberror, dbtx, domain, tool, workflowplan |
| `operations` | cmd/gouno, controller | dbtx, domain, post, tool |
| `knowledge` | cmd/gouno, controller, controllerutil, tool | dbtx, domain, provider, secretbox |
| `media` | agent, cmd/gouno, controllerutil, router/web.go | access, controllerutil, domain |
| `post` | agent, cmd/gouno, controllerutil, operations, router/web.go, tool | access, controllerutil, domain |
| `page` | agent, cmd/gouno, controller, controllerutil, domain, router/web.go, tool | access, controllerutil |
| `community` | cmd/gouno, controllerutil, router/web.go, tool | controllerutil, domain, ratelimit |
| `taxonomy` | cmd/gouno, controllerutil, router/web.go | controllerutil, domain |
| `site` | cmd/gouno, controllerutil, router/web.go | controllerutil |
| `analytics` | cmd/gouno, router/web.go | controllerutil, domain |
| `recommendation` | cmd/gouno, controllerutil, router/web.go | controllerutil, domain |
| `postversion` | cmd/gouno, controllerutil, router/web.go | access, controllerutil, domain |
| `access` | cmd/gouno, controller, media, middleware/blog_access.go, page, post, postversion, router/web.go | domain |
| `authbff` | cmd/gouno, router/web.go | — |
| `tool` | agent, cmd/gouno, controller, operations, workflow, workflowplan | community, domain, knowledge, page, post, provider |
| `provider` | agent, cmd/gouno, controller, knowledge, tool, workflowplan | domain |
| `notification` | cmd/gouno | — |
| `starterpack` | cmd/gouno | dbtx, domain |
| `workflowplan` | controller, controllerutil, workflow | domain, provider, tool |
| `dbtx` | agent, cmd/gouno, knowledge, operations, repository, starterpack, workflow | — |
| `dberror` | agent, workflow | — |
| `testsupport` | — | migrations |
| `controllerutil` | analytics, community, controller, media, page, post, postversion, recommendation, site, taxonomy | agent, community, knowledge, media, page, post, postversion, recommendation, site, taxonomy, workflow, workflowplan |
| `identitybackfill` | cmd/gouno | — |
| `ratelimit` | community, router/web.go | — |
| `secretbox` | agent, cmd/gouno, connector, knowledge | — |

### Runtime contracts that imports cannot express

| Consumer | Port / dependency | Implementation and composition |
| --- | --- | --- |
| Management | `ManagementProviderStore`, `ManagementAgentStore`, `ManagementSkillStore`, notification writer, `StarterPackReconciler` | Provider, Definition, Skill, SystemNotification repositories and StarterPack Coordinator; all constructed in web root |
| Runner | `RunnerRunStore`, Approval writer, Workflow scope store, MediaCandidate store, Notification writer, `RunnerRunLifecycle` | Canonical repositories, Agent RunLifecycle; Management still supplies Agent/Provider reads and Runner uses Post service |
| Approval | `ApprovalStore`, `MediaCandidateStore`, `MediaGenerationStore`, Workflow interaction/event ports, `ApprovalEffectWriter` | Agent repositories, Workflow InteractionRepository, Operations Service; Post/Page/PostVersion/Media services and Generation are explicit dependencies |
| Generation | `generationAuditRepository`, `mediaCreator`, `media.Store`, Management | GenerationAudit repository, Media service/storage; provider invocation through Management. No aggregate AgentRepository |
| Scheduler | `schedulerRepository` | DefinitionRepository and Runner from web root |
| Operations | `GovernanceToolCallWriter`, `GovernanceApprovalWriter` | Agent Run/Approval repositories receive Operations transaction; Post service configured explicitly |
| StarterPack | Provider/Skill/Agent/Workflow transaction ports | Coordinator owns bootstrap lock and transaction; each repository owns its table writes |
| Workflow lifecycle | Workflow/AgentRun/MediaCandidate lifecycle ports | One coordinator and canonical persistence dependencies; no service-local lifecycle repository construction |
| Workflow execution | concrete Runner/Management, Tool registry, DefinitionRepository, ResourceCatalog | Definition repository/catalog still constructed inside `NewService`; extraction/injection is deferred to the coherent execution persistence phase, not silently called converged |

### Remaining flat files: exhaustive classification

Paths below are relative to `internal/`. A = capability destination, B = shared infrastructure, C = deliberate shared boundary, D = Hold. Test ownership follows the behavior tested, not the old filename.

| File(s) | Class / owner | Current consumer / exit condition |
| --- | --- | --- |
| `repository/transaction.go` | D / shared infrastructure alias | Connector Service only; explicit Hold lift, direct dbtx cutover and unchanged security tests before removal |
| `repository/agent_repository_integration_test.go` | A / Agent Approval + Provider | Two canonical-repository regression tests still located in retired aggregate package; split into owning repository packages with recursive integration discovery, then remove file |
| `controller/agent_controller.go` | A with D coupling / Agent, Provider and composition | Router/web root use AgentController; embeds Connector dependency. Separate non-held HTTP ownership only after designing an adapter that preserves held Connector behavior; `NewAgentControllerWithOptions` alias has web root consumer |
| `controller/agent_workflow_controller.go`, `workflow_draft_test.go` | A / Workflow | Methods on flat AgentController and router; move with stable Workflow service API and route contract tests in controller phase |
| `controller/agent_operations_controller.go` | A / Operations | AgentController and router; move with canonical controller wiring in controller phase |
| `controller/agent_knowledge_controller.go` | A / Knowledge | AgentController and router; move with stable Knowledge contract in controller phase |
| `controller/agent_connector_controller.go` | D / Connector | Frozen by Connector Hold; no migration authorized |
| `controller/access_controller.go` | A, security deferred / Access | Router; only a separately verified behavior-preserving HTTP ownership phase |
| `controller/feed_controller.go`, `feed_controller_test.go` | C / feed transport composition | Router + Post/Page/Taxonomy/Site reads; cohesive cross-content projection, not automatically Post-owned. Decide a feed adapter boundary before moving |
| `controller/pagination.go`, `pagination_test.go` | B / controllerutil alias | Flat controllers/tests; direct canonical helper cutover after held-controller constraints are resolved |
| `controller/response.go` | B / controllerutil aliases | Flat controllers, including Connector; Hold-aware HTTP cutover before deletion |
| `controller/agent_controller_test.go`, `provider_import_export_test.go` | A / Agent + Provider HTTP | Current AgentController behavior tests; move together with controller ownership, preserve credential coverage |
| `controller/template_identity_test.go`, `webhook_security_test.go` | A / Agent + Workflow security tests | Flat HTTP adapters; retain tests until their entrypoints move, never drop security coverage |
| `domain/agent.go` | C / mixed contracts, not shared kernel by default | Agent models, ProviderProfile/ProviderType, Knowledge EmbeddingProfile, Tool contracts and MediaCandidate DTOs have different owners. Split only with consumer contract cutover, not alias proliferation |
| `domain/workflow.go` | C / Workflow concepts + resource/interaction transport contracts | Workflow/Agent/Tool/HTTP use; stable contract design precedes domain relocation |
| `domain/operations.go` | C / Operations DTOs | Operations + Agent effect ports + HTTP; preserve shared contract until those boundaries are intentionally changed |
| `domain/post.go` | C / mixed Post, Taxonomy, PostVersion, Media, Analytics contracts | Multiple services/read models; classify individual types before relocation. Not a justification to keep adding unrelated models |
| `domain/page.go` | C / Page aliases to canonical domain | Shared content consumers; remove only with all consumers cut over to canonical Page models |
| `service/` | retired | Directory absent; do not recreate |

### Additional shared and application ownership

- `starterpack` owns `ai_workspace_bootstrap` orchestration state, not Provider/Agent/Workflow tables.
- `workflowplan` owns plan/schema validation, no persistence or transaction. Workflow and HTTP validation consume it.
- `identitybackfill` is security-sensitive migration tooling; `migrations` owns ordered schema/data upgrade execution, not runtime business behavior.
- `secretbox`, `ratelimit`, `dberror`, `dbtx`, `testsupport`, `controllerutil` are explicit shared infrastructure. They require no symmetric layers.
- Knowledge still reads Provider profiles and maintains index/profile state directly; Operations combines persistence with application behavior. Their existing cohesion is documented, not a blanket statement that service-local SQL is the permanent target.
- Analytics/Recommendation/resource catalog have explicit cross-capability read models. Reads do not confer write ownership.
- PostVersion restore, Workflow execution/resource enrichment and the flat multi-capability AgentController remain architectural debt. Canonical physical location alone does not satisfy the full Definition of Done.

### Transaction audit entrypoints

Audit both raw transactions and coordinator calls. The following production call sites were verified for this slice; repository `*Tx` operations receive their transaction from the named caller, and must not independently commit it.

| Source | Function owning transaction start / execution |
| --- | --- |
| `internal/access/service.go` | `func (s *Service) ApproveIdentityAlias(ctx context.Context, approval IdentityAliasApproval) error` |
| `internal/access/service.go` | `func (s *Service) Resolve(ctx context.Context, claims jwt.MapClaims) (Snapshot, error)` |
| `internal/access/service.go` | `func (s *Service) SetMember(ctx context.Context, actor Snapshot, principalID int64, displayName *string, status string, roles []string, reason, requestID, sourceIP string) error` |
| `internal/access/service.go` | `func (s *Service) TransferOwner(ctx context.Context, actor Snapshot, targetPrincipalID int64, reason, requestID, sourceIP string) error` |
| `internal/access/service.go` | `func (s *Service) RecoverOwner(ctx context.Context, issuer, subject, reason string) error` |
| `internal/agent/repository/media_candidate_repository.go` | `func (r *MediaCandidateRepository) SelectMediaCandidates(ctx context.Context, selections []domain.MediaCandidateSelection) error` |
| `internal/agent/repository/media_candidate_repository.go` | `func (r *MediaCandidateRepository) RejectMediaCandidates(ctx context.Context, ids []int64) error` |
| `internal/agent/repository/skill_repository.go` | `func (r *SkillRepository) CreateSkill(ctx context.Context, skill *domain.AgentSkill) error` |
| `internal/agent/repository/skill_repository.go` | `func (r *SkillRepository) UpdateSkill(ctx context.Context, skill *domain.AgentSkill) error` |
| `internal/agent/run_lifecycle.go` | `func (l *RunLifecycle) DeleteRun(ctx context.Context, runID int64) error` |
| `internal/community/repository/repository.go` | `func (r *CommunityRepository) CreateComment(ctx context.Context, comment *domain.Comment) error` |
| `internal/community/repository/repository.go` | `func (r *CommunityRepository) ModerateComment(ctx context.Context, id int64, status string) error` |
| `internal/community/repository/repository.go` | `func (r *CommunityRepository) SetLike(ctx context.Context, postID int64, actorKey string, liked bool) (*domain.State, error)` |
| `internal/connector/service.go` | `func (s *Service) DeliverMock(ctx context.Context, id int64) error` |
| `internal/dbtx/transactor.go` | `func (t *Transactor) Run(ctx context.Context, fn func(tx *sql.Tx) error) error` |
| `internal/dbtx/transactor.go` | `func (t *Transactor) RunIsolation(ctx context.Context, isolation sql.IsolationLevel, fn func(tx *sql.Tx) error) (err error)` |
| `internal/identitybackfill/service.go` | `func Report(ctx context.Context, db *sql.DB) ([]Finding, error)` |
| `internal/identitybackfill/service.go` | `func Approve(ctx context.Context, db *sql.DB, mappings []Mapping, approvedBy, reason string) error` |
| `internal/knowledge/service.go` | `func (s *Service) processOne(ctx context.Context)` |
| `internal/knowledge/service.go` | `func (s *Service) indexPost(ctx context.Context, postID int64, action, version string) error` |
| `internal/knowledge/service.go` | `func (s *Service) ReplaceEvaluationCases(ctx context.Context, cases []EvaluationCase) error` |
| `internal/media/repository/repository.go` | `func (r *postgresRepository) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error)` |
| `internal/migrations/migrate.go` | `func up(ctx context.Context, db *sql.DB, source fs.FS) error` |
| `internal/operations/approval_effects.go` | `func (s *Service) CreateContentCandidateSet(ctx context.Context, approval *domain.AgentApproval) error` |
| `internal/operations/service.go` | `func (s *Service) processOne(ctx context.Context)` |
| `internal/operations/service.go` | `func (s *Service) saveLinkResults(ctx context.Context, postID int64, raw json.RawMessage) error` |
| `internal/operations/service.go` | `func (s *Service) ConvertSuggestion(ctx context.Context, id int64) error` |
| `internal/operations/service.go` | `func (s *Service) SelectCandidate(ctx context.Context, setID, candidateID int64) error` |
| `internal/postversion/repository/repository.go` | `func (r *PostgresRepository) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error)` |
| `internal/provider/repository/provider_repository.go` | `func (r *Repository) SetDefaultProvider(ctx context.Context, id int64, purpose string) error` |
| `internal/starterpack/coordinator.go` | `func (c *Coordinator) BootstrapStarterPack(ctx context.Context) (int, error)` |
| `internal/workflow/repository/definition_repository.go` | `func (r *DefinitionRepository) Save(ctx context.Context, value *domain.Workflow, nextRun *time.Time) error` |
| `internal/workflow/run_lifecycle.go` | `func (l *RunLifecycle) Cancel(ctx context.Context, runID int64) error` |
| `internal/workflow/run_lifecycle.go` | `func (l *RunLifecycle) DeleteRun(ctx context.Context, runID int64) error` |
| `internal/workflow/service.go` | `func (s *Service) RetryFailed(ctx context.Context, runID int64, childStepID string, iterations []int, triggeredByPrincipalID *int64) (*domain.WorkflowRun, error)` |

Database integration discovery recursively inventories `*_integration_test.go` under `internal/`. Every required test must execute (no skip/missing result); packages receive isolated migrated databases and run with race detection. The previous one-directory glob omitted capability repository integration tests and is retired. Retain this recursive contract when adding deeper capability packages.


### Agent HTTP ownership convergence — 2026-09-14

- `internal/agent/controller` owns Provider administration, Agent/Skill management, Runs, Approvals, Agent-owned MediaCandidate/image-generation transport, editor generation, and Agent Skill draft transport.
- Agent HTTP consumes a narrow Workflow lifecycle/reconciliation port for approval/media coordination rather than the Workflow HTTP aggregate.
- Knowledge and Connector routes remain on the transitional flat controller shell. Connector handler/service behavior is unchanged under Connector Module Hold.
- `cmd/gouno/web.go` constructs canonical Agent HTTP and the transitional Knowledge/Connector adapter separately; `router.WebRouterOptions` exposes them as separate dependencies.
- Existing URL paths, middleware, BFF/auth semantics and external response contracts are unchanged.
