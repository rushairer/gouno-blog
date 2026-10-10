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

For current `create_draft` / `create_page_draft` executions, an
`executed` approval and its created Post/Page `target_id` commit together.
Older deployments or in-doubt `approved` records may still have a missing
`target_id`; inspect the proposed slug and actual content before drawing
any conclusion. A missing ID alone never authorizes replay.
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

## Atomic local PostgreSQL effects (phase 2)

`create_content_candidates`, `create_media_candidate` and
`create_distribution_draft` with `format=image_brief` now use the same
approval-completion transaction. For content candidate sets, **all child
`ai_content_candidates` rows and their parent
`ai_content_candidate_sets` row** roll back together if the approval status
cannot be persisted. For media, the existing captured post-revision check
is executed as part of the same transaction as
`ai_media_candidates` insertion and approval completion.
Both parent business tables retain `UNIQUE(source_approval_id)`.

A non-image `create_distribution_draft` (social/newsletter/FAQ) still has
no immediate media side effect. It only finalizes the approved proposal.
Subsequent image generation, asset publication, and article application
are **not** part of the approval transaction and require their own
independent recovery rules.

`internal/agent/approval_atomic_operations_integration_test.go` includes
a real migrated PostgreSQL matrix for both earlier Operations actions
and these new candidate actions: normal commit, an injected status
write failure after effects are staged, lost COMMIT acknowledgement,
concurrent reviewers, nested content children rollback, stale media
revision, and non-image distribution behavior.

## Atomic operational suggestions (phase 3)

`create_operational_suggestion` now commits the Operations-owned
`ai_operational_suggestions` natural-key upsert together with the Agent
`approved -> executed` status update in one PostgreSQL transaction.

The existing SHA256 fingerprint of `source_type:source_key:title` is the
**suggestion dedupe identity**, not a per-approval external idempotency key.
If a matching suggestion is still `new`, only its evidence and
`updated_at` may refresh. If the existing row is already ignored,
converted, selected or resolved, the approval is recorded as executed but
the suggestion remains untouched and is not reactivated. The trusted
`source_run_id` is always taken from the approved Run instead of user-supplied
proposal JSON.

The isolated PostgreSQL integration suite verifies insert+status rollback,
dedupe evidence-update rollback, commit-ACK loss, 16 concurrent reviewers,
source run provenance and terminal-status protection. These tests do **not**
claim delivery of downstream workflow events or exactly-once behavior across
external systems.

## Atomic Post draft and revision approvals (phase 4)

`create_draft`, `update_post` and `update_tags` use Post capability-owned
validation/SQL with a shared approval transaction. New draft creation now
inserts `posts`, writes `ai_approvals.target_id` with its guarded
`status='approved'` predicate, and completes the approval within **one**
commit. Title, status, principal fields, revision and publication cannot
be overridden through a draft proposal.

Post mutation fetches the existing record inside the transaction, validates
the proposal's recorded before-snapshot revision, preserves the PostService
slug and publication validation, then applies the existing SQL
`WHERE revision = expected` optimistic lock. This closes the race between
the pre-claim conflict check and the later business UPDATE. Existing
`post_versions` and `ai_workflow_events` triggers run in the same
transaction; they disappear on rollback, along with the content change.
Post link-health job triggers also retain their existing database
transaction semantics where relevant.

The migrated PostgreSQL integration matrix now tests normal approval,
business/status rollback, lost COMMIT response, 16 concurrent reviewers,
PostVersion and event rollback, created-draft target write failure,
concurrent edit after durable approval claim and draft-only field
allowlisting. A caller-reported uncertain result still does **not**
authorize replay, even where the database transaction itself rolled back;
reconciliation and a fresh approval remain required.

This does **not** certify PostVersion retention/history accuracy outside
the existing trigger contract, Page writes, image-generation operations,
downstream delivery or exactly-once external side effects.

## Atomic Page approvals (phase 5)

`create_page_draft` and `update_page` now run PageService's title,
normalized Slug, reserved-path, duplicate-Slug and template defaults inside
a shared PostgreSQL transaction with the Agent decision. Page-owned SQL stays
in `internal/page/repository`; `create_page_draft` inserts a **draft only**,
sets `ai_approvals.target_id` while `status='approved'`, and completes
`approved -> executed` in the **same COMMIT**. An injected failure of either
the target assignment or the final approval update rolls back the entire
business effect. Unrecognized proposal fields cannot override draft status,
ID or timestamps.

Page updates intentionally differ from Post revisions: each review must
contain a matching `target_type=page`, target ID and a nonzero
`before_snapshot.updated_at` captured by the proposal generator. A
pre-claim read checks this token; after the reviewer claim, the Page is
read **again in the same transaction** and the actual SQL UPDATE requires
`WHERE id = target AND updated_at = expected`. The predicate prevents a
concurrent product editor from winning between the Go read and SQL write.
Both ordinary PageService updates and transactional updates advance
`updated_at` with
`GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')` to
guarantee strictly monotonic timestamp tokens, even in long transactions.

Migrated PostgreSQL tests verify insert/status/target commit and rollback,
lost COMMIT acknowledgement, 16 competing reviewers, concurrent Page changes
**after durable reviewer claim** and **after a transactional read**, absent or
mismatched snapshots, reserved/duplicate Slugs, draft-only output and accepted
Page update fields/status. As with previous phases, uncertainty about the
final commit means **quarantine** of the one attempted approval ID, never
automatic replay.

This is local PostgreSQL atomicity, not delivery of external side effects
or globally exactly-once Page publishing. Historical `approved` records
from prior deployments still need read-only reconciliation.

## Image-generation attempt fencing and uncertain completion (phase 6)

Image generation cannot be made atomic with a PostgreSQL transaction:
the external AI provider, object storage and Media metadata are separate
durability boundaries. A Media Candidate is claimed by atomically setting
`generation_status='generating'` and increasing its `generation_attempt`.
Every subsequent candidate completion or error update now includes
`WHERE generation_status='generating' AND generation_attempt=:claimed_attempt`.
Cancelling and manually regenerating increments the attempt: a late response
from the old attempt may not attach an old asset or mark the new attempt failed.

After an external image succeeds, Media binary bytes and `media_assets`
metadata can already be durable BEFORE the Candidate references them.
Classify finalization errors precisely:

- **Definite guarded CAS miss (`sql.ErrNoRows`)**: this write did not
  attach the newly generated asset. An old, cancelled or superseded attempt
  may compensate its orphan Media row and object bytes.
- **Database/transport error, ambiguous COMMIT**: the Candidate MAY
  already reference the asset. Never delete Media bytes or metadata solely
  because the client did not receive the commit acknowledgement. Preserve
  the asset and its GenerationAudit linkage for manual reconciliation.
- **Confirmed success**: Candidate references the generated asset with the
  same attempt; do not initiate another provider generation.

Investigate `ai_media_candidates.id`, `generation_attempt`,
`generation_status`, `media_asset_id`, matching `media_assets` and
`ai_generation_audits` (where present) **read only** before any cleanup
or new human-authorized attempt. Do not reset a running lease or automatically
retry a provider call following an uncertain response. This phase is an
at-most-one-claimed-attempt fence and safe compensation policy, **not** an
exactly-once external generation guarantee.

Migrated PostgreSQL tests cover cancel -> re-claim -> delayed old failure
or success, and unit fault injection proves ambiguous completion never
deletes a candidate-referenced asset.

## Expired or provider-uncertain media generation (phase 7)

A `generation_deadline_at` is **not a renewable lease**. It is a
threshold for investigation. A crashed backend may leave a Media Candidate
in `generation_status='generating'`; neither cron nor a new HTTP request
may flip that row back to `failed` or re-call the provider based only
on elapsed time.

External provider errors, cancellations and timeouts can occur **after**
the provider accepted the request and charged for generation. Such errors
now attempt to record `error_code='outcome_uncertain'` with a fixed,
non-sensitive diagnosis **without changing** the `generating` status.
The recorded deadline is brought forward to make that uncertain attempt
appear immediately in the reconciliation queue. If the worker context
has already been cancelled, a separate bounded persistence context is used;
a failed marker write leaves the original claimed attempt blocked, and
the time-based query eventually reveals it.

An authorized AI-Operations administrator can call:

```http
GET /api/admin/ai-media-generation-reconciliation?limit=50
```

The GET handler is in the existing protected `aiOps` route group. Its
limit defaults to 50 and must be between 1 and 100. The response includes
only candidate IDs, Post/Run IDs, the claimed attempt number, started/
deadline timestamps, candidate error code and latest matching generation
audit identifiers/status/asset metadata. It includes **no prompts, raw
provider error messages, credentials or generated bytes**. It cannot
perform a provider request, change state, cancel a job or reset a lease.

The query also includes historical `generating` candidates whose deadlines
have elapsed (using the recorded start or creation timestamp for legacy
rows without a deadline). Investigate each separately:

1. Compare the claimed attempt, candidate status, Media asset link,
   `ai_generation_audits`, original workflow events and provider-side
   request/billing logs where available.
2. A **latest audit record is not proven to belong to the current attempt**:
   historical audit rows do not carry a generation-attempt token. A
   "failed" audit does not prove the provider did not charge.
3. Verify whether a provider response completed, storage metadata was
   created, or a candidate link might have committed without ACK. Preserve
   referenced assets when the result is ambiguous.
4. Only after independent investigation may an authorized operator use
   the existing explicit cancel-and-new-generation flow. Such action
   starts a **new attempt** and may incur a second charge; old in-flight
   responses are still fenced by their original attempt number.
5. If provider billing or outcome cannot be determined, leave the existing
   attempt quarantined; never automate a retry, SQL status reset or cleanup
   based solely on age.

A review entry can still represent a legitimately slow in-flight request;
it is a **triage signal**, not an assertion that the worker has exited.
No exactly-once provider execution or automatic provider reconciliation
is claimed.

## Remaining architectural work

The phased atomic paths eliminate the split commit for editorial tasks,
reply drafts, content candidate sets, approved media candidate briefs,
operational suggestion upserts, Post draft/revision/tag approvals and Page draft/update approvals.
The remaining guards prevent unsafe **automatic replay** elsewhere but do not
provide a universal cross-capability atomic commit. For other external effects, a later phase should add durable per-effect
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
