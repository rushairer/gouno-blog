# Frontend hook state boundaries

The repository-root AGENTS.md remains authoritative.

- Sudo timestamps, completion events and hook booleans are presentation hints, not authentication or authorization. Preserve the backend Blog-local permission/recent-MFA checks and existing popup/BFF protocol.
- Keep the public SudoModeState and active/expiring UI semantics stable. Canonical SudoGate/SudoBanner composition and certification records require their separate parity workflow; do not modify or downgrade them to make hook tests pass.
- Shared Sudo state uses cached immutable useSyncExternalStore snapshots. Do not read storage/time or mutate the store during render/getSnapshot. One subscriber group owns one polling interval and releases all listeners/timers when the last subscriber unmounts.
- Validate the entire positive, safe-integer timestamp; reject future/expired values. Read current localStorage after a relevant localStorage event, including clear; never treat arbitrary event.newValue, an unrelated transport key, or a sessionStorage notification as fresh MFA.
- Preserve an observed stale hint across component remounts. Re-reading the same timestamp must not remove that warning. Storage write/removal failures must not resurrect the previous hint; same-document success and clear update every subscriber immediately.
- Test through the public hook API, including positive popup callbacks and teardown. No hidden dependency-rule suppressions, relaxed coverage floors, fabricated visual certification or automatic privileged-operation/provider replay.
