ALTER TABLE ai_connector_profiles
    ADD COLUMN IF NOT EXISTS oauth_pkce_ciphertext BYTEA,
    ADD COLUMN IF NOT EXISTS oauth_pkce_nonce BYTEA;
