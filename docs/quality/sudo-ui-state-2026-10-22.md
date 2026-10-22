# Sudo presentation-state consistency - 2026-10-22

## Scope

This checkpoint addresses useSudoMode, not server authorization. The existing public SudoModeState, active/expiring display contract, SudoGate/SudoBanner markup, popup transport and backend permission/MFA enforcement remain unchanged. Browser timestamps/events are still untrusted UI hints, never proof of successful MFA. No privileged business action is retried by the store.

## Defects and change

The previous hook parsed timestamp prefixes, accepted future timestamps, kept a separate timer/state per component and accepted storage events without checking their storage area. A truthy unrelated/unchanged event could erase an observed stale warning and clear the popup busy indicator. Direct recordSudoSuccess did not immediately update other same-document subscribers. Storage clear was ignored until polling; failed removal/write could expose an old activation again. Component remount lost observed stale state.

The hook now subscribes to one small browser presentation store with immutable cached snapshots and one reference-counted polling interval. Timestamp validation rejects malformed, unsafe, future and expired values. Relevant localStorage events cause a fresh storage read rather than trusting the queued payload; null-key clear is handled without treating a synthetic notification as a completion. An observed stale marker is retained until explicit completion or a valid stored activation newer than that marker. A failed write/removal fences the old hint in this document. Success/clear notifications update all mounted subscribers immediately.

## Regression evidence

The initial test-only checkpoint is retained in PR #381. CI 39765176165 / frontend job 119778724341 reproduced malformed/future timestamp acceptance, same-document desynchronization, loss of stale state on remount and duplicate timers against unchanged main. It also exposed test-harness defects: shared setup installs a custom Storage double, which cannot be passed to the native StorageEvent constructor or faulted by spying on Storage.prototype. Those failures are not application-defect evidence. The final harness models the event storageArea explicitly and spies on the actual installed storage object, with assertions proving each fault was invoked; production validation is not relaxed.

The final suite contains 35 public-hook scenarios covering malformed/future timestamps, expiration boundaries, shared updates/timers, stale remount, storage area/payload/clear, clock rollback before activation, storage exceptions, popup cancellation/busy state, blocked popup and successful callback. These are React/jsdom tests with synthetic storage events, not a real multi-tab authentication exercise. Existing hook, popup, MFA and canonical component tests remain required.

Local verification is TypeScript syntax transpilation plus 21 standalone checks of the actual store module with deterministic time, storage faults and event delivery. This is not a React/browser or full project acceptance claim. DNS/dependency availability prevented the locked-toolchain suite locally. Exact final-head CI, image security, database artifact, browser/parity results and remaining warnings must be recorded in the PR acceptance discussion before merge; no threshold or certification record is relaxed here.

## Limits

Stale/failure fences are in-memory and apply to observations made by this document while subscribed; they are not durable server state or a cross-device revocation mechanism. Full reload, user-modified storage/clock and fabricated same-origin completion events are not authentication boundaries. A clear resets the presentation hint, not the backend session, and does not cancel an already open popup. The unchanged server must reject unauthorized privileged requests regardless of the UI. This patch neither certifies all React warnings nor resolves operator recovery issue #338 or overall A+ issue #359.

Canonical component source and the parity certification ledger are untouched. Passing automated browser/parity checks is not a new manual visual certification.
