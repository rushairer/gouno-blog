package domain

import "time"

type EmbeddingProfile struct {
	ID                    int64     `json:"id"`
	Name                  string    `json:"name"`
	BaseURL               string    `json:"base_url"`
	Model                 string    `json:"model"`
	Dimensions            int       `json:"dimensions"`
	APIKeyCiphertext      []byte    `json:"-"`
	APIKeyNonce           []byte    `json:"-"`
	APIKeyLast4           string    `json:"api_key_last4,omitempty"`
	KeyVersion            int       `json:"-"`
	HasAPIKey             bool      `json:"has_api_key"`
	Enabled               bool      `json:"enabled"`
	RequestTimeoutSeconds int       `json:"request_timeout_seconds"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}
