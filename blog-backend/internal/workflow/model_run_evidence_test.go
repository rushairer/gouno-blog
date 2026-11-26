package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/agent/domain"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

type modelRunEvidenceStub struct {
	queued, observed                  *domain.AgentRun
	queueErr, readErr                  error
	queuedCalls, live, preview, reads  int
}

func (s *modelRunEvidenceStub) QueueWorkflow(context.Context, int64, *int64, json.RawMessage, int64, ...int64) (*domain.AgentRun, error) {
	s.queuedCalls++
	return s.queued, s.queueErr
}

func (s *modelRunEvidenceStub) Execute(context.Context, int64) { s.live++ }

func (s *modelRunEvidenceStub) ExecutePreview(context.Context, int64) { s.preview++ }

func (s *modelRunEvidenceStub) GetRun(context.Context, int64) (*domain.AgentRun, error) {
	s.reads++
	return s.observed, s.readErr
}

func TestWorkflowModelRequiresConfirmedAdmissionAndOutcome(t *testing.T) {
	parent := &workflowdomain.WorkflowRun{ID: 15, WorkflowVersionID: 21}
	makeRun := func(status domain.AgentRunStatus) *domain.AgentRun {
		return &domain.AgentRun{ID: 73, AgentID: 9, Status: status, WorkflowRunID: &parent.ID, WorkflowVersionID: &parent.WorkflowVersionID, InputTokens: 3, OutputTokens: 5}
	}
	wrongID := makeRun(domain.AgentRunSucceeded)
	wrongID.ID++
	wrongParent := makeRun(domain.AgentRunSucceeded)
	otherParent := int64(99)
	wrongParent.WorkflowRunID = &otherParent
	wrongAgent := makeRun(domain.AgentRunQueued)
	wrongAgent.AgentID++
	for _, tc := range []struct {
		name         string
		stub         modelRunEvidenceStub
		dryRun       bool
		wantDispatch int
		wantEvidence bool
		wantSuccess  bool
	}{
		{"unknown admission", modelRunEvidenceStub{queueErr: errCheckpointInjected}, false, 0, true, false},
		{"budget rejection", modelRunEvidenceStub{queueErr: agentservice.ErrTokenBudget}, false, 0, false, false},
		{"nil admission", modelRunEvidenceStub{}, false, 0, true, false},
		{"foreign agent", modelRunEvidenceStub{queued: wrongAgent}, false, 0, true, false},
		{"already running admission", modelRunEvidenceStub{queued: makeRun(domain.AgentRunRunning)}, false, 0, true, false},
		{"unknown observation", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), readErr: errCheckpointInjected}, false, 1, true, false},
		{"nil observation", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued)}, false, 1, true, false},
		{"foreign outcome ID", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: wrongID}, false, 1, true, false},
		{"foreign parent", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: wrongParent}, false, 1, true, false},
		{"queued outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunQueued)}, false, 1, true, false},
		{"running outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunRunning)}, false, 1, true, false},
		{"failed outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunFailed)}, false, 1, false, false},
		{"cancelled outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunCancelled)}, false, 1, false, false},
		{"succeeded outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunSucceeded)}, false, 1, false, true},
		{"approval outcome", modelRunEvidenceStub{queued: makeRun(domain.AgentRunQueued), observed: makeRun(domain.AgentRunAwaitingApproval)}, true, 1, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stub := tc.stub
			parent.DryRun = tc.dryRun
			result, err := runWorkflowModel(context.Background(), &stub, parent, 9, json.RawMessage("{}"))
			if errors.Is(err, errWorkflowEvidenceUnconfirmed) != tc.wantEvidence || (err == nil) != tc.wantSuccess {
				t.Fatalf("result=%v error=%v", result, err)
			}
			if stub.queuedCalls != 1 || stub.live+stub.preview != tc.wantDispatch || stub.reads != tc.wantDispatch || (tc.dryRun && stub.live != 0) || (!tc.dryRun && stub.preview != 0) {
				t.Fatalf("dispatch counts: %+v", stub)
			}
			if tc.wantSuccess && (result == nil || result.InputTokens != 3 || result.OutputTokens != 5) {
				t.Fatalf("confirmed output lost: %#v", result)
			}
			if tc.wantEvidence {
				store := &checkpointEvidenceStore{}
				service := &Service{execution: &ExecutionCoordinator{store: store}}
				checkpointErr := service.recordStep(context.Background(), parent.ID, workflowdomain.WorkflowStep{ID: "model", Type: "model"}, nil, nil, result, time.Now(), err)
				if !errors.Is(checkpointErr, errWorkflowEvidenceUnconfirmed) || store.writes != 0 {
					t.Fatalf("uncertain child produced checkpoint: %v / %d", checkpointErr, store.writes)
				}
				if finishErr := service.finishExecution(context.Background(), parent.ID, workflowExecutionOutcome{}, checkpointErr); !errors.Is(finishErr, errWorkflowEvidenceUnconfirmed) {
					t.Fatalf("uncertain child authorized finalization: %v", finishErr)
				}
			}
		})
	}
}
