ALTER TABLE ai_media_candidates
    ADD COLUMN IF NOT EXISTS media_asset_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_media_candidates_media_asset
    ON ai_media_candidates (media_asset_id) WHERE media_asset_id IS NOT NULL;
