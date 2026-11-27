package workflow

import (
	"errors"
	"testing"

	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

func TestRetryScopeRequiresIsolatedBatch(t *testing.T) {
	model := workflowdomain.WorkflowStep{ID: "model", Type: "model"}
	output := workflowdomain.WorkflowStep{ID: "value", Type: "output"}
	batch := func(children ...workflowdomain.WorkflowStep) workflowdomain.WorkflowStep {
		return workflowdomain.WorkflowStep{ID: "batch", Type: "for_each", ContinueOnError: true, Steps: children}
	}
	for _, tc := range []struct {
		name  string
		steps []workflowdomain.WorkflowStep
		valid bool
	}{
		{"single model", []workflowdomain.WorkflowStep{{ID: "query", Type: "resource_query"}, batch(model), output}, true},
		{"pure batch", []workflowdomain.WorkflowStep{batch(output)}, true},
		{"outer model", []workflowdomain.WorkflowStep{model, batch(output)}, false},
		{"outer interaction", []workflowdomain.WorkflowStep{batch(output), {ID: "ask", Type: "human_interaction"}}, false},
		{"another batch", []workflowdomain.WorkflowStep{batch(output), {ID: "other", Type: "for_each", Steps: []workflowdomain.WorkflowStep{model}}}, false},
		{"nested batch", []workflowdomain.WorkflowStep{batch(batch(output))}, false},
		{"model sibling", []workflowdomain.WorkflowStep{batch(model, output)}, false},
		{"missing target", []workflowdomain.WorkflowStep{output}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validateRetryScope(tc.steps, "batch")
			if tc.valid && err != nil {
				t.Fatal(err)
			}
			if !tc.valid && !errors.Is(err, ErrInvalid) {
				t.Fatalf("unsafe retry accepted: %v", err)
			}
		})
	}
}

func TestRetryRunScopeRejectsMalformedPersistedSelection(t *testing.T) {
	parent, source := "batch", int64(42)
	steps := []workflowdomain.WorkflowStep{{ID: parent, Type: "for_each", ContinueOnError: true, Steps: []workflowdomain.WorkflowStep{{ID: "value", Type: "output"}}}}
	run := workflowdomain.WorkflowRun{TriggerKind: "retry", RetryOfRunID: &source, RetryStepID: &parent, RetryIterations: []int{1}}
	if err := validateRetryRunScope(&run, steps); err != nil {
		t.Fatal(err)
	}
	for _, selection := range [][]int{nil, {-1}, {1, 1}} {
		run.RetryIterations = selection
		if err := validateRetryRunScope(&run, steps); !errors.Is(err, ErrInvalid) {
			t.Fatalf("selection %v accepted: %v", selection, err)
		}
	}
	run.RetryIterations = []int{1}
	run.RetryStepID = nil
	if err := validateRetryRunScope(&run, steps); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing parent accepted: %v", err)
	}
	if err := validateRetryRunScope(&workflowdomain.WorkflowRun{TriggerKind: "manual"}, nil); err != nil {
		t.Fatalf("ordinary run affected: %v", err)
	}
}
