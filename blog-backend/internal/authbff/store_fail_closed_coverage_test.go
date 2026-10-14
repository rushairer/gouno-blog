package authbff

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestBFFMiddlewareFailsClosedForMissingForeignExpiredAndUnrefreshableSessions(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	now := time.Now()
	valid := Session{
		Issuer: f.server.URL, Subject: "subject", SID: "sid",
		IDToken: "opaque-id", AccessToken: "opaque-access", TokenExpiry: now.Add(time.Hour),
		CreatedAt: now,
	}
	wrongIssuer := valid
	wrongIssuer.Issuer = "https://another-issuer.example"
	absoluteExpired := valid
	absoluteExpired.CreatedAt = now.Add(-24 * time.Hour)
	needsRefreshButNoToken := valid
	needsRefreshButNoToken.TokenExpiry = now.Add(-time.Minute)
	for _, tc := range []struct {
		handle string
		session Session
		write bool
		wantDeleted bool
	}{
		{"nonexistent-session", Session{}, false, false},
		{"foreign-issuer", wrongIssuer, true, false},
		{"absolute-expired", absoluteExpired, true, true},
		{"cannot-refresh", needsRefreshButNoToken, true, true},
	} {
		t.Run(tc.handle, func(t *testing.T) {
			if tc.write {
				if err := store.PutSession(ctx, tc.handle, tc.session, time.Hour); err != nil {
					t.Fatal(err)
				}
			}
			router := gin.New()
			router.Use(client.SessionMiddleware())
			router.GET("/restricted", func(c *gin.Context) {
				if _, ok := c.Get("claims"); ok {
					c.Status(http.StatusNoContent)
					return
				}
				c.Status(http.StatusUnauthorized)
			})
			req := httptest.NewRequest(http.MethodGet, "/restricted", nil)
			req.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: tc.handle})
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("invalid BFF session created an authenticated request: %d", rec.Code)
			}
			foundClear := false
			for _, cookie := range rec.Result().Cookies() {
				if cookie.Name == client.config.SessionCookie && cookie.MaxAge < 0 &&
					cookie.Secure && cookie.HttpOnly && cookie.Domain == "" {
					foundClear = true
				}
			}
			if !foundClear {
				t.Fatal("invalid BFF session did not clear the host-only cookie")
			}
			if tc.wantDeleted {
				if _, err := store.GetSession(ctx, tc.handle); !errors.Is(err, ErrNotFound) {
					t.Fatalf("expired/invalidated session was not destroyed: %v", err)
				}
			}
		})
	}
	// Absence of any cookie is normal anonymous access and should not
	// manufacture a new cookie or a server-side bearer credential.
	router := gin.New()
	router.Use(client.SessionMiddleware())
	router.GET("/anonymous", func(c *gin.Context) {
		if _, ok := c.Get("claims"); ok {
			c.Status(http.StatusInternalServerError)
			return
		}
		c.Status(http.StatusUnauthorized)
	})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/anonymous", nil))
	if rec.Code != http.StatusUnauthorized || len(rec.Result().Cookies()) != 0 {
		t.Fatal("anonymous browser unexpectedly acquired BFF session state")
	}
}

func TestConfidentialStoreRejectsInvalidRecordsAndSessionResurrection(t *testing.T) {
	store, _ := testStore(t)
	ctx := context.Background()
	if _, err := NewStore(nil, store.aead, "test"); err == nil {
		t.Fatal("store accepted absent Redis transport")
	}
	if _, err := NewStore(store.redis, nil, "test"); err == nil {
		t.Fatal("store accepted absent authenticated encryption")
	}
	if _, err := NewStore(store.redis, store.aead, ""); err == nil {
		t.Fatal("store accepted unscoped Redis namespace")
	}
	invalid := Session{Issuer: "https://sso.example", Subject: "subject", IDToken: "opaque-id"}
	for _, tc := range []struct {
		name string
		handle string
		session Session
		ttl time.Duration
	}{
		{"missing_handle", "", invalid, time.Hour},
		{"missing_issuer", "id", Session{Subject: "subject", IDToken: "opaque"}, time.Hour},
		{"missing_subject", "id", Session{Issuer: "https://sso.example", IDToken: "opaque"}, time.Hour},
		{"missing_id_token", "id", Session{Issuer: "https://sso.example", Subject: "subject"}, time.Hour},
		{"negative_ttl", "id", invalid, -time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := store.PutSession(ctx, tc.handle, tc.session, tc.ttl); err == nil {
				t.Fatal("incomplete confidential session was persisted")
			}
		})
	}
	if err := store.ReplaceSession(ctx, "missing-key", invalid, invalid, time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("replacement resurrected an absent session: %v", err)
	}
	if err := store.RotateSession(ctx, "missing-key", "new-handle", invalid, invalid, time.Hour); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rotation minted a session without the previous bearer: %v", err)
	}
	if err := store.RotateSession(ctx, "same-handle", "same-handle", invalid, invalid, time.Hour); err == nil {
		t.Fatal("rotation allowed old and new handle to be equal")
	}
	if err := store.RotateSession(ctx, "", "new-handle", invalid, invalid, time.Hour); err == nil {
		t.Fatal("rotation allowed missing old handle")
	}
	if err := store.ReplaceSession(ctx, "", invalid, invalid, time.Hour); err == nil {
		t.Fatal("refresh allowed missing old handle")
	}
	if err := store.PutFlow(ctx, "", AuthorizationFlow{}, time.Minute); err == nil {
		t.Fatal("empty OAuth callback flow accepted")
	}
	flow := AuthorizationFlow{State: "s", Nonce: "n", PKCEVerifier: "private-verifier"}
	if err := store.PutFlow(ctx, "single-use", flow, time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := store.PutFlow(ctx, "single-use", flow, time.Minute); err == nil {
		t.Fatal("duplicate OAuth flow overwrite accepted")
	}
	if err := store.TakeLogoutState(ctx, ""); err == nil {
		t.Fatal("missing logout state was accepted")
	}
	if err := store.PutLogoutState(ctx, "", time.Minute); err == nil {
		t.Fatal("empty logout state could be stored")
	}
	if err := store.PutLogoutState(ctx, "state", 0); err == nil {
		t.Fatal("nonpositive logout state TTL was accepted")
	}
	if _, _, _, err := store.ClaimLogoutToken(ctx, "", time.Minute); err == nil {
		t.Fatal("logout replay lease accepted empty JTI")
	}
	if _, _, _, err := store.ClaimLogoutToken(ctx, "valid", 0); err == nil {
		t.Fatal("logout replay lease accepted zero duration")
	}
	if err := store.FinishLogoutToken(ctx, "valid", "", time.Minute); err == nil {
		t.Fatal("logout replay completion accepted missing lease owner")
	}
}

func TestBFFRefreshRequiresServerSideRefreshCredentialAndAbsoluteLifetime(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	now := time.Now()
	missingRefresh := Session{
		Issuer: f.server.URL, Subject: "subject", IDToken: "id",
		TokenExpiry: now.Add(time.Second), CreatedAt: now,
	}
	if err := store.PutSession(ctx, "missing-refresh", missingRefresh, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Refresh(ctx, "missing-refresh"); err == nil {
		t.Fatal("refresh accepted a session without server-side refresh credentials")
	}
	if f.tokenRequests.Load() != 0 {
		t.Fatal("missing refresh credential triggered OP HTTP request")
	}
	if got, err := store.GetSession(ctx, "missing-refresh"); err != nil || got.Subject != missingRefresh.Subject {
		t.Fatalf("failed refresh changed authenticated identity: %#v err=%v", got, err)
	}
	if _, err := client.Refresh(ctx, "nonexistent-refresh"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing BFF session did not reject refresh: %v", err)
	}
	expired := missingRefresh
	expired.CreatedAt = now.Add(-24 * time.Hour)
	expired.RefreshToken = "invalid-but-not-usable"
	if err := store.PutSession(ctx, "expired-refresh", expired, time.Hour); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Refresh(ctx, "expired-refresh"); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh extended absolute BFF lifetime: %v", err)
	}
	if f.tokenRequests.Load() != 0 {
		t.Fatal("expired local BFF lifetime dispatched a billable token refresh")
	}
	if _, err := client.StepUpMFA(ctx, "missing-refresh", "user-supplied-code", "sms"); err == nil {
		t.Fatal("retired direct MFA path accepted a user-supplied verification code")
	}
}
