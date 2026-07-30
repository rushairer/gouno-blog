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
