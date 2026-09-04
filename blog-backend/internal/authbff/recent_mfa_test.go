package authbff

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rushairer/blog-backend/internal/access"
)

func TestRecentMFAEvidenceRequiresFreshStrongAuthentication(t *testing.T) {
	now := time.Date(2026, 9, 4, 16, 30, 0, 0, time.UTC)
	tests := []struct {
		name     string
		authTime int64
		amr      []string
		want     bool
	}{
		{"fresh webauthn", now.Add(-time.Minute).Unix(), []string{"pwd", "webauthn"}, true},
		{"fresh totp", now.Add(-5 * time.Minute).Unix(), []string{"pwd", "totp"}, true},
		{"stale mfa", now.Add(-10*time.Minute - time.Second).Unix(), []string{"mfa"}, false},
		{"future beyond skew", now.Add(61 * time.Second).Unix(), []string{"fido2"}, false},
		{"password only", now.Unix(), []string{"pwd"}, false},
		{"missing auth time", 0, []string{"webauthn"}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			evidence, ttl, ok := recentMFAEvidence(test.authTime, test.amr, now)
			if ok != test.want {
				t.Fatalf("recentMFAEvidence() ok = %v, want %v", ok, test.want)
			}
			if !ok {
				return
			}
			if evidence.AuthTime != test.authTime || ttl <= 0 || evidence.RecordedAt != now {
				t.Fatalf("unexpected evidence: %#v ttl=%s", evidence, ttl)
			}
		})
	}
}

func TestRecentMFAEvidenceIsEncryptedAndBoundToSessionHandle(t *testing.T) {
	store, server := testStore(t)
	ctx := context.Background()
	handle, _ := RandomHandle()
	evidence := RecentMFAEvidence{AuthTime: time.Now().Add(-time.Minute).Unix(), AMR: []string{"pwd", "webauthn"}, RecordedAt: time.Now().UTC()}
	if err := store.PutRecentMFA(ctx, handle, evidence, 10*time.Minute); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(server.Dump(), "webauthn") {
		t.Fatal("recent MFA evidence was stored in plaintext")
	}
	got, err := store.GetRecentMFA(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	if got.AuthTime != evidence.AuthTime || len(got.AMR) != 2 || got.AMR[1] != "webauthn" {
		t.Fatalf("evidence round trip mismatch: %#v", got)
	}
	otherHandle, _ := RandomHandle()
	if _, err := store.GetRecentMFA(ctx, otherHandle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("evidence leaked across session handles: %v", err)
	}
}

func TestSessionMiddlewareUsesOnlyBFFRecentMFAEvidence(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	now := time.Now().UTC().Truncate(time.Second)
	client.flowNow = func() time.Time { return now }
	handle, _ := RandomHandle()
	session := Session{
		Issuer:      client.config.Issuer,
		Subject:     "user-123",
		SID:         "sid-123",
		TokenExpiry: now.Add(time.Hour),
		AuthTime:    now.Unix(), // Simulates a refresh response claiming fresh authentication.
		AMR:         []string{"pwd", "webauthn"},
		ACR:         client.config.RequiredACR,
		Claims: map[string]any{
			"auth_time": now.Unix(),
			"amr":       []string{"pwd", "webauthn"},
		},
		CreatedAt: now,
	}
	if err := store.PutSession(context.Background(), handle, session, time.Hour); err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.Use(client.SessionMiddleware())
	router.GET("/protected", func(c *gin.Context) {
		claimsRaw, _ := c.Get("claims")
		claims, _ := claimsRaw.(jwt.MapClaims)
		if access.RecentMFA(claims, now) {
			c.Status(http.StatusNoContent)
			return
		}
		c.Status(http.StatusForbidden)
	})

	request := func() int {
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.AddCookie(&http.Cookie{Name: client.config.SessionCookie, Value: handle})
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w.Code
	}

	if got := request(); got != http.StatusForbidden {
		t.Fatalf("fresh auth_time from the stored ID-token session must not establish Blog MFA freshness; status=%d", got)
	}

	stale := RecentMFAEvidence{AuthTime: now.Add(-11 * time.Minute).Unix(), AMR: []string{"webauthn"}, RecordedAt: now.Add(-11 * time.Minute)}
	if err := store.PutRecentMFA(context.Background(), handle, stale, time.Minute); err != nil {
		t.Fatal(err)
	}
	if got := request(); got != http.StatusForbidden {
		t.Fatalf("refresh must not extend stale Blog-owned MFA evidence; status=%d", got)
	}

	fresh := RecentMFAEvidence{AuthTime: now.Add(-time.Minute).Unix(), AMR: []string{"pwd", "webauthn"}, RecordedAt: now}
	if err := store.PutRecentMFA(context.Background(), handle, fresh, 9*time.Minute); err != nil {
		t.Fatal(err)
	}
	if got := request(); got != http.StatusNoContent {
		t.Fatalf("fresh Blog-owned MFA evidence should authorize the freshness gate; status=%d", got)
	}
}

func TestPeekFlowDoesNotConsumeAuthorizationFlow(t *testing.T) {
	store, _ := testStore(t)
	ctx := context.Background()
	handle, _ := RandomHandle()
	flow := AuthorizationFlow{Purpose: "step_up", SessionHandle: "session-handle", State: "state", Nonce: "nonce", PKCEVerifier: "verifier", ReturnTo: "/admin", CreatedAt: time.Now()}
	if err := store.PutFlow(ctx, handle, flow, time.Minute); err != nil {
		t.Fatal(err)
	}
	peeked, err := store.PeekFlow(ctx, handle)
	if err != nil || peeked.Purpose != "step_up" || peeked.SessionHandle != flow.SessionHandle {
		t.Fatalf("PeekFlow() = %#v, %v", peeked, err)
	}
	consumed, err := store.TakeFlow(ctx, handle)
	if err != nil || consumed.State != flow.State {
		t.Fatalf("PeekFlow consumed or changed flow: %#v, %v", consumed, err)
	}
}
