ALTER TABLE ai_media_candidates DROP CONSTRAINT IF EXISTS ai_media_candidate_generation_check;
ALTER TABLE ai_media_candidates ADD CONSTRAINT ai_media_candidate_generation_check
    CHECK (generation_status IN ('brief_ready','ready_to_generate','generating','generated','rejected','failed'));
