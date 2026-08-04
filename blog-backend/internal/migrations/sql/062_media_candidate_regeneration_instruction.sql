ALTER TABLE ai_media_candidates
    ADD COLUMN IF NOT EXISTS regeneration_instruction TEXT NOT NULL DEFAULT '';
