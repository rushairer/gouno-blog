# Agent approval: in-doubt execution recovery

## Safety invariant

An approval ID is a **single execution attempt**, not a retry token. The service
durably claims a pending approval as `approved` before applying a business
effect. A successful effect and final approval status are not always in the same
transaction, so a database/network error does **not** prove the effect failed.

- `pending`: a human may approve or reject it, subject to permissions and MFA.
- `approved`: an execution was claimed. It may be running, completed with an
  unacknowledged write, or abandoned by a crashed worker. **Do not replay.**
- `executed`: final approval transition persisted.
- `failed` (legacy): historical execution errors may have occurred **after**
  a durable effect. They are excluded from the actionable queue and cannot be
  reapproved or rejected through review endpoints.
- `rejected` / `expired`: terminal without a new execution.

If a call returns `ErrApprovalOutcomeUncertain`, **never** automatically
convert `approved` to `pending` / `failed`. The HTTP response is not
proof that the effect was rolled back. This is **fail-closed at-most-one
attempt**, not a claim of atomic exactly-once execution.

The ApprovalRepository enforces guarded state transitions. Reconciliation
must not overwrite `approved` while another proposal in the run is rejected.

## Read-only investigation

First find claimed approvals older than the normal request duration. The
following is an example alert query (15 minutes is an operational starting
point, not a release-time guarantee):

```sql
SELECT id, run_id, tool_call_id, action_type, target_type, target_id,
       reviewed_at, now() - reviewed_at AS claimed_age
FROM ai_approvals
WHERE status = 'approved'
  AND reviewed_at < now() - interval '15 minutes'
ORDER BY reviewed_at;
```

Correlate approval ID, run ID and request ID with backend logs and audit
events. Use **read-only** database inspection to confirm the actual target,
revision and writes relevant to `action_type`. For example:

```sql
SELECT id, source_approval_id, title, priority
FROM ai_editorial_tasks WHERE source_approval_id = :approval_id;

SELECT id, source_approval_id, comment_id
FROM ai_comment_reply_drafts WHERE source_approval_id = :approval_id;

SELECT id, source_approval_id, post_id
FROM ai_content_candidate_sets WHERE source_approval_id = :approval_id;
```

For `create_draft` / `create_page_draft`, inspect the proposed slug and
created content; `target_id` may be NULL even after a successful create.
For edits, compare the captured revision or update timestamp with current
data. For media proposals and operational suggestions, inspect their
source-approval or deduplication linkage and any downstream records.

## Recovery policy

1. Preserve the approval record and collect an incident/audit reference.
2. Determine whether the effect was applied, partially applied, or cannot be
   established. Do **not** infer rollback from timeout or a missing target ID.
3. If effects are uncertain, keep the approval quarantined; resolve through a
   separately reviewed operational incident process. Never execute the same
   approval ID twice, reset its state by SQL, or replay its original request.
4. If a clean new action is required, first verify the current business state
   and create a **new** approval with a fresh proposal/snapshot, permissions,
   MFA and reviewer decision. Do not silently recover an old decision.
5. Review orphaned `approved` rows and legacy `failed` rows before migration
   or release cutover. Retain all evidence; do not delete them for cosmetic
   status cleanup.

## Atomic local PostgreSQL effects (phase 1)

Agent approval now executes `create_editorial_task` and `reply_comment`
inside one `dbtx.Transactor` transaction that spans the Operations-owned insert
and the Agent-owned `approved -> executed` update. Both target tables already
enforce `UNIQUE(source_approval_id)`, so duplicate writes fail at the durable
business boundary. The initial `pending -> approved` claim remains a separate
transaction and retains the fail-closed policy.

For these two actions:

- **Before final COMMIT:** failure rolls back the business row **and** the
  `executed` transition; approval remains `approved` and must not auto-retry.
- **After COMMIT, ACK lost:** the business row and `executed` approval are
  committed together. The caller may still see an uncertain outcome; inspect
  the database rather than replaying the approval.
- **Concurrent reviewers:** only the conditional initial claim wins; the
  losing requests must not execute any effect.

Other action types still use the older separated-effect/finalization path and
remain quarantined on ambiguous outcomes. This phase **does not** implement
transactional recovery or externally observable exactly-once semantics for
posts, pages, media, or workflows.

The isolated PostgreSQL regressions for this phase are in
`internal/agent/approval_atomic_operations_integration_test.go`: commit,
rollback after insert, committed-but-lost-ACK, and 16 concurrent reviewers for
both supported action types.

## Remaining architectural work

The phase-1 atomic Operations path eliminates the split commit for editorial
and reply-draft approvals only. The remaining guards prevent unsafe
**automatic replay** elsewhere but do not provide a universal cross-capability
atomic commit. A later phase should add durable per-effect
idempotency keys and transactional completion (or a transactional outbox)
where feasible. Only then should selective, provably safe retries be
reintroduced, with database fault-injection tests for each action type.

Relevant regression tests:
- `internal/agent/approval_fault_recovery_test.go`: concurrent reviewers,
  lost effect/completion acknowledgements.
- `internal/agent/approval_fault_integration_test.go`: a PostgreSQL write
  commits, then the writer reports failure; the approval cannot be replayed.
- `internal/agent/repository/approval_repository_integration_test.go`:
  historical failure quarantine, guarded transitions and safe run reconciliation.
