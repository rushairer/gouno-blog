package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// Invalid limits must be rejected before accessing backend services. This
// prevents expensive or unbounded operational report reads.
func TestMediaReconciliationRejectsUnboundedOrInvalidLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	r := gin.New()
	r.GET("/triage", ctrl.ListMediaGenerationReconciliation)
	for _, query := range []string{"?limit=0", "?limit=101", "?limit=-1", "?limit=all", "?limit=1.5"} {
		t.Run(query, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/triage"+query, nil))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("limit %q returned HTTP %d, want 400", query, w.Code)
			}
		})
	}
}
