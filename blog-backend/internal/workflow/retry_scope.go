package workflow

import (
	"fmt"

	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

// validateRetryScope limits partial retries to one isolated top-level batch.
// Copying a query snapshot cannot make unrelated effects safe to replay.
func validateRetryScope(steps []workflowdomain.WorkflowStep, parentID string) error {
	denied := fmt.Errorf("%w: retry requires one isolated top-level for_each with no other effectful steps", ErrInvalid)
	found := false
	for _, step := range steps {
		switch step.Type {
		case "resource_query", "output", "approval_gate":
			if len(step.Steps) != 0 {
				return denied
			}
		case "for_each":
			if found || parentID == "" || step.ID != parentID || !step.ContinueOnError || len(step.Steps) == 0 {
				return denied
			}
			found = true
			for _, child := range step.Steps {
				if len(child.Steps) != 0 {
					return denied
				}
				switch child.Type {
				case "output", "approval_gate":
				case "model":
					if len(step.Steps) != 1 {
						return denied
					}
				default:
					return denied
				}
			}
		default:
			return denied
		}
	}
	if !found {
		return denied
	}
	return nil
}

// Recheck immutable graph and persisted metadata before dispatch, including
// queued retries admitted before the scope restriction.
func validateRetryRunScope(run *workflowdomain.WorkflowRun, steps []workflowdomain.WorkflowStep) error {
	if run.TriggerKind != "retry" && run.RetryOfRunID == nil && run.RetryStepID == nil && len(run.RetryIterations) == 0 {
		return nil
	}
	invalid := fmt.Errorf("%w: invalid persisted retry selection", ErrInvalid)
	if run.TriggerKind != "retry" || run.RetryOfRunID == nil || *run.RetryOfRunID <= 0 || run.RetryStepID == nil || len(run.RetryIterations) == 0 || len(run.RetryIterations) > maxRunResources {
		return invalid
	}
	seen := make(map[int]bool, len(run.RetryIterations))
	for _, index := range run.RetryIterations {
		if index < 0 || seen[index] {
			return invalid
		}
		seen[index] = true
	}
	return validateRetryScope(steps, *run.RetryStepID)
}
