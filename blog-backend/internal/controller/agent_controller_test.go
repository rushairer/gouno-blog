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
