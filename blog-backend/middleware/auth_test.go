package middleware

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
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
	router.GET("/admin", AuthMiddlewareWithOptions(verifier, AuthOptions{
		RequiredRole: "admin",
		Issuer:       "test-issuer",
		Audience:     "test-audience",
		ClientID:     "test-client-id",
	}), func(ctx *gin.Context) {
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

func TestJWTVerifier_SingleflightAndCooldown(t *testing.T) {
	requestCount := 0
	var mu sync.Mutex
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	// Mock JWKS server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requestCount++
		mu.Unlock()

		nBytes := privateKey.N.Bytes()
		eBytes := big.NewInt(int64(privateKey.E)).Bytes()
		jwks := JWKS{
			Keys: []JWK{
				{
					Kty: "RSA",
					Use: "sig",
					Alg: "RS256",
					Kid: "test-key",
					N:   base64.RawURLEncoding.EncodeToString(nBytes),
					E:   base64.RawURLEncoding.EncodeToString(eBytes),
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	defer server.Close()

	verifier := &JWTVerifier{
		jwksURL: server.URL,
		keys:    make(map[string]*rsa.PublicKey),
	}

	// Trigger concurrent key refreshes
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = verifier.refreshKeys()
		}()
	}
	wg.Wait()

	mu.Lock()
	countBefore := requestCount
	mu.Unlock()

	if countBefore != 1 {
		t.Errorf("expected exactly 1 HTTP request due to singleflight, got %d", countBefore)
	}

	// A sequential request immediately after should be ignored due to cooldown
	err = verifier.refreshKeys()
	if err != nil {
		t.Fatalf("refreshKeys: %v", err)
	}

	mu.Lock()
	countAfter := requestCount
	mu.Unlock()

	if countAfter != 1 {
		t.Errorf("expected request count to remain 1 due to cooldown, got %d", countAfter)
	}
}
