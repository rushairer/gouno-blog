# Blog Backend Architecture Convergence Map

This document is the migration Source of Truth for Capability convergence. `ARCHITECTURE.md` defines the project convention; this map records the current ownership, dependency, transaction, compatibility, and retirement state. A capability is not complete merely because files have moved.

## Capability ownership and convergence

| Capability / boundary | Owned domain concepts / tables | Canonical implementation | Dependencies and cross-capability contracts | Transaction ownership | Legacy / migration state |
| --- | --- | --- | --- | --- | --- |
| **Agent** | Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates and Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits` | `internal/agent` and `internal/agent/repository` | Outbound to Provider, Workflow, Media, Post, Page, PostVersion, Notification and Tool through consumer-sized service dependencies or ports. | Repository-local transactions for owned aggregates; `RunLifecycle` coordinates Run/MediaCandidate lifecycle and Starter Pack uses its application coordinator. | **Service dependency model converged.** Scheduler, GenerationService, ApprovalService, ManagementService and Runner all consume canonical repositories/ports. Agent HTTP ownership remains flat. |
| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow`, `internal/workflow/repository` | Uses Agent Runner/Management and Tool registry. Agent consumes canonical Workflow interaction/event/scope contracts; Workflow consumes Agent-owned Media Candidate state only through the consumer-sized `MediaCandidateRunStore`. | `RunLifecycle` owns cancellation/deletion; `MediaRunCoordinator` owns MediaCandidate-to-Workflow decisions at Serializable isolation; `RunAdmissionCoordinator` owns queued-run admission, scheduled retry snapshots and retry-copy transactions through `dbtx.Transactor`. Repositories receive coordinator transactions. | **Definition/version, lifecycle, MediaCandidate boundary, and Run admission/retry/recovery are converged.** Event scheduling, due-Workflow claims, execution checkpoints and read models remain service-local pending Workflow consolidation. HTTP ownership remains flat. |
| **Operations** | Operational suggestions, health evidence, candidate sets, feedback, editorial/reply/news work; `ai_operational_suggestions`, `ai_link_health_jobs`, `ai_link_health_snapshots`, `ai_content_candidate_sets`, `ai_content_candidates`, `ai_feedback`, `ai_editorial_tasks`, `ai_comment_reply_drafts`, `ai_daily_news_jobs`, `ai_daily_news_runs`, `ai_daily_news_sources` | `internal/operations` service; no artificial repository/controller layer | Narrow `GovernanceToolCallWriter` -> Agent Run persistence and `GovernanceApprovalWriter` -> Agent Approval persistence; canonical Post service. | Operations service owns governance transactions through `dbtx.Transactor`. | **Service dependency and approval-effect ownership converged.** Governance uses narrow Agent writers, and approved candidate/task/reply/suggestion effects are persisted by Operations rather than Agent ApprovalRepository. HTTP ownership remains a later controller phase. |
| **Knowledge** | Embedding profiles, index jobs/chunks, retrieval metrics/evaluation; `ai_embedding_profiles`, `ai_content_index_jobs`, `ai_content_chunks`, `ai_retrieval_metrics`, `ai_retrieval_eval_cases` | `internal/knowledge` service; cohesive service-local persistence is intentional today | Provider HTTP/runtime boundary; Tool consumers through Knowledge service API. | Knowledge service owns multi-write index transactions through `dbtx.Transactor`. | **Service boundary stable.** Controller ownership remains flat and is deferred until service/dependency convergence is complete. |
| **Media** | Media assets; `media_assets` | `internal/media/{repository,service,controller}` | Agent generation/approval uses narrow Media contracts. | Media repository/service. | **Canonical implementation; remaining contracts tracked below.** |
| **Post** | Post lifecycle and post-owned relationships; principally `posts` plus owned relationship writes | `internal/post/{repository,service,controller}` | Community, Recommendation, Analytics, Tool and Agent use canonical service or narrow readers. | Post service/repository. | **Canonical implementation; remaining contracts tracked below.** Flat Post facades and the old flat service bucket are retired. |
| **Page** | Pages; `pages` | `internal/page/{domain,repository,service,controller}` | Feed, Agent and Tool use canonical service. | Page service/repository. | **Canonical implementation; remaining contracts tracked below.** Shared root Page model aliases remain only where cross-capability model sharing is real. |
| **Community** | Comments, reactions, reports and community notification behavior; `comments`, `post_reactions`, `comment_reports`, community-origin rows in `notifications` | `internal/community/{domain,repository,service,controller}` | Narrow published-Post resolution; Tool moderation reads. | Community service/repository. | **Canonical implementation; remaining contracts tracked below.** The physical `notifications` table is shared with the system-notification persistence boundary; shared storage does not imply duplicate business ownership. |
| **Taxonomy** | Categories, Tags and taxonomy relationships; `categories`, `tags`, association writes | `internal/taxonomy/{repository,service,controller}` | Post/feed consumers use canonical taxonomy API. | Taxonomy service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Site** | Site settings; `site_settings` | `internal/site/{repository,service,controller}` | Feed uses a narrow settings-read contract. | Site service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Analytics** | Analytics events and summary read model; `analytics_events` | `internal/analytics/{repository,service,controller}` | Cross-capability read model; Tool binds directly to canonical Analytics service. | Analytics service/repository. | **Canonical implementation; remaining contracts tracked below.** |
| **Recommendation** | Related-post read model; no owned write table | `internal/recommendation/{repository,service,controller}` | Narrow published-Post resolution and tag-overlap reads. | Read-only; no cross-capability write transaction. | **Canonical implementation; remaining contracts tracked below.** |
| **PostVersion** | Post version history/restore; `post_versions` | `internal/postversion/{repository,service,controller}` | Approval uses narrow `postVersionReader`. | PostVersion repository owns transactional restore. | **Canonical implementation; remaining contracts tracked below.** |
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
- **Workflow:** `RunLifecycle` owns cancellation/deletion. `MediaRunCoordinator` owns Agent Media Candidate read + Workflow Run write decisions through `dbtx.Transactor` at Serializable isolation. `RunAdmissionCoordinator` owns atomic queued-run creation + manual scope, failed scheduled-run reuse, and partial retry snapshot copying at Read Committed. Repositories receive caller-owned transactions and never call each other.
- **Connector:** still receives the flat compatibility alias solely because the module is under Hold. Removal condition: explicit Hold lift, direct `dbtx` cutover, unchanged Connector behavior, and Connector tests green.
- **Starter Pack application coordinator:** `internal/starterpack.Coordinator` owns the `dbtx.Transactor` boundary and `ai_workspace_bootstrap` coordination state; Provider, Skill, Agent Definition and Workflow repositories expose only narrow transaction-aware operations over their owned tables.
- **Approval -> Media Candidate -> Workflow event:** Media Candidate state is Agent-owned; Workflow event persistence is Workflow-owned. ApprovalService now owns the best-effort orchestration through `MediaGenerationStore` and `WorkflowEventPort`; repositories remain persistence-only and no cross-capability transaction is implied.
- **Operations governance:** Operations owns the transaction while Agent Run and Approval repositories expose narrow transaction-aware writers. This is the current reference shape for cross-capability coordination.
- **PostVersion restore — ownership debt:** `postversion/repository.RestoreVersion` starts a transaction that writes Post-owned state and version history. The operation is cohesive, but that alone does not settle persistence ownership. A later Post/PostVersion coordinator slice must keep restore atomic while moving Post writes behind a Post-owned transaction port. Do not mark this cross-capability contract complete.

## Compatibility facade inventory

| Facade / boundary | Classification | Current consumer(s) | Removal condition |
| --- | --- | --- | --- |
| `internal/repository.Transactor` and `NewTransactor` | Shared-infrastructure alias | **Connector only after Phase B** | Deferred by Connector Module Hold. Delete immediately after explicitly authorized Connector direct-`dbtx` cutover. |
| `internal/controller` Agent/Workflow/Operations/Knowledge controllers | Transitional HTTP ownership | Active router/controller composition | Move only after service dependency and transaction models stabilize; preserve routes, middleware, BFF and authorization behavior exactly. |
| `internal/domain` Agent/Workflow/Operations/Post/Page models | Deliberate model migration boundary, not automatically a facade | Multiple capabilities | Classify each model as capability-owned, shared kernel, cross-capability contract or transport DTO before moving. Never move solely for directory symmetry. |

## Flat-layer classification

The remaining flat files are not all equivalent debt:

- **A — migrate to capability / retire facade:** Agent/Workflow/Operations/Knowledge controllers after their service contracts stabilize. Flat Agent repository delegates are retired.
- **B — shared infrastructure:** generic DB transaction execution belongs in `internal/dbtx`; generic SQL error classification belongs in `internal/dberror`; shared HTTP primitives belong in `internal/controllerutil` when/where proven.
- **C — intentionally shared pending model-boundary decision:** root `internal/domain` types with real cross-capability consumers. These must not be duplicated or moved just to empty the directory.
- **D — explicit hold:** Connector-related controller/dependency paths. Record the dependency but do not modify it while Connector Module Hold remains active.

## Migration debt priority

1. **Workflow consolidation:** Definition/version, lifecycle, Agent MediaCandidate/Workflow Run, and Run admission/retry/recovery boundaries are explicit. Next converge event/schedule claiming and execution checkpoint persistence as coherent contracts; keep resource-query checkpoints and event scheduling with their owning operation rather than extracting isolated SQL statements.
2. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.
3. **Transitional layer retirement:** delete remaining flat controller facades and stale adapters only after consumer proof and full gates.

Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, **Starter Pack application coordination**, **Runner dependency/lifecycle convergence**, **Workflow Definition/Version persistence extraction**, **Workflow Run lifecycle coordination**, **Agent MediaCandidate / Workflow Run boundary convergence**, and **Workflow Run admission/retry/recovery convergence** now use canonical ownership boundaries and explicit composition-root wiring. The flat `repository.AgentRepository` aggregate and its Agent/Workflow/Notification delegates are retired; `internal/repository` remains only for the Connector-held Transactor alias until that Hold is explicitly lifted.


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
