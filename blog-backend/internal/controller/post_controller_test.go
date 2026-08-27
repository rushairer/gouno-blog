package controller

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/service"
)

type fakeBlogService struct {
	posts        map[int64]*domain.Post
	postsBySlug  map[string]*domain.Post
	comments     map[int64][]*domain.Comment
	createErr    error
	resolveCalls []string
	adminFilter  domain.AdminPostFilter
	adminPage    int
	adminSize    int
}

func newFakeBlogService() *fakeBlogService {
	post := &domain.Post{ID: 1, Title: "Hello", Slug: "hello", Content: "Body", Status: domain.PostStatusPublished}
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

func (s *fakeBlogService) GetAdminPost(_ context.Context, id int64) (*domain.Post, error) {
	if p, ok := s.posts[id]; ok {
		return p, nil
	}
	return nil, service.ErrPostNotFound
}

func (s *fakeBlogService) GetAdminPostBySlug(_ context.Context, slug string) (*domain.Post, error) {
	if p, ok := s.postsBySlug[slug]; ok {
		return p, nil
	}
	return nil, service.ErrPostNotFound
}

func (s *fakeBlogService) BatchPosts(_ context.Context, ids []int64, action string) (int64, error) {
	return int64(len(ids)), nil
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

func (s *fakeBlogService) IncrementViews(context.Context, int64) error {
	return nil
}

func (s *fakeBlogService) IncrementLikes(context.Context, int64) error {
	return nil
}

func (s *fakeBlogService) ListPosts(context.Context, string, string, int, int) ([]*domain.Post, int, error) {
	return []*domain.Post{s.posts[1]}, 1, nil
}

func (s *fakeBlogService) ListAdminPosts(_ context.Context, filter domain.AdminPostFilter, page, pageSize int) ([]*domain.Post, int, error) {
	s.adminFilter, s.adminPage, s.adminSize = filter, page, pageSize
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
	router.GET("/api/admin/posts", ctrl.ListAdmin)
	router.GET("/api/admin/posts/:id", ctrl.GetAdmin)
	router.POST("/api/admin/posts/batch", ctrl.Batch)
	return router
}

func TestListAdminPassesSearchFiltersAndPagination(t *testing.T) {
	svc := newFakeBlogService()
	router := setupControllerRouter(svc)
	request := httptest.NewRequest(http.MethodGet, "/api/admin/posts?q=system&status=draft&category=architecture&tag=go&page=2&pageSize=20", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if svc.adminFilter.Query != "system" || svc.adminFilter.Status != domain.PostStatusDraft || svc.adminFilter.Category != "architecture" || svc.adminFilter.Tag != "go" {
		t.Fatalf("unexpected filters: %#v", svc.adminFilter)
	}
	if svc.adminPage != 2 || svc.adminSize != 20 {
		t.Fatalf("unexpected pagination: page=%d size=%d", svc.adminPage, svc.adminSize)
	}
}

func TestGetPostSupportsIDAndSlug(t *testing.T) {
	svc := newFakeBlogService()
	numericSlug := &domain.Post{ID: 2, Title: "Numeric slug", Slug: "112", Content: "Body", Status: domain.PostStatusPublished}
	svc.posts[numericSlug.ID] = numericSlug
	svc.postsBySlug[numericSlug.Slug] = numericSlug
	router := setupControllerRouter(svc)

	for _, path := range []string{"/api/posts/1", "/api/posts/hello", "/api/posts/112"} {
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
	svc.createErr = service.ErrPostTitleEmpty
	router := setupControllerRouter(svc)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/posts", bytes.NewBufferString(`{"title":" ","content":"Body"}`))
	req.Header.Set("Content-Type", "application/json")

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
}

func TestGetAdminPost(t *testing.T) {
	svc := newFakeBlogService()
	router := setupControllerRouter(svc)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/posts/1", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestBatchPosts(t *testing.T) {
	svc := newFakeBlogService()
	router := setupControllerRouter(svc)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/posts/batch", bytes.NewBufferString(`{"ids":[1],"action":"publish"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestGetPost_DraftAccessControl(t *testing.T) {
	svc := newFakeBlogService()
	authorID := int64(100)
	otherID := int64(200)

	svc.posts[2] = &domain.Post{ID: 2, Title: "Draft Post", Slug: "draft-post", Status: domain.PostStatusDraft, CreatedByPrincipalID: &authorID}
	svc.postsBySlug["draft-post"] = svc.posts[2]

	router := setupControllerRouter(svc)

	// 1. Anonymous request for draft post returns 404 (not found / forbidden without existence leak)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/posts/draft-post", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("anonymous draft access: got status = %d, want 404", rec.Code)
	}

	// 2. Author accessing own draft post returns 200
	authorRouter := gin.New()
	ctrl := NewPostController(svc)
	authorRouter.GET("/api/posts/:slugOrID", func(c *gin.Context) {
		c.Set("blog_access", access.Snapshot{
			Principal:        access.Principal{ID: authorID},
			MembershipStatus: "active",
			Roles:            []string{access.RoleAuthor},
			Permissions:      []string{access.PermissionAuthorContent},
		})
		ctrl.Get(c)
	})

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/posts/draft-post", nil)
	authorRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("author own draft access: got status = %d, want 200", rec.Code)
	}

	// 3. Other author accessing draft post returns 404
	otherAuthorRouter := gin.New()
	otherAuthorRouter.GET("/api/posts/:slugOrID", func(c *gin.Context) {
		c.Set("blog_access", access.Snapshot{
			Principal:        access.Principal{ID: otherID},
			MembershipStatus: "active",
			Roles:            []string{access.RoleAuthor},
			Permissions:      []string{access.PermissionAuthorContent},
		})
		ctrl.Get(c)
	})

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/posts/draft-post", nil)
	otherAuthorRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("other author draft access: got status = %d, want 404", rec.Code)
	}

	// 4. Editor accessing draft post returns 200
	editorRouter := gin.New()
	editorRouter.GET("/api/posts/:slugOrID", func(c *gin.Context) {
		c.Set("blog_access", access.Snapshot{
			Principal:        access.Principal{ID: 300},
			MembershipStatus: "active",
			Roles:            []string{access.RoleEditor},
			Permissions:      []string{access.PermissionManageContent, access.PermissionAuthorContent},
		})
		ctrl.Get(c)
	})

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/posts/draft-post", nil)
	editorRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("editor draft access: got status = %d, want 200", rec.Code)
	}
}

