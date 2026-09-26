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
	ClientID    int64
	RequestID   string
	Capability  string
	Result      string
	StatusCode  int
	SourceIP    string
	InputDigest string
	DurationMS  int64
}
