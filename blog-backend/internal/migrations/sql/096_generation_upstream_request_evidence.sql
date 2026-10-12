-- Upstream correlation evidence for governed generation attempts.
-- These fields are diagnostic only. They do not establish billing outcome,
-- replay safety or Provider-side idempotency.
ALTER TABLE ai_generation_audits
    ADD COLUMN upstream_request_id TEXT,
    ADD COLUMN upstream_account_id TEXT,
    ADD COLUMN upstream_workspace_id TEXT,
    ADD COLUMN client_request_id_sent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_upstream_request_id_check
    CHECK (upstream_request_id IS NULL OR length(upstream_request_id) BETWEEN 1 AND 512);

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_upstream_account_id_check
    CHECK (upstream_account_id IS NULL OR length(upstream_account_id) BETWEEN 1 AND 512);

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_upstream_workspace_id_check
    CHECK (upstream_workspace_id IS NULL OR length(upstream_workspace_id) BETWEEN 1 AND 512);

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_client_request_id_check
    CHECK (NOT client_request_id_sent OR (dispatch_id IS NOT NULL AND provider_vendor='openai'));

CREATE INDEX idx_ai_generation_audits_upstream_request_id
    ON ai_generation_audits (upstream_request_id)
    WHERE upstream_request_id IS NOT NULL;
