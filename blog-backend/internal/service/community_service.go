package service

import (
	"context"
	"errors"

	communityservice "github.com/rushairer/blog-backend/internal/community/service"
	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrCommentContentTooLong = communityservice.ErrCommentContentTooLong
	ErrAuthorTooLong         = communityservice.ErrAuthorTooLong
	ErrParentCommentNotFound = communityservice.ErrParentCommentNotFound
	ErrInvalidCommentStatus  = communityservice.ErrInvalidCommentStatus
	ErrReportReasonTooLong   = communityservice.ErrReportReasonTooLong
)

type Actor = communityservice.Actor
type VisitorTokenManager = communityservice.VisitorTokenManager
type CommunityRepository = communityservice.CommunityRepository
type PostLookup = communityservice.PostLookup
type NotificationCleanupSpec = communityservice.NotificationCleanupSpec

func NewVisitorTokenManager(secret string) *VisitorTokenManager {
	return communityservice.NewVisitorTokenManager(secret)
}

// CommunityService is retained as a compatibility facade while runtime ownership
// moves to internal/community/service. New Community code should depend on the
// canonical capability package directly.
type CommunityService struct {
	*communityservice.CommunityService
}

func NewCommunityService(repo CommunityRepository, posts PostLookup) *CommunityService {
	return &CommunityService{CommunityService: communityservice.NewCommunityService(repo, posts)}
}

// Canonical exposes the capability-owned implementation to composition roots
// while legacy callers still depend on this facade type.
func (s *CommunityService) Canonical() *communityservice.CommunityService {
	if s == nil {
		return nil
	}
	return s.CommunityService
}

func (s *CommunityService) ResolvePublishedPost(ctx context.Context, value string) (*domain.Post, error) {
	post, err := s.CommunityService.ResolvePublishedPost(ctx, value)
	if errors.Is(err, communityservice.ErrPostNotFound) {
		return nil, ErrPostNotFound
	}
	return post, err
}

func (s *CommunityService) CreateComment(ctx context.Context, postID int64, parentID *int64, actor Actor, suppliedAuthor, content string) (*domain.Comment, error) {
	comment, err := s.CommunityService.CreateComment(ctx, postID, parentID, actor, suppliedAuthor, content)
	switch {
	case errors.Is(err, communityservice.ErrPostNotFound):
		return nil, ErrPostNotFound
	case errors.Is(err, communityservice.ErrCommentAuthorEmpty):
		return nil, ErrCommentAuthorEmpty
	case errors.Is(err, communityservice.ErrCommentContentEmpty):
		return nil, ErrCommentContentEmpty
	default:
		return comment, err
	}
}
