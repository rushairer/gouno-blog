package domain

import "time"

type ProviderType string
type ProviderVendor string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
)

const (
	VendorCustom          ProviderVendor = "custom"
	VendorOpenAI          ProviderVendor = "openai"
	VendorAnthropic       ProviderVendor = "anthropic"
	VendorGoogle          ProviderVendor = "google"
	VendorDeepSeek        ProviderVendor = "deepseek"
	VendorAlibabaBailian  ProviderVendor = "alibaba_bailian"
	VendorVolcengineArk   ProviderVendor = "volcengine_ark"
	VendorTencentHunyuan  ProviderVendor = "tencent_hunyuan"
	VendorBaiduQianfan    ProviderVendor = "baidu_qianfan"
	VendorMoonshot        ProviderVendor = "moonshot"
	VendorZhipu           ProviderVendor = "zhipu"
	VendorSiliconFlow     ProviderVendor = "siliconflow"
	VendorMiniMax         ProviderVendor = "minimax"
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

func ValidVendor(vendor ProviderVendor) bool {
	switch vendor {
	case VendorCustom, VendorOpenAI, VendorAnthropic, VendorGoogle, VendorDeepSeek,
		VendorAlibabaBailian, VendorVolcengineArk, VendorTencentHunyuan, VendorBaiduQianfan,
		VendorMoonshot, VendorZhipu, VendorSiliconFlow, VendorMiniMax:
		return true
	default:
		return false
	}
}

type ProviderProfile struct {
	ID                    int64        `json:"id"`
	Name                  string         `json:"name"`
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
