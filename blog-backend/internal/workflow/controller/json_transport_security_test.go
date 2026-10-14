package controller

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestWorkflowManagementJSONErrorsNeverReflectUserFieldsOrBusinessSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	const marker = "PRIVATE_WORKFLOW_PROMPT_OR_RESUME_TOKEN"
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
	}{
		{"create_workflow", ctrl.CreateWorkflow},
		{"draft_workflow", ctrl.DraftWorkflow},
		{"rollback_workflow", ctrl.RollbackWorkflow},
		{"retry_run", ctrl.RetryWorkflowRun},
		{"emit_workflow_event", ctrl.EmitWorkflowEvent},
		{"resolve_interaction", ctrl.ResolveInteraction},
		{"cancel_interaction", ctrl.CancelInteraction},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/workflow/"+tc.name,
				strings.NewReader(`{"`+marker+`":"secret-test-value"}`))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest || !c.IsAborted() {
				t.Fatalf("workflow accepted/reused unknown field: %d %s", rec.Code, rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, "invalid request body") ||
				strings.Contains(body, marker) || strings.Contains(body, "secret-test-value") {
				t.Fatalf("workflow controller exposed decoder/schema detail: %s", body)
			}
		})
	}
}

func TestWorkflowPayloadLimitsPreserveSafe413WithoutRawIOError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	for _, tc := range []struct {
		name string
		handler func(*gin.Context)
	}{
		{"draft", ctrl.DraftWorkflow},
		{"save", ctrl.CreateWorkflow},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/workflows",
				strings.NewReader(`{"prompt":"`+strings.Repeat("x", maxWorkflowJSONBody)+`"}`))
			tc.handler(c)
			if rec.Code != http.StatusRequestEntityTooLarge ||
				!strings.Contains(rec.Body.String(), "workflow request body exceeds 256 KiB") ||
				strings.Contains(rec.Body.String(), "http: request body too large") {
				t.Fatalf("workflow max-body contract regressed: status=%d body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowWebhookHeaderErrorsRemainTypedFixedAndUnauthenticated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("GOUNO_AI_WEBHOOK_SECRET", strings.Repeat("k", 32))
	ctrl := &Controller{}
	const injectedHeader = "private-untrusted-signature-payload"
	for _, tc := range []struct {
		name string
		sig string
		ts string
		wantStatus int
		wantMessage string
	}{
		{"bad_timestamp", "v1="+injectedHeader, injectedHeader, http.StatusBadRequest, "missing or invalid webhook timestamp"},
		{"missing_signature", "", strconv.FormatInt(time.Now().Unix(), 10), http.StatusBadRequest, "missing webhook signature"},
		{"invalid_hmac", strings.Repeat("0", 64), strconv.FormatInt(time.Now().Unix(), 10), http.StatusUnauthorized, "invalid webhook signature"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "event", Value: "post.updated"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/webhooks/workflows/post.updated",
				strings.NewReader(`{"event":"a harmless fixture"}`))
			c.Request.Header.Set("Idempotency-Key", "request-security-1")
			c.Request.Header.Set("X-Gouno-Timestamp", tc.ts)
			c.Request.Header.Set("X-Gouno-Signature", tc.sig)
			ctrl.ReceiveWorkflowWebhook(c)
			if rec.Code != tc.wantStatus ||
				!strings.Contains(rec.Body.String(), tc.wantMessage) ||
				strings.Contains(rec.Body.String(), injectedHeader) {
				t.Fatalf("webhook transport error mismatch: status=%d body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}
