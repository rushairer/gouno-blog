package authbff

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tink-crypto/tink-go/v2/aead"
	"github.com/tink-crypto/tink-go/v2/insecurecleartextkeyset"
	"github.com/tink-crypto/tink-go/v2/keyset"
)

func TestBFFKeysetSecretFileMustBeReadableValidAndAEAD(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing-secret.json")
	if value, err := LoadAEAD(missing); err == nil || value != nil {
		t.Fatal("BFF accepted absent keyset instead of failing startup closed")
	}
	invalid := filepath.Join(t.TempDir(), "malformed-secret.json")
	if err := os.WriteFile(invalid, []byte("{invalid-json"), 0600); err != nil {
		t.Fatal(err)
	}
	if value, err := LoadAEAD(invalid); err == nil || value != nil {
		t.Fatal("BFF accepted malformed key material")
	}
	handle, err := keyset.NewHandle(aead.AES256GCMKeyTemplate())
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := insecurecleartextkeyset.Write(handle, keyset.NewJSONWriter(&buf)); err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(t.TempDir(), "runtime-secret.json")
	if err := os.WriteFile(keyPath, buf.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	primitive, err := LoadAEAD(keyPath)
	if err != nil {
		t.Fatalf("valid mounted BFF keyset rejected: %v", err)
	}
	plaintext := []byte("server-side-refresh-token")
	ciphertext, err := primitive.Encrypt(plaintext, []byte("identity-bound-AAD"))
	if err != nil {
		t.Fatal(err)
	}
	actual, err := primitive.Decrypt(ciphertext, []byte("identity-bound-AAD"))
	if err != nil || !bytes.Equal(actual, plaintext) {
		t.Fatalf("Tink AEAD keyset failed actual encryption: %v", err)
	}
	if _, err := primitive.Decrypt(ciphertext, []byte("different-session")); err == nil {
		t.Fatal("keyset loaded but failed to authenticate record associated data")
	}
}

func TestBFFLoginStartRequiresSafeReturnAndOpaqueFlowCookie(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	router := gin.New()
	client.RegisterRoutes(router)
	before, err := store.redis.DBSize(context.Background()).Result()
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []string{"https://evil.example/", "//evil.example/", "javascript:alert(1)", "/%5c%5cevil.example"} {
		request := httptest.NewRequest(http.MethodGet, "/api/auth/login?return_to="+url.QueryEscape(input), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, request)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "unable to start login") {
			t.Fatalf("unsafe return_to accepted: %q -> %d %s", input, rec.Code, rec.Body.String())
		}
	}
	after, err := store.redis.DBSize(context.Background()).Result()
	if err != nil || after != before {
		t.Fatalf("unsafe return target allocated login state: before=%d after=%d err=%v", before, after, err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/auth/login?return_to=%2Fadmin", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("safe login navigation failed: %d %s", rec.Code, rec.Body.String())
	}
	location, err := url.Parse(rec.Header().Get("Location"))
	if err != nil || location.Host == "" || location.Query().Get("code_challenge_method") != "S256" ||
		location.Query().Get("state") == "" {
		t.Fatalf("login did not issue a PKCE-bound authorization request: %s err=%v", rec.Header().Get("Location"), err)
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != client.config.FlowCookie ||
		!cookies[0].Secure || !cookies[0].HttpOnly ||
		cookies[0].SameSite != http.SameSiteLaxMode || cookies[0].Domain != "" {
		t.Fatalf("login did not issue an opaque temporary host-only flow cookie: %#v", cookies)
	}
	if _, err := store.PeekFlow(context.Background(), cookies[0].Value); err != nil {
		t.Fatalf("opaque login flow was not independently persisted: %v", err)
	}
}

func TestInvalidCallbackAndStepUpNeverCreateUnboundBFFSessions(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	router := gin.New()
	client.RegisterRoutes(router)
	// Missing and guessed flow handles never reach the provider's token endpoint.
	for _, cookieValue := range []string{"", "guessed-flow-handle"} {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/callback?code=attacker&state=state&iss="+url.QueryEscape(f.server.URL), nil)
		if cookieValue != "" {
			req.AddCookie(&http.Cookie{Name: client.config.FlowCookie, Value: cookieValue})
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("invalid login flow was not rejected: %d %s", rec.Code, rec.Body.String())
		}
	}
	if f.tokenRequests.Load() != 0 {
		t.Fatalf("invalid callbacks invoked token endpoint %d times", f.tokenRequests.Load())
	}
	for _, handle := range []string{"", "guessed-session"} {
		if _, _, err := client.BeginStepUp(ctx, handle, "/admin"); err == nil {
			t.Fatal("step-up accepted nonexistent BFF session handle")
		}
	}
	invalidIssuer := Session{
		Issuer: "https://attacker.example", Subject: "subject",
		IDToken: "opaque-id-token", TokenExpiry: time.Now().Add(time.Hour), CreatedAt: time.Now(),
	}
	if err := store.PutSession(ctx, "wrong-issuer", invalidIssuer, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.BeginStepUp(ctx, "wrong-issuer", "/admin"); err == nil {
		t.Fatal("step-up accepted a foreign issuer's session")
	}
	expired := invalidIssuer
	expired.Issuer = f.server.URL
	expired.CreatedAt = time.Now().Add(-48 * time.Hour)
	if err := store.PutSession(ctx, "expired-step-up", expired, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.BeginStepUp(ctx, "expired-step-up", "/admin"); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("step-up extended an expired absolute BFF session: %v", err)
	}
	good := expired
	good.CreatedAt = time.Now()
	if err := store.PutSession(ctx, "valid-step-up", good, time.Hour); err != nil {
		t.Fatal(err)
	}
	before, err := store.redis.DBSize(ctx).Result()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.BeginStepUp(ctx, "valid-step-up", "//evil.example"); err == nil {
		t.Fatal("step-up allocated flow for untrusted return path")
	}
	after, err := store.redis.DBSize(ctx).Result()
	if err != nil || after != before {
		t.Fatalf("untrusted step-up changed Redis keys: before=%d after=%d err=%v", before, after, err)
	}
}

func TestLogoutRedirectStateCannotBeReplayedAndNeverLeaksProviderToken(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle, _, flowQuery := f.beginCode(t, client, "/admin")
	sessionHandle, session, _, err := client.Complete(ctx, handle, flowQuery)
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	client.RegisterRoutes(router)
	logout := httptest.NewRequest(http.MethodPost, "/api/auth/logout?redirect=true", nil)
	logout.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: sessionHandle})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, logout)
	if rec.Code != http.StatusFound || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("RP logout did not return safe redirect: %d %s", rec.Code, rec.Body.String())
	}
	redirect := rec.Header().Get("Location")
	location, err := url.Parse(redirect)
	if err != nil {
		t.Fatal(err)
	}
	if location.Scheme != "https" || location.Host != f.server.URL[len("https://"):] ||
		location.Query().Get("post_logout_redirect_uri") != client.config.PostLogoutURL ||
		strings.Contains(redirect, session.IDToken) || strings.Contains(redirect, session.RefreshToken) {
		t.Fatalf("RP logout leaked credentials or used unregistered callback: %s", redirect)
	}
	if _, err := store.GetSession(ctx, sessionHandle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("local session survived RP logout: %v", err)
	}
	foundCleared := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == client.config.SessionCookie && c.MaxAge < 0 && c.Secure && c.HttpOnly {
			foundCleared = true
		}
	}
	if !foundCleared {
		t.Fatal("RP logout did not clear HttpOnly browser cookie")
	}
	state := location.Query().Get("state")
	if state == "" {
		t.Fatal("RP logout omitted replay-protected state")
	}
	for attempt := 0; attempt < 2; attempt++ {
		callback := httptest.NewRequest(http.MethodGet,
			"/api/auth/logout/callback?state="+url.QueryEscape(state), nil)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, callback)
		want := http.StatusSeeOther
		if attempt == 1 {
			want = http.StatusBadRequest
		}
		if res.Code != want || res.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("logout state use=%d result=%d want=%d", attempt, res.Code, want)
		}
	}
}
