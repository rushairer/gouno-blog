package agent

import (
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	pagedomain "github.com/rushairer/blog-backend/internal/page/domain"
)

// decodePageDraftApproval keeps the Agent's original strict create-draft
// allowlist: the proposal cannot supply a published status, a persisted ID,
// reviewer identity, created_at or updated_at.
func decodePageDraftApproval(approval *domain.AgentApproval) (*pagedomain.Page, error) {
	if approval == nil {
		return nil, errors.New("page draft approval is required")
	}
	var payload struct {
		Title          string `json:"title"`
		Slug           string `json:"slug"`
		Summary        string `json:"summary"`
		Content        string `json:"content"`
		Template       string `json:"template"`
		ShowInNav      bool   `json:"show_in_nav"`
		AllowComments  bool   `json:"allow_comments"`
		SortOrder      int    `json:"sort_order"`
		SEOTitle       string `json:"seo_title"`
		SEODescription string `json:"seo_description"`
	}
	if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
		return nil, err
	}
	template := payload.Template
	if template == "" {
		template = "default"
	}
	return &pagedomain.Page{
		Title: payload.Title, Slug: payload.Slug, Summary: payload.Summary,
		Content: payload.Content, Template: template, Status: pagedomain.PageStatusDraft,
		ShowInNav: payload.ShowInNav, AllowComments: payload.AllowComments,
		SortOrder: payload.SortOrder, SEOTitle: payload.SEOTitle,
		SEODescription: payload.SEODescription,
	}, nil
}

// pageApprovalBeforeSnapshot rejects missing, stale or mismatched Page
// identities. A timestamp without the proposed resource identity is not a
// valid reviewer conflict guard.
func pageApprovalBeforeSnapshot(approval *domain.AgentApproval) (pagedomain.Page, error) {
	var before pagedomain.Page
	if approval == nil || approval.TargetType != "page" ||
		approval.TargetID == nil || *approval.TargetID <= 0 || len(approval.BeforeSnapshot) == 0 {
		return before, ErrApprovalConflict
	}
	if err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil ||
		before.ID != *approval.TargetID || before.UpdatedAt.IsZero() {
		return before, ErrApprovalConflict
	}
	return before, nil
}

// applyPageApprovalPatch preserves the existing Page edit allowlist; status
// transitions remain exactly those historically accepted for update_page.
// Proposal JSON cannot override ID or timestamp capture tokens.
func applyPageApprovalPatch(approval *domain.AgentApproval, current *pagedomain.Page) error {
	if approval == nil || current == nil {
		return ErrApprovalConflict
	}
	var payload struct {
		Title          *string `json:"title"`
		Slug           *string `json:"slug"`
		Summary        *string `json:"summary"`
		Content        *string `json:"content"`
		Template       *string `json:"template"`
		Status         *string `json:"status"`
		ShowInNav      *bool   `json:"show_in_nav"`
		AllowComments  *bool   `json:"allow_comments"`
		SortOrder      *int    `json:"sort_order"`
		SEOTitle       *string `json:"seo_title"`
		SEODescription *string `json:"seo_description"`
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
	if payload.Template != nil {
		current.Template = *payload.Template
	}
	if payload.Status != nil {
		current.Status = pagedomain.PageStatus(*payload.Status)
	}
	if payload.ShowInNav != nil {
		current.ShowInNav = *payload.ShowInNav
	}
	if payload.AllowComments != nil {
		current.AllowComments = *payload.AllowComments
	}
	if payload.SortOrder != nil {
		current.SortOrder = *payload.SortOrder
	}
	if payload.SEOTitle != nil {
		current.SEOTitle = *payload.SEOTitle
	}
	if payload.SEODescription != nil {
		current.SEODescription = *payload.SEODescription
	}
	return nil
}
