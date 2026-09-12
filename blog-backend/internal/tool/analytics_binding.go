package tool

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
)

type analyticsSummaryReader interface {
	AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error)
}

var errAnalyticsNotBound = errors.New("analytics service is not bound")

func unboundAnalyticsSummary(_ context.Context, raw json.RawMessage) (any, error) {
	var args struct{}
	if err := decodeArguments(raw, &args); err != nil {
		return nil, err
	}
	return nil, errAnalyticsNotBound
}

// BindAnalytics connects the public analytics Tool definition to the canonical
// Analytics service at the application composition boundary.
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
