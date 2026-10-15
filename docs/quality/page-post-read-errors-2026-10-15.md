# Article / Page read-failure and public error-boundary hardening — 2026-10-15

This is the fourth targeted Controller/service reliability and confidentiality phase in [A+ closeout #359](https://github.com/rushairer/gouno-blog/issues/359), following fully merged [#363](https://github.com/rushairer/gouno-blog/pull/363), [#364](https://github.com/rushairer/gouno-blog/pull/364), and [#365](https://github.com/rushairer/gouno-blog/pull/365). Base `main`: `492da22d85e47706a740652c4fbbb66579143006`. A green workflow is not a whole-project A+ certification.

## Source-confirmed defects

1. `internal/page/service/page_service.go` previously converted **every** error from `GetByID`, `GetBySlug` or `GetPublishedBySlug` into `ErrPageNotFound`. A canceled SQL read, unavailable PostgreSQL connection or other serious repository failure was irreversibly misclassified as a user-visible Page 404. The Controller also returned 404 for every direct `GetPageBySlug` / `GetPage` error. This masked outages, made monitoring unreliable and could preserve a misleading cached not-found response in clients.
2. A **real PostgreSQL** negative test discovered another edge: `pages.id` is `SERIAL` (signed 32-bit), while HTTP accepts `int64` route IDs. A value above the SERIAL range produces PostgreSQL `22003` (integer out of range), not a genuine missing row. Page Service now validates this range **before** Get, Update and Delete SQL; impossible IDs map to the existing not-found sentinel. Genuine SQL no-row tests use an ID within the database's valid range.
3. `internal/post/controller/post_controller.go` correctly falls back from numeric ID to a numeric-looking Slug after `postservice.ErrPostNotFound`, but a normal repository `sql.ErrNoRows` result was treated as an immediate error and skipped that Slug fallback. Non-not-found SQL/transport failures must still **stop** before fallback.

These paths already called the shared domain response writer in other branches and did **not** directly reflect raw SQL strings. The issue was primarily **error classification, availability and operational observability**, not proof of an exposed DB password.

## Exact changes

- `PageService.pageLookupResult` maps only confirmed `sql.ErrNoRows` or `nil page, nil error` to `ErrPageNotFound`; other errors keep their original Go identity for diagnostics. All three Page reads use the same rule. A nil/invalid ID retains existing not-found behavior.
- `PageController.writePageLookupError` emits the **exact previous** `page not found` HTTP 404 for genuine missing entries, including wrapped `ErrPageNotFound`, `sql.ErrNoRows` and nil result. Unexpected errors pass to `controllerutil.WriteDomainError` for redacted HTTP 500 and trusted structured logs. The public route keeps the authorization-based **404 for an unpublished draft**, with no Page details exposed. The admin route no longer returns a false-success JSON null for an unexpected nil result.
- `PostController.Get` treats either `postservice.ErrPostNotFound` or `sql.ErrNoRows` (including wrapped variants) as a real missing ID and may then try the original Slug. Any other SQL/context/transport error is a redacted HTTP 500 **without** alternate lookup; the existing Post authorization policy and draft-hiding 404 are unchanged.
- Extend the AST direct `Error()` response guard to **ten independently audited capability Controllers**, update `AGENTS.md` and changelogs. The AST guard cannot prove absence of indirect error string reflection, especially in other capability controllers or middleware.

## Regression evidence

- `page/service/page_lookup_error_test.go`: typed/no-result not found vs wrapped SQL errors, cancellation and deadline; plus 32-bit SERIAL ID bounds on Get/Update/Delete using a nil repository to prove no SQL dispatch; trusted original causes remain available.
- `page/service/page_lookup_error_integration_test.go`: **real disposable PostgreSQL** canceled read vs truly missing row for GetPage, GetPageBySlug and GetPublishedPageBySlug; automatically discovered as required by `scripts/check-db-integration.py`, never silently skipped.
- `page/controller/page_lookup_security_test.go`: public/admin exact 404 vs safe 500, unexpected nil response, published Page, hidden draft, and error marker redaction.
- `post/controller/post_lookup_security_test.go`: numeric Slug with both raw/wrapped `sql.ErrNoRows`, domain not-found, SQL outage, cancellation and failed second Slug lookup; verify call counts and preservation of unpublished draft privacy.

No underlying SQL statements, schema, migrations, public article editor API payload, BFF/OIDC identity handling, managed UI, Connector capability, media/recovery workflows or generation retry/compensation behavior are modified.

## Required exact-final-head gates before merge

- Backend and Seed full Go **1.27.2** test/race/vet/go mod verify/govulncheck; `authbff` security package coverage >= enforced 80%; frontend build/quality and Compose/dependency review.
- Real disposable PostgreSQL inventory: prior 113 required tests **plus two new Page Service integration tests**, zero failed/skipped/missing, all three false-green probes properly fail, independent artifact ZIP hash and `summary.json` inventory inspection. Count the actual required tests, not an expected guess.
- Three multi-architecture image builds and all six Trivy/Grype scans, Gosso Release BFF Compatibility, Blog Showcase Parity (root `AGENTS.md` has changed, so the workflow should run).
- Only merge the immutable final head after all required green results; record exact run IDs/artifacts in the PR.

## Explicitly outstanding

This closes known Page read-error misclassification and Post numeric-Slug fallback. It **does not** certify all Article/Page error flows or all ten controllers against indirect data leakage. [#359](https://github.com/rushairer/gouno-blog/issues/359) still tracks frontend **74 oxlint warnings**, Vite oversized entry chunk, other non-audited Controller/middleware output paths, final release supply-chain proof and [#338](https://github.com/rushairer/gouno-blog/issues/338) human operator recovery exercises. Connector product remains frozen by the root repository policy.
