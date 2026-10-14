package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAIOperationsControllersDoNotReflectJSONFieldsOrPromptSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	// An unknown JSON property is embedded in Go decoder errors. These routes
	// must reject it BEFORE touching a Provider, store, Approval or Workflow.
	const marker = "PRIVATE_API_KEY_OR_AI_PROMPT_UNTRUSTED_FIELD"
	ctrl := &Controller{}
	cases := []struct {
		name string
		handler func(*gin.Context)
	}{
		{"save_provider", ctrl.CreateProvider},
		{"import_skill", ctrl.ImportSkill},
		{"save_skill", ctrl.CreateSkill},
		{"copy_skill", ctrl.CopySkill},
		{"save_agent", ctrl.CreateAgent},
		{"run_agent", ctrl.RunAgent},
		{"review_approval", ctrl.Approve},
		{"reject_approval", ctrl.Reject},
		{"review_media", ctrl.ReviewMediaCandidate},
		{"attach_media", ctrl.AttachMediaAsset},
		{"generate_media_candidate", ctrl.GenerateMediaCandidate},
		{"select_image_task", ctrl.SelectImageTask},
		{"select_workflow_image_tasks", ctrl.SelectWorkflowImageTasks},
		{"apply_workflow_image_tasks", ctrl.ApplyWorkflowImageTasks},
		{"reject_workflow_image_tasks", ctrl.RejectWorkflowImageTasks},
		{"generate_editor_image", ctrl.GenerateImage},
		{"draft_assist", ctrl.DraftAssist},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/"+tc.name,
				strings.NewReader(`{"`+marker+`":"private-credential"}`))
			tc.handler(c)
			if rec.Code != http.StatusBadRequest || !c.IsAborted() {
				t.Fatalf("invalid body not rejected: status=%d aborted=%t body=%s", rec.Code, c.IsAborted(), rec.Body.String())
			}
			body := rec.Body.String()
			if !strings.Contains(body, "invalid request body") ||
				strings.Contains(body, marker) || strings.Contains(body, "private-credential") {
				t.Fatalf("untrusted JSON detail reflected from %s: %s", tc.name, body)
			}
		})
	}
}

func TestProviderImportRejectsMalformedAndOversizedSecretsWithoutStorageSideEffects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	const secret = "SUPER_SECRET_PROVIDER_API_KEY_MUST_NOT_REFLECT"
	cases := []struct {
		name string
		payload string
		want int
		message string
	}{
		{
			"invalid_provider_array",
			`[{"name":42,"api_key":"`+secret+`"}]`,
			http.StatusBadRequest,
			"invalid request body",
		},
		{
			"oversized_provider_array",
			"[" + strings.Repeat(" ", maxProviderImportBody+1) + "]",
			http.StatusRequestEntityTooLarge,
			"provider import payload exceeds 1 MiB",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/providers/import", strings.NewReader(tc.payload))
			ctrl.ImportProviders(c)
			if rec.Code != tc.want || !c.IsAborted() {
				t.Fatalf("status=%d aborted=%t want=%d", rec.Code, c.IsAborted(), tc.want)
			}
			body := rec.Body.String()
			if !strings.Contains(body, tc.message) || strings.Contains(body, secret) {
				t.Fatalf("unsafe provider-import failure: %s", body)
			}
		})
	}
}

func TestAIAgentAndWorkflowPayloadLimitsKeep413WithoutEchoingInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctrl := &Controller{}
	for _, tc := range []struct {
		name string
		payload string
		handler func(*gin.Context)
		wantText string
	}{
		{"run_agent", `{"input":"`+strings.Repeat("x", 64<<10)+`"}`, ctrl.RunAgent, "request body too large"},
		{"workflow", `{"prompt":"`+strings.Repeat("x", maxWorkflowJSONBody)+`"}`, func(c *gin.Context) {
			var req workflowDraftRequest
			if bindWorkflowJSON(c, &req) {
				t.Fatal("over-limit Agent workflow body accepted")
			}
		}, "workflow request body exceeds 256 KiB"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Params = gin.Params{{Key: "id", Value: "1"}}
			c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/ai/"+tc.name, strings.NewReader(tc.payload))
			tc.handler(c)
			if rec.Code != http.StatusRequestEntityTooLarge ||
				!strings.Contains(rec.Body.String(), tc.wantText) ||
				strings.Contains(rec.Body.String(), "http: request body too large") {
				t.Fatalf("oversized request response changed: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
