package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/service"
)

var (
	ErrApprovalConflict = errors.New("approval target changed or is no longer pending")
	ErrApprovalExpired  = errors.New("approval has expired")
)

type ApprovalService struct {
	repo  *repository.AgentRepository
	posts *service.PostService
}

func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService) *ApprovalService {
	return &ApprovalService{repo: repo, posts: posts}
}

func (s *ApprovalService) List(ctx context.Context, status string, page, pageSize int) ([]*domain.AgentApproval, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return s.repo.ListApprovals(ctx, status, pageSize, (page-1)*pageSize)
}

func (s *ApprovalService) Reject(ctx context.Context, id int64, reviewer, note string) error {
	if err := s.repo.RejectApproval(ctx, id, reviewer, strings.TrimSpace(note)); err != nil {
		return ErrApprovalConflict
	}
	return nil
}

func (s *ApprovalService) Approve(ctx context.Context, id int64, reviewer, note string) error {
	approval, err := s.repo.GetApproval(ctx, id)
	if err != nil {
		return translateError(err)
	}
	if approval.Status != domain.ApprovalPending {
		return ErrApprovalConflict
	}
	if time.Now().After(approval.ExpiresAt) {
		_ = s.repo.CompleteApproval(ctx, id, domain.ApprovalExpired, "approval expired")
		return ErrApprovalExpired
	}
	if err := s.validateConflict(ctx, approval); err != nil {
		return err
	}
	if err := s.repo.ClaimApproval(ctx, id, reviewer, strings.TrimSpace(note)); err != nil {
		return ErrApprovalConflict
	}
	if err := s.execute(ctx, approval); err != nil {
		_ = s.repo.CompleteApproval(ctx, id, domain.ApprovalFailed, safeError(err))
		return err
	}
	return s.repo.CompleteApproval(ctx, id, domain.ApprovalExecuted, "")
}

func (s *ApprovalService) validateConflict(ctx context.Context, approval *domain.AgentApproval) error {
	if approval.TargetType != "post" || approval.TargetID == nil || len(approval.BeforeSnapshot) == 0 {
		return nil
	}
	var before domain.Post
	if err := json.Unmarshal(approval.BeforeSnapshot, &before); err != nil {
		return ErrApprovalConflict
	}
	current, err := s.posts.GetAdminPost(ctx, *approval.TargetID)
	if err != nil || !current.UpdatedAt.Equal(before.UpdatedAt) {
		return ErrApprovalConflict
	}
	return nil
}

func (s *ApprovalService) execute(ctx context.Context, approval *domain.AgentApproval) error {
	switch approval.ActionType {
	case "create_draft":
		var payload struct {
			Title   string   `json:"title"`
			Slug    string   `json:"slug"`
			Summary string   `json:"summary"`
			Content string   `json:"content"`
			Tags    []string `json:"tags"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		return s.posts.CreatePost(ctx, &domain.Post{
			Title: payload.Title, Slug: payload.Slug, Summary: payload.Summary,
			Content: payload.Content, Tags: payload.Tags, Status: domain.PostStatusDraft,
		})
	case "update_post", "update_tags":
		if approval.TargetID == nil {
			return errors.New("post target is required")
		}
		current, err := s.posts.GetAdminPost(ctx, *approval.TargetID)
		if err != nil {
			return err
		}
		var payload struct {
			Title   *string   `json:"title"`
			Slug    *string   `json:"slug"`
			Summary *string   `json:"summary"`
			Content *string   `json:"content"`
			Tags    *[]string `json:"tags"`
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
		return s.posts.UpdatePost(ctx, current)
	case "reply_comment":
		var payload struct {
			CommentID int64  `json:"comment_id"`
			Content   string `json:"content"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.CommentID <= 0 || strings.TrimSpace(payload.Content) == "" {
			return errors.New("invalid reply draft")
		}
		return s.repo.CreateReplyDraft(ctx, approval.ID, payload.CommentID, payload.Content)
	case "create_editorial_task":
		var payload struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Priority    string `json:"priority"`
		}
		if err := json.Unmarshal(approval.ProposedPayload, &payload); err != nil {
			return err
		}
		if payload.Priority == "" {
			payload.Priority = "medium"
		}
		return s.repo.CreateEditorialTask(ctx, approval.ID, payload.Title, payload.Description, payload.Priority)
	default:
		return fmt.Errorf("unsupported approval action %q", approval.ActionType)
	}
}
