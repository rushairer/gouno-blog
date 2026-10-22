# Admin request lifecycle

Root `AGENTS.md` and the manual-first Showcase protocol remain authoritative.

- Read-only detail requests must be associated with the latest user intent, not merely with the last response to finish. URL-driven and list-driven lookups for the same pane share one request generation.
- Fence both successful responses and errors. Leaving the owning tab/record type, unmounting, or removing the selected record invalidates the pending intent. StrictMode cleanup must not disable the next legitimate setup.
- Never render a previous record's actionable details as the newly selected record while its request is pending. Do not let completion of a deletion clear an unrelated, newer selection.
- Keep current-request failures actionable and preserve deliberate, user-triggered retry. This read-side guard must never cause an approval, generation, publication, or other business mutation to replay automatically.
- Test controlled response ordering through the actual page and API boundary, including stale errors, URL lookups, context changes, current failure/retry and StrictMode. A source-marker-only test does not establish lifecycle correctness.
- Admin pages are certified Product-owned paths. A behavior-only change still requires fresh manual/browser evidence or an explicit `needs-manual-recertification` ledger state; do not manufacture verification by moving refs or reusing historical screenshots.
