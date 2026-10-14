package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// Embedding profiles carry Provider API keys. Decoder diagnostics must never
// become a public schema-disclosure or credential-echo channel.
func TestKnowledgeAdminJSONEndpointsRedactUnknownFieldsBeforeServiceWork(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	const privateProperty = "PRIVATE_EMBEDDING_API_KEY_FIELD_NOT_PUBLIC"
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
	}{
		{"create_profile", ctrl.CreateEmbeddingProfile},
		{"update_profile", ctrl.UpdateEmbeddingProfile},
		{"replace_evaluation_cases", ctrl.ReplaceIndexEvaluation},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/knowledge/"+tc.name,
				strings.NewReader(`{"`+privateProperty+`":"secret-private-value"}`))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest || !c.IsAborted() {
				t.Fatalf("unknown field was not rejected before service dispatch: %d %s", rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, "invalid request body") ||
				strings.Contains(body, privateProperty) || strings.Contains(body, "secret-private-value") ||
				strings.Contains(body, "json: unknown field") {
				t.Fatalf("Knowledge admin reflected decoder/secret data: %s", body)
			}
		})
	}
}
