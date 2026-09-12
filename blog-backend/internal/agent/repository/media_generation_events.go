package repository

import (
	"context"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

// WorkflowEventAppender is the narrow cross-capability seam used when Media
// Candidate state transitions need to emit a Workflow audit event.
type WorkflowEventAppender interface {
	AppendWorkflowRunEvent(context.Context, *domain.WorkflowRunEvent) error
}

// RecordMediaGenerationErrorWithWorkflowEvent records the Agent-owned Media
// Candidate failure first, then emits the related Workflow audit event through
// a narrow interface. Workflow audit failure remains best-effort to preserve
// the existing failure-recording contract.
func (r *MediaCandidateRepository) RecordMediaGenerationErrorWithWorkflowEvent(
	ctx context.Context,
	events WorkflowEventAppender,
	candidateID int64,
	code, message string,
) error {
	workflowRunID, err := r.RecordMediaGenerationError(ctx, candidateID, code, message)
	if err != nil {
		return err
	}
	if workflowRunID == nil || events == nil {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"candidate_id":  candidateID,
		"error_code":    code,
		"error_message": message,
	})
	_ = events.AppendWorkflowRunEvent(ctx, &domain.WorkflowRunEvent{
		WorkflowRunID: workflowRunID,
		EventType:     generationFailureEvent(code),
		Payload:       payload,
	})
	return nil
}

func generationFailureEvent(code string) string {
	if code == "image_generation_timeout" {
		return "image_generation_timed_out"
	}
	return "image_generation_failed"
}
