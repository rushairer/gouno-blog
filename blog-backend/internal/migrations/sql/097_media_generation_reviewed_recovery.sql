-- Explicit human recovery decisions are separate from generation audits.
-- Historical cancelled/failed attempts get no fabricated verification.
-- No FK: an immutable decision must retain its original candidate ID even
-- when the candidate itself is subsequently removed.
CREATE TABLE ai_media_generation_recovery_decisions (
    id BIGSERIAL PRIMARY KEY,
    candidate_id BIGINT NOT NULL CHECK (candidate_id > 0),
    generation_attempt INTEGER NOT NULL CHECK (generation_attempt > 0),
    reviewed_by_principal_id BIGINT NOT NULL CHECK (reviewed_by_principal_id > 0),
    decision TEXT NOT NULL DEFAULT 'release_after_verified_review'
        CHECK (decision = 'release_after_verified_review'),
    evidence_reference TEXT NOT NULL
        CHECK (evidence_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{11,199}$'),
    verified_provider_outcome BOOLEAN NOT NULL CHECK (verified_provider_outcome),
    verified_object_storage BOOLEAN NOT NULL CHECK (verified_object_storage),
    acknowledged_possible_billing BOOLEAN NOT NULL CHECK (acknowledged_possible_billing),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(candidate_id, generation_attempt)
);

-- The application exposes only an INSERT as part of the candidate status
-- transition; future readers may use this index to inspect an operator's work.
CREATE INDEX idx_ai_media_generation_recovery_reviewer
    ON ai_media_generation_recovery_decisions (reviewed_by_principal_id, reviewed_at DESC);


-- Operator decisions are append-only under normal application DB privileges.
-- Deliberate retention/deletion migrations require a separately reviewed
-- schema change; a runtime UPDATE/DELETE/TRUNCATE must never erase evidence.
CREATE FUNCTION prevent_media_generation_recovery_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'media generation recovery decision history is append-only';
END;
$$;

CREATE TRIGGER trg_media_recovery_no_update_delete
    BEFORE UPDATE OR DELETE ON ai_media_generation_recovery_decisions
    FOR EACH ROW EXECUTE FUNCTION prevent_media_generation_recovery_audit_mutation();

CREATE TRIGGER trg_media_recovery_no_truncate
    BEFORE TRUNCATE ON ai_media_generation_recovery_decisions
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_media_generation_recovery_audit_mutation();
