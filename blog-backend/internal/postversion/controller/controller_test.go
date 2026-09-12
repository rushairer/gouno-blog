package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
)

type fakeService struct {
	versions  []*domain.PostVersion
	restored  *domain.Post
	postID    int64
	versionID int64
}

func (f *fakeService) ListVersions(_ context.Context, postID int64) ([]*domain.PostVersion, error) {
	f.postID = postID
	return f.versions, nil
}

func (f *fakeService) RestoreVersion(_ context.Context, postID, versionID int64) (*domain.Post, error) {
	f.postID = postID
	f.versionID = versionID
	return f.restored, nil
}

type fakePostReader struct{}

func (fakePostReader) GetAdminPost(context.Context, int64) (*domain.Post, error) {
	return &domain.Post{ID: 1}, nil
}

func TestListVersionsUsesCanonicalService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &fakeService{versions: []*domain.PostVersion{{ID: 7, PostID: 3}}}
	ctrl := New(svc, fakePostReader{})
	engine := gin.New()
	engine.GET("/posts/:id/versions", ctrl.ListVersions)

	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/posts/3/versions", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if svc.postID != 3 {
		t.Fatalf("postID=%d, want 3", svc.postID)
	}
}

func TestRestoreVersionUsesCanonicalService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &fakeService{restored: &domain.Post{ID: 3, Title: "restored"}}
	ctrl := New(svc, fakePostReader{})
	engine := gin.New()
	engine.POST("/posts/:id/versions/:versionID/restore", ctrl.RestoreVersion)

	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/posts/3/versions/9/restore", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if svc.postID != 3 || svc.versionID != 9 {
		t.Fatalf("postID=%d versionID=%d", svc.postID, svc.versionID)
	}
}
