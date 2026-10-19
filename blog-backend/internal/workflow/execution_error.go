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
