ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS generation_deadline_at TIMESTAMPTZ;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE ai_media_candidates DROP CONSTRAINT IF EXISTS ai_media_candidate_generation_check;
ALTER TABLE ai_media_candidates ADD CONSTRAINT ai_media_candidate_generation_check
    CHECK (generation_status IN ('brief_ready','ready_to_generate','generating','generated','rejected','failed','cancelled'));
