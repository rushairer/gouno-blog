package controller

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestResolveUniqueProviderName(t *testing.T) {
	existingNames := map[string]bool{
		"openai gpt-4":     true,
		"openai gpt-4 (1)": true,
		"claude sonnet":    true,
	}

	// 1. Non-conflicting name
	name1 := resolveUniqueProviderName("Gemini Flash", existingNames)
	if name1 != "Gemini Flash" {
		t.Fatalf("expected Gemini Flash, got %s", name1)
	}
	if !existingNames["gemini flash"] {
		t.Fatalf("expected gemini flash to be added to existingNames")
	}

	// 2. Conflicting name should increment suffix
	name2 := resolveUniqueProviderName("OpenAI GPT-4", existingNames)
	if name2 != "OpenAI GPT-4 (2)" {
		t.Fatalf("expected OpenAI GPT-4 (2), got %s", name2)
	}
	if !existingNames["openai gpt-4 (2)"] {
		t.Fatalf("expected openai gpt-4 (2) to be added to existingNames")
	}

	// 3. Another collision with same base name
	name3 := resolveUniqueProviderName("OpenAI GPT-4", existingNames)
	if name3 != "OpenAI GPT-4 (3)" {
		t.Fatalf("expected OpenAI GPT-4 (3), got %s", name3)
	}

	// 4. Collision with single item
	name4 := resolveUniqueProviderName("claude sonnet", existingNames)
	if name4 != "claude sonnet (1)" {
		t.Fatalf("expected claude sonnet (1), got %s", name4)
	}

	// 5. Empty name default
	name5 := resolveUniqueProviderName("", existingNames)
	if name5 != "Imported Provider" {
		t.Fatalf("expected Imported Provider, got %s", name5)
	}
}

func TestParseProviderImportPayload(t *testing.T) {
	// Array format
	rawArray := []byte(`[
		{"name": "OpenAI 1", "provider_type": "openai", "base_url": "https://api.openai.com", "model": "gpt-4o", "protocol_mode": "chat_completions"},
		{"name": "Claude 1", "provider_type": "anthropic", "base_url": "https://api.anthropic.com", "model": "claude-3-5-sonnet"}
	]`)
	items, err := parseProviderImportPayload(rawArray)
	if err != nil {
		t.Fatalf("failed to parse array: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].Name != "OpenAI 1" || items[0].Model != "gpt-4o" || items[0].ProtocolMode != "chat_completions" {
		t.Fatalf("unexpected item 0: %+v", items[0])
	}

	// Wrapper with "providers"
	rawWrapper := []byte(`{
		"providers": [
			{"name": "Gemini 1", "provider_type": "gemini", "base_url": "https://generativelanguage.googleapis.com", "model": "gemini-1.5-pro", "protocol_mode": "generate_content"}
		]
	}`)
	items, err = parseProviderImportPayload(rawWrapper)
	if err != nil {
		t.Fatalf("failed to parse wrapper: %v", err)
	}
	if len(items) != 1 || items[0].Name != "Gemini 1" || items[0].ProtocolMode != "generate_content" {
		t.Fatalf("unexpected items: %+v", items)
	}

	// Wrapper with "data"
	rawDataWrapper := []byte(`{
		"data": [
			{"name": "Gemini 2", "provider_type": "gemini", "base_url": "https://generativelanguage.googleapis.com", "model": "gemini-1.5-flash"}
		]
	}`)
	items, err = parseProviderImportPayload(rawDataWrapper)
	if err != nil {
		t.Fatalf("failed to parse data wrapper: %v", err)
	}
	if len(items) != 1 || items[0].Name != "Gemini 2" {
		t.Fatalf("unexpected items: %+v", items)
	}

	// Single object
	rawSingle := []byte(`{"name": "Single Model", "provider_type": "openai", "base_url": "https://api.openai.com", "model": "gpt-4o-mini"}`)
	items, err = parseProviderImportPayload(rawSingle)
	if err != nil {
		t.Fatalf("failed to parse single: %v", err)
	}
	if len(items) != 1 || items[0].Name != "Single Model" {
		t.Fatalf("unexpected items: %+v", items)
	}

	// Invalid format
	rawInvalid := []byte(`{}`)
	_, err = parseProviderImportPayload(rawInvalid)
	if err == nil {
		t.Fatal("expected error for invalid payload")
	}
}

func TestProviderExportItemStructure(t *testing.T) {
	item := providerExportItem{
		Name:                  "Test",
		ProviderType:          domain.ProviderOpenAI,
		BaseURL:               "https://api.openai.com",
		Model:                 "gpt-4o",
		Enabled:               true,
		IsDefaultWriting:      true,
		IsDefaultImage:        false,
		ProtocolMode:          "chat_completions",
		StreamMode:            "always",
		RequestTimeoutSeconds: 60,
		MaxOutputTokens:       2000,
	}
	if item.Name != "Test" || item.ProviderType != domain.ProviderOpenAI || item.ProtocolMode != "chat_completions" || item.StreamMode != "always" {
		t.Fatalf("unexpected export item: %+v", item)
	}
}
