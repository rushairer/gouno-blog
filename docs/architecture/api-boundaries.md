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

## Audit semantics

An authorized read-only Tool invocation returns a successful result only after its invocation audit insert is acknowledged. An audit failure or timeout withholds the result and returns a fixed 500. Existing denied, malformed, and rate-limited response contracts are preserved; audit failures on those paths are logged as redacted operational errors. Invocation and rate-limit audit writes use a two-second context independent of request cancellation. No failed or ambiguous insert is automatically replayed. Successful catalog discovery is distinct from invocation; malformed JSON rejected before Tool dispatch does not represent an invocation. The audit record describes the attempted operation, not proof of response delivery. No new database schema, external write capability, or exactly-once guarantee is introduced.

## Contract governance

- The [current OpenAPI document](../../blog-backend/config/openapi.yaml) describes selected operations across multiple surfaces. It is not a complete route inventory and must not be published as a stable general-purpose SDK contract without additional review.
- A preliminary source-only comparison identified 187 literal route registrations in selected router groups and 96 without matching operations in the current specification at main `cb994f30c16e541b33f4e77afad080317a57850d`. This excludes dynamically registered BFF routes and other registration forms; counts are not a runtime census. Do not interpret undocumented internal routes as public capabilities.
- First stabilize the two versioned External Capability v1 operations and their actual schemas, errors, scope and audit contract. Maintain backwards-compatible response envelopes and route version; don't rename them merely to match internal Blog URLs.
- Next enumerate actual registered routes with the full application configuration, classify by owning capability and trust boundary, reconcile missing/stale operations, and establish an executable contract-drift check. Include intentional internal-only and compatibility operations explicitly rather than generating empty schemas.
- Later define a separately reviewed Content Delivery API, external SDK and outbound webhook contract only where there is a proven consumer. Do not expand the external write scope or Connector behavior implicitly.

Acceptance of this boundary change requires targeted fault tests, full backend and database gates and the existing cross-surface security checks. Documentation is not evidence of release acceptance.
