# Workflow claimed-run reconciliation (read-only)

## Scope and safety

A Workflow left in `running` may still be executing on another replica, may
have completed an external effect before checkpoint acknowledgement, or may
have stopped at a claim, checkpoint, child Agent, interaction or retry-owner
evidence boundary. Age is a triage signal, **not** a lease or proof of failure.
Startup and periodic recovery dispatch queued runs only; do not reset a
claimed run, replay a request, delete evidence or infer a billing outcome.

## Bounded inspection

Use the checked-in [candidate query](../../scripts/workflow-reconciliation.sql)
from the exact deployed schema revision (migration 102 or later), with an
already authorized read-only database connection. Do not create or rotate
credentials as part of an incident. In a psql session started from the
repository root:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
\i scripts/workflow-reconciliation.sql
ROLLBACK;
```

The single SELECT returns at most 100 oldest running candidates: claims at
least 15 minutes old or running rows with no claim timestamp. The threshold
is a starting point for operator triage, not a timeout guarantee. The
projection contains IDs, timestamps, persisted observed Workflow token
counters and counts of retained checkpoints, linked Agent runs, active
children, pending interactions and owned retry indices. No prompt, input,
output, error message, resume token, Provider credential or resource snapshot
is selected. A timeout or error is an incomplete report, not an empty result.
A full page means there may be more candidates; never delete or transition
rows to expose the next page. This bounded result is not a complete incident
inventory or a liveness probe.

## Investigation and recovery decisions

1. Record the deployed immutable image/commit, Run ID, version ID, observation
   time and an independent incident reference. Check all worker replicas and
   logs using trusted operational access before calling a Run abandoned.
2. Inspect retained step and child identities/statuses for the exact Run.
   Correlate actual child Agent usage/audit and Provider request evidence;
   absence of a row or a zero counter does not prove absence of dispatch,
   effect or billing. Workflow counters are acknowledged phase observations,
   not a billing ledger; do not add child and parent totals together.
3. For a retry, inspect the exact source Run, immutable definition and
   `ai_workflow_retry_admissions` ownership. A count alone does not establish
   selection equality. Unowned, conflicting or missing indices never
   authorize replay. Pre-migration deleted history cannot be reconstructed.
4. Inspect pending human interactions, approvals and media effects through
   their existing protected read-only procedures. Follow [approval recovery](agent-approval-in-doubt-recovery.md)
   and [manual media recovery](media-generation-manual-recovery.md) for those
   capabilities. Do not copy payloads or secrets into incident reports.
5. Preserve records while outcomes are unknown. Cancellation does not prove
   external requests were interrupted; deletion can remove detailed
   evidence and the source Run's retry ledger. Never cancel/delete solely to
   clear the report, reset by SQL, release consumed indices, or automatically
   resubmit. Any fresh action requires independent outcome verification,
   current permissions and a separately reviewed operational decision.

The query is exercised in the disposable PostgreSQL integration suite
(`TestWorkflowReconciliationReadOnlyCandidates`), including a real read-only
transaction, metadata-only columns, linked evidence, old/missing claim
timestamps, state exclusions and the result cap. It does not add an HTTP
route, alter execution behavior, or certify a production recovery drill.
