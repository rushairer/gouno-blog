package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

// workflowModelRunner is the narrow child-run admission and observation port.
type workflowModelRunner interface {
	QueueWorkflow(context.Context, int64, *int64, json.RawMessage, int64, ...int64) (*domain.AgentRun, error)
	Execute(context.Context, int64)
	ExecutePreview(context.Context, int64)
	GetRun(context.Context, int64) (*domain.AgentRun, error)
}

func matchesWorkflowModel(run *domain.AgentRun, parent *workflowdomain.WorkflowRun, agentID int64) bool {
	return run != nil && run.ID > 0 && run.AgentID == agentID &&
		run.WorkflowRunID != nil && *run.WorkflowRunID == parent.ID &&
		run.WorkflowVersionID != nil && *run.WorkflowVersionID == parent.WorkflowVersionID
}

// A definitive admission rejection is not an uncertain insert. Keep the
// existing partial-batch behavior for known validation, budget and uniqueness
// rejections; unknown persistence/transport errors may follow a committed row.
func definitiveModelAdmissionRejection(err error) bool {
	return errors.Is(err, agentservice.ErrInvalid) || errors.Is(err, agentservice.ErrNotFound) ||
		errors.Is(err, agentservice.ErrRunLimit) || errors.Is(err, agentservice.ErrTokenBudget) ||
		errors.Is(err, agentservice.ErrAlreadyRunning)
}

func runWorkflowModel(ctx context.Context, runner workflowModelRunner, parent *workflowdomain.WorkflowRun, agentID int64, input json.RawMessage) (*domain.AgentRun, error) {
	queued, err := runner.QueueWorkflow(ctx, agentID, parent.TriggeredByPrincipalID, input, parent.WorkflowVersionID, parent.ID)
	if err != nil {
		if definitiveModelAdmissionRejection(err) {
			return nil, err
		}
		return nil, unconfirmedWorkflowEvidence(err)
	}
	if !matchesWorkflowModel(queued, parent, agentID) || queued.Status != domain.AgentRunQueued {
		return nil, unconfirmedWorkflowEvidence(fmt.Errorf("Agent admission identity not confirmed"))
	}
	runID := queued.ID
	if parent.DryRun {
		runner.ExecutePreview(ctx, runID)
	} else {
		runner.Execute(ctx, runID)
	}
	observed, err := runner.GetRun(ctx, runID)
	if err != nil {
		return nil, unconfirmedWorkflowEvidence(err)
	}
	if !matchesWorkflowModel(observed, parent, agentID) || observed.ID != runID {
		return nil, unconfirmedWorkflowEvidence(fmt.Errorf("Agent outcome identity not confirmed"))
	}
	return observed, agentRunOutcomeError(observed)
}
