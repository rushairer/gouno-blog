# Admin request lifecycle

Root `AGENTS.md` and the manual-first Showcase protocol remain authoritative.

- Read-only detail requests must be associated with the latest user intent, not merely with the last response to finish. URL-driven and list-driven lookups for the same pane share one request generation.
- Fence both successful responses and errors. Leaving the owning tab/record type, unmounting, or removing the selected record invalidates the pending intent. StrictMode cleanup must not disable the next legitimate setup.
- Never render a previous record's actionable details as the newly selected record while its request is pending. Do not let completion of a deletion clear an unrelated, newer selection.
- Keep current-request failures actionable and preserve deliberate, user-triggered retry. This read-side guard must never cause an approval, generation, publication, or other business mutation to replay automatically.
- Test controlled response ordering through the actual page and API boundary, including stale errors, URL lookups, context changes, current failure/retry and StrictMode. A source-marker-only test does not establish lifecycle correctness.
- Admin pages are certified Product-owned paths. A behavior-only change still requires fresh manual/browser evidence or an explicit `needs-manual-recertification` ledger state; do not manufacture verification by moving refs or reusing historical screenshots.
- Full-workspace reads need a separate shared snapshot generation across initial, manual and post-mutation refresh. Fence the complete parallel batch before any state write, and fence its error/loading completion too. A newer refresh may finish initial loading; an obsolete result must not replace the last accepted snapshot even after the current request fails.
- Unmount must retire pending snapshots and prevent delayed mutation completions from dispatching new reads for the retired page. Re-arm legitimate StrictMode setup without reviving the retired generation. Preserve optional-endpoint policy and explicit read retry; never replay a successful write because its follow-up read failed.

## PageEditor save/preview acknowledgement ownership

- The PageEditor draft is user-editable while a network save is in flight. An API acknowledgement for an older draft must **never** overwrite a newer local edit or clear its dirty/beforeunload protection. User-intent generations must cover text/metadata, AI apply, and publish intent.
- React status labels must render from committed state, not read a mutable ref during render; retain a synchronous ref for the beforeunload listener. A successful latest-generation save alone may mark the draft clean.
- A newly created Page may have committed before its HTTP response returns. Preserve its exact returned ID even when the response is stale to local edits. The next explicit save must be PUT, never an automatic duplicate POST. Only navigate/rehydrate the new edit URL when the current draft is actually acknowledged.
- Preview-before-open shares the same single in-flight save fence. If the response is stale, preserve the draft and require another deliberate preview/save action; never display an older persisted preview as if it included newer edits.
- Keep the real PageEditor and delayed API regressions (ordinary save, preview, new-page create, beforeunload, desktop/mobile) plus current manual-first Core Wave 3 Showcase recertification. Do not turn this into generic auto-retry/auto-save or weaken backend 409 conflicts.
