package controller

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindAgentJSONRejectsUnknownFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"provider","unknown":true}`))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request

	var value providerRequest
	if err := bindAgentJSON(context, &value); err == nil {
		t.Fatal("expected unknown JSON field to be rejected")
	}
}

func TestBindAgentJSONRunsStructValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"provider"}`))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request

	var value providerRequest
	if err := bindAgentJSON(context, &value); err == nil {
		t.Fatal("expected required fields to be validated")
	}
}

func TestBindWorkflowJSONRejectsOversizedBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"prompt":"`+strings.Repeat("x", maxWorkflowJSONBody)+`"}`))
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request

	var value workflowDraftRequest
	if bindWorkflowJSON(context, &value) {
		t.Fatal("expected oversized workflow request to be rejected")
	}
	if recorder.Code != 413 {
		t.Fatalf("status = %d, want 413", recorder.Code)
	}
}
