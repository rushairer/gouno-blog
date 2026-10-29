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

## PostEditor save, preview and autosave ownership

- PostEditor may be edited during an in-flight save. Only acknowledge the complete saved Post as clean if no newer local edit generation exists. Keep the latest title, content, SEO, taxonomy, media, publication intent, and beforeunload protection even when an older server response returns success.
- Never write a dirty ref in a React setState updater or read it during render; retain the ref for synchronous unload protection and React state for visible feedback. The ACK for a newer edit generation cannot overwrite local fields or falsely report success. Preserve server-generated Post ID and revision on stale ACK so the next write is UPDATE, not another CREATE.
- Explicit save, preview-before-open, and draft autosave share one in-flight mutation fence. Do not open a preview of an older saved snapshot when local edits changed during its request. Do not automatically replay the same revision after an ambiguous failed save; allow deliberate user-triggered retry or a genuinely newer edit generation.
- Autosave remains for existing drafts only and may not silently revert a pending publish/schedule intent to draft. Preserve server-enforced 409 conflicts and no unreviewed automatic mutation replay. Cover the real API boundary with delayed responses, create identity, status visibility, beforeunload and desktop/mobile browser tests.
- Any behavior change to the certified PostEditor must follow manual-first Canonical Showcase/Product comparison, strict Core Wave 3 certification evidence and final-head CI, Images, browser and Showcase parity before merge.

## PostEditor historical-version restore contract

- Historical version restore is a business mutation and must share the existing single in-flight save/preview/autosave mutation fence. Reject double restore and concurrent writes; preserve the server's revision CAS, local permissions and 409 semantics.
- Never silently discard local unsaved draft edits when selecting an old version. Require a previously saved clean draft before submitting a restore; copy or explicitly save the draft first. The actual restore request may remain pending while the user changes the editor after dispatch.
- A successful restore acknowledgement only installs the returned historical version when the user's edit generation is unchanged. Otherwise retain newer local fields and dirty/beforeunload feedback, accept only new persisted revision/identity metadata and require an explicit subsequent save (never immediately auto-replay or falsely claim the current draft was saved).
- A transient timeout/ambiguous restore outcome never permits an automatic retry. Verify correct UI status and disabled controls during a restore, and cover desktop/mobile delayed response, 409 and unsaved-before-restore cases with real Product API tests. Refresh the incremental Core Wave 3 manual-first certification on exact tested refs.
