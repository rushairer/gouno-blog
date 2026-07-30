package operations

import (
	"encoding/json"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
)

func TestRegisterOperationalToolsAreReadOnly(t *testing.T) {
	registry := tool.New()
	service := NewService(nil, registry, nil)
	if err := service.RegisterTools(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"content.list_broken_links", "content.list_tag_bloat"} {
		risk, ok := registry.Risk(name)
		if !ok || risk != domain.ToolRiskRead {
			t.Fatalf("%s risk=%q registered=%v", name, risk, ok)
		}
	}
	risk, ok := registry.Risk("operations.propose_suggestion")
	if !ok || risk != domain.ToolRiskPropose {
		t.Fatalf("suggestion proposal risk=%q registered=%v", risk, ok)
	}
}

func TestDecodeRejectsUnknownOperationalArguments(t *testing.T) {
	var value struct {
		Limit int `json:"limit"`
	}
	if err := decode(json.RawMessage(`{"limit":5}`), &value); err != nil || value.Limit != 5 {
		t.Fatalf("valid arguments rejected: %v", err)
	}
	if err := decode(json.RawMessage(`{"identity":"private"}`), &value); err == nil {
		t.Fatal("unknown identity argument should be rejected")
	}
}

func TestSuggestionProposalRequiresEvidence(t *testing.T) {
	service := &Service{}
	if _, err := service.proposeSuggestion(t.Context(), json.RawMessage(`{
		"source_type":"stale","source_key":"post:1","title":"Refresh","description":"Old",
		"priority":"medium","evidence":{"updated_at":"2025-01-01"}
	}`)); err != nil {
		t.Fatalf("valid suggestion rejected: %v", err)
	}
	if _, err := service.proposeSuggestion(t.Context(), json.RawMessage(`{
		"source_type":"stale","source_key":"post:1","title":"Refresh","description":"Old",
		"priority":"medium"
	}`)); err == nil {
		t.Fatal("suggestion without evidence should be rejected")
	}
}
