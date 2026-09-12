package agent

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestApprovalMutatesExistingPost(t *testing.T) {
	tests := []struct {
		action string
		want   bool
	}{
		{action: "update_post", want: true},
		{action: "update_tags", want: true},
		{action: "create_content_candidates", want: false},
		{action: "create_distribution_draft", want: false},
	}
	for _, test := range tests {
		if got := approvalMutatesExistingPost(test.action); got != test.want {
			t.Fatalf("approvalMutatesExistingPost(%q) = %v, want %v", test.action, got, test.want)
		}
	}
}

func TestValidateMediaCandidateSelections(t *testing.T) {
	assetID := int64(7)
	available := []*domain.MediaCandidate{{ID: 1, GenerationStatus: "generated", MediaAssetID: &assetID}}
	tests := []struct {
		name  string
		input []domain.MediaCandidateSelection
		want  string
	}{
		{name: "normalizes cover", input: []domain.MediaCandidateSelection{{ID: 1}}, want: ""},
		{name: "requires inline anchor", input: []domain.MediaCandidateSelection{{ID: 1, Placement: "inline"}}, want: "inline image requires an anchor"},
		{name: "rejects duplicate", input: []domain.MediaCandidateSelection{{ID: 1}, {ID: 1}}, want: "duplicate image candidate"},
		{name: "rejects unknown candidate", input: []domain.MediaCandidateSelection{{ID: 99}}, want: "image candidate is not ready or does not belong to this run"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := append([]domain.MediaCandidateSelection(nil), test.input...)
			err := validateMediaCandidateSelections(available, input)
			if test.want == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if input[0].Placement != "cover" {
					t.Fatalf("placement = %q, want cover", input[0].Placement)
				}
			} else if err == nil || err.Error() != test.want {
				t.Fatalf("error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestIsImageBriefApproval(t *testing.T) {
	imageBrief := &domain.AgentApproval{ActionType: "create_distribution_draft", ProposedPayload: json.RawMessage(`{"format":"image_brief"}`)}
	if !isImageBriefApproval(imageBrief) {
		t.Fatal("image brief approval should start the run-owned generation")
	}
	for _, approval := range []*domain.AgentApproval{
		{ActionType: "create_distribution_draft", ProposedPayload: json.RawMessage(`{"format":"social"}`)},
		{ActionType: "update_post", ProposedPayload: json.RawMessage(`{"format":"image_brief"}`)},
		{ActionType: "create_distribution_draft", ProposedPayload: json.RawMessage(`invalid`)},
	} {
		if isImageBriefApproval(approval) {
			t.Fatalf("non-image approval %#v should not start generation", approval)
		}
	}
}

type mediaGenerationFailureStub struct {
	workflowRunID *int64
	recordErr     error
	candidateID   int64
	code          string
	message       string
}

func (s *mediaGenerationFailureStub) ClaimMediaGeneration(context.Context, int64) (*domain.MediaCandidate, error) {
	return nil, errors.New("unused")
}
func (s *mediaGenerationFailureStub) CompleteMediaGeneration(context.Context, int64, int64, bool) error {
	return errors.New("unused")
}
func (s *mediaGenerationFailureStub) CancelMediaGeneration(context.Context, int64) error {
	return errors.New("unused")
}
func (s *mediaGenerationFailureStub) RecordMediaGenerationError(_ context.Context, candidateID int64, code, message string) (*int64, error) {
	s.candidateID, s.code, s.message = candidateID, code, message
	return s.workflowRunID, s.recordErr
}

type workflowEventStub struct {
	events    []*domain.WorkflowRunEvent
	appendErr error
}

func (s *workflowEventStub) AppendWorkflowRunEvent(_ context.Context, event *domain.WorkflowRunEvent) error {
	s.events = append(s.events, event)
	return s.appendErr
}
func (s *workflowEventStub) ListWorkflowRunEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {
	return nil, nil
}
func (s *workflowEventStub) ListMediaCandidateEvents(context.Context, int64) ([]*domain.WorkflowRunEvent, error) {
	return nil, nil
}

func TestRecordMediaGenerationFailureOwnsWorkflowOrchestration(t *testing.T) {
	runID := int64(41)
	mediaStore := &mediaGenerationFailureStub{workflowRunID: &runID}
	events := &workflowEventStub{appendErr: errors.New("audit unavailable")}
	svc := &ApprovalService{mediaGeneration: mediaStore, workflowEvents: events}

	svc.recordMediaGenerationFailure(context.Background(), 7, "image_generation_timeout", "provider timed out")

	if mediaStore.candidateID != 7 || mediaStore.code != "image_generation_timeout" || mediaStore.message != "provider timed out" {
		t.Fatalf("media failure write = id:%d code:%q message:%q", mediaStore.candidateID, mediaStore.code, mediaStore.message)
	}
	if len(events.events) != 1 {
		t.Fatalf("workflow events = %d, want 1", len(events.events))
	}
	event := events.events[0]
	if event.WorkflowRunID == nil || *event.WorkflowRunID != runID || event.EventType != "image_generation_timed_out" {
		t.Fatalf("workflow event = %#v", event)
	}
	var payload map[string]any
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["candidate_id"] != float64(7) || payload["error_code"] != "image_generation_timeout" || payload["error_message"] != "provider timed out" {
		t.Fatalf("workflow payload = %#v", payload)
	}
}

func TestRecordMediaGenerationFailureSkipsWorkflowWhenUnavailable(t *testing.T) {
	for _, test := range []struct {
		name     string
		store    *mediaGenerationFailureStub
		wantSeen int
	}{
		{name: "no workflow run", store: &mediaGenerationFailureStub{}},
		{name: "agent persistence failed", store: &mediaGenerationFailureStub{recordErr: errors.New("write failed")}},
	} {
		t.Run(test.name, func(t *testing.T) {
			events := &workflowEventStub{}
			svc := &ApprovalService{mediaGeneration: test.store, workflowEvents: events}
			svc.recordMediaGenerationFailure(context.Background(), 9, "image_generation_failed", "failed")
			if len(events.events) != test.wantSeen {
				t.Fatalf("workflow events = %d, want %d", len(events.events), test.wantSeen)
			}
		})
	}
}

func TestGenerationFailureEvent(t *testing.T) {
	if got := generationFailureEvent("image_generation_timeout"); got != "image_generation_timed_out" {
		t.Fatalf("timeout event = %q", got)
	}
	if got := generationFailureEvent("image_generation_failed"); got != "image_generation_failed" {
		t.Fatalf("failure event = %q", got)
	}
}
