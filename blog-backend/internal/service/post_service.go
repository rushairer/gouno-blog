package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrPostNotFound = errors.New("post not found")
	ErrSlugInUse    = errors.New("slug is already in use")
)

type PostRepository interface {
	Create(ctx context.Context, post *domain.Post) error
	Update(ctx context.Context, post *domain.Post) error
	Delete(ctx context.Context, id int64) error
	GetByID(ctx context.Context, id int64) (*domain.Post, error)
	GetBySlug(ctx context.Context, slug string) (*domain.Post, error)
	List(ctx context.Context, tag string, limit, offset int) ([]*domain.Post, int, error)
	ListTags(ctx context.Context) ([]string, error)
	CreateComment(ctx context.Context, comment *domain.Comment) error
	GetVisibleCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error)
	GetAllCommentsByPostID(ctx context.Context, postID int64) ([]*domain.Comment, error)
	SetCommentVisibility(ctx context.Context, id int64, isVisible bool) error
	DeleteComment(ctx context.Context, id int64) error
}

type PostService struct {
	repo PostRepository
}

func NewPostService(repo PostRepository) *PostService {
	return &PostService{repo: repo}
}

func (s *PostService) CreatePost(ctx context.Context, post *domain.Post) error {
	if post.Title == "" {
		return errors.New("post title cannot be empty")
	}
	if post.Content == "" {
		return errors.New("post content cannot be empty")
	}

	// Generate slug from title if not set
	if post.Slug == "" {
		post.Slug = generateSlug(post.Title)
	} else {
		post.Slug = generateSlug(post.Slug)
	}

	// Verify slug uniqueness
	existing, err := s.repo.GetBySlug(ctx, post.Slug)
	if err != nil {
		return err
	}
	if existing != nil {
		// Append random suffix if slug exists
		post.Slug = fmt.Sprintf("%s-%d", post.Slug, timeNowUnixNano()%1000)
	}

	if post.Summary == "" {
		// Generate summary from content
		post.Summary = generateSummary(post.Content)
	}

	return s.repo.Create(ctx, post)
}

func (s *PostService) UpdatePost(ctx context.Context, post *domain.Post) error {
	if post.ID <= 0 {
		return errors.New("invalid post ID")
	}
	if post.Title == "" {
		return errors.New("post title cannot be empty")
	}
	if post.Content == "" {
		return errors.New("post content cannot be empty")
	}

	post.Slug = generateSlug(post.Slug)
	if post.Slug == "" {
		post.Slug = generateSlug(post.Title)
	}

	// Verify slug uniqueness for other posts
	existing, err := s.repo.GetBySlug(ctx, post.Slug)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != post.ID {
		return fmt.Errorf("%w: %s", ErrSlugInUse, post.Slug)
	}

	if post.Summary == "" {
		post.Summary = generateSummary(post.Content)
	}

	if err := s.repo.Update(ctx, post); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPostNotFound
		}
		return err
	}
	return nil
}

func (s *PostService) DeletePost(ctx context.Context, id int64) error {
	if id <= 0 {
		return errors.New("invalid post ID")
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPostNotFound
		}
		return err
	}
	return nil
}

func (s *PostService) GetPost(ctx context.Context, id int64) (*domain.Post, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *PostService) GetPostBySlug(ctx context.Context, slug string) (*domain.Post, error) {
	return s.repo.GetBySlug(ctx, slug)
}

func (s *PostService) ResolvePostID(ctx context.Context, slugOrID string) (int64, error) {
	if id, err := strconv.ParseInt(slugOrID, 10, 64); err == nil {
		if id <= 0 {
			return 0, errors.New("invalid post id")
		}
		post, err := s.repo.GetByID(ctx, id)
		if err != nil {
			return 0, err
		}
		if post == nil {
			return 0, ErrPostNotFound
		}
		return post.ID, nil
	}

	slug := generateSlug(slugOrID)
	if slug == "" {
		return 0, errors.New("invalid post slug")
	}
	post, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return 0, err
	}
	if post == nil {
		return 0, ErrPostNotFound
	}
	return post.ID, nil
}

func (s *PostService) ListPosts(ctx context.Context, tag string, page, pageSize int) ([]*domain.Post, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	offset := (page - 1) * pageSize
	return s.repo.List(ctx, tag, pageSize, offset)
}

func (s *PostService) ListTags(ctx context.Context) ([]string, error) {
	return s.repo.ListTags(ctx)
}

func (s *PostService) CreateComment(ctx context.Context, comment *domain.Comment) error {
	if comment.PostID <= 0 {
		return errors.New("invalid post ID")
	}
	if comment.Author == "" {
		return errors.New("comment author cannot be empty")
	}
	if comment.Content == "" {
		return errors.New("comment content cannot be empty")
	}
	return s.repo.CreateComment(ctx, comment)
}

func (s *PostService) GetComments(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	return s.repo.GetVisibleCommentsByPostID(ctx, postID)
}

func (s *PostService) GetAllComments(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	return s.repo.GetAllCommentsByPostID(ctx, postID)
}

func (s *PostService) SetCommentVisibility(ctx context.Context, id int64, isVisible bool) error {
	if id <= 0 {
		return errors.New("invalid comment id")
	}
	if err := s.repo.SetCommentVisibility(ctx, id, isVisible); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPostNotFound
		}
		return err
	}
	return nil
}

func (s *PostService) DeleteComment(ctx context.Context, id int64) error {
	if id <= 0 {
		return errors.New("invalid comment id")
	}
	if err := s.repo.DeleteComment(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPostNotFound
		}
		return err
	}
	return nil
}

// Helpers
var slugRegexp = regexp.MustCompile(`[^a-z0-9]+`)

func generateSlug(src string) string {
	slug := strings.ToLower(src)
	slug = slugRegexp.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	return slug
}

func generateSummary(content string) string {
	// Remove markdown headers and formatters
	clean := regexp.MustCompile(`[#*_\-`+"`"+`]`).ReplaceAllString(content, "")
	clean = strings.TrimSpace(clean)
	runes := []rune(clean)
	if len(runes) > 150 {
		return string(runes[:150]) + "..."
	}
	return clean
}

// Inline fallback for test helper
func timeNowUnixNano() int64 {
	return time.Now().UnixNano()
}
