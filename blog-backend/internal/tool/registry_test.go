package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestRegistryEnforcesCapabilityBeforeExecution(t *testing.T) {
	executed := false
	registry := New(Definition{
		Name: "safe.read", Risk: domain.ToolRiskRead,
		Parameters: json.RawMessage(`{"type":"object"}`),
		Execute: func(context.Context, json.RawMessage) (any, error) {
			executed = true
			return map[string]bool{"ok": true}, nil
		},
	})
	_, _, _, err := registry.Invoke(context.Background(), nil, "safe.read", json.RawMessage(`{}`))
	if !errors.Is(err, ErrUnauthorized) || executed {
		t.Fatalf("err = %v, executed = %v", err, executed)
	}
}

func TestRegistryCreatesProposalWithoutExecutingWrite(t *testing.T) {
	registry := New(Definition{
		Name: "content.propose", Risk: domain.ToolRiskPropose,
		Parameters: json.RawMessage(`{"type":"object"}`),
		Propose: func(context.Context, json.RawMessage) (*Proposal, error) {
			return &Proposal{
				ActionType: "create_draft", TargetType: "post",
				Payload: json.RawMessage(`{"title":"Draft"}`),
			}, nil
		},
	})
	risk, result, proposal, err := registry.Invoke(
		context.Background(), []string{"content.propose"}, "content.propose", json.RawMessage(`{}`),
	)
	if err != nil || risk != domain.ToolRiskPropose || proposal == nil ||
		!json.Valid(result) || proposal.ActionType != "create_draft" {
		t.Fatalf("risk=%s result=%s proposal=%#v err=%v", risk, result, proposal, err)
	}
}

func TestRegistryRejectsInvalidJSON(t *testing.T) {
	registry := New(Definition{Name: "safe.read", Risk: domain.ToolRiskRead})
	_, _, _, err := registry.Invoke(
		context.Background(), []string{"safe.read"}, "safe.read", json.RawMessage(`{`),
	)
	if !errors.Is(err, ErrInvalidArgument) {
		t.Fatalf("err = %v", err)
	}
}
