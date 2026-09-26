package domain

import "time"

// ProviderType is the wire protocol family used by the runtime. The JSON/database
// name is intentionally retained for backward compatibility with existing profiles.
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
)

type ProviderVendor string

const (
	VendorOpenAI     ProviderVendor = "openai"
	VendorAnthropic  ProviderVendor = "anthropic"
	VendorGoogle     ProviderVendor = "google"
	VendorDeepSeek   ProviderVendor = "deepseek"
	VendorAlibaba    ProviderVendor = "alibaba"
	VendorVolcengine ProviderVendor = "volcengine"
	VendorMoonshot   ProviderVendor = "moonshot"
	VendorTencent    ProviderVendor = "tencent"
	VendorZhipu      ProviderVendor = "zhipu"
	VendorBaidu      ProviderVendor = "baidu"
	VendorMiniMax    ProviderVendor = "minimax"
	VendorXAI        ProviderVendor = "xai"
	VendorMistral    ProviderVendor = "mistral"
	VendorCustom     ProviderVendor = "custom"
)

func DefaultVendor(providerType ProviderType) ProviderVendor {
	switch providerType {
	case ProviderAnthropic:
		return VendorAnthropic
	case ProviderGemini:
		return VendorGoogle
	default:
		return VendorOpenAI
	}
}

type ProviderProfile struct {
	ID                    int64        `json:"id"`
	Name                  string       `json:"name"`
	ProviderType          ProviderType   `json:"provider_type"`
	Vendor                ProviderVendor `json:"vendor"`
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
