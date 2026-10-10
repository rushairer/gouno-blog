# Agent capability: generation-attempt audit rules

The repository-root `AGENTS.md` remains authoritative. These additional rules apply to this capability and its repository/domain subdirectories.

## Required invariants

- Carry the exact positive `generation_attempt` returned by `ClaimMediaGeneration` into `ImageGenerationRequest` and its audit. Never fetch the candidate's current attempt after external work, infer it from timestamps/filenames, or backfill legacy audit rows.
- A governed image request must confirm its durable `started` audit before invoking the image provider. A database error, duplicate candidate/attempt pair, or missing returned audit ID stops dispatch. A committed INSERT whose acknowledgement is lost does not permit a replay.
- Finish only the same audit ID, candidate ID and attempt number, guarded by `status='started'`. A late old worker may finish its own audit, never a newer attempt's audit. Do not replace this with an upsert or an update by candidate ID alone.
- Bound audit writes to five seconds. Terminal evidence may outlive a cancelled worker context; a terminal write failure must never trigger another provider request. Preserve the existing candidate-level uncertain-outcome quarantine.
- Keep `latest_audit_*` backward compatible, but do not treat it as current-attempt evidence. Only `current_attempt_audit` is matched by the persisted pair; a NULL legacy attempt is unknown, not zero or the candidate's current attempt.
- Reconciliation remains a bounded, protected, read-only query. No lease reset, retry, automatic attachment, publication, compensation or permission escalation belongs in that query.
- Audit evidence is not proof of provider-side idempotency, dispatch, billing, or a completed candidate link. Missing evidence is not proof that no external side effect occurred. No prompt, credentials, raw provider errors or image bytes belong in these audit records.
- Candidate deletion must retain audit history through the existing nullable foreign key. Schema upgrades must preserve old terminal rows and tolerate old writers without fabricating correlation.

## Regression evidence

Retain the unit tests in `generation_attempt_audit_test.go`, real-database tests in `generation_attempt_audit_integration_test.go`, the migration upgrade test in `../migrations/generation_attempt_audit_integration_test.go`, and the existing media-generation fencing/reconciliation suites. Database skips are not database acceptance; run the repository's disposable PostgreSQL gate.

Operational interpretation and remaining limitations: `../../../docs/quality/media-generation-attempt-audit.md`. Issue #338 remains open until provider-specific recovery and other outstanding approval boundaries are actually verified.
