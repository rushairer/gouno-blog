# Workflow execution lifecycle

The repository-root AGENTS.md remains authoritative. Preserve the Agent claim, approval, usage, and Provider no-replay boundaries.

- Only a worker with an acknowledged queued-to-running claim may execute or attempt finalization. A losing or uncertain claim must not change Run state, notify failure, or dispatch work. No automatic reclaim or reset.
- Completion is conditional on the Run still being running and must acknowledge exactly one affected row. Cancellation, terminal states and externally transitioned waiting states must not be overwritten by a late worker.
- Bound completion/failure writes to five seconds independently of worker cancellation. Never turn an uncertain completion acknowledgement into a second failure write. Notify failure only after a confirmed failure transition.
- Test duplicate claims, committed-before-acknowledgement-loss, before/after completion faults and stale completion with migrated PostgreSQL. These guards do not prove that cancellation interrupts an already dispatched Provider request, that step effects are atomic with checkpoints, or that operator retries are replay-safe.
