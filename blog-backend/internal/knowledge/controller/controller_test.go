package controller

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindJSONPreservesStrictKnowledgeTransportContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, body := range []string{`{"name":"x","unknown":true}`, `{"name":"x"} {}`} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("POST", "/", strings.NewReader(body))
		var req struct {
			Name string `json:"name" binding:"required"`
		}
		if err := bindJSON(c, &req); err == nil {
			t.Fatalf("expected strict JSON rejection for %q", body)
		}
	}
}

func TestKnowledgeControllerOwnsKnowledgeTransportOnly(t *testing.T) {
	data, err := os.ReadFile("controller.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{"internal/connector", "connector.Service", "AgentController"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("Knowledge controller crossed ownership boundary: %s", forbidden)
		}
	}
	for _, required := range []string{"*knowledge.Service", "ListEmbeddingProfiles", "ListIndexContent", "SearchIndex", "EvaluateIndex"} {
		if !strings.Contains(text, required) {
			t.Fatalf("Knowledge controller missing canonical transport marker: %s", required)
		}
	}
}
