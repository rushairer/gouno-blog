package workflow

import (
	"context"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"

	"github.com/rushairer/blog-backend/internal/workflow/readmodel"
)

// RunReadModel is the admin/query projection for Workflow Run history. It is
// deliberately separate from admission, execution and lifecycle persistence.
type RunReadModel interface {
	ListRuns(context.Context, int64) ([]*workflowdomain.WorkflowRun, error)
	RunSteps(context.Context, int64) ([]*workflowdomain.WorkflowStepRun, bool, error)
	ListResources(context.Context, int64) ([]workflowdomain.WorkflowResource, error)
}

// MetricsReadModel owns only cross-run Workflow metrics projections. Keeping it
// separate prevents the Run read model from becoming a generic Workflow query repository.
type MetricsReadModel interface {
	ListWorkflowMetrics(context.Context) ([]readmodel.Metric, error)
}
