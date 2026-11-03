# Blog Admin AI — Workflow Run Latest-Intent Recertification

Status: **needs-manual-recertification**. This is a pending review record, not a visual certification.

## Scope

- Product path: `blog-frontend/src/components/agent/WorkflowRunRecords.tsx`
- Product owner: Blog Admin AI Operations / Run Center
- Canonical reference: Gouno UI main `2e1e1a5c31cc6f741fecf273b7ddd63a88133ee9`
- Canonical composition: `showcase/demos/products/blog-admin/ai/operations/automation-records.tsx`
- Related canonical patterns: `showcase/demos/products/blog-admin/ai/operations/canonical-patterns.tsx`
- Certification entry: `blog-admin-ai`

## Why this recertification is required

A read-only inspection found that the Product Run Center could accept an older asynchronous detail response after the operator selected a newer run. The stale response could replace the newer detail, surface an obsolete error, or clear the newer request's loading state.

The Product correction adds request-generation fencing for detail success, error and loading completion; invalidates pending reads when the user changes filters, leaves the detail pane or unmounts the owning workspace; fences URL-driven run lookup against newer user intent; and prevents a delayed mutation acknowledgement from refreshing or clearing another selected run.

The existing visual composition was inspected against the canonical Showcase. The Product continues to use the same master/detail layout, canonical object-row composition, run summary/detail hierarchy, empty/loading/error feedback locations and responsive pane switch. No JSX layout, typography, spacing token, CSS, public UI primitive, canonical Showcase or `@gouno/ui` dependency change is included.

## Required exact-head verification

- CI frontend quality and existing 61-warning Oxlint ratchet.
- Existing unit tests plus deferred-response regressions for:
  - older success arriving after the latest selected run;
  - older completion not clearing a newer loading state;
  - obsolete detail errors not replacing current state;
  - current detail errors remaining visible and user-retryable.
- Real Chromium desktop/mobile rendered acceptance for delayed stale success, stale error and leaving the Run Center while a detail read is pending.
- Showcase Parity workflow on the exact PR head.
- No approval, generation, retry, publication or other business mutation is automatically replayed by the read-side guard.

## Manual-first review still required

Before restoring `status: verified`, inspect fresh exact-head Product screenshots and compare them side-by-side with the frozen canonical Showcase at desktop and mobile widths. Explicitly inspect:

1. Run list default state and selected-row state.
2. Loading state while a newer run is selected.
3. Current detail, current request failure and deliberate retry.
4. Mobile master/detail transition and return-to-list behavior.
5. The visual state after a delayed obsolete success/error completes.

Confirm that the Product composition remains canonical and that no old run content, stale error, loading indicator or mobile pane leaks into the newer user intent. Record the exact Blog SHA, canonical Gouno UI SHA, workflow run IDs, artifact IDs and independently verified SHA-256 values. Do not reuse the 2026-10-28 screenshots or historical CI artifacts as evidence for this change.

Until that review is complete, the certification ledger must remain `needs-manual-recertification`. CI green is necessary but is not visual certification.
