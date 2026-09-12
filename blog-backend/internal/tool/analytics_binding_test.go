package tool

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

type analyticsBindingStub struct {
	called  bool
	summary *domain.AnalyticsSummary
}

func (s *analyticsBindingStub) AnalyticsSummary(context.Context) (*domain.AnalyticsSummary, error) {
	s.called = true
	return s.summary, nil
}

func TestBindAnalyticsUsesCanonicalSummaryReader(t *testing.T) {
	legacyCalled := false
	registry := New(Definition{
		Name: "analytics.get_summary",
		Risk: domain.ToolRiskRead,
		Execute: func(context.Context, json.RawMessage) (any, error) {
			legacyCalled = true
			return nil, nil
		},
	})
	analytics := &analyticsBindingStub{summary: &domain.AnalyticsSummary{TotalPosts: 7}}
	BindAnalytics(registry, analytics)

	_, result, _, err := registry.Invoke(context.Background(), []string{"analytics.get_summary"}, "analytics.get_summary", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if legacyCalled {
		t.Fatal("legacy Growth-backed analytics handler was invoked")
	}
	if !analytics.called {
		t.Fatal("canonical Analytics summary reader was not invoked")
	}
	var summary domain.AnalyticsSummary
	if err := json.Unmarshal(result, &summary); err != nil {
		t.Fatal(err)
	}
	if summary.TotalPosts != 7 {
		t.Fatalf("total_posts=%d, want 7", summary.TotalPosts)
	}
}

func TestBlogRegistryAnalyticsSummaryFailsClosedUntilCanonicalBinding(t *testing.T) {
	registry := NewBlogRegistry(nil, nil, nil, nil)
	_, _, _, err := registry.Invoke(context.Background(), []string{"analytics.get_summary"}, "analytics.get_summary", json.RawMessage(`{}`))
	if !errors.Is(err, errAnalyticsNotBound) {
		t.Fatalf("err=%v, want errAnalyticsNotBound", err)
	}
}
