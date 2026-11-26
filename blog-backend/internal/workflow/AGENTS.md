# Workflow execution lifecycle

The repository-root AGENTS.md remains authoritative. Preserve the Agent claim, approval, usage, and Provider no-replay boundaries.

- Only a worker with an acknowledged queued-to-running claim may execute or attempt finalization. A losing or uncertain claim must not change Run state, notify failure, or dispatch work. No automatic reclaim or reset.
- Completion is conditional on the Run still being running and must acknowledge exactly one affected row. Cancellation, terminal states and externally transitioned waiting states must not be overwritten by a late worker.
- Bound completion/failure writes to five seconds independently of worker cancellation. Never turn an uncertain completion acknowledgement into a second failure write. Notify failure only after a confirmed failure transition.
- Startup and periodic recovery may drain only queued runs. Never bulk-reset running runs to queued: another replica can still own the claim, and a crash can follow a committed step effect before its checkpoint. A stranded claimed run requires independent operator outcome verification before explicit recovery. The queued scan is not evidence of per-step replay safety.
- Test duplicate claims, committed-before-acknowledgement-loss, before/after completion faults and stale completion with migrated PostgreSQL. These guards do not prove that cancellation interrupts an already dispatched Provider request, that step effects are atomic with checkpoints, or that operator retries are replay-safe.

- Missing checkpoint rows and failed checkpoint reads are distinct. A failed read, malformed stored output, existing non-successful same-run checkpoint, or unconfirmed checkpoint insert stops that execution path; a conflict/no-op is not acknowledgement. Do not dispatch based on unconfirmed evidence or turn it into a retryable failed run. An unconfirmed interaction creation or pending-state query also preserves the claimed run for inspection. ForEach must propagate evidence faults even with continue_on_error; independently executing siblings may already have effects. This is not per-step effect/checkpoint atomicity or permission to replay historical runs.
