package service

import (
	"context"
	"database/sql"
	"errors"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrCommentContentTooLong = errors.New("comment content must be between 1 and 5000 characters")
	ErrAuthorTooLong         = errors.New("author must be between 1 and 100 characters")
	ErrParentCommentNotFound = errors.New("parent comment not found")
	ErrInvalidCommentStatus  = errors.New("invalid comment status")
	ErrReportReasonTooLong   = errors.New("report reason is too long")
)

type Actor struct {
	Key           string
	Subject       string
	DisplayName   string
	Authenticated bool
}

// VisitorTokenManager encapsulates signing and verification of anonymous visitor identifiers.
type VisitorTokenManager struct {
	secret []byte
}

func NewVisitorTokenManager(secret string) *VisitorTokenManager {
	if secret == "" {
		secret = "gouno-blog-development-visitor-secret"
	}
	return &VisitorTokenManager{secret: []byte(secret)}
}

func (m *VisitorTokenManager) Verify(cookieValue string) (string, bool) {
	parts := strings.SplitN(cookieValue, ".", 2)
	if len(parts) == 2 && hmac.Equal([]byte(parts[1]), []byte(m.Sign(parts[0]))) {
		return parts[0], true
	}
	return "", false
}

func (m *VisitorTokenManager) Sign(value string) string {
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (m *VisitorTokenManager) GenerateVisitorID(clientIP string) string {
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d-%s", time.Now().UnixNano(), clientIP)))
		buf = sum[:18]
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}


type CommunityRepository interface {
	CreateComment(context.Context, *domain.Comment) error
	GetVisibleComments(context.Context, int64) ([]*domain.Comment, error)
	ListCommentsForAdmin(context.Context, string, bool, int, int) ([]*domain.Comment, int, error)
	ModerateComment(context.Context, int64, string) error
	DeleteComment(context.Context, int64) error
	ReportComment(context.Context, int64, string, string) error
	SetLike(context.Context, int64, string, bool) (*domain.CommunityState, error)
	CommunityState(context.Context, int64, string, string) (*domain.CommunityState, error)
	ListNotifications(context.Context, string, int, int) ([]*domain.Notification, int, error)
	ReadNotification(context.Context, string, int64) error
	ReadAllNotifications(context.Context, string) error
	DeleteNotification(context.Context, string, int64) error
	DeleteNotifications(context.Context, string, []int64) error
	ClearNotifications(context.Context, string, bool) (int64, error)
}

type CommunityService struct {
	repo  CommunityRepository
	posts PostLookup
}

type PostLookup interface {
	GetByID(context.Context, int64) (*domain.Post, error)
	GetBySlug(context.Context, string) (*domain.Post, error)
}

func NewCommunityService(repo CommunityRepository, posts PostLookup) *CommunityService {
	return &CommunityService{repo: repo, posts: posts}
}

func (s *CommunityService) ResolvePublishedPost(ctx context.Context, value string) (*domain.Post, error) {
	var post *domain.Post
	var err error
	if id, parseErr := parsePositiveID(value); parseErr == nil {
		post, err = s.posts.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if post != nil && post.Status == domain.PostStatusPublished {
			return post, nil
		}
	}
	post, err = s.posts.GetBySlug(ctx, value)
	if err != nil {
		return nil, err
	}
	if post == nil || post.Status != domain.PostStatusPublished {
		return nil, ErrPostNotFound
	}
	return post, nil
}

func (s *CommunityService) CreateComment(ctx context.Context, postID int64, parentID *int64, actor Actor, suppliedAuthor, content string) (*domain.Comment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, ErrCommentContentEmpty
	}
	if len([]rune(content)) > 5000 {
		return nil, ErrCommentContentTooLong
	}
	author := strings.TrimSpace(suppliedAuthor)
	comment := &domain.Comment{
		PostID: postID, ParentID: parentID, Content: content,
		AuthorType: "anonymous", Status: "pending", IsVisible: false,
	}
	if actor.Authenticated {
		comment.Author = actor.DisplayName
		comment.AuthorSubject = &actor.Subject
		comment.AuthorType = "user"
		comment.Status = "visible"
		comment.IsVisible = true
	} else {
		if author == "" {
			return nil, ErrCommentAuthorEmpty
		}
		if len([]rune(author)) > 100 {
			return nil, ErrAuthorTooLong
		}
		comment.Author = author
	}
	if err := s.repo.CreateComment(ctx, comment); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrParentCommentNotFound
		}
		return nil, err
	}
	return comment, nil
}

func (s *CommunityService) GetComments(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	return s.repo.GetVisibleComments(ctx, postID)
}

func (s *CommunityService) ListAdminComments(ctx context.Context, status string, reported bool, page, pageSize int) ([]*domain.Comment, int, error) {
	if status != "" && status != "all" && status != "pending" && status != "visible" && status != "hidden" {
		return nil, 0, ErrInvalidCommentStatus
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	return s.repo.ListCommentsForAdmin(ctx, status, reported, pageSize, (page-1)*pageSize)
}

func (s *CommunityService) ModerateComment(ctx context.Context, id int64, status string) error {
	if status != "visible" && status != "hidden" && status != "pending" {
		return ErrInvalidCommentStatus
	}
	return s.repo.ModerateComment(ctx, id, status)
}

func (s *CommunityService) DeleteComment(ctx context.Context, id int64) error {
	return s.repo.DeleteComment(ctx, id)
}

func (s *CommunityService) ReportComment(ctx context.Context, id int64, actor Actor, reason string) error {
	reason = strings.TrimSpace(reason)
	if len([]rune(reason)) > 500 {
		return ErrReportReasonTooLong
	}
	return s.repo.ReportComment(ctx, id, actor.Key, reason)
}

func (s *CommunityService) SetLike(ctx context.Context, postID int64, actor Actor, liked bool) (*domain.CommunityState, error) {
	return s.repo.SetLike(ctx, postID, actor.Key, liked)
}

func (s *CommunityService) State(ctx context.Context, postID int64, actor Actor) (*domain.CommunityState, error) {
	return s.repo.CommunityState(ctx, postID, actor.Key, actor.Subject)
}

func (s *CommunityService) ListNotifications(ctx context.Context, subject string, page, pageSize int) ([]*domain.Notification, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListNotifications(ctx, subject, pageSize, (page-1)*pageSize)
}

func (s *CommunityService) ReadNotification(ctx context.Context, subject string, id int64) error {
	return s.repo.ReadNotification(ctx, subject, id)
}

func (s *CommunityService) ReadAllNotifications(ctx context.Context, subject string) error {
	return s.repo.ReadAllNotifications(ctx, subject)
}

func (s *CommunityService) DeleteNotification(ctx context.Context, subject string, id int64) error {
	return s.repo.DeleteNotification(ctx, subject, id)
}

func (s *CommunityService) DeleteNotifications(ctx context.Context, subject string, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	return s.repo.DeleteNotifications(ctx, subject, ids)
}

func (s *CommunityService) ClearNotifications(ctx context.Context, subject string, readOnly bool) (int64, error) {
	return s.repo.ClearNotifications(ctx, subject, readOnly)
}

func parsePositiveID(value string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid id")
	}
	return id, nil
}

func (s *CommunityService) parseNotificationIDs(values []string) []int64 {
	ids := make([]int64, 0, len(values))
	for _, v := range values {
		if id, err := parsePositiveID(v); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

type NotificationCleanupSpec struct {
	OlderThanDays int
	BatchSize     int
}

func (s *CommunityService) CleanupOldNotifications(ctx context.Context, spec NotificationCleanupSpec) (int64, error) {
	if spec.OlderThanDays <= 0 {
		spec.OlderThanDays = 30
	}
	if spec.BatchSize <= 0 {
		spec.BatchSize = 1000
	}
	cutoff := time.Now().AddDate(0, 0, -spec.OlderThanDays)
	_ = cutoff
	return 0, nil
}
