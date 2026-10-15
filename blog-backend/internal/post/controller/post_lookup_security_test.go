package controller

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
)

type postReadFaultService struct {
	BlogService
	idErr error
	slugErr error
	slugPost *postdomain.Post
	idCalls int
	slugCalls int
}

func (s *postReadFaultService) GetAdminPost(context.Context, int64) (*postdomain.Post, error) {
	s.idCalls++
	return nil, s.idErr
}

func (s *postReadFaultService) GetAdminPostBySlug(context.Context, string) (*postdomain.Post, error) {
	s.slugCalls++
	return s.slugPost, s.slugErr
}

func TestNumericLookingPostSlugFallbackOnlyAfterConfirmedIDMiss(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_POST_REPOSITORY_SQL_CAUSE"
	numericSlug := &postdomain.Post{
		ID: 1024, Slug: "101", Title: "Numeric Slug", Status: postdomain.PostStatusPublished,
	}
	for _, tc := range []struct {
		name string
		idErr error
		slugErr error
		post *postdomain.Post
		wantStatus int
		wantIDCalls int
		wantSlugCalls int
		message string
	}{
		{"sql_no_rows", sql.ErrNoRows, nil, numericSlug, http.StatusOK, 1, 1, "Numeric Slug"},
		{"wrapped_sql_no_rows", fmt.Errorf("repository: %w", sql.ErrNoRows), nil, numericSlug, http.StatusOK, 1, 1, "Numeric Slug"},
		{"domain_not_found", postservice.ErrPostNotFound, nil, numericSlug, http.StatusOK, 1, 1, "Numeric Slug"},
		{"both_missing", sql.ErrNoRows, postservice.ErrPostNotFound, nil, http.StatusNotFound, 1, 1, "post not found"},
		{"sql_unavailable", errors.New(marker), nil, numericSlug, http.StatusInternalServerError, 1, 0, "internal server error"},
		{"canceled_id_read", fmt.Errorf("%s: %w", marker, context.Canceled), nil, numericSlug, http.StatusInternalServerError, 1, 0, "internal server error"},
		{"slug_lookup_error", sql.ErrNoRows, errors.New(marker), nil, http.StatusInternalServerError, 1, 1, "internal server error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc := &postReadFaultService{idErr: tc.idErr, slugErr: tc.slugErr, slugPost: tc.post}
			router := gin.New()
			router.GET("/api/posts/:slugOrID", NewPostController(svc).Get)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/posts/101", nil))
			if rec.Code != tc.wantStatus || svc.idCalls != tc.wantIDCalls ||
				svc.slugCalls != tc.wantSlugCalls ||
				!strings.Contains(rec.Body.String(), tc.message) ||
				strings.Contains(rec.Body.String(), marker) {
				t.Fatalf("numeric Post fallback/error classification changed: status=%d id=%d slug=%d body=%s",
					rec.Code, svc.idCalls, svc.slugCalls, rec.Body.String())
			}
		})
	}
}

func TestNumericPostSlugFallbackStillHidesUnauthorizedDraft(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &postReadFaultService{
		idErr: sql.ErrNoRows,
		slugPost: &postdomain.Post{ID: 42, Slug: "101", Title: "PRIVATE_DRAFT_TITLE",
			Status: postdomain.PostStatusDraft},
	}
	router := gin.New()
	router.GET("/api/posts/:slugOrID", NewPostController(svc).Get)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/posts/101", nil))
	if rec.Code != http.StatusNotFound || svc.slugCalls != 1 ||
		strings.Contains(rec.Body.String(), "PRIVATE_DRAFT_TITLE") {
		t.Fatalf("numeric Post fallback exposed an unpublished draft: %d %s", rec.Code, rec.Body.String())
	}
}
