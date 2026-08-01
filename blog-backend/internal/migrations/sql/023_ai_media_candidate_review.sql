ALTER TABLE ai_media_candidates
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
    ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE ai_media_candidates
    DROP CONSTRAINT IF EXISTS ai_media_candidate_generation_check;
ALTER TABLE ai_media_candidates
    ADD CONSTRAINT ai_media_candidate_generation_check
    CHECK (generation_status IN ('brief_ready','ready_to_generate','generated','rejected','failed'));
