# A+ public Feed canonical-origin / Controller error-response guard — 2026-10-29

**Status: security candidate; no merge, publication or A+ signoff implied without the exact-head gates.** Baseline main `705a15bb35cbf27fc52acdeacca26ee5c18727db`.

## Read-only reproduction and trust boundary

The public `internal/feed/controller.GetRSS` and `GetSitemap` previously built absolute links from a request `X-Forwarded-Host` header, then `Request.Host`, and `X-Forwarded-Proto`. No per-handler trusted-proxy/origin authorization was applied to those values. This allows a direct unauthenticated request or a misconfigured edge that passes these headers through to cause a feed/sitemap response containing attacker-chosen absolute links. Impact is feed/sitemap link poisoning and potential cache/SEO abuse; whether a particular production reverse proxy passes forged headers through is not proven by source inspection.

Production already sets an HTTPS `BLOG_OIDC_REDIRECT_URL` on the actual Blog domain and the confidential BFF validates its registered callback. The Feed controller now derives *only* the origin of an HTTPS `/api/auth/callback` URL from that trusted server configuration. It rejects userinfo, relative schemes, wrong paths, encoded callback variations, query and fragment, and falls back to a **fixed** `https://blog.dev.local` URL if not configured. It never reads Host or X-Forwarded-* to produce outbound URLs. The constructor receives the configured callback explicitly from the composition root via `WebRouterOptions`; there is no new browser token, SSO flow, cookie, permission or database contract. Production operators must maintain the existing valid Blog OIDC callback URL; a fallback is safe from attacker input but does not authorize an incorrect production SEO origin.

Regression tests send hostile Host + X-Forwarded-Host/Proto to both Gin feed routes while supplying the genuine Blog callback and assert only the configured origin appears. Negative cases exercise empty, http, relative, userinfo, wrong-path, query, fragment and percent-encoded callback; all fail closed. Canonical article route remains `/articles/:slug`.

## Error transport guard coverage, not a taint-certification claim

The previous Go-AST check covered ten Agent/Workflow/Knowledge/Operations/Community/Media/Site/Taxonomy/Post/Page controller packages. This batch adds Access, Analytics, Feed, PostVersion, Recommendation and ExternalCapability for **sixteen independently reviewed non-Connector capability directories**. It keeps direct `Error()` detection inside Gin JSON/String/Data/XML/etc responses and now detects local aliases/transitive map/struct/fmt wrappers. Synthetic positive and negative probes prevent a silent false-green for these cases and allow fixed/redacted messages plus trusted internal logging.

This remains **limited first-order static analysis**: it does not prove absence of indirect service-return taint, dynamically constructed strings through external helpers, custom writers, middleware, authorization, or all raw Provider/DB messages. **Connector is explicitly excluded** under root AGENTS Section 5; its observed raw JSON decoder error responses must be tracked as an unresolved Connector-specific security boundary and may not be silently changed or declared compliant without an explicit product authorization.

## Required exact-head acceptance

Require the actual candidate SHA to pass Go 1.27.3 backend/seed `go test` including the feed regression, `go test -race ./...`, vet, module checks and govulncheck; real isolated PostgreSQL suite with every required test and no skips/missing; three image builds + six Trivy/Grype checks; GOSSO BFF compatibility; Showcase Parity and UI Browser Acceptance where triggered. Review any callback/edge domain mismatch against deployed environment separately; these tests cannot replace a real Caddy/CDN header-verification drill.

Do not close #359 or #338 on this basis. The remaining React warnings, operational recovery dry-runs, signed image digest/provenance verification, dependency review, connector-specific risks and final A+ go/no-go remain tracked independently.
