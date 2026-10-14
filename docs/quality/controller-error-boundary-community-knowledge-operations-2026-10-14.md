# A+ Controller response confidentiality — Community / Knowledge / Operations phase (2026-10-14)

Continues [#363](https://github.com/rushairer/gouno-blog/pull/363) from exact current main `18bcaf0c8b9859da2cf91fb5ce35cfe0ccb1f1e5`. Tracked as an incremental item in [A+ checklist #359](https://github.com/rushairer/gouno-blog/issues/359).

## Scope and observed exposure

A separate, read-only inspection identified **nine** `err.Error()` HTTP responses that serialized Gin/Go JSON decoder errors in three capability controllers:

| Controller | Previous untrusted decode/binding error responses | Path-specific concern |
| --- | ---: | --- |
| Community | 3 | Comment reports, notification batch deletion, comment moderation |
| Knowledge | 2 | Embedding Provider profile JSON (including secret-bearing API key fields), index evaluation cases |
| Operations | 4 | Suggestion-review reason, editorial task status, content candidate selection and AI feedback |
| **Total** | **9** | Direct parser/validator reflection in HTTP 400 |

This phase replaces **only the listed binder-error transport branches** with the accepted shared `controllerutil.WriteJSONBindingError`. It preserves each existing HTTP 400 status and all strict decoding, required-field constraints, business validation, access control, data access and success envelopes. It does not relax errors, inject a generic retry, change query limits, or add an undocumented request-body size cap.

Community's separate public comment creation route intentionally continues to use the preexisting localized `controllerutil.WriteValidationError` contract. No public/private comment workflows, Redis rate limits, notification semantics or Connector product behavior are changed.

## Regression evidence

- Knowledge: real Gin handlers reject unknown private embedding API key fields and evaluation-case properties, using fixed HTTP 400 before service dispatch.
- Operations: four real Gin handlers reject private suggestion/feedback JSON field names, retaining HTTP 400 before any business effects.
- Community: report, batch deletion and moderation reject invalid JSON type/shape with a fixed response; the report route also preserves its existing identity and rate-limit prechecks.
- The existing AST guard in `internal/controllerutil/controller_transport_security_test.go` is expanded from Agent/Workflow to all **five** audited capability controllers. It prevents direct nested `Error()` serialization in Gin JSON/string/data output, but cannot prove freedom from indirect leaks; do not overstate it.

## Required final-head acceptance

Go 1.27.2 backend+Seed test/race/vet/module verification/govulncheck, actual disposable PostgreSQL required-test inventory and false-green probes, frontend quality/dependency review/Compose, backend+frontend+Seed image builds plus all six Trivy/Grype scans, Gosso Release BFF compatibility. GitHub's Showcase Parity has strict frontend, canonical design and root `AGENTS.md` path filters; this backend/controller/docs-only PR does not qualify, and its absence must **not** be represented as a successful new parity execution. Previously accepted #363 parity evidence remains a contextual baseline only.

After CI, log the exact immutable PR head and artifact IDs/hashes before merge. No migrations or production identity/publishing changes are intended.

## Remaining A+ Controller analysis

This batch does **not** close #359's total Controller work. Known raw `err.Error()` return sites in **Media** (file validation/in-use), **Site** (settings validation) and **Taxonomy** (category constraints) require distinct typed-contract review and fixed safe responses, since some are wrapped known-domain cases with established user-facing semantics. Post/Page indirect errors and non-Controller handlers, including code paths not caught by the static AST check, also require audit. Connector remains explicitly frozen without a separate user authorization. Frontend lint/performance and operator recovery remain independent unresolved A+ gates.
