package controllerutil

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestWriteJSONBindingErrorNeverReflectsUntrustedDecoderOrSchemaDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const marker = "PRIVATE_PROVIDER_KEY_OR_PROMPT_SHOULD_NEVER_REFLECT"
	for _, tc := range []struct {
		name           string
		err            error
		maxBodyMessage string
		wantStatus     int
		wantMessage    string
	}{
		{
			name: "unknown_JSON_property",
			err: fmt.Errorf("json: unknown field %q", marker),
			wantStatus: http.StatusBadRequest,
			wantMessage: "invalid request body",
		},
		{
			name: "internal_validation_cause",
			err: errors.New("PostgreSQL private DSN " + marker),
			wantStatus: http.StatusBadRequest,
			wantMessage: "invalid request body",
		},
		{
			name: "oversized_workflow_body",
			err: fmt.Errorf("%s: %w", marker, &http.MaxBytesError{Limit: 256 << 10}),
			maxBodyMessage: "workflow request body exceeds 256 KiB",
			wantStatus: http.StatusRequestEntityTooLarge,
			wantMessage: "workflow request body exceeds 256 KiB",
		},
		{
			name: "oversized_generic_body",
			err: &http.MaxBytesError{Limit: 1 << 20},
			wantStatus: http.StatusRequestEntityTooLarge,
			wantMessage: "request body too large",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai", nil)
			WriteJSONBindingError(c, tc.err, tc.maxBodyMessage)
			if rec.Code != tc.wantStatus || !c.IsAborted() {
				t.Fatalf("status=%d aborted=%t want=%d", rec.Code, c.IsAborted(), tc.wantStatus)
			}
			body := rec.Body.String()
			if !strings.Contains(body, tc.wantMessage) ||
				strings.Contains(body, marker) ||
				strings.Contains(body, "PostgreSQL") {
				t.Fatalf("untrusted parser/validator data leaked: %s", body)
			}
		})
	}
}
