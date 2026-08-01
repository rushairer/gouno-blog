package provider

import (
	"context"
	"encoding/json"
)

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
	MaxTokens    int
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
