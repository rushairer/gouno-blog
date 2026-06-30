package middleware

import (
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func setupAuthTestRouter(t *testing.T, roles []string) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := &JWTVerifier{
		keys: map[string]*rsa.PublicKey{"test-key": &privateKey.PublicKey},
	}

	router := gin.New()
	router.GET("/admin", AuthMiddlewareWithOptions(verifier, AuthOptions{RequiredRole: "admin"}), func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":   "user-1",
		"roles": roles,
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}

	return router, tokenString
}

func TestAuthMiddlewareMissingHeaderReturnsUnauthorized(t *testing.T) {
	router, _ := setupAuthTestRouter(t, []string{"admin"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareWithoutRequiredRoleReturnsForbidden(t *testing.T) {
	router, token := setupAuthTestRouter(t, []string{"user"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareWithRequiredRoleAllowsRequest(t *testing.T) {
	router, token := setupAuthTestRouter(t, []string{"admin"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}
}
