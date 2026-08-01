package tool

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

var (
	ErrUnknownTool     = errors.New("unknown tool")
	ErrUnauthorized    = errors.New("tool capability is not authorized")
	ErrInvalidArgument = errors.New("invalid tool arguments")
)

type Proposal struct {
	ActionType     string          `json:"action_type"`
	TargetType     string          `json:"target_type"`
	TargetID       *int64          `json:"target_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	BeforeSnapshot json.RawMessage `json:"before_snapshot,omitempty"`
}

type Definition struct {
	Name        string
	Description string
	Parameters  json.RawMessage
	Output      json.RawMessage
	Surfaces    []string
	Risk        domain.ToolRiskLevel
	Execute     func(context.Context, json.RawMessage) (any, error)
	Propose     func(context.Context, json.RawMessage) (*Proposal, error)
}

type Registry struct {
	definitions map[string]Definition
}

type CatalogItem struct {
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Parameters  json.RawMessage      `json:"parameters"`
	Output      json.RawMessage      `json:"output_schema,omitempty"`
	Surfaces    []string             `json:"surfaces"`
	Risk        domain.ToolRiskLevel `json:"risk_level"`
}

func New(definitions ...Definition) *Registry {
	items := make(map[string]Definition, len(definitions))
	for _, definition := range definitions {
		if len(definition.Surfaces) == 0 {
			definition.Surfaces = []string{"agent"}
		}
		items[definition.Name] = definition
	}
	return &Registry{definitions: items}
}

func (r *Registry) Definitions(capabilities []string) []provider.ToolDefinition {
	result := make([]provider.ToolDefinition, 0, len(capabilities))
	for _, name := range capabilities {
		definition, ok := r.definitions[name]
		if !ok || !slices.Contains(definition.Surfaces, "agent") {
			continue
		}
		result = append(result, provider.ToolDefinition{
			Name: definition.Name, Description: definition.Description, Parameters: definition.Parameters,
		})
	}
	return result
}

func (r *Registry) Invoke(ctx context.Context, capabilities []string, name string, arguments json.RawMessage) (domain.ToolRiskLevel, json.RawMessage, *Proposal, error) {
	if !slices.Contains(capabilities, name) {
		return "", nil, nil, ErrUnauthorized
	}
	definition, ok := r.definitions[name]
	if !ok {
		return "", nil, nil, ErrUnknownTool
	}
	if !json.Valid(arguments) {
		return definition.Risk, nil, nil, ErrInvalidArgument
	}
	if definition.Risk == domain.ToolRiskPropose {
		if definition.Propose == nil {
			return definition.Risk, nil, nil, fmt.Errorf("%w: proposal handler missing", ErrUnknownTool)
		}
		proposal, err := definition.Propose(ctx, arguments)
		if err != nil {
			return definition.Risk, nil, nil, err
		}
		result, _ := json.Marshal(map[string]any{
			"status": "awaiting_approval", "action_type": proposal.ActionType,
		})
		return definition.Risk, result, proposal, nil
	}
	if definition.Execute == nil {
		return definition.Risk, nil, nil, fmt.Errorf("%w: execute handler missing", ErrUnknownTool)
	}
	value, err := definition.Execute(ctx, arguments)
	if err != nil {
		return definition.Risk, nil, nil, err
	}
	result, err := json.Marshal(value)
	return definition.Risk, result, nil, err
}

func (r *Registry) Catalog() []CatalogItem {
	result := make([]CatalogItem, 0, len(r.definitions))
	for _, definition := range r.definitions {
		result = append(result, CatalogItem{
			Name: definition.Name, Description: definition.Description,
			Parameters: definition.Parameters, Output: definition.Output,
			Surfaces: definition.Surfaces, Risk: definition.Risk,
		})
	}
	slices.SortFunc(result, func(a, b CatalogItem) int {
		if a.Name < b.Name {
			return -1
		}
		if a.Name > b.Name {
			return 1
		}
		return 0
	})
	return result
}

func (r *Registry) Names() []string {
	result := make([]string, 0, len(r.definitions))
	for name := range r.definitions {
		result = append(result, name)
	}
	slices.Sort(result)
	return result
}

func (r *Registry) AgentNames() []string {
	result := make([]string, 0, len(r.definitions))
	for name, definition := range r.definitions {
		if slices.Contains(definition.Surfaces, "agent") {
			result = append(result, name)
		}
	}
	slices.Sort(result)
	return result
}

func (r *Registry) ProposalNames() []string {
	result := make([]string, 0)
	for name, definition := range r.definitions {
		if definition.Risk == domain.ToolRiskPropose {
			result = append(result, name)
		}
	}
	slices.Sort(result)
	return result
}

func (r *Registry) Risk(name string) (domain.ToolRiskLevel, bool) {
	item, ok := r.definitions[name]
	return item.Risk, ok
}

func (r *Registry) Register(definitions ...Definition) error {
	for _, definition := range definitions {
		if definition.Name == "" {
			return fmt.Errorf("%w: empty tool name", ErrUnknownTool)
		}
		if _, exists := r.definitions[definition.Name]; exists {
			return fmt.Errorf("%w: duplicate tool %q", ErrUnknownTool, definition.Name)
		}
		if len(definition.Surfaces) == 0 {
			definition.Surfaces = []string{"agent"}
		}
		r.definitions[definition.Name] = definition
	}
	return nil
}
