ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS placement VARCHAR(16) NOT NULL DEFAULT 'cover';
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS anchor TEXT;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS selected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ai_media_candidates ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_media_candidate_placement_check') THEN
        ALTER TABLE ai_media_candidates ADD CONSTRAINT ai_media_candidate_placement_check CHECK (placement IN ('cover','inline'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_media_candidates_selected ON ai_media_candidates(post_id, selected, generation_status);
