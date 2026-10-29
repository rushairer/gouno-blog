# Global API body budget and external Capability overflow — 2026-10-29

Status: **candidate pending exact-head CI and security gates**.
Baseline main: `96643859df118c006df443b5deb51d1f44962395`.

## Actual gap

The global middleware **already** enforced 2 MiB JSON and 11 MiB multipart limits. However the larger allowance was keyed on caller-supplied Content-Type prefix rather than the registered Media upload route. A valid JSON request could carry a forged multipart header and receive the 11 MiB envelope on a non-upload endpoint. Production FormFile inventory and route registration identify only `POST /api/admin/media` for large multipart uploads. Additionally the external Capability JSON decoder lacked a local streaming limit and suppressed a trailing-data MaxBytesError into HTTP 400.

## Bounded correction and evidence

- Only exact registered Gin FullPath `POST /api/admin/media` with parsed multipart MIME uses 11 MiB; all other requests retain global 2 MiB. Streamed/unknown-length inputs remain capped.
- External Capability body decoder has a second 2 MiB limit in isolated handlers, keeps strict single JSON object parsing and returns fixed 413 on either Decode overflow. Invalid requests retain the fixed `invalid external capability request` 400, never raw parser details. No Tool invocation occurs after size errors.
- Tests cover legitimate Media framing, forged Content-Type on external routes, wrong method/path, MIME prefix spoofing, unknown length and real overlimit, Bearer-authenticated Tool invocation, and one-time client secret creation. OpenAPI documents 413 for affected POST/PUT JSON contracts.
- No changes to Connector Hold, auth/BFF, UI, persisted schemas or real upload validation.

## Required premerge acceptance

Exact head: CI Go tests/race/vet/govulncheck and real PostgreSQL (zero required test failures/skips), Images three builds / Trivy+Grype, GOSSO BFF and Showcase Parity. Browser acceptance if triggered; no relaxation of gates. This is a scoped improvement, not final #359 approval or #338 manual incident drill.
