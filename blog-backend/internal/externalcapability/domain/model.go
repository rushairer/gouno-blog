package domain

import "time"

type Client struct {
	ID                   int64      `json:"id"`
	Name                 string     `json:"name"`
	KeyPrefix            string     `json:"key_prefix"`
	Capabilities         []string   `json:"capabilities"`
	Enabled              bool       `json:"enabled"`
	RateLimitPerMinute   int        `json:"rate_limit_per_minute"`
	ExpiresAt            *time.Time `json:"expires_at,omitempty"`
	LastUsedAt           *time.Time `json:"last_used_at,omitempty"`
	CreatedByPrincipalID *int64     `json:"created_by_principal_id,omitempty"`
	RevokedAt            *time.Time `json:"revoked_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

type CreatedClient struct {
	Client Client `json:"client"`
	APIKey string `json:"api_key"`
}

type InvocationAudit struct {
	ID          int64     `json:"id"`
	ClientID    int64     `json:"client_id"`
	RequestID   string    `json:"request_id"`
	Capability  string    `json:"capability"`
	Result      string    `json:"result"`
	StatusCode  int       `json:"status_code"`
	SourceIP    string    `json:"source_ip"`
	InputDigest string    `json:"input_digest"`
	DurationMS  int64     `json:"duration_ms"`
	CreatedAt   time.Time `json:"created_at"`
}
