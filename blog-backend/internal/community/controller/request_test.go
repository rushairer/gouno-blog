package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindCreateCommunityCommentRedactsMalformedRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, body := range []string{
		`{"content":{"sensitive-marker":"never-return-decoder-detail"}}`,
		`{"content":""}`,
		`{"content":`,
	} {
		w := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(w)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/posts/test/comments", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		if _, ok := bindCreateCommunityComment(ctx); ok {
			t.Fatalf("accepted malformed comment body: %q", body)
		}
		if w.Code != http.StatusBadRequest {
			t.Fatalf("unexpected status %d: %s", w.Code, w.Body.String())
		}
		var response struct {
			Message string `json:"message"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatalf("invalid response envelope: %v", err)
		}
		if response.Message != "invalid comment request" ||
			strings.Contains(w.Body.String(), "sensitive-marker") ||
			strings.Contains(w.Body.String(), "unmarshal") ||
			strings.Contains(w.Body.String(), "required") {
			t.Fatalf("decoder diagnostics leaked: %s", w.Body.String())
		}
	}
}

func TestBindCreateCommunityCommentPreservesValidInput(t *testing.T) {
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/posts/test/comments",
		strings.NewReader(`{"parent_id":12,"author":"Alice","content":"Hello"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	got, ok := bindCreateCommunityComment(ctx)
	if !ok || got.ParentID == nil || *got.ParentID != 12 || got.Author != "Alice" || got.Content != "Hello" {
		t.Fatalf("valid comment request changed: %+v, ok=%v, response=%s", got, ok, w.Body.String())
	}
}
