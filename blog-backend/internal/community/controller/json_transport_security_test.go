package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// Keep the existing localized public comment creation errors; harden only
// explicit moderation/report/notification binder paths that historically
// returned raw Gin decoder text.
func TestCommunityBindingErrorsStayBoundedAndPreserveBadRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := NewCommunityController(nil, nil, strings.Repeat("k", 32), nil)
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
		payload string
	}{
		{"report_comment", ctrl.ReportComment, `{"reason":{"PRIVATE_REPORT_REASON":"secret"}}`},
		{"batch_delete_notifications", ctrl.BatchDeleteNotifications, `{"ids":"PRIVATE_NOTIFICATION_IDS"}`},
		{"moderate_comment", ctrl.ModerateComment, `{"status":123}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Set("blog_principal_id", int64(17))
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/community/"+tc.name,
				strings.NewReader(tc.payload))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest || !c.IsAborted() {
				t.Fatalf("bad Community JSON was not rejected: %d %s", rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, "invalid request body") ||
				strings.Contains(body, "PRIVATE_REPORT_REASON") ||
				strings.Contains(body, "PRIVATE_NOTIFICATION_IDS") ||
				strings.Contains(body, "cannot unmarshal") ||
				strings.Contains(body, "reportCommentRequest") {
				t.Fatalf("Community exposed decoder or schema details: %s", body)
			}
		})
	}
}
