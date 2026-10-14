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
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
)

func TestRealSignedOIDCCallbackEstablishesServerOnlySessionAndMFAEvidence(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle, flow, query := f.beginCode(t, client, "/admin/ai-ops")
	router := gin.New()
	client.RegisterRoutes(router)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback?"+query.Encode(), nil)
	req.AddCookie(&http.Cookie{Name: client.config.FlowCookie, Value: handle})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != flow.ReturnTo ||
		rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("signed callback did not establish a server-side login: %d %#v %s", rec.Code, rec.Header(), rec.Body.String())
	}
	var sessionCookie *http.Cookie
	clearedFlow := false
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == client.config.FlowCookie && cookie.MaxAge < 0 {
			clearedFlow = true
		}
		if cookie.Name == client.config.SessionCookie {
			sessionCookie = cookie
		}
	}
	if !clearedFlow || sessionCookie == nil || !sessionCookie.Secure ||
		!sessionCookie.HttpOnly || sessionCookie.Domain != "" ||
		sessionCookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("callback lost confidential browser-cookie policy: %#v", rec.Result().Cookies())
	}
	stored, err := store.GetSession(ctx, sessionCookie.Value)
	if err != nil || stored.Subject != "subject-123" ||
		stored.RefreshToken != "private-refresh-token" {
		t.Fatalf("confidential BFF session was not saved: %#v err=%v", stored, err)
	}
	evidence, err := store.GetRecentMFA(ctx, sessionCookie.Value)
	if err != nil || evidence.AuthTime <= 0 || len(evidence.AMR) == 0 {
		t.Fatalf("signed interactive callback did not establish owned MFA evidence: %#v err=%v", evidence, err)
	}

	// A browser sees only a host-only opaque session handle. Neither /me nor
	// middleware claims can disclose the server-side provider credentials.
	check := gin.New()
	check.Use(client.SessionMiddleware())
	check.GET("/protected", func(c *gin.Context) {
		claimsRaw, ok := c.Get("claims")
		claims, valid := claimsRaw.(jwt.MapClaims)
		if !ok || !valid || !access.RecentMFA(claims, time.Now()) ||
			claims["iss"] != f.server.URL || claims["sub"] != stored.Subject {
			c.Status(http.StatusForbidden)
			return
		}
		if _, ok := claims["access_token"]; ok {
			c.Status(http.StatusInternalServerError)
			return
		}
		c.JSON(http.StatusOK, gin.H{"subject": claims["sub"], "acr": claims["acr"]})
	})
	protected := httptest.NewRequest(http.MethodGet, "/protected", nil)
	protected.AddCookie(sessionCookie)
	protectedRec := httptest.NewRecorder()
	check.ServeHTTP(protectedRec, protected)
	if protectedRec.Code != http.StatusOK || strings.Contains(protectedRec.Body.String(), stored.RefreshToken) {
		t.Fatalf("BFF middleware leaked session credentials or lost recent MFA: %d %s", protectedRec.Code, protectedRec.Body.String())
	}
	me := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	me.AddCookie(sessionCookie)
	meRec := httptest.NewRecorder()
	router.ServeHTTP(meRec, me)
	if meRec.Code != http.StatusOK || strings.Contains(meRec.Body.String(), stored.IDToken) ||
		strings.Contains(meRec.Body.String(), stored.RefreshToken) ||
		!strings.Contains(meRec.Body.String(), "\"authenticated\":true") {
		t.Fatalf("/me leaked server-side identity tokens: %d %s", meRec.Code, meRec.Body.String())
	}
}

func TestSignedStepUpCallbackChangesHandleButNotAbsoluteSessionLifetime(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	firstHandle, _, firstQuery := f.beginCode(t, client, "/admin")
	oldHandle, initial, _, err := client.Complete(ctx, firstHandle, firstQuery)
	if err != nil {
		t.Fatal(err)
	}
	oldEvidence := RecentMFAEvidence{AuthTime: time.Now().Add(-time.Minute).Unix(), AMR: []string{"webauthn"}, RecordedAt: time.Now().UTC()}
	if err := store.PutRecentMFA(ctx, oldHandle, oldEvidence, 4*time.Minute); err != nil {
		t.Fatal(err)
	}
	flowHandle, _, err := client.BeginStepUp(ctx, oldHandle, "/admin")
	if err != nil {
		t.Fatal(err)
	}
	flow, err := store.PeekFlow(ctx, flowHandle)
	if err != nil {
		t.Fatal(err)
	}
	f.setClaims(flow.Nonce, initial.Subject, client.config.RequiredACR)

	router := gin.New()
	client.RegisterRoutes(router)
	callback := url.Values{"state": {flow.State}, "iss": {f.server.URL}, "code": {"fresh-step-up-code"}}
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback?"+callback.Encode(), nil)
	req.AddCookie(&http.Cookie{Name: client.config.FlowCookie, Value: flowHandle})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("signed step-up browser callback failed: %d %s", rec.Code, rec.Body.String())
	}
	var freshCookie *http.Cookie
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == client.config.SessionCookie {
			freshCookie = cookie
		}
	}
	if freshCookie == nil || freshCookie.Value == oldHandle {
		t.Fatal("step-up did not rotate the opaque session handle")
	}
	next, err := store.GetSession(ctx, freshCookie.Value)
	if err != nil || !next.CreatedAt.Equal(initial.CreatedAt) {
		t.Fatalf("step-up extended absolute session lifetime: %#v err=%v", next, err)
	}
	if _, err := store.GetSession(ctx, oldHandle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old step-up session remained active: %v", err)
	}
	if _, err := store.GetRecentMFA(ctx, oldHandle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("step-up failed to invalidate old-handle MFA evidence: %v", err)
	}
	if _, err := store.GetRecentMFA(ctx, freshCookie.Value); err != nil {
		t.Fatalf("step-up did not bind MFA freshness to the rotated handle: %v", err)
	}
}

func TestOIDCRefreshHTTPResponseNeverReturnsTokens(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle := "http-refresh-secure-session"
	old := Session{
		Issuer: f.server.URL, Subject: "subject-123", RefreshToken: "old-private-refresh",
		IDToken: "old-private-id-token", AccessToken: "old-private-access",
		TokenExpiry: time.Now().Add(time.Second), CreatedAt: time.Now(),
	}
	if err := store.PutSession(ctx, handle, old, time.Hour); err != nil {
		t.Fatal(err)
	}
	f.setClaims("nonce-not-used-in-refresh", old.Subject, client.config.RequiredACR)
	router := gin.New()
	client.RegisterRoutes(router)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: handle})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("confidential refresh handler failed: %d %s", rec.Code, rec.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil || payload["ok"] != true ||
		len(payload) != 2 || payload["expires_at"] == nil {
		t.Fatalf("refresh response unexpectedly exposes provider fields: %#v err=%v", payload, err)
	}
	current, err := store.GetSession(ctx, handle)
	if err != nil || current.AccessToken != "private-access-token" || current.Subject != old.Subject {
		t.Fatalf("refresh failed to replace encrypted session: %#v err=%v", current, err)
	}
	if f.refreshRequests.Load() != 1 || f.codeRequests.Load() != 0 {
		t.Fatalf("HTTP refresh used unexpected provider grants: refresh=%d code=%d", f.refreshRequests.Load(), f.codeRequests.Load())
	}
}
