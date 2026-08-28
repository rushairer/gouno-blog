package authbff

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func testBFFClientWithStore(t *testing.T) (*Client, *Store) {
	t.Helper()
	store, _ := testStore(t)
	cfg := Config{
		Issuer:        "https://sso.local.test",
		ClientID:      "blog-bff",
		ClientSecret:  "secret-123",
		RedirectURL:   "https://blog.local.test/api/auth/callback",
		PostLogoutURL: "https://blog.local.test/",
		Resource:      "https://blog.local.test/api",
	}
	cfg.ApplyDefaults()
	client := &Client{
		config:     cfg,
		store:      store,
		endSession: "https://sso.local.test/oidc/logout",
		flowNow:    time.Now,
	}
	return client, store
}

func TestMeHandler(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	router := gin.New()
	client.RegisterRoutes(router)

	// Case 1: Unauthenticated
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	var resp struct {
		Authenticated bool `json:"authenticated"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || resp.Authenticated {
		t.Fatalf("expected unauthenticated response, got %s", w.Body.String())
	}

	// Case 2: Authenticated
	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer:      "https://sso.local.test",
		Subject:     "user-123",
		SID:         "sid-abc",
		AccessToken: "acc-token",
		IDToken:     "id-token",
		TokenExpiry: time.Now().Add(time.Hour),
		Claims:      map[string]any{"email": "test@io84.com"},
		CreatedAt:   time.Now(),
	}
	if err := store.PutSession(ctx, handle, session, time.Hour); err != nil {
		t.Fatal(err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(&http.Cookie{
		Name:  client.config.SessionCookie,
		Value: handle,
	})
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	var authResp struct {
		Authenticated bool `json:"authenticated"`
		User          struct {
			ID     string         `json:"id"`
			Issuer string         `json:"issuer"`
			SID    string         `json:"sid"`
			Claims map[string]any `json:"claims"`
		} `json:"user"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &authResp); err != nil || !authResp.Authenticated {
		t.Fatalf("expected authenticated response, got %s", w.Body.String())
	}
	if authResp.User.ID != "user-123" || authResp.User.SID != "sid-abc" {
		t.Fatalf("user identity mismatch: %+v", authResp.User)
	}
}

func TestLogoutHandler(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	router := gin.New()
	client.RegisterRoutes(router)

	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer:      "https://sso.local.test",
		Subject:     "user-123",
		SID:         "sid-abc",
		AccessToken: "acc-token",
		IDToken:     "id-token-abc",
		TokenExpiry: time.Now().Add(time.Hour),
		CreatedAt:   time.Now(),
	}
	_ = store.PutSession(ctx, handle, session, time.Hour)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{
		Name:  client.config.SessionCookie,
		Value: handle,
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	var resp struct {
		OK        bool   `json:"ok"`
		LogoutURL string `json:"logout_url"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || !resp.OK {
		t.Fatalf("expected successful logout, got %s", w.Body.String())
	}
	if resp.LogoutURL == "" {
		t.Fatal("expected non-empty logout_url for RP-initiated logout")
	}

	// Verify session was deleted
	if _, err := store.GetSession(ctx, handle); err == nil {
		t.Fatal("session should have been deleted from store")
	}
}

func TestSessionMiddlewareInfiltration(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	router := gin.New()
	router.Use(client.SessionMiddleware())
	router.GET("/protected", func(c *gin.Context) {
		claims, ok := c.Get("claims")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "no claims"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"claims": claims})
	})

	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer:      "https://sso.local.test",
		Subject:     "user-123",
		AccessToken: "acc-token",
		IDToken:     "id-token-abc",
		TokenExpiry: time.Now().Add(time.Hour),
		Claims:      map[string]any{"email": "user@io84.com"},
		CreatedAt:   time.Now(),
	}
	_ = store.PutSession(ctx, handle, session, time.Hour)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(&http.Cookie{
		Name:  client.config.SessionCookie,
		Value: handle,
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (%s)", w.Code, w.Body.String())
	}
}
