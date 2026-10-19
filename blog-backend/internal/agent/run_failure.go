package agent

import "github.com/rushairer/blog-backend/internal/provider"

func runFailureDetails(err error) (string, string) {
	code := provider.TextFailureCode(err)
	if code == "" {
		code = "agent_run_failed"
	}
	return code, safeError(err)
}
