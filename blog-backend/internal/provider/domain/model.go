package domain

import "time"

type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
)

type ProviderProfile struct {
	ID                    int64        `json:"id"`
	Name                  string       `json:"name"`
	ProviderType          ProviderType `json:"provider_type"`
	BaseURL               string       `json:"base_url"`
	Model                 string       `json:"model"`
	APIKeyCiphertext      []byte       `json:"-"`
	APIKeyNonce           []byte       `json:"-"`
	APIKeyLast4           string       `json:"api_key_last4,omitempty"`
	KeyVersion            int          `json:"-"`
	HasAPIKey             bool         `json:"has_api_key"`
	Enabled               bool         `json:"enabled"`
	IsDefaultWriting      bool         `json:"is_default_writing"`
	IsDefaultImage        bool         `json:"is_default_image"`
	ProtocolMode          string       `json:"protocol_mode"`
	StreamMode            string       `json:"stream_mode"`
	RequestTimeoutSeconds int          `json:"request_timeout_seconds"`
	MaxOutputTokens       int          `json:"max_output_tokens"`
	CreatedAt             time.Time    `json:"created_at"`
	UpdatedAt             time.Time    `json:"updated_at"`
}
