package controller

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/media"
	mediadomain "github.com/rushairer/blog-backend/internal/media/domain"
	mediarepository "github.com/rushairer/blog-backend/internal/media/repository"
	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

type uploadACKLossService struct {
	mediaservice.Service
	mode        string
	calls       int
	committedID int64
	cancel      context.CancelFunc
}

func (s *uploadACKLossService) CreateMedia(ctx context.Context, asset *mediadomain.MediaAsset) error {
	s.calls++
	if s.mode == "before_commit" {
		return sql.ErrNoRows
	}
	if err := s.Service.CreateMedia(ctx, asset); err != nil {
		return err
	}
	s.committedID = asset.ID
	if s.mode == "success" {
		return nil
	}
	asset.ID, asset.CreatedAt = 0, time.Time{}
	if s.mode == "cancel_after_commit" {
		s.cancel()
		return context.Canceled
	}
	return errors.New("fixture: media INSERT committed before ACK loss")
}

type uploadPreservationStore struct {
	media.Store
	key     string
	puts    int
	deletes int
}

func (s *uploadPreservationStore) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	s.puts++
	s.key = key
	return s.Store.Put(ctx, key, body, contentType)
}
func (s *uploadPreservationStore) Delete(ctx context.Context, key string) error {
	s.deletes++
	return s.Store.Delete(ctx, key)
}

// Exercises the multipart handler, real Media service/repository, migrated
// PostgreSQL and local object bytes. This is not an authentication E2E test.
func exerciseUploadPersistence(t *testing.T, mode string) {
	t.Helper()
	db := testsupport.OpenTestDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	service := &uploadACKLossService{Service: mediaservice.New(mediarepository.New(db)), mode: mode, cancel: cancel}
	store := &uploadPreservationStore{Store: media.NewLocal(t.TempDir())}
	t.Cleanup(func() {
		if service.committedID > 0 {
			if _, err := db.Exec(`DELETE FROM media_assets WHERE id=$1`, service.committedID); err != nil {
				t.Error(err)
			}
		}
	})
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "fixture.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(imageData.Bytes()); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/upload", &body).WithContext(ctx)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router := gin.New()
	router.POST("/upload", New(service, store).Upload)
	router.ServeHTTP(response, req)
	if mode == "success" {
		if response.Code != http.StatusCreated {
			t.Fatalf("successful upload returned %d: %s", response.Code, response.Body.String())
		}
	} else if response.Code < 400 || response.Code > 599 {
		t.Fatalf("uncertain upload returned success: %d %s", response.Code, response.Body.String())
	}
	if service.calls != 1 || store.puts != 1 || store.deletes != 0 || store.key == "" {
		t.Fatalf("upload retried or deleted evidence: metadata=%d puts=%d deletes=%d", service.calls, store.puts, store.deletes)
	}
	path, ok := store.LocalPath(store.key)
	if !ok {
		t.Fatal("fixture has no local storage path")
	}
	stored, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(stored, imageData.Bytes()) {
		t.Fatalf("uploaded bytes disappeared or changed: %v", err)
	}
	var rows int
	if err := db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE storage_name=$1`, store.key).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	expectedRows := 1
	if mode == "before_commit" {
		expectedRows = 0
	}
	if rows != expectedRows {
		t.Fatalf("metadata rows=%d, want %d", rows, expectedRows)
	}
}

func TestUploadUnconfirmedMetadataNeverDeletesStoredBytes(t *testing.T) {
	for _, mode := range []string{"after_commit", "before_commit", "cancel_after_commit"} {
		t.Run(mode, func(t *testing.T) { exerciseUploadPersistence(t, mode) })
	}
}

func TestUploadConfirmedMetadataStillReturnsCreated(t *testing.T) {
	exerciseUploadPersistence(t, "success")
}
