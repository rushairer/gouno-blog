-- Provider deletion is a security boundary: historical Agent runs keep their
-- foreign-key reference, but the encrypted credential must not remain usable.
ALTER TABLE ai_provider_profiles
    ALTER COLUMN api_key_ciphertext DROP NOT NULL,
    ALTER COLUMN api_key_nonce DROP NOT NULL;
