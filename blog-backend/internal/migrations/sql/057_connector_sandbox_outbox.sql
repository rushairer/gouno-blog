CREATE TABLE IF NOT EXISTS ai_connector_profiles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    kind VARCHAR(40) NOT NULL,
    sandbox BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    credential_ciphertext BYTEA,
    credential_nonce BYTEA,
    credential_last4 VARCHAR(4) NOT NULL DEFAULT '',
    key_version INT NOT NULL DEFAULT 0,
    oauth_state VARCHAR(128),
    oauth_state_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_connector_kind_check CHECK (kind IN ('search_console','newsletter','social','webhook'))
);

CREATE TABLE IF NOT EXISTS ai_connector_outbox (
    id BIGSERIAL PRIMARY KEY,
    connector_profile_id BIGINT NOT NULL REFERENCES ai_connector_profiles(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(180) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'awaiting_approval',
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_message TEXT,
    delivered_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(connector_profile_id,idempotency_key),
    CONSTRAINT ai_connector_outbox_status_check CHECK (status IN ('awaiting_approval','approved','delivered','failed','revoked'))
);

CREATE INDEX IF NOT EXISTS idx_ai_connector_outbox_claim
    ON ai_connector_outbox (status,available_at,id);

CREATE TABLE IF NOT EXISTS ai_connector_delivery_audits (
    id BIGSERIAL PRIMARY KEY,
    outbox_id BIGINT NOT NULL REFERENCES ai_connector_outbox(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    request_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
