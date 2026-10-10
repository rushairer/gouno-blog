-- Historical/editor audits remain uncorrelated. Never assign the candidate's
-- current attempt to old evidence: a late old worker may finish after a new one.
ALTER TABLE ai_generation_audits ADD COLUMN generation_attempt INTEGER;

ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_attempt_check
    CHECK (generation_attempt IS NULL OR
        (generation_attempt > 0 AND source = 'agent_candidate'
         AND operation = 'media.generate_candidate'));

-- A durable started row precedes external dispatch. Only its exact identity
-- may transition once to a terminal observation; outcome_uncertain is NOT retryable.
ALTER TABLE ai_generation_audits DROP CONSTRAINT ai_generation_audit_status_check;
ALTER TABLE ai_generation_audits ADD CONSTRAINT ai_generation_audit_status_check
    CHECK (status IN ('succeeded', 'failed') OR
        (generation_attempt IS NOT NULL AND status IN ('started', 'outcome_uncertain')));

-- Keep ON DELETE SET NULL on media_candidate_id: removing a candidate must not
-- erase audit rows or make historical evidence look like a newly numbered attempt.
CREATE UNIQUE INDEX idx_ai_generation_audits_candidate_attempt
    ON ai_generation_audits (media_candidate_id, generation_attempt)
    WHERE media_candidate_id IS NOT NULL AND generation_attempt IS NOT NULL
      AND operation = 'media.generate_candidate';

CREATE INDEX idx_ai_generation_audits_candidate_latest
    ON ai_generation_audits (media_candidate_id, created_at DESC, id DESC)
    WHERE media_candidate_id IS NOT NULL AND operation = 'media.generate_candidate';
