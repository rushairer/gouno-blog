package controller

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindJSONPreservesStrictAgentTransportContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name string
		body string
	}{
		{name: "unknown field", body: `{"reason":"later","unknown":true}`},
		{name: "trailing object", body: `{"reason":"later"} {}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
			var req struct {
				Reason string `json:"reason" binding:"required"`
			}
			if err := bindJSON(c, &req); err == nil {
				t.Fatal("expected strict JSON binding error")
			}
		})
	}
}

func TestPrincipalIDRequiresPositiveLocalPrincipal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	if _, ok := principalID(c); ok {
		t.Fatal("missing principal must be rejected")
	}
	c.Set("blog_principal_id", int64(42))
	if got, ok := principalID(c); !ok || got != 42 {
		t.Fatalf("principal = %d, %v; want 42, true", got, ok)
	}
	c.Set("blog_principal_id", int64(0))
	if _, ok := principalID(c); ok {
		t.Fatal("non-positive principal must be rejected")
	}
}

func TestFlatAgentControllerDoesNotOwnOperationsHTTP(t *testing.T) {
	files := []string{
		"../../controller/agent_controller.go",
		"../../controller/agent_media_controller.go",
	}
	forbidden := []string{
		"internal/operations",
		"operations *operations.Service",
		"ListSuggestions(",
		"RefreshSuggestions(",
		"ListEditorialTasks(",
		"ListCandidateSets(",
		"SaveFeedback(",
		"OutcomeMetrics(",
	}
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(data)
		for _, value := range forbidden {
			if strings.Contains(text, value) {
				t.Errorf("flat Agent controller %s still owns Operations HTTP dependency/handler: %s", path, value)
			}
		}
	}
}
