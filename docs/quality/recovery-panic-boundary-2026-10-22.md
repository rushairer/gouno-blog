# Request panic boundary: bounded A+ continuation

Base: `e63704c1a7d00009eb43b4265d7347b0b0da15ab`. Tracking: #359, PR #380.
This is a request-recovery remediation, not whole-project A+ or production signoff.

## Confirmed failure and provenance

The original `middleware.go` blob `0a4e4daf64e7db20e7b95ca1305143b8396dbc3d` was independently hash-checked. Test-only commit `53179b61b6e4385437fb34b9fe0249daf007999b` deliberately preserved that implementation. [CI 39752175504](https://github.com/rushairer/gouno-blog/actions/runs/39752175504), backend job `119735165320`, ran Go 1.27.3 and failed with synthetic panic values appearing in diagnostics and `aborted=false reachedNext=true`. A hostile error implementation then panicked during Gin's `errors.Is` classification and terminated the test binary. Later matrix cases were not executed by that initial failed run; do not count them as reproduced there.

Pinned [Gin v1.12.0 recovery](https://github.com/gin-gonic/gin/blob/v1.12.0/recovery.go) logs the original panic before invoking the application's custom handler. Its debug/disconnect request dump masks Authorization but not every request field. The application additionally retained raw panic text and `debug.Stack` in private Gin errors, and failed to abort the remaining handlers.

Pinned [gin-contrib/timeout v1.2.3](https://github.com/gin-contrib/timeout/blob/v1.2.3/timeout.go) catches worker panics internally. In Debug mode it renders the raw panic and stack directly to the HTTP response, bypassing outer recovery. This source-confirmed path must be exercised by the final passing matrix, not excused as a development-only issue.

## Boundary implemented

- Own the recovery boundary instead of using Gin's default recovery logger. Add only a fixed private error and one structured diagnostic: registered route template plus frame-only Zap stack for ordinary panics; a fixed warning without a stack for disconnections. Do not format the recovered value or record URL/query/header/body/request-ID data. Classification failures from throwing Is/Unwrap methods become generic panics.
- Abort the Gin handler chain before responding. Uncommitted ordinary panics use the existing canonical 500 JSON envelope. Committed responses and disconnected requests escape as the fixed `http.ErrAbortHandler` sentinel so net/http terminates the transport without logging the original value; returning normally would let Gin finalize an unwritten response as 200.
- Keep the existing public timeout functions, route overrides, request context cancellation, canonical 408 envelope and worker-join behavior. An application-owned timeout coordinator reuses the pinned upstream exported buffered Writer but avoids its mode-dependent panic handler. It does not change global Gin mode or dependency pins.
- Serialize timeout responses with worker writes. Discard failed/timed-out buffered output and uncommitted worker headers while preserving headers from outer middleware. A completed worker cannot win the select race after its request deadline. Join the worker before touching Gin's handler index, restoring its writer or returning the context to the pool. Retain a safe diagnostic for a late worker panic without replacing the 408 response.

The recovery/timeout combination remains a buffered, non-streaming boundary. It cannot forcibly stop a handler that ignores cancellation; waiting for that handler remains necessary for safe Gin context ownership. This does not certify arbitrary handler-spawned goroutines, WebSocket/SSE or every HTTP/2 transport behavior. Existing general access logs and normal controller/domain error logging are outside this patch; do not claim all application logs are sanitized.

## Regression coverage and acceptance

The final regression source defines nine top-level tests with 66 leaf scenarios: release/debug ordinary panic matrix, real timeout-worker path, hostile error/stringer methods, nil panic, disconnection variants with and without timeout, context/global logger selection, unknown routes, healthy responses, a real HTTP partially committed response, buffered-header/body rollback, late success/panic, worker joining and 32 concurrent mixed requests. The initial disconnection fixture was tightened to assert the safe transport sentinel and inspect deferred state; its zero-write, abort and redaction assertions remain required.

The pre-existing route-template override test is retained unchanged. No assertion is waived, no existing test removed and no workflow filter, coverage floor or scanner threshold lowered.

Local evidence is limited to source review, exact original blob verification and gofmt/parsing. The available container has Go 1.23.2 and Node 22; repository/module downloads fail DNS resolution. No local full Go 1.27.3/Node 24/Docker suite is claimed. Final exact-head CI, race/vet/vulnerability checks, required real PostgreSQL manifest, Images/scanners and released-GOSSO BFF compatibility must pass before merge. Record actual run IDs, counts, hashes and any failures in the PR acceptance comment.

Frontend sources and certification ownership are untouched. Browser/Showcase workflows excluded by their existing backend-only filters are not new-head results. Overall #359, remaining React/indirect-error audit, #338 authorized operator recovery drills and final target-SHA release/security go/no-go remain open. No external provider request, business replay, production deployment or operator recovery is performed.
