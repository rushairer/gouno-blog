package tool

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/rushairer/blog-backend/internal/knowledge"
)

type knowledgeSearcher interface {
	Search(context.Context, string, int, int64) ([]knowledge.SearchResult, error)
}

// BindKnowledge connects knowledge-backed Tool execution only after the
// Knowledge capability is actually configured. Until then the tool remains
// Agent-only and is not advertised by the External Capability Gateway.
func BindKnowledge(registry *Registry, searcher knowledgeSearcher) {
	if registry == nil || searcher == nil {
		return
	}
	definition, ok := registry.definitions["content.search_knowledge"]
	if !ok {
		return
	}
	definition.Execute = func(ctx context.Context, raw json.RawMessage) (any, error) {
		var args struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}
		if err := decodeArguments(raw, &args); err != nil ||
			strings.TrimSpace(args.Query) == "" {
			return nil, ErrInvalidArgument
		}
		items, err := searcher.Search(ctx, args.Query, args.Limit, 0)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"query":       args.Query,
			"suggestions": items,
		}, nil
	}
	if !slices.Contains(definition.Surfaces, "external") {
		definition.Surfaces = append(definition.Surfaces, "external")
	}
	registry.definitions[definition.Name] = definition
}
