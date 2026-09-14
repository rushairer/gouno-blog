package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/domain"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHumanTemplateBindingUsesAuthenticatedActor(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, body := range []string{`{"creation_origin":"system","created_by_principal_id":999}`, `{"creation_origin":"legacy","created_by_principal_id":null}`, `{}`} {
		for _, kind := range []string{"agent", "skill", "workflow"} {
			t.Run(kind+body, func(t *testing.T) {
				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				c.Request = httptest.NewRequest("POST", "/", strings.NewReader(body))
				c.Set("blog_principal_id", int64(42))
				var value any
				switch kind {
				case "agent":
					value = &domain.Agent{}
				case "skill":
					value = &domain.AgentSkill{}
				case "workflow":
					value = &domain.Workflow{}
				}
				if err := bindHumanTemplateJSON(c, value); err != nil {
					t.Fatal(err)
				}
				var principal *int64
				var origin string
				switch v := value.(type) {
				case *domain.Agent:
					principal = v.CreatedByPrincipalID
					origin = v.CreationOrigin
				case *domain.AgentSkill:
					principal = v.CreatedByPrincipalID
					origin = v.CreationOrigin
				case *domain.Workflow:
					principal = v.CreatedByPrincipalID
					origin = v.CreationOrigin
				}
				if principal == nil || *principal != 42 || origin != "" {
					t.Fatal("request forged attribution")
				}
			})
		}
	}
}

func TestHumanTemplateBindingRequiresAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/", strings.NewReader(`{"created_by_principal_id":42,"creation_origin":"system"}`))
	if err := bindHumanTemplateJSON(c, &domain.AgentSkill{}); err == nil || c.Writer.Status() != 401 {
		t.Fatal("request supplied identity accepted")
	}
}
