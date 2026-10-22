# Request failure boundaries

Root AGENTS.md remains authoritative. These rules apply to this middleware directory.

- Recovery must terminate Gin's remaining handler chain. Never format a recovered panic or attach its raw value, request dump, query, headers, body or user-supplied request ID to diagnostics or private Gin errors. Use fixed messages and registered route templates; keep frame-only stacks for ordinary panics.
- Do not reintroduce Gin's default recovery logger or gin-contrib/timeout.New's Debug-mode panic response. The pinned upstream buffered Writer is reused by the application-owned timeout coordinator. Preserve the release/debug and real worker regressions when changing this adapter.
- Uncommitted ordinary panics use the canonical 500 JSON envelope. Disconnections and already-committed failed responses terminate through the safe net/http abort sentinel; never append JSON after committed bytes or return a fabricated successful response.
- Timeout writes must not race worker writes. Preserve canonical 408s, request cancellation, route-specific deadlines, failed-buffer/header discard, and joining the worker before aborting/reusing the Gin context. Do not pretend that cancellation forcibly stops non-cooperative handlers or that this buffered middleware supports streaming.
- Keep synthetic secret markers, hostile Error/String/Is/Unwrap cases, real HTTP transport, concurrent isolation and race checks. Tests that change global Gin mode/writers or the global Zap logger must remain non-parallel and restore them.
- Request recovery does not justify business retries or approval/generation replay. Broader logging and operational recovery gates remain separate; passing this package alone is not A+ signoff.
