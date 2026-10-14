package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// Operations requests may include private review and feedback text. Known
// invalid payloads must be rejected before any persistence mutation and their
// decoder/validator errors must not be serialized into API JSON.
func TestOperationsAdminBindingRedactsPrivateJSONProperties(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	const privateField = "PRIVATE_EDITORIAL_APPROVAL_CONTENT_NEVER_RETURN"
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
	}{
		{"ignore_suggestion", ctrl.IgnoreSuggestion},
		{"update_editorial_task_status", ctrl.UpdateEditorialTaskStatus},
		{"select_candidate", ctrl.SelectCandidate},
		{"save_ai_feedback", ctrl.SaveFeedback},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/operations/"+tc.name,
				strings.NewReader(`{"`+privateField+`":"confidential-reason"}`))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest || !c.IsAborted() {
				t.Fatalf("invalid Operations request crossed service boundary: status=%d body=%s", rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, "invalid request body") ||
				strings.Contains(body, privateField) ||
				strings.Contains(body, "confidential-reason") {
				t.Fatalf("Operations JSON error reflected private content: %s", body)
			}
		})
	}
}
