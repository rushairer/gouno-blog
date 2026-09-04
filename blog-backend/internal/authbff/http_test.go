package authbff

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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
		PostLogoutURL: "https://blog.local.test/api/auth/logout/callback",
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

func TestLogoutCallbackConsumesStateOnce(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	logoutURL, err := client.LogoutURL(context.Background(), Session{}, "")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(logoutURL)
	if err != nil {
		t.Fatal(err)
	}
	state := parsed.Query().Get("state")
	if state == "" {
		t.Fatal("logout state is missing")
	}
	router := gin.New()
	client.RegisterRoutes(router)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/logout/callback?state="+url.QueryEscape(state), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/" {
		t.Fatalf("unexpected callback response: %d %q", w.Code, w.Header().Get("Location"))
	}
	if err := store.TakeLogoutState(context.Background(), state); err == nil {
		t.Fatal("logout state should have been consumed")
	}
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
	if authResp.User.ID != "user-123" || authResp.User.Issuer != "https://sso.local.test" || authResp.User.SID != "" || len(authResp.User.Claims) != 0 {
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
	if strings.Contains(resp.LogoutURL, "id_token_hint") || strings.Contains(resp.LogoutURL, "id-token-abc") {
		t.Fatalf("logout_url must NOT leak id_token_hint into browser URL: %s", resp.LogoutURL)
	}
	if !strings.Contains(resp.LogoutURL, "client_id=") || !strings.Contains(resp.LogoutURL, "post_logout_redirect_uri=") {
		t.Fatalf("logout_url missing standard RP logout parameters: %s", resp.LogoutURL)
	}
	if !strings.Contains(resp.LogoutURL, "state=") {
		t.Fatalf("logout_url must include state parameter for CSRF protection: %s", resp.LogoutURL)
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

func TestSessionMiddlewareRejectsSessionPastAbsoluteLifetime(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	client.config.SessionTTL = time.Hour
	client.flowNow = func() time.Time { return time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC) }
	router := gin.New()
	router.Use(client.SessionMiddleware())
	router.GET("/protected", func(c *gin.Context) {
		if _, ok := c.Get("claims"); ok {
			c.Status(http.StatusOK)
			return
		}
		c.Status(http.StatusUnauthorized)
	})

	handle, _ := RandomHandle()
	session := Session{
		Issuer: "https://sso.local.test", Subject: "user-123", IDToken: "id-token",
		TokenExpiry: client.flowNow().Add(time.Hour), CreatedAt: client.flowNow().Add(-2 * time.Hour),
	}
	if err := store.PutSession(context.Background(), handle, session, 4*time.Hour); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: handle})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expired absolute session was accepted: %d", w.Code)
	}
	if _, err := store.GetSession(context.Background(), handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired session was not deleted: %v", err)
	}
}

func TestRefreshRejectsSessionPastAbsoluteLifetime(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	client.config.SessionTTL = time.Hour
	client.flowNow = func() time.Time { return time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC) }
	handle, _ := RandomHandle()
	session := Session{
		Issuer: "https://sso.local.test", Subject: "user-123", AccessToken: "still-fresh",
		RefreshToken: "refresh-token", IDToken: "id-token",
		TokenExpiry: client.flowNow().Add(time.Hour), CreatedAt: client.flowNow().Add(-2 * time.Hour),
	}
	if err := store.PutSession(context.Background(), handle, session, 4*time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Refresh(context.Background(), handle); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh accepted a session past its absolute lifetime: %v", err)
	}
}

func TestLogoutFailsClosedWhenSessionStoreIsUnavailable(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	if err := store.redis.Close(); err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	client.RegisterRoutes(router)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: "stolen-session-handle"})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("logout reported success while the session store was unavailable: %d %s", w.Code, w.Body.String())
	}
	if len(w.Result().Cookies()) == 0 || w.Result().Cookies()[0].MaxAge >= 0 {
		t.Fatal("logout must clear the browser cookie even when server-side deletion needs a retry")
	}
}

func TestConcurrentRefresh_AlreadyRefreshed(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer:       "https://sso.local.test",
		Subject:      "user-123",
		AccessToken:  "acc-token-fresh",
		RefreshToken: "ref-token-123",
		IDToken:      "id-token-abc",
		TokenExpiry:  time.Now().Add(10 * time.Minute), // Fresh token!
		Claims:       map[string]any{"email": "user@io84.com"},
		CreatedAt:    time.Now(),
	}
	_ = store.PutSession(ctx, handle, session, time.Hour)

	// Since token is fresh (valid > 30s into future), Refresh returns it immediately without remote call
	refreshed, err := client.Refresh(ctx, handle)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if refreshed.AccessToken != "acc-token-fresh" {
		t.Fatalf("expected cached access token, got %s", refreshed.AccessToken)
	}
}

func TestStepUpMfaHandler(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	router := gin.New()
	client.RegisterRoutes(router)

	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer:      client.config.Issuer,
		Subject:     "user-123",
		AccessToken: "acc-token-valid",
		IDToken:     "id-token-valid",
		TokenExpiry: time.Now().Add(time.Hour),
		CreatedAt:   time.Now(),
	}
	if err := store.PutSession(ctx, handle, session, time.Hour); err != nil {
		t.Fatalf("failed to put test session: %v", err)
	}

	// Step-up is a browser navigation to the OIDC provider, never a JSON MFA
	// code submission to the BFF.
	req := httptest.NewRequest(http.MethodGet, "/api/auth/mfa/step-up?return_to=/admin", nil)
	req.AddCookie(&http.Cookie{
		Name:  client.config.SessionCookie,
		Value: handle,
	})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d: %s", w.Code, w.Body.String())
	}
	location := w.Header().Get("Location")
	if !strings.Contains(location, "acr_values=urn%3Agouno%3Aaal2") || !strings.Contains(location, "max_age=600") || !strings.Contains(location, "login_hint=user-123") {
		t.Fatalf("step-up authorization request lacks strong-auth parameters: %q", location)
	}
	if len(w.Result().Cookies()) != 1 || w.Result().Cookies()[0].Name != client.config.FlowCookie {
		t.Fatalf("expected a temporary BFF flow cookie, got %#v", w.Result().Cookies())
	}
}
