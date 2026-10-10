package agent

import (
	"context"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

// The worker can have been cancelled by shutdown before the provider call
// returns. A bounded detached context must still be used to quarantine the
// attempt, so the error path never turns a lost response into an auto-retry.
func TestUncertainProviderResultPersistsAfterWorkerContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	workflowID := int64(54)
	store := &mediaGenerationFailureStub{workflowRunID: &workflowID}
	events := &workflowEventStub{}
	svc := &ApprovalService{mediaGeneration: store, workflowEvents: events}
	svc.markMediaGenerationUncertain(ctx, 144, 6)
	if store.contextErr != nil || store.candidateID != 144 ||
		store.code != domain.MediaGenerationOutcomeUncertainCode ||
		store.message != "provider outcome unconfirmed; manual reconciliation required" {
		t.Fatalf("cancelled context prevented quarantine: ctx=%v id=%d code=%q msg=%q",
			store.contextErr, store.candidateID, store.code, store.message)
	}
	if len(events.events) != 1 || events.events[0].EventType != "image_generation_outcome_uncertain" {
		t.Fatalf("missing safe uncertain-outcome audit event: %#v", events.events)
	}
}

func TestMediaReconciliationRequiresGenerationPort(t *testing.T) {
	svc := &ApprovalService{}
	if _, err := svc.ListMediaGenerationReconciliation(context.Background(), 50); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing reconciliation store result=%v, want ErrInvalid", err)
	}
}
