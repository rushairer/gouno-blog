package provider

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var imageDataURI = regexp.MustCompile(`data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)`)

type ImageRequest struct{ Prompt, AspectRatio, ImageSize string }

type ImageResult struct {
	Data     []byte
	MIMEType string
}

type ImageGenerator interface {
	GenerateImage(context.Context, ImageRequest) (ImageResult, error)
}

type Message struct {
	Role       string
	Content    string
	ToolCallID string
	ToolCalls  []ToolCall
}

type ToolDefinition struct {
	Name        string
	Description string
	Parameters  json.RawMessage
}

type ToolCall struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type Request struct {
	Instructions string
	Messages     []Message
	Tools        []ToolDefinition
	// ToolChoice forces one named tool when a caller needs a structured result.
	// Empty keeps the provider's automatic tool-selection behaviour.
	ToolChoice string
	MaxTokens  int
}

type Result struct {
	Text         string
	ToolCalls    []ToolCall
	InputTokens  int64
	OutputTokens int64
	StopReason   string
}

type Provider interface {
	Name() string
	Model() string
	Generate(context.Context, Request) (Result, error)
}

// Generate dispatches text and tool-calling requests to the configured provider (OpenAI, Anthropic, or Gemini).
func (p *HTTPProvider) Generate(ctx context.Context, req Request) (Result, error) {
	switch p.name {
	case "openai":
		return p.openAIGenerate(ctx, req)
	case "anthropic":
		return p.anthropicGenerate(ctx, req)
	case "gemini":
		return p.geminiGenerate(ctx, req)
	default:
		return Result{}, errors.New("unsupported provider")
	}
}

// GenerateImage dispatches image generation requests to the configured provider (OpenAI, Anthropic, or Gemini).
func (p *HTTPProvider) GenerateImage(ctx context.Context, req ImageRequest) (ImageResult, error) {
	if req.Prompt = strings.TrimSpace(req.Prompt); req.Prompt == "" || len([]rune(req.Prompt)) > 12000 {
		return ImageResult{}, errors.New("invalid image prompt")
	}
	switch p.name {
	case "openai":
		return p.openAIGenerateImage(ctx, req)
	case "anthropic":
		return p.anthropicGenerateImage(ctx, req)
	case "gemini":
		return p.geminiGenerateImage(ctx, req)
	default:
		return ImageResult{}, errors.New("provider does not support image generation")
	}
}

func parseImageDataOrBase64(raw string) (ImageResult, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ImageResult{}, false
	}
	if match := imageDataURI.FindStringSubmatch(raw); len(match) == 3 {
		data, err := base64.StdEncoding.DecodeString(match[2])
		if err == nil && len(data) > 0 {
			return ImageResult{Data: data, MIMEType: match[1]}, true
		}
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err == nil && len(data) > 0 {
		mimeType := "image/png"
		if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
			mimeType = "image/jpeg"
		} else if len(data) >= 4 && string(data[:4]) == "RIFF" {
			mimeType = "image/webp"
		}
		return ImageResult{Data: data, MIMEType: mimeType}, true
	}
	return ImageResult{}, false
}
