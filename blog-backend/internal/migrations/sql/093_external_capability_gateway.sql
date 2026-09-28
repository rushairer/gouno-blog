CREATE TABLE IF NOT EXISTS external_api_clients (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL UNIQUE,
    key_hash BYTEA NOT NULL UNIQUE,
    capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 6000),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by_principal_id BIGINT REFERENCES blog_principals(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_api_invocation_audits (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT REFERENCES external_api_clients(id) ON DELETE SET NULL,
    request_id TEXT NOT NULL DEFAULT '',
    capability TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'failed', 'rate_limited')),
    status_code INTEGER NOT NULL,
    source_ip TEXT NOT NULL DEFAULT '',
    input_digest TEXT NOT NULL DEFAULT '',
    duration_ms BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_api_clients_enabled
    ON external_api_clients(enabled) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_external_api_invocation_audits_client_created
    ON external_api_invocation_audits(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_api_invocation_audits_capability_created
    ON external_api_invocation_audits(capability, created_at DESC);
