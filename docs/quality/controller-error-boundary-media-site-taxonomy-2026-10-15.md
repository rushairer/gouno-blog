# Controller error confidentiality: Media / Site / Taxonomy (2026-10-15)

Third independently scoped capability phase of [A+ issue #359](https://github.com/rushairer/gouno-blog/issues/359), following merged [#363](https://github.com/rushairer/gouno-blog/pull/363) and [#364](https://github.com/rushairer/gouno-blog/pull/364). Review base: `main` `2fa817d1282df1aff973a6b6cd00d371df9ab8bb`. The project is **not** globally certified A+ by this one phase.

## Findings and changed contracts

The preceding phases removed direct raw binding-error reflection from Agent, Workflow, Community, Knowledge and Operations. Media, Site and Taxonomy had a different problem: their service errors include *valid public-facing, often localized, validation descriptions*, but Controller code selected a trusted sentinel with `errors.Is` then serialized the **entire received wrapped error** using `err.Error()`. If a repository, filesystem or upstream caller wrapped a sentinel with private diagnostic context, the HTTP response could expose that context. Blindly replacing all 400s would remove useful existing Chinese errors and violate consumers' UI contracts.

| Capability | Existing response that must stay stable | Revised failure boundary |
| --- | --- | --- |
| **Media upload** | HTTP 400 with fixed `image must be no larger than 10 MB`, supported MIME list, and fixed SVG safety denial messages | Only known, typed validator sentinels can select fixed 400 messages. `multipart.FileHeader.Open`, unexpected file Read or SVG parser I/O faults remain internal causes for a redacted HTTP 500; malformed client XML stays 400. Short final file read with bytes+EOF is valid. |
| **Media multipart framing** | Missing image field: fixed HTTP 400 | Over **11 MiB total multipart body**: fixed HTTP 413; do not echo raw Go `http.MaxBytesError`. Image file limit **10 MiB** unchanged. |
| **Media delete** | Referenced asset: HTTP 409 with the existing `ErrMediaInUse` static message | The wrapped SQL/DB error is not serialized. Unknown storage error remains redacted 5xx. No changes to binary object deletion/uncertain INSERT preservation semantics. |
| **Site settings** | Known overlength/empty-title/URL errors: HTTP 400 with their exact existing localized Chinese descriptions | Fixed output is selected only by known `errors.Is` identities. Unknown persistence failures are 5xx. Invalid JSON still has the existing `invalid settings payload` message. |
| **Taxonomy** | Name/Slug and invalid-ID known errors: HTTP 400 with existing localized Chinese messages; known missing category: 404 | Wrapped repository/private error text is never serialized. Known slug conflict retains standard HTTP 409, unknown database errors 5xx. Create/update/merge JSON rejection messages are unchanged. |

**Do not infer that HTTP 500 means a transaction was rolled back**. This change adds neither retries nor compensating deletion. The original Media persistence uncertainty protections stay intact.

## Implementation and repeatable evidence

- `internal/media/controller/validation_errors.go`: exact typed allowlist of supported Media/SVG validation outcomes, with existing public strings.
- `internal/media/controller/controller.go`: classify known validation separately from raw file I/O; preserve known media-use conflict; differentiate over-limit multipart 413 from missing file 400; `readMediaSample` accepts short final bytes with EOF and propagates unexpected I/O.
- `internal/media/controller/svg_security.go`: XML syntax faults return the fixed SVG-invalid sentinel, underlying reader failures retain their internal cause for redacted 500.
- `internal/site/controller/controller.go` and `internal/taxonomy/controller/controller.go`: classify typed, fixed localized public errors without reflecting wrapped causes.
- `media/controller/error_transport_security_test.go`: Gin multipart unsupported/active SVG/empty/multipart >11 MiB; known wrapped 409 and unknown 500; exact typed allowlist; synthetic final EOF, filesystem and XML reader errors; malformed XML validation.
- `site/controller/controller_security_test.go`: Gin settings endpoint with all five wrapped known validation errors, unknown database 500, malformed JSON fixed 400.
- `taxonomy/controller/controller_security_test.go`: Gin create/update/delete with wrapped sentinel 400/404/409, unknown 500, stable JSON binder messages.
- The AST HTTP-output guard in `controllerutil/controller_transport_security_test.go` now scans all **eight explicitly audited** controllers: Agent, Workflow, Community, Knowledge, Operations, Media, Site and Taxonomy. It catches direct `Error()` serialization in Gin response expressions, but is not a taint analyzer and cannot prove the absence of indirect leaks. Update root `AGENTS.md` accordingly.

## Mandatory merge gates

On the immutable final PR head, verify Go 1.27.2 backend and Seed tests, `go test -race ./...`, vet, go mod verify, govulncheck, actual `authbff >= 80%` ratchet; frontend quality, Compose, dependency review; disposable PostgreSQL **all required test inventory with zero skipped/missing/failed plus three fail-closed probes** and independent artifact hash; backend/frontend/Seed multiarch image builds with **all six Trivy and Grype checks**; Gosso Release BFF Compatibility; and **Blog Showcase Parity** (root `AGENTS.md` changed and should trigger). If any gate is red, fix the cause and rerun on the resulting new head, not only the old commit.

## Explicitly not closed by this work

The three phases establish *scoped direct-error-response coverage in eight controllers*. Article/Page indirect errors, remaining non-audited controllers/HTTP middleware, secondary policy-derived messages and incident/logging flows require their own independent audit and final whole-project verification. The frontend still has **74 lint warnings and an oversized Vite chunk** on previous measured main; no frontend remediation is included here. Operator recovery, Provider billing/outcome uncertainty and associated approval boundaries remain separately tracked by [#338](https://github.com/rushairer/gouno-blog/issues/338). Connector product behavior remains frozen by root `AGENTS.md`.
