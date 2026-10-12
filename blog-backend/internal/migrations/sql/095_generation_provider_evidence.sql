-- Durable, bounded evidence for one governed image-generation attempt.
-- Historical rows remain NULL; never backfill provider or object evidence.
ALTER TABLE ai_generation_audits
    ADD COLUMN provider_profile_id BIGINT,
    ADD COLUMN provider_vendor TEXT,
    ADD COLUMN provider_config_fingerprint TEXT,
    ADD COLUMN dispatch_id TEXT,
    ADD COLUMN storage_name TEXT,
    ADD COLUMN storage_url TEXT;

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_fingerprint_check
    CHECK (provider_config_fingerprint IS NULL OR provider_config_fingerprint ~ '^[0-9a-f]{64}$');

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_dispatch_id_check
    CHECK (dispatch_id IS NULL OR dispatch_id ~ '^[0-9a-f]{32}$');

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_storage_name_check
    CHECK (storage_name IS NULL OR (length(storage_name) BETWEEN 1 AND 255));

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_storage_url_check
    CHECK (storage_url IS NULL OR (length(storage_url) BETWEEN 1 AND 2048));

-- A dispatch ID is local correlation evidence, not a provider idempotency key.
CREATE UNIQUE INDEX idx_ai_generation_audits_dispatch_id
    ON ai_generation_audits (dispatch_id)
    WHERE dispatch_id IS NOT NULL;

CREATE INDEX idx_ai_generation_audits_storage_name
    ON ai_generation_audits (storage_name)
    WHERE storage_name IS NOT NULL;
