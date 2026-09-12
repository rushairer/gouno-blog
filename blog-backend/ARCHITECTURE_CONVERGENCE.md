# Blog Backend Architecture Convergence Map

This document is the migration Source of Truth for Capability convergence. `ARCHITECTURE.md` defines the project convention; this map records the current ownership, dependency, transaction, compatibility, and retirement state. A capability is not complete merely because files have moved.

## Capability ownership and convergence

| Capability / boundary | Owned domain concepts / tables | Canonical implementation | Dependencies and cross-capability contracts | Transaction ownership | Legacy / migration state |
| --- | --- | --- | --- | --- | --- |
| **Agent** | Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates and Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits` | `internal/agent` and `internal/agent/repository` | Outbound to Provider, Workflow, Media, Post, Page, PostVersion, Notification and Tool through consumer-sized service dependencies or ports. | Repository-local transactions for owned aggregates; `RunLifecycle` coordinates Run/MediaCandidate lifecycle and Starter Pack uses its application coordinator. | **Service dependency model converged.** Scheduler, GenerationService, ApprovalService, ManagementService and Runner all consume canonical repositories/ports. Agent HTTP ownership remains flat. |
| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow`, `internal/workflow/repository` | Uses Agent Runner/Management and Tool registry. Agent consumes canonical Workflow interaction/event/scope contracts rather than Workflow SQL or aggregate delegates. | Workflow application service owns execution-level transactions through `dbtx.Transactor`; repositories own persistence concerns. | **Persistence and Agent-consumer ownership converged.** ApprovalService and Runner consume Workflow-owned ports directly. HTTP ownership remains flat. |
| **Operations** | Operational suggestions, health evidence, candidate sets, feedback, editorial/reply/news work; `ai_operational_suggestions`, `ai_link_health_jobs`, `ai_link_health_snapshots`, `ai_content_candidate_sets`, `ai_content_candidates`, `ai_feedback`, `ai_editorial_tasks`, `ai_comment_reply_drafts`, `ai_daily_news_jobs`, `ai_daily_news_runs`, `ai_daily_news_sources` | `internal/operations` service; no artificial repository/controller layer | Narrow `GovernanceToolCallWriter` -> Agent Run persistence and `GovernanceApprovalWriter` -> Agent Approval persistence; canonical Post service. | Operations service owns governance transactions through `dbtx.Transactor`. | **Service dependency and approval-effect ownership converged.** Governance uses narrow Agent writers, and approved candidate/task/reply/suggestion effects are persisted by Operations rather than Agent ApprovalRepository. HTTP ownership remains a later controller phase. |
| **Knowledge** | Embedding profiles, index jobs/chunks, retrieval metrics/evaluation; `ai_embedding_profiles`, `ai_content_index_jobs`, `ai_content_chunks`, `ai_retrieval_metrics`, `ai_retrieval_eval_cases` | `internal/knowledge` service; cohesive service-local persistence is intentional today | Provider HTTP/runtime boundary; Tool consumers through Knowledge service API. | Knowledge service owns multi-write index transactions through `dbtx.Transactor`. | **Service boundary stable.** Controller ownership remains flat and is deferred until service/dependency convergence is complete. |
| **Media** | Media assets; `media_assets` | `internal/media/{repository,service,controller}` | Agent generation/approval uses narrow Media contracts. | Media repository/service. | **Complete / canonical.** |
| **Post** | Post lifecycle and post-owned relationships; principally `posts` plus owned relationship writes | `internal/post/{repository,service,controller}` | Community, Recommendation, Analytics, Tool and Agent use canonical service or narrow readers. | Post service/repository. | **Complete / canonical.** Flat Post facades and the old flat service bucket are retired. |
| **Page** | Pages; `pages` | `internal/page/{domain,repository,service,controller}` | Feed, Agent and Tool use canonical service. | Page service/repository. | **Complete / canonical.** Shared root Page model aliases remain only where cross-capability model sharing is real. |
| **Community** | Comments, reactions, reports and community notification behavior; `comments`, `post_reactions`, `comment_reports`, community-origin rows in `notifications` | `internal/community/{domain,repository,service,controller}` | Narrow published-Post resolution; Tool moderation reads. | Community service/repository. | **Complete / canonical.** The physical `notifications` table is shared with the system-notification persistence boundary; shared storage does not imply duplicate business ownership. |
| **Taxonomy** | Categories, Tags and taxonomy relationships; `categories`, `tags`, association writes | `internal/taxonomy/{repository,service,controller}` | Post/feed consumers use canonical taxonomy API. | Taxonomy service/repository. | **Complete / canonical.** |
| **Site** | Site settings; `site_settings` | `internal/site/{repository,service,controller}` | Feed uses a narrow settings-read contract. | Site service/repository. | **Complete / canonical.** |
| **Analytics** | Analytics events and summary read model; `analytics_events` | `internal/analytics/{repository,service,controller}` | Cross-capability read model; Tool binds directly to canonical Analytics service. | Analytics service/repository. | **Complete / canonical.** |
| **Recommendation** | Related-post read model; no owned write table | `internal/recommendation/{repository,service,controller}` | Narrow published-Post resolution and tag-overlap reads. | Read-only; no cross-capability write transaction. | **Complete / canonical.** |
| **PostVersion** | Post version history/restore; `post_versions` | `internal/postversion/{repository,service,controller}` | Approval uses narrow `postVersionReader`. | PostVersion repository owns transactional restore. | **Complete / canonical.** |
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

- **Knowledge / Operations / Workflow:** the application service owns its multi-write transaction boundary and receives `*dbtx.Transactor` directly.
- **Connector:** still receives the flat compatibility alias solely because the module is under Hold. Removal condition: explicit Hold lift, direct `dbtx` cutover, unchanged Connector behavior, and Connector tests green.
- **Starter Pack application coordinator:** `internal/starterpack.Coordinator` owns the `dbtx.Transactor` boundary and `ai_workspace_bootstrap` coordination state; Provider, Skill, Agent Definition and Workflow repositories expose only narrow transaction-aware operations over their owned tables.
- **Approval -> Media Candidate -> Workflow event:** Media Candidate state is Agent-owned; Workflow event persistence is Workflow-owned. ApprovalService now owns the best-effort orchestration through `MediaGenerationStore` and `WorkflowEventPort`; repositories remain persistence-only and no cross-capability transaction is implied.
- **Operations governance:** Operations owns the transaction while Agent Run and Approval repositories expose narrow transaction-aware writers. This is the current reference shape for cross-capability coordination.
- **PostVersion restore:** the PostVersion repository owns its transactional restore because the operation is cohesive to the PostVersion capability.

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

1. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.
2. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.
3. **Transitional layer retirement:** delete remaining flat controller facades and stale adapters only after consumer proof and full gates.

Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, **Starter Pack application coordination**, and **Runner dependency/lifecycle convergence** now use consumer-side canonical contracts and explicit composition-root wiring. The flat `repository.AgentRepository` aggregate and its Agent/Workflow/Notification delegates are retired; `internal/repository` remains only for the Connector-held Transactor alias until that Hold is explicitly lifted.


## Definition of done for a capability

A capability is Complete only when ownership, persistence ownership, service dependencies, cross-capability contracts, transaction ownership, composition-root wiring, HTTP ownership, tests, CI/security gates, and architecture documentation all agree. Any retained compatibility facade must identify its current consumer and concrete removal condition.
