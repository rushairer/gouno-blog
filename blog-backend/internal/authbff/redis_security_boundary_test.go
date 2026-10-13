package authbff

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestLogoutLeaseCannotBeReleasedOrFinishedByWrongOwner(t *testing.T) {
	store, redisServer := testStore(t)
	ctx := context.Background()
	owner, acquired, complete, err := store.ClaimLogoutToken(ctx, "jti-owner-bound", time.Minute)
	if err != nil || owner == "" || !acquired || complete {
		t.Fatalf("first logout claim failed: owner=%q acquired=%v complete=%v err=%v", owner, acquired, complete, err)
	}
	if err := store.ReleaseLogoutToken(ctx, "jti-owner-bound", "malicious-other-owner"); err != nil {
		t.Fatal(err)
	}
	if err := store.FinishLogoutToken(ctx, "jti-owner-bound", "malicious-other-owner", time.Hour); err == nil {
		t.Fatal("nonowner completed another worker's logout claim")
	}
	_, acquired, complete, err = store.ClaimLogoutToken(ctx, "jti-owner-bound", time.Minute)
	if err != nil || acquired || complete {
		t.Fatalf("incorrect concurrent logout claim after wrong-owner release: acquired=%v complete=%v err=%v", acquired, complete, err)
	}
	if err := store.FinishLogoutToken(ctx, "jti-owner-bound", owner, time.Hour); err != nil {
		t.Fatal(err)
	}
	if err := store.ReleaseLogoutToken(ctx, "jti-owner-bound", owner); err != nil {
		t.Fatal(err)
	}
	_, acquired, complete, err = store.ClaimLogoutToken(ctx, "jti-owner-bound", time.Minute)
	if err != nil || acquired || !complete {
		t.Fatalf("completed logout marker was erased: acquired=%v complete=%v err=%v", acquired, complete, err)
	}
	// Expired claims must never accept stale completion from the former owner.
	other, acquired, complete, err := store.ClaimLogoutToken(ctx, "jti-expired", time.Second)
	if err != nil || !acquired || complete {
		t.Fatalf("failed to obtain expiring lease: %v", err)
	}
	redisServer.FastForward(2 * time.Second)
	if err := store.FinishLogoutToken(ctx, "jti-expired", other, time.Hour); err == nil {
		t.Fatal("expired logout-claim owner finalized a lease it no longer owned")
	}
	newOwner, acquired, complete, err := store.ClaimLogoutToken(ctx, "jti-expired", time.Minute)
	if err != nil || !acquired || complete || newOwner == "" || newOwner == other {
		t.Fatalf("expired claim was not safely reacquired: new=%q acquired=%v complete=%v err=%v", newOwner, acquired, complete, err)
	}
	if err := store.FinishLogoutToken(ctx, "jti-expired", other, time.Hour); err == nil {
		t.Fatal("stale logout worker modified a newer claim")
	}
}

func TestEncryptedOIDCFlowIsBoundToHandleAndRecordKind(t *testing.T) {
	store, server := testStore(t)
	ctx := context.Background()
	h1, h2 := "opaque-handle-1", "opaque-handle-2"
	flow := AuthorizationFlow{State: "private-state", Nonce: "private-nonce", PKCEVerifier: "private-PKCE-verifier", Purpose: "login", CreatedAt: time.Now()}
	if err := store.PutFlow(ctx, h1, flow, time.Minute); err != nil {
		t.Fatal(err)
	}
	key1, _ := store.key("flow", h1)
	key2, _ := store.key("flow", h2)
	sessionKey, _ := store.key("session", h1)
	ciphertext, err := store.redis.Get(ctx, key1).Result()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(ciphertext, flow.State) || strings.Contains(ciphertext, flow.PKCEVerifier) ||
		strings.Contains(key1, h1) {
		t.Fatal("flow secret or opaque handle leaked in persisted Redis data")
	}
	if err := store.redis.Set(ctx, key2, ciphertext, time.Minute).Err(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PeekFlow(ctx, h2); err == nil {
		t.Fatal("ciphertext copied to another handle was accepted without associated-data binding")
	}
	if err := store.redis.Set(ctx, sessionKey, ciphertext, time.Minute).Err(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetSession(ctx, h1); err == nil {
		t.Fatal("flow ciphertext was decrypted as a session record")
	}
	got, err := store.TakeFlow(ctx, h1)
	if err != nil || got.State != flow.State {
		t.Fatalf("tampering another handle/kind damaged the original flow: %#v, %v", got, err)
	}
	// The flow must remain single use even if its ciphertext was copied to
	// another key; the unrecognized copy cannot authorize a callback.
	if _, err := store.TakeFlow(ctx, h1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("original flow was replayable: %v", err)
	}
	if strings.Contains(server.Dump(), flow.PKCEVerifier) {
		t.Fatal("stored authorization verifier appeared in plaintext")
	}
}

func TestRecentMFAStorageRejectsMalformedEvidenceAndNeverRefreshesItself(t *testing.T) {
	store, server := testStore(t)
	ctx := context.Background()
	handle := "session-mfa-proof"
	for _, tc := range []struct {
		name string
		handle string
		evidence RecentMFAEvidence
		ttl time.Duration
	}{
		{"empty_handle", "", RecentMFAEvidence{AuthTime: 1, AMR: []string{"webauthn"}}, time.Minute},
		{"missing_auth_time", handle, RecentMFAEvidence{AMR: []string{"webauthn"}}, time.Minute},
		{"missing_methods", handle, RecentMFAEvidence{AuthTime: 1}, time.Minute},
		{"zero_ttl", handle, RecentMFAEvidence{AuthTime: 1, AMR: []string{"webauthn"}}, 0},
		{"negative_ttl", handle, RecentMFAEvidence{AuthTime: 1, AMR: []string{"webauthn"}}, -time.Second},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := store.PutRecentMFA(ctx, tc.handle, tc.evidence, tc.ttl); err == nil {
				t.Fatal("invalid recent-MFA evidence accepted")
			}
		})
	}
	if _, err := store.GetRecentMFA(ctx, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing MFA handle did not fail closed: %v", err)
	}
	if err := store.DeleteRecentMFA(ctx, ""); err != nil {
		t.Fatal(err)
	}
	evidence := RecentMFAEvidence{AuthTime: time.Now().Unix(), AMR: []string{"webauthn"}, RecordedAt: time.Now().UTC()}
	if err := store.PutRecentMFA(ctx, handle, evidence, 2*time.Second); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetRecentMFA(ctx, handle); err != nil {
		t.Fatalf("fresh evidence was not stored: %v", err)
	}
	server.FastForward(3 * time.Second)
	if _, err := store.GetRecentMFA(ctx, handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired MFA evidence still existed: %v", err)
	}
	if _, err := store.PeekFlow(ctx, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing flow handle did not fail closed: %v", err)
	}
	if err := store.DeleteRecentMFA(ctx, handle); err != nil {
		t.Fatal(err)
	}
}
