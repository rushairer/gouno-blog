package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

var errCheckpointInjected = errors.New("injected checkpoint fault")

type checkpointEvidenceStore struct {
	ExecutionStore
	readOutput json.RawMessage
	found      bool
	readErr    error
	writeErr   error
	writes     int
}

func (s *checkpointEvidenceStore) CompletedStepOutput(context.Context, int64, string, int) (json.RawMessage, bool, error) {
	return s.readOutput, s.found, s.readErr
}

func (s *checkpointEvidenceStore) ResolvedInteractionResponse(context.Context, int64, string) (json.RawMessage, bool, error) {
	return s.readOutput, s.found, s.readErr
}

func (s *checkpointEvidenceStore) RecordStep(context.Context, *workflowdomain.WorkflowStepRun) error {
	s.writes++
	return s.writeErr
}

func TestWorkflowCheckpointReadFaultDoesNotDispatch(t *testing.T) {
	for _, stepType := range []string{"model", "human_interaction"} {
		for _, tc := range []struct {
			name  string
			store checkpointEvidenceStore
		}{
			{"read error", checkpointEvidenceStore{readErr: errCheckpointInjected}},
			{"malformed evidence", checkpointEvidenceStore{found: true, readOutput: json.RawMessage("{")}},
			{"empty evidence", checkpointEvidenceStore{found: true}},
		} {
			t.Run(stepType+"/"+tc.name, func(t *testing.T) {
				store := tc.store
				s := &Service{execution: &ExecutionCoordinator{store: &store}}
				doc := map[string]any{"input": map[string]any{}, "steps": map[string]any{}}
				// No model runner or interaction store is installed: reaching
				// dispatch is a test failure, not a mocked successful call.
				_, _, _, _, err := s.executeSteps(context.Background(), &workflowdomain.WorkflowRun{ID: 1},
					[]workflowdomain.WorkflowStep{{ID: "blocked", Type: stepType}}, doc, nil, nil)
				if !errors.Is(err, errWorkflowEvidenceUnconfirmed) || store.writes != 0 {
					t.Fatalf("read fault err=%v writes=%d", err, store.writes)
				}
			})
		}
	}
}

func TestWorkflowCheckpointWriteFaultStopsDownstream(t *testing.T) {
	store := &checkpointEvidenceStore{writeErr: errCheckpointInjected}
	s := &Service{execution: &ExecutionCoordinator{store: store}}
	doc := map[string]any{"input": map[string]any{}, "steps": map[string]any{}}
	steps := []workflowdomain.WorkflowStep{
		{ID: "first", Type: "output", OutputPointer: "/input"},
		{ID: "blocked", Type: "model"},
	}
	_, _, _, _, err := s.executeSteps(context.Background(), &workflowdomain.WorkflowRun{ID: 1}, steps, doc, nil, nil)
	if !errors.Is(err, errWorkflowEvidenceUnconfirmed) || !errors.Is(err, errCheckpointInjected) || store.writes != 1 {
		t.Fatalf("write fault err=%v writes=%d", err, store.writes)
	}
	// A nil FailRun port would panic if the uncertain result were finalized.
	if err := s.finishExecution(context.Background(), 1, workflowExecutionOutcome{}, err); !errors.Is(err, errWorkflowEvidenceUnconfirmed) {
		t.Fatalf("finalization lost evidence fault: %v", err)
	}
}

func TestWorkflowForEachEvidenceFaultCannotBecomePartialSuccess(t *testing.T) {
	store := &checkpointEvidenceStore{writeErr: errCheckpointInjected}
	s := &Service{execution: &ExecutionCoordinator{store: store}}
	doc := map[string]any{"input": map[string]any{"items": []any{map[string]any{"value": "ok"}}}, "steps": map[string]any{}}
	steps := []workflowdomain.WorkflowStep{{ID: "batch", Type: "for_each", CollectionPointer: "/input/items", MaxItems: 1,
		MaxConcurrency: 1, ContinueOnError: true, Steps: []workflowdomain.WorkflowStep{{ID: "child", Type: "output", OutputPointer: "/item/value"}}}}
	_, _, _, _, err := s.executeSteps(context.Background(), &workflowdomain.WorkflowRun{ID: 1}, steps, doc, nil, nil)
	if !errors.Is(err, errWorkflowEvidenceUnconfirmed) || store.writes != 1 {
		t.Fatalf("batch fault err=%v writes=%d", err, store.writes)
	}
}
