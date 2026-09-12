package tool

import (
	"context"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

type analyticsSummaryReader interface {
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

// BindAnalytics replaces the legacy Growth-backed analytics tool handler with
// the canonical Analytics service without changing the public Tool catalog.
func BindAnalytics(registry *Registry, analytics analyticsSummaryReader) {
	if registry == nil || analytics == nil {
		return
	}
	definition, ok := registry.definitions["analytics.get_summary"]
	if !ok {
		return
	}
	definition.Execute = func(ctx context.Context, raw json.RawMessage) (any, error) {
		var args struct{}
		if err := decodeArguments(raw, &args); err != nil {
			return nil, err
		}
		return analytics.AnalyticsSummary(ctx)
	}
	registry.definitions[definition.Name] = definition
}
