package controller

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
)

type fakeBlogService struct {
	posts        map[int64]*domain.Post
	postsBySlug  map[string]*domain.Post
	comments     map[int64][]*domain.Comment
	createErr    error
	resolveCalls []string
}

func newFakeBlogService() *fakeBlogService {
	post := &domain.Post{ID: 1, Title: "Hello", Slug: "hello", Content: "Body"}
	return &fakeBlogService{
		posts:       map[int64]*domain.Post{1: post},
		postsBySlug: map[string]*domain.Post{"hello": post},
		comments: map[int64][]*domain.Comment{1: []*domain.Comment{
			{ID: 10, PostID: 1, Author: "Ada", Content: "Visible", IsVisible: true},
			{ID: 11, PostID: 1, Author: "Grace", Content: "Pending", IsVisible: false},
		}},
	}
}

func (s *fakeBlogService) CreatePost(context.Context, *domain.Post) error {
	return s.createErr
}

func (s *fakeBlogService) UpdatePost(context.Context, *domain.Post) error {
	return nil
}

func (s *fakeBlogService) DeletePost(context.Context, int64) error {
	return nil
}

func (s *fakeBlogService) GetPost(_ context.Context, id int64) (*domain.Post, error) {
	return s.posts[id], nil
}

func (s *fakeBlogService) GetPostBySlug(_ context.Context, slug string) (*domain.Post, error) {
	return s.postsBySlug[slug], nil
}

func (s *fakeBlogService) ResolvePostID(_ context.Context, slugOrID string) (int64, error) {
	s.resolveCalls = append(s.resolveCalls, slugOrID)
	if slugOrID == "missing" {
		return 0, service.ErrPostNotFound
	}
	if post := s.postsBySlug[slugOrID]; post != nil {
		return post.ID, nil
	}
	if slugOrID == "1" {
		return 1, nil
	}
	return 0, errors.New("invalid post slug")
}

func (s *fakeBlogService) ListPosts(context.Context, string, int, int) ([]*domain.Post, int, error) {
	return []*domain.Post{s.posts[1]}, 1, nil
}

func (s *fakeBlogService) ListTags(context.Context) ([]string, error) {
	return []string{"go"}, nil
}

func (s *fakeBlogService) CreateComment(context.Context, *domain.Comment) error {
	return nil
}

func (s *fakeBlogService) GetComments(_ context.Context, postID int64) ([]*domain.Comment, error) {
	comments := make([]*domain.Comment, 0)
	for _, comment := range s.comments[postID] {
		if comment.IsVisible {
			comments = append(comments, comment)
		}
	}
	return comments, nil
}

func (s *fakeBlogService) GetAllComments(_ context.Context, postID int64) ([]*domain.Comment, error) {
	return s.comments[postID], nil
}

func (s *fakeBlogService) SetCommentVisibility(_ context.Context, id int64, isVisible bool) error {
	for _, comments := range s.comments {
		for _, comment := range comments {
			if comment.ID == id {
				comment.IsVisible = isVisible
				return nil
			}
		}
	}
	return service.ErrPostNotFound
}

func (s *fakeBlogService) DeleteComment(context.Context, int64) error {
	return nil
}

func setupControllerRouter(svc *fakeBlogService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	ctrl := NewPostController(svc)
	router.GET("/api/posts/:slugOrID", ctrl.Get)
	router.GET("/api/posts/:slugOrID/comments", ctrl.GetComments)
	router.GET("/api/posts/:slugOrID/comments/all", ctrl.GetAllComments)
	router.POST("/api/posts/:slugOrID/comments", ctrl.CreateComment)
	router.PUT("/api/comments/:id/visibility", ctrl.UpdateCommentVisibility)
	router.POST("/api/posts", ctrl.Create)
	return router
}

func TestGetPostSupportsIDAndSlug(t *testing.T) {
	router := setupControllerRouter(newFakeBlogService())

	for _, path := range []string{"/api/posts/1", "/api/posts/hello"} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200; body=%s", path, rec.Code, rec.Body.String())
		}
	}
}

func TestGetPostReturnsNotFound(t *testing.T) {
	router := setupControllerRouter(newFakeBlogService())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/posts/missing", nil)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
}

func TestCommentsSupportSlugOrID(t *testing.T) {
	svc := newFakeBlogService()
	router := setupControllerRouter(svc)

	for _, path := range []string{"/api/posts/1/comments", "/api/posts/hello/comments"} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200; body=%s", path, rec.Code, rec.Body.String())
		}
	}
	if len(svc.resolveCalls) != 2 {
		t.Fatalf("ResolvePostID calls = %v, want two calls", svc.resolveCalls)
	}
}

func TestPublicCommentsOnlyReturnVisibleComments(t *testing.T) {
	router := setupControllerRouter(newFakeBlogService())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/posts/hello/comments", nil)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("Visible")) || bytes.Contains(rec.Body.Bytes(), []byte("Pending")) {
		t.Fatalf("body = %s, want only visible comments", rec.Body.String())
	}
}

func TestAdminCommentsReturnAllAndCanToggleVisibility(t *testing.T) {
	svc := newFakeBlogService()
	router := setupControllerRouter(svc)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/posts/hello/comments/all", nil)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("Visible")) || !bytes.Contains(rec.Body.Bytes(), []byte("Pending")) {
		t.Fatalf("body = %s, want all comments", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/comments/11/visibility", bytes.NewBufferString(`{"is_visible":true}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if !svc.comments[1][1].IsVisible {
		t.Fatal("comment visibility was not updated")
	}
}

func TestCreateCommentReturnsBadRequestForInvalidBody(t *testing.T) {
	router := setupControllerRouter(newFakeBlogService())
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/posts/hello/comments", bytes.NewBufferString(`{"author":"","content":""}`))
	req.Header.Set("Content-Type", "application/json")

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

func TestCreatePostValidationErrorReturnsBadRequest(t *testing.T) {
	svc := newFakeBlogService()
	svc.createErr = errors.New("post title cannot be empty")
	router := setupControllerRouter(svc)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/posts", bytes.NewBufferString(`{"title":" ","content":"Body"}`))
	req.Header.Set("Content-Type", "application/json")

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}
