# API surfaces and contract ownership

This document is the current API-boundary decision and work order for the Blog-first platform. It is not a claim that every operation has a complete OpenAPI schema or that a future CMS exists.

## Current boundaries

| Surface | Current source | Trust boundary |
| --- | --- | --- |
| Public Blog | `/api/posts`, `/api/pages/*`, taxonomy, site, feed/sitemap | Public published-content handlers; optional browser identity for interactive operations; no administrative authorization implied |
| Browser BFF and management | `/api/auth/*`, `/api/me/*`, `/api/admin/*`, protected content/community routes | Blog-origin HttpOnly session, CSRF and Blog-local authorization; MFA on governed administrative actions; no browser access or refresh tokens |
| External Capability v1 | `GET /api/external/v1/capabilities`, `POST /api/external/v1/capabilities/{name}/invoke` | Server-only API key, explicit client scope, external Tool surface and read risk, independent rate limiting; no browser Origin, no BFF session, no proposals or write Tools |
| Workflow inbound webhook | `POST /api/ai/webhooks/{event}` | Workflow-owned inbound event receiver; not a general public webhook delivery service or an external capability API |
| Connector | Existing Connector administration/callbacks | Frozen product behavior; no change or enablement through the platform work |

Sources: [route composition](../../blog-backend/router/web.go), [runtime wiring](../../blog-backend/cmd/gouno/web.go), [External Capability HTTP adapter](../../blog-backend/internal/externalcapability/controller/controller.go), [invocation service](../../blog-backend/internal/externalcapability/service/service.go), [Tool registry](../../blog-backend/internal/tool/registry.go), [confidential BFF ADR](../oidc-bff-split-adr.md).

## Tool dispatch ownership

The Tool Registry owns executable Tool definitions, surface classification, risk and resource scope. External Capability consumes only a read catalog and read invocation port. The same registry predicate governs both discovery and execution: an explicit external surface, read risk, an executable handler and no proposal handler. The gateway still verifies the persisted client's grant before dispatch. Agent/Workflow execution remains on the existing governed path; no new external Tool names, routes or privileges are introduced.

Registration owns copies of mutable schema, surface and scope metadata. Catalog, provider definitions and scope queries return detached copies so consumers cannot silently change authority through an alias. Registry registration and binding remain startup operations, not a concurrent runtime plugin lifecycle.

## Agent model execution contract

Runner consumes only the model and locked Skill version inputs from Agent Management. It checks all returned Tool names against the actual request's offered definitions before dispatching any call. The last synthesis turn cannot execute Tools, stale grants cannot cross the Agent surface, and preview does not execute write-risk Tools or persist approvals. Normal-run publication, strict scope and approval contracts remain unchanged. Dry-run still records execution/usage and may consume Provider resources.

Agent-level retries use a typed HTTP 429 rejection, not substring matching. Timeouts, transport/decode errors and 5xx are not automatically replayed. Existing explicit text protocol negotiation is separate; Anthropic thinking/tool-choice negotiation requires an explicit typed compatibility rejection at each transition and stops after unrelated failures. Typed HTTP failure codes are shared across OpenAI, Anthropic and Gemini. Neither an HTTP rejection nor local usage evidence guarantees provider-side billing behavior. The Agent execution owner confirms a one-way queued-to-running claim before dispatch; claim failures cannot finish another worker's run. Only a guarded running-to-terminal transaction can persist execution status and synchronize MediaCandidate usage. The terminal write is independently bounded, with no replay after an uncertain acknowledgement. Workflow accepts only succeeded/awaiting_approval as completed model-step outcomes.

Observed tokens survive subsequent execution failure. Monthly budget checks include active, failed and cancelled runs, reconciling each run's durable ledger and aggregate counters without double-counting. Preserve the existing run-creation-month and deletion semantics. Governed Agent text now has a separate durable dispatch ledger at each explicit HTTP client call, including protocol negotiation and retries. It records the actual selected profile fingerprint, operation/stream flags, turn/sequence, HTTP status or transport uncertainty and bounded optional header IDs. Starts and outcomes require acknowledgement; failures stop further dispatch. HTTP response headers are not parsed model success or usage. The ledger retains source Run identity after deletion; historical usage totals still follow existing retention and calendar semantics. Gemini response-body IDs, final decoded/stream outcomes, other text callers and exact upstream billing remain separate audit work; these changes do not introduce automatic reclaim or retry of uncertain executions.

## Audit semantics

An authorized read-only Tool invocation returns a successful result only after its invocation audit insert is acknowledged. An audit failure or timeout withholds the result and returns a fixed 500. Existing denied, malformed, and rate-limited response contracts are preserved; audit failures on those paths are logged as redacted operational errors. Invocation and rate-limit audit writes use a two-second context independent of request cancellation. No failed or ambiguous insert is automatically replayed. Successful catalog discovery is distinct from invocation; malformed JSON rejected before Tool dispatch does not represent an invocation. The audit record describes the attempted operation, not proof of response delivery. No new database schema, external write capability, or exactly-once guarantee is introduced.

## Rate-limit storage contract

External Capability and Community share the `internal/ratelimit` infrastructure but not the same outage policy. The external service rejects Redis errors; Community retains its existing bounded process fallback. Redis uses a single-key atomic fixed-window operation: new counters are created together with their expiry, existing deadlines are preserved, and legacy persistent counters receive a finite expiry without resetting usage. No Redis ACL expansion, key namespace change, new quota policy or Connector change is implied. The executable tests cover expiry, legacy repair, concurrency, invalid parameters and storage errors. Actual deployment and multi-replica acceptance remain separate.

## Contract governance

- The [current OpenAPI document](../../blog-backend/config/openapi.yaml) describes selected operations across multiple surfaces. It is not a complete route inventory and must not be published as a stable general-purpose SDK contract without additional review.
- A preliminary source-only comparison identified 187 literal route registrations in selected router groups and 96 without matching operations in the current specification at main `cb994f30c16e541b33f4e77afad080317a57850d`. This excludes dynamically registered BFF routes and other registration forms; counts are not a runtime census. Do not interpret undocumented internal routes as public capabilities.
- First stabilize the two versioned External Capability v1 operations and their actual schemas, errors, scope and audit contract. Maintain backwards-compatible response envelopes and route version; don't rename them merely to match internal Blog URLs. The router contract test compares actual Gin registrations for the machine and management surfaces against the parsed OpenAPI operations and their distinct security declarations. This scoped check does not certify authorization middleware behavior or full API coverage.
- The existing public tag summary and Page reads have explicit OpenAPI response schemas, including the authorized draft-preview distinction. Post detail/update/delete now share the same canonical path template; numeric write inputs remain unchanged. The scoped runtime registration guard also rejects equivalent OpenAPI template hierarchies. This is not a new Content Delivery API.
- Next enumerate actual registered routes with the full application configuration, classify by owning capability and trust boundary, reconcile missing/stale operations, and establish an executable contract-drift check. Include intentional internal-only and compatibility operations explicitly rather than generating empty schemas.
- Later define a separately reviewed Content Delivery API, external SDK and outbound webhook contract only where there is a proven consumer. Do not expand the external write scope or Connector behavior implicitly.

Acceptance of this boundary change requires targeted fault tests, full backend and database gates and the existing cross-surface security checks. Documentation is not evidence of release acceptance.
