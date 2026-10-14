# A+ Controller response confidentiality — AI and Workflow phase (2026-10-14)

Tracked under [project-wide A+ closeout #359](https://github.com/rushairer/gouno-blog/issues/359). This is an evidence-driven transport hardening **of two capabilities**, not a claim that all Controller paths in the repository are sanitized or that the project has reached A+.

## Reproduced issue and scope

Read-only source review of `main` `0a5fec6c5bacc7dc0be23f3a2536be9f7b891466` showed that Agent/AI and Workflow handlers wrote Go JSON-decoder errors or wrapped external service errors directly to HTTP responses via `gouno.NewErrorResponse(..., err.Error())`. Unrecognized JSON fields are attacker-controlled strings embedded in the parser error; nested Provider/Redis/SQL causes may also contain internal addresses, payload identifiers or confidential diagnostics.

The most consequential path was `Agent.GenerateImage`: **any** generation, Provider or Media persistence error was exposed verbatim as HTTP 400. A third-party failure is not a client JSON error, and the error body should not become a Provider diagnostics channel.

The former `DraftAssist` special case relied on `strings.Contains(err.Error(), ...)` to identify the missing default writing model, making status selection dependent on mutable error wording rather than a trusted type. Provider JSON imports had no route-level body-size bound despite potentially containing private API keys.

## Implemented boundary

| API class | New transport behavior | Preserved semantics |
| --- | --- | --- |
| Agent and Workflow malformed JSON / unsupported property / binding validation | Fixed HTTP 400, `invalid request body`; never echo field names or error causes | Strict decoder, `DisallowUnknownFields`, required-field rejection and business/service validation remain |
| Agent Run 64 KiB and Workflow Draft/Save 256 KiB limits | Fixed HTTP 413; Workflow retains the established 256 KiB error text | Exact existing limits, no widening of accepted inputs |
| Provider configuration import | Enforce 1 MiB limit; fixed 400 malformed import, fixed 413 oversized import | Existing array/wrapper/single-profile success shapes unchanged; no provider credentials emitted on error |
| Direct editor image generation failure after valid request | `WriteDomainError`: typed safe 4xx or bounded 5xx, not raw all-purpose 400 | Provider/storage/database/Media uncertainty semantics unchanged; no retries, compensation, deletion or object mutation added |
| Editor default writing Provider missing | Stable 409 `an enabled default AI provider is required` guarded by typed `errors.Is` | Existing wrapped `ErrInvalid` identity retained and other errors use standard domain mapping |
| Workflow webhook header errors | Fixed trusted 400 `missing or invalid webhook timestamp` or `missing webhook signature` and existing 401 invalid HMAC, no raw header echo | HMAC canonicalization, signature validation, time-skew checks and unauthenticated routing unchanged |

The new `controllerutil.WriteJSONBindingError` owns the fixed 400 and MaxBytesError 413 transport classification; it aborts the Gin request. A narrow Go AST guard scans production Agent and Workflow Controller files to reject a direct `Error()` call nested inside HTTP output. **This guard is deliberately scoped and cannot prove the absence of indirect leak paths**, logging leaks or vulnerabilities in other capabilities.

## Regression requirements

- `controllerutil/json_error_test.go`: user-controlled decoder field names, wrapped SQL/credential string sentinels, oversized body classification and explicit Gin abort.
- `agent/controller/json_transport_security_test.go`: actual handler invocation with private unknown JSON fields across Provider/Skill/Agent Approval/Media/Image/Draft Assist operations, bounded Provider import and Run/Workflow 413, typed 409 vs generic 400 and unknown Provider/DB 500.
- `workflow/controller/json_transport_security_test.go`: actual malformed JSON responses on workflow edit, rollback, retry, event, interaction; 256 KiB 413 for draft/save; signed-webhook header error classification independent of injected strings.
- `controllerutil/controller_transport_security_test.go`: syntactic guard against reintroduction of direct raw `Error()` into AI/Workflow HTTP outputs.

**Before merging** require the exact final PR head to pass Go 1.27.2 backend+Seed `go test ./...`, `go test -race ./...`, `go vet ./...`, `go mod verify`, `govulncheck`, disposable PostgreSQL integration (**zero skipped/missing/failed required tests** with actual artifact inspection and false-green probes), frontend quality, dependency review, Compose policy, backend/frontend/Seed multiarch image builds + both Trivy/Grype scans, Gosso BFF Compatibility and Showcase Parity (root `AGENTS.md` was changed, so parity is expected to run).

## Intentionally outstanding / next phases

Known additional Controller classes with `err.Error()` response sites were **observed, not modified**, including Community JSON binding, Knowledge requests, Operations AI feedback, Site/Taxonomy and Media-specific validation errors. The last three contain some typed domain cases that need proper mapping and backward-compatible UI contracts, not a blind replacement. Article/Page handlers and indirect reflection require their own complete audit. Connector product behavior is explicitly frozen and excluded without new user authorization.

After these capability-by-capability audits, refresh [#359](https://github.com/rushairer/gouno-blog/issues/359) with measured remaining sites and evidence. CI green, this source-scope AST guard or a high security-package coverage percentage **is not** an A+ project-wide rating. Manual incident recovery and external Provider billing/cross-store atomicity remain separately tracked in [#338](https://github.com/rushairer/gouno-blog/issues/338).
