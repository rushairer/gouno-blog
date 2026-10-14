package authbff

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func signedLogoutClaims(issuer, subject, sid, jti string, now time.Time) map[string]any {
	return map[string]any{
		"iss": issuer, "aud": "blog-bff",
		"iat": now.Unix(), "exp": now.Add(time.Hour).Unix(),
		"sub": subject, "sid": sid, "jti": jti,
		"events": map[string]any{
			"http://schemas.openid.net/event/backchannel-logout": map[string]any{},
		},
	}
}

func TestSignedBackchannelLogoutRevokesExactIssuerSIDAndRejectsReplay(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	for _, tc := range []struct{
		handle, issuer, subject, sid string
	}{
		{"first-session", f.server.URL, "subject-123", "sid-shared"},
		{"second-session", f.server.URL, "subject-123", "sid-other"},
		{"different-issuer", "https://unrelated-issuer.example", "subject-123", "sid-shared"},
	} {
		session := Session{
			Issuer: tc.issuer, Subject: tc.subject, SID: tc.sid,
			IDToken: "private-token", TokenExpiry: time.Now().Add(time.Hour),
			CreatedAt: time.Now(),
		}
		if err := store.PutSession(ctx, tc.handle, session, time.Hour); err != nil {
			t.Fatal(err)
		}
	}
	token := f.sign(t, signedLogoutClaims(f.server.URL, "subject-123", "sid-shared", "jti-1", time.Now()), "logout+jwt")
	if err := client.BackChannelLogout(ctx, token); err != nil {
		t.Fatalf("signed exact-SID backchannel logout failed: %v", err)
	}
	if _, err := store.GetSession(ctx, "first-session"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("matching issuer/SID session survived logout: %v", err)
	}
	for _, handle := range []string{"second-session", "different-issuer"} {
		if _, err := store.GetSession(ctx, handle); err != nil {
			t.Fatalf("logout affected different SID/issuer session %q: %v", handle, err)
		}
	}
	if err := client.BackChannelLogout(ctx, token); err != nil {
		t.Fatalf("identical signed logout token was not idempotently acknowledged: %v", err)
	}
	processed, err := store.IsLogoutTokenProcessed(ctx, "jti-1")
	if err != nil || !processed {
		t.Fatalf("signed logout replay marker not retained: processed=%v err=%v", processed, err)
	}
	// The SID-less sub fallback intentionally closes only this issuer's other
	// sessions and never any user under an independent identity domain.
	subToken := f.sign(t, signedLogoutClaims(f.server.URL, "subject-123", "", "jti-2", time.Now()), "logout+jwt")
	if err := client.BackChannelLogout(ctx, subToken); err != nil {
		t.Fatalf("subject-only signed logout failed: %v", err)
	}
	if _, err := store.GetSession(ctx, "second-session"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("same-issuer subject fallback failed: %v", err)
	}
	if _, err := store.GetSession(ctx, "different-issuer"); err != nil {
		t.Fatalf("different issuer was affected by subject logout: %v", err)
	}
}

func TestSignedBackchannelLogoutRequiresExactOIDCEventAndTokenType(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle := "protected-against-invalid-logout"
	s := Session{Issuer: f.server.URL, Subject: "subject-123", SID: "sid-protected", IDToken: "private-id"}
	if err := store.PutSession(ctx, handle, s, time.Hour); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		mutate func(map[string]any)
		typ string
	}{
		{"wrong_typ", nil, "JWT"},
		{"missing_jti", func(c map[string]any) { delete(c, "jti") }, "logout+jwt"},
		{"no_event", func(c map[string]any) { delete(c, "events") }, "logout+jwt"},
		{"missing_both_sub_and_sid", func(c map[string]any) { delete(c, "sub"); delete(c, "sid") }, "logout+jwt"},
		{"nonce_forbidden", func(c map[string]any) { c["nonce"] = "OIDC-logout-should-not-have-nonce" }, "logout+jwt"},
		{"stale_iat", func(c map[string]any) { c["iat"] = time.Now().Add(-6*time.Minute).Unix() }, "logout+jwt"},
		{"future_iat", func(c map[string]any) { c["iat"] = time.Now().Add(2*time.Minute).Unix() }, "logout+jwt"},
		{"wrong_audience", func(c map[string]any) { c["aud"] = "other-client" }, "logout+jwt"},
		{"wrong_issuer", func(c map[string]any) { c["iss"] = "https://other-issuer.example" }, "logout+jwt"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			claims := signedLogoutClaims(f.server.URL, s.Subject, s.SID, "invalid-"+tc.name, time.Now())
			if tc.mutate != nil {
				tc.mutate(claims)
			}
			raw := f.sign(t, claims, tc.typ)
			if err := client.BackChannelLogout(ctx, raw); err == nil {
				t.Fatal("cryptographically signed but semantically invalid logout token accepted")
			}
			if _, err := store.GetSession(ctx, handle); err != nil {
				t.Fatalf("invalid logout removed valid session: %v", err)
			}
		})
	}
}

func TestBackchannelLogoutDoesNotLieAboutRedisPersistenceFailure(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	if err := store.redis.Close(); err != nil {
		t.Fatal(err)
	}
	raw := f.sign(t, signedLogoutClaims(f.server.URL, "subject-123", "sid-1", "jti-closed-store", time.Now()), "logout+jwt")
	err := client.BackChannelLogout(context.Background(), raw)
	if !errors.Is(err, ErrBackchannelStoreFailure) {
		t.Fatalf("unavailable Redis was not classified as a secure persistence failure: %v", err)
	}
	// Both authentication and token verification are performed by the Client;
	// public responses remain bounded even if the internal cause contains
	// infrastructure details.
	writeToken := url.Values{"logout_token": {raw}}
	ginRouter := gin.New()
	client.RegisterRoutes(ginRouter)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/backchannel-logout",
		strings.NewReader(writeToken.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	ginRouter.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || rec.Header().Get("Cache-Control") != "no-store" ||
		strings.Contains(rec.Body.String(), "redis:") ||
		!strings.Contains(rec.Body.String(), "logout request could not be completed") {
		t.Fatalf("backchannel Redis failure leaked or reported success: %d %s", rec.Code, rec.Body.String())
	}
}
