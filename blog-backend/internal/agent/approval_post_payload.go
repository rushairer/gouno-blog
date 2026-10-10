package agent

import (
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
)

// decodeDraftPostApproval retains the existing draft-only payload contract.
// Agent proposals cannot choose a published/scheduled status.
func decodeDraftPostApproval(approval *domain.AgentApproval) (*postdomain.Post, error) {
	if approval == nil {
		return nil, errors.New("post draft approval is required")
	}
	var payload struct {
		Title   string   `json:"title"`
		Slug    string   `json:"slug"`
		Summary string   `json:"summary"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return nil, err
	}
	return &postdomain.Post{
		Title: payload.Title, Slug: payload.Slug, Summary: payload.Summary,
		Content: payload.Content, Tags: payload.Tags, Status: postdomain.PostStatusDraft,
	}, nil
}

// applyPostApprovalPatch preserves the existing editable-field allowlist.
// In particular no proposal may change status, principals, timestamps or
// revision. The expected revision comes only from the recorded before snapshot.
func applyPostApprovalPatch(approval *domain.AgentApproval, current *postdomain.Post) error {
	if approval == nil || current == nil {
		return ErrApprovalConflict
	}
	var payload struct {
		Title    *string   `json:"title"`
		Slug     *string   `json:"slug"`
		Summary  *string   `json:"summary"`
		Content  *string   `json:"content"`
		Tags     *[]string `json:"tags"`
		CoverAlt *string   `json:"cover_alt"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return err
	}
	if payload.Title != nil {
		current.Title = *payload.Title
	}
	if payload.Slug != nil {
		current.Slug = *payload.Slug
	}
	if payload.Summary != nil {
		current.Summary = *payload.Summary
	}
	if payload.Content != nil {
		current.Content = *payload.Content
	}
	if payload.Tags != nil {
		current.Tags = *payload.Tags
	}
	if payload.CoverAlt != nil {
		current.CoverAlt = *payload.CoverAlt
	}
	var before postdomain.Post
	if json.Unmarshal(approval.BeforeSnapshot, &before) != nil || before.Revision <= 0 {
		return ErrApprovalConflict
	}
	current.Revision = before.Revision
	return nil
}
