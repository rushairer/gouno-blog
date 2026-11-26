# Workflow Planner response boundary

The repository-root AGENTS.md and Provider text negotiation rules remain authoritative.

- Require explicit protocol completion for both initial and correction text requests, without fabricating an Agent run or durable dispatch audit.
- Accept exactly one offered submit_workflow_draft Tool call with a valid identity and object arguments, or text when no Tools were returned. Reject ambiguous or unsolicited batches instead of selecting the first call.
- Only a completed, structurally accepted response that fails the typed draft contract may trigger one correction. Never correct an incomplete, rejected, invalid Provider response or transport failure. Preserve the actual correction request's typed error.
- Decode the correction into a fresh envelope. Never inherit fields or normalization warnings from the previous rejected draft. Keep returned drafts disabled and subject to existing Workflow validation; planning does not execute Tools or persist a workflow.
- Exercise actual HTTP counts and typed errors. No claims of billing certainty, audit retention or production deployment follow from these checks.
