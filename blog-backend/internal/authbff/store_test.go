package authbff

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/tink-crypto/tink-go/v2/aead"
	"github.com/tink-crypto/tink-go/v2/keyset"
)

func testStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	handle, err := keyset.NewHandle(aead.AES256GCMKeyTemplate())
	if err != nil {
		t.Fatal(err)
	}
	primitive, err := aead.New(handle)
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(client, primitive, "test:auth")
	if err != nil {
		t.Fatal(err)
	}
	return store, server
}

func TestFlowIsEncryptedAndConsumedOnce(t *testing.T) {
	store, server := testStore(t)
	ctx := context.Background()
	handle, err := RandomHandle()
	if err != nil {
		t.Fatal(err)
	}
	flow := AuthorizationFlow{State: "state-secret", Nonce: "nonce-secret", PKCEVerifier: "verifier-secret", ReturnTo: "/admin", CreatedAt: time.Now()}
	if err := store.PutFlow(ctx, handle, flow, 5*time.Minute); err != nil {
		t.Fatal(err)
	}
	dump := server.Dump()
	if strings.Contains(dump, flow.State) || strings.Contains(dump, flow.PKCEVerifier) {
		t.Fatal("flow secret was stored in plaintext")
	}
	got, err := store.TakeFlow(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	if got.State != flow.State || got.Nonce != flow.Nonce || got.PKCEVerifier != flow.PKCEVerifier {
		t.Fatalf("flow round trip mismatch: %#v", got)
	}
	if _, err := store.TakeFlow(ctx, handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("authorization flow was replayable: %v", err)
	}
}

func TestSessionTokensStayServerSideAndEncrypted(t *testing.T) {
	store, server := testStore(t)
	ctx := context.Background()
	handle, _ := RandomHandle()
	session := Session{
		Issuer: "https://sso.local.test", Subject: "subject", SID: "sid",
		AccessToken: "access-secret", RefreshToken: "refresh-secret", IDToken: "id-secret",
		TokenExpiry: time.Now().Add(time.Hour), CreatedAt: time.Now(),
	}
	if err := store.PutSession(ctx, handle, session, time.Hour); err != nil {
		t.Fatal(err)
	}
	dump := server.Dump()
	if strings.Contains(dump, session.AccessToken) || strings.Contains(dump, session.RefreshToken) || strings.Contains(dump, session.IDToken) {
		t.Fatal("provider token was stored in plaintext")
	}
	got, err := store.GetSession(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	if got.RefreshToken != session.RefreshToken || got.IDToken != session.IDToken {
		t.Fatal("encrypted session round trip mismatch")
	}
	if err := store.DeleteSession(ctx, handle); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetSession(ctx, handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted session still exists: %v", err)
	}
}

func TestStoreDeleteBySubjectAndSID(t *testing.T) {
	store, _ := testStore(t)
	ctx := context.Background()
	h1, _ := RandomHandle()
	h2, _ := RandomHandle()
	h3, _ := RandomHandle()

	s1 := Session{
		Issuer: "https://sso.local.test", Subject: "user-1", SID: "sid-1",
		AccessToken: "acc1", RefreshToken: "ref1", IDToken: "id1",
		TokenExpiry: time.Now().Add(time.Hour), CreatedAt: time.Now(),
	}
	s2 := Session{
		Issuer: "https://sso.local.test", Subject: "user-1", SID: "sid-2",
		AccessToken: "acc2", RefreshToken: "ref2", IDToken: "id2",
		TokenExpiry: time.Now().Add(time.Hour), CreatedAt: time.Now(),
	}
	s3 := Session{
		Issuer: "https://sso.local.test", Subject: "user-2", SID: "sid-3",
		AccessToken: "acc3", RefreshToken: "ref3", IDToken: "id3",
		TokenExpiry: time.Now().Add(time.Hour), CreatedAt: time.Now(),
	}

	_ = store.PutSession(ctx, h1, s1, time.Hour)
	_ = store.PutSession(ctx, h2, s2, time.Hour)
	_ = store.PutSession(ctx, h3, s3, time.Hour)

	// Test DeleteBySID for sid-1
	if err := store.DeleteBySID(ctx, "sid-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetSession(ctx, h1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session h1 should have been deleted by sid-1: %v", err)
	}
	if _, err := store.GetSession(ctx, h2); err != nil {
		t.Fatalf("session h2 should still exist: %v", err)
	}

	// Test DeleteBySubject for user-1
	if err := store.DeleteBySubject(ctx, "user-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetSession(ctx, h2); !errors.Is(err, ErrNotFound) {
		t.Fatalf("session h2 should have been deleted by user-1: %v", err)
	}
	if _, err := store.GetSession(ctx, h3); err != nil {
		t.Fatalf("session h3 for user-2 should still exist: %v", err)
	}
}

func TestConfigRequiresConfidentialHTTPSBoundary(t *testing.T) {
	cfg := Config{Issuer: "https://sso.local.test", ClientID: "blog-bff", ClientSecret: "secret", RedirectURL: "https://blog.local.test/api/auth/callback", Resource: "https://blog.local.test/api", TinkKeysetPath: "/run/secrets/blog-bff-keyset"}
	cfg.ApplyDefaults()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	cfg.ClientSecret = ""
	if err := cfg.Validate(); err == nil {
		t.Fatal("public client configuration must be rejected")
	}
	cfg.ClientSecret, cfg.Issuer = "secret", "http://sso.local.test"
	if err := cfg.Validate(); err == nil {
		t.Fatal("non-HTTPS issuer must be rejected")
	}
}
