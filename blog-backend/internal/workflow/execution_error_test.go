package workflow

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

func TestAgentExecutionFailureReportsSafeCauseNotInvalidWorkflow(t *testing.T) {
	for _, test := range []struct {
		code string
		want string
	}{
		{"provider_tool_name_invalid", "Provider rejected a tool name"},
		{"provider_auth_rejected", "HTTP 401/403"},
		{"provider_timeout", "timed out"},
		{"provider_rate_limited", "HTTP 429"},
		{"provider_stream_rejected", "already sent stream=true"},
		{"agent_run_failed", "Inspect this Agent run's error details"},
		{"untrusted bearer secret", "Inspect this Agent run's error details"},
	} {
		t.Run(test.code, func(t *testing.T) {
			raw := `secret prompt, bearer token, https://private.example/`
			run := &domain.AgentRun{ID: 73, Status: domain.AgentRunFailed, ErrorCode: &test.code, ErrorMessage: &raw}
			err := agentRunExecutionError(run)
			message := safeError(err)
			if !strings.Contains(message, "Agent run 73 failed") || !strings.Contains(message, test.want) || errors.Is(err, ErrInvalid) {
				t.Fatalf("misleading execution diagnostic: %v", err)
			}
			for _, forbidden := range []string{"invalid workflow", "secret", "bearer", "private.example", "Stream must be set to true"} {
				if strings.Contains(message, forbidden) {
					t.Fatalf("diagnostic contains %q: %s", forbidden, message)
				}
			}
			store := &failureStepStore{failure: err}
			service := &Service{execution: &ExecutionCoordinator{store: store}}
			service.recordStep(context.Background(), 58, workflowdomain.WorkflowStep{ID: "write_article", Type: "model"}, nil, nil, nil, time.Now(), err)
			if store.step == nil || store.step.Status != "failed" || store.step.ErrorMessage == nil || *store.step.ErrorMessage != message {
				t.Fatalf("step diagnostic differs from run diagnostic: %#v", store.step)
			}
			service.Execute(context.Background(), 58)
			if store.runCode != "workflow_failed" || store.runMessage != message {
				t.Fatalf("run diagnostic differs from step diagnostic: %q / %q", store.runCode, store.runMessage)
			}
		})
	}
}

func TestCancelledAndLegacyAgentFailuresRemainActionable(t *testing.T) {
	for _, status := range []domain.AgentRunStatus{domain.AgentRunFailed, domain.AgentRunCancelled} {
		err := agentRunExecutionError(&domain.AgentRun{ID: 73, Status: status})
		if errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), string(status)) || !strings.Contains(err.Error(), "Inspect this Agent run") {
			t.Fatalf("incorrect legacy diagnostic: %v", err)
		}
	}
}

type failureStepStore struct {
	ExecutionStore
	step       *workflowdomain.WorkflowStepRun
	failure    error
	runCode    string
	runMessage string
}

func (store *failureStepStore) RecordStep(_ context.Context, step *workflowdomain.WorkflowStepRun) error {
	store.step = step
	return nil
}

func (store *failureStepStore) ClaimRun(context.Context, int64) (*workflowdomain.WorkflowRun, error) {
	return nil, store.failure
}

func (store *failureStepStore) FailRun(_ context.Context, _ int64, code, message string) (bool, error) {
	store.runCode, store.runMessage = code, message
	return true, nil
}

func (store *failureStepStore) FailureNotificationTarget(context.Context, int64) (*int64, string, int64, error) {
	return nil, "", 0, nil
}
