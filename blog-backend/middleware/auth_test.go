package middleware

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	auth "github.com/rushairer/gouno/auth"
)

func serveJWKS(t *testing.T, key *rsa.PublicKey) *httptest.Server {
	t.Helper()
	jwks := auth.JWKS{Keys: []auth.JWK{{
		Kty: "RSA",
		Use: "sig",
		Alg: "RS256",
		Kid: "test-key",
		N:   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}}}
	body, err := json.Marshal(jwks)
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	return server
}

func setupAuthTestRouter(t *testing.T, roles []string) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	verifier := auth.NewVerifier(serveJWKS(t, &privateKey.PublicKey).URL)

	router := gin.New()
	router.GET("/admin", AuthMiddlewareWithOptions(verifier, AuthOptions{
		RequiredRole: "admin",
		Issuer:       "test-issuer",
		Audience:     "test-audience",
		ClientID:     "test-client-id",
	}), func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})
	router.GET("/optional", OptionalAuth(verifier, AuthOptions{
		Issuer: "test-issuer", Audience: "test-audience", ClientID: "test-client-id",
	}), func(ctx *gin.Context) {
		if subject, _ := ctx.Get("account_id"); subject == "user-1" {
			ctx.Status(http.StatusNoContent)
			return
		}
		ctx.Status(http.StatusUnauthorized)
	})
	router.GET("/optional-anonymous", OptionalAuth(verifier, AuthOptions{
		Issuer: "test-issuer", Audience: "test-audience", ClientID: "test-client-id",
	}), func(ctx *gin.Context) {
		if _, authenticated := ctx.Get("account_id"); authenticated {
			ctx.Status(http.StatusInternalServerError)
			return
		}
		ctx.Status(http.StatusNoContent)
	})

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":       "user-1",
		"roles":     roles,
		"iss":       "test-issuer",
		"aud":       "test-audience",
		"azp":       "test-client-id",
		"client_id": "test-client-id",
		"exp":       time.Now().Add(time.Hour).Unix(),
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

func TestAuthMiddlewareRejectsBearerWithoutBFFSession(t *testing.T) {
	router, token := setupAuthTestRouter(t, []string{"user"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body=%s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); body == "" || !strings.Contains(body, "BFF session") || strings.Contains(body, "roles") {
		t.Fatalf("Bearer rejection must stay generic, body=%s", body)
	}
}

func TestAuthMiddlewareDoesNotAcceptValidBearerToken(t *testing.T) {
	router, token := setupAuthTestRouter(t, []string{"admin"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareAcceptsPreAttachedBFFClaims(t *testing.T) {
	router, _ := setupAuthTestRouter(t, []string{"admin"})
	router.GET("/admin-bff", func(ctx *gin.Context) {
		ctx.Set("claims", jwt.MapClaims{
			"sub":   "user-bff-1",
			"roles": []any{"admin"},
		})
		ctx.Next()
	}, AuthMiddlewareWithOptions(auth.NewVerifier("http://127.0.0.1:1/jwks"), AuthOptions{
		RequiredRole: "admin",
		Issuer:       "test-issuer",
		Audience:     "test-audience",
		ClientID:     "test-client-id",
	}), func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin-bff", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareRejectsTokenWithoutConfiguredAudience(t *testing.T) {
	gin.SetMode(gin.TestMode)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	verifier := auth.NewVerifier(serveJWKS(t, &privateKey.PublicKey).URL)
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": "user-1", "roles": []string{"admin"}, "iss": "test-issuer", "exp": time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.GET("/admin", AuthMiddlewareWithOptions(verifier, AuthOptions{
		RequiredRole: "admin", Issuer: "test-issuer", Audience: "test-audience", ClientID: "test-client-id",
	}), func(ctx *gin.Context) { ctx.Status(http.StatusNoContent) })
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body=%s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "BFF session") || strings.Contains(body, "audience") {
		t.Fatalf("Bearer rejection must not expose verification detail, body=%s", body)
	}
}

func TestOptionalAuthIgnoresAnonymousRequests(t *testing.T) {
	router, _ := setupAuthTestRouter(t, []string{"admin"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/optional-anonymous", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 for anonymous public request; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthMiddlewareRejectsCookieAuthentication(t *testing.T) {
	router, token := setupAuthTestRouter(t, []string{"admin"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(&http.Cookie{Name: "__Host-access_token", Value: token})
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("cookie was unexpectedly accepted by AuthMiddleware: status=%d", rec.Code)
	}
}
