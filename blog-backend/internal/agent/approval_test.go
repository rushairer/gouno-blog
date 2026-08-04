package agent

import (
	"encoding/json"
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
