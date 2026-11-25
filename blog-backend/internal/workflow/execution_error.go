package workflow

import (
	"fmt"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

func agentRunExecutionError(run *domain.AgentRun) error {
	message := "Inspect this Agent run's error details for the underlying cause."
	if run.ErrorCode != nil {
		if summary := provider.TextFailureMessage(*run.ErrorCode); summary != "" {
			message = summary
		}
	}
	return fmt.Errorf("Agent run %d %s: %s", run.ID, run.Status, message)
}

// A returned worker is not evidence of a completed Agent run. In particular,
// a lost claim/finalization acknowledgement may leave a nonterminal row.
func agentRunOutcomeError(run *domain.AgentRun) error {
	switch run.Status {
	case domain.AgentRunSucceeded, domain.AgentRunAwaitingApproval:
		return nil
	case domain.AgentRunFailed, domain.AgentRunCancelled:
		return agentRunExecutionError(run)
	default:
		return fmt.Errorf("Agent run %d did not reach confirmed completion; inspect its state before retrying", run.ID)
	}
}
