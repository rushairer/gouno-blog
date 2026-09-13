package workflow

import (
	"context"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/workflow/readmodel"
)

// RunReadModel is the admin/query projection for Workflow Run history. It is
// deliberately separate from admission, execution and lifecycle persistence.
type RunReadModel interface {
	ListRuns(context.Context, int64) ([]*domain.WorkflowRun, error)
	RunSteps(context.Context, int64) ([]*domain.WorkflowStepRun, bool, error)
	ListResources(context.Context, int64) ([]domain.WorkflowResource, error)
}

// MetricsReadModel owns only cross-run Workflow metrics projections. Keeping it
// separate prevents the Run read model from becoming a generic Workflow query repository.
type MetricsReadModel interface {
	ListWorkflowMetrics(context.Context) ([]readmodel.Metric, error)
}
