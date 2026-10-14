package authbff

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestOIDCTLSDiscoveryRejectsUntrustedProviderEndpoints(t *testing.T) {
	f := newLocalOIDCFixture(t)
	store, _ := testStore(t)
	cfg := Config{
		Issuer: f.server.URL,
		ClientID: "blog-bff", ClientSecret: "confidential-test-secret",
		RedirectURL: "https://blog.local.test/api/auth/callback",
		PostLogoutURL: "https://blog.local.test/api/auth/logout/callback",
		Resource: "https://blog.local.test/api",
		TinkKeysetPath: "/run/secrets/oidc-fixture",
	}
	// Discovery must remain strict even when the OP metadata itself has an
	// otherwise correctly signed transport certificate.
	for _, tc := range []struct {
		name string
		change func(map[string]any)
	}{
		{"missing_RFC9207_iss", func(m map[string]any) { m["authorization_response_iss_parameter_supported"] = false }},
		{"wrong_authorization_origin", func(m map[string]any) { m["authorization_endpoint"] = "https://evil.example/authorize" }},
		{"wrong_token_origin", func(m map[string]any) { m["token_endpoint"] = "https://evil.example/token" }},
		{"wrong_jwks_origin", func(m map[string]any) { m["jwks_uri"] = "https://evil.example/jwks" }},
		{"http_jwks", func(m map[string]any) { m["jwks_uri"] = "http://evil.example/jwks" }},
		{"wrong_logout_origin", func(m map[string]any) { m["end_session_endpoint"] = "https://evil.example/logout" }},
		{"wrong_revocation_origin", func(m map[string]any) { m["revocation_endpoint"] = "https://evil.example/revoke" }},
		{"wrong_issuer_claim", func(m map[string]any) { m["issuer"] = "https://evil.example" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f.setMetadataChange(tc.change)
			c, err := NewClient(context.Background(), cfg, store, f.server.Client())
			if err == nil || c != nil {
				t.Fatal("untrusted/missing OP metadata was accepted")
			}
			if strings.Contains(err.Error(), cfg.ClientSecret) {
				t.Fatalf("OIDC error disclosed BFF client secret: %v", err)
			}
		})
	}
	f.setMetadataChange(nil)
	if _, err := NewClient(context.Background(), cfg, store, f.server.Client()); err != nil {
		t.Fatalf("trusted metadata rejected after invalid fixtures: %v", err)
	}
	if _, err := NewClient(context.Background(), cfg, nil, f.server.Client()); err == nil {
		t.Fatal("new BFF client accepted a nil confidential session store")
	}
}

func TestSignedOIDCLoginUsesPKCEIssuerNonceAndConfidentialRedisSession(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle, authorize, err := client.Begin(ctx, "/admin?section=ai")
	if err != nil {
		t.Fatal(err)
	}
	flow, err := store.PeekFlow(ctx, handle)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(authorize)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(flow.PKCEVerifier))
	if parsed.Query().Get("code_challenge") != base64.RawURLEncoding.EncodeToString(digest[:]) ||
		parsed.Query().Get("code_challenge_method") != "S256" ||
		parsed.Query().Get("state") != flow.State ||
		parsed.Query().Get("nonce") != flow.Nonce ||
		parsed.Query().Get("acr_values") != client.config.RequiredACR ||
		parsed.Query().Get("resource") != client.config.Resource ||
		!strings.Contains(parsed.Query().Get("scope"), "openid") ||
		flow.Purpose != "login" || flow.ReturnTo != "/admin?section=ai" ||
		strings.Contains(authorize, flow.PKCEVerifier) {
		t.Fatalf("authorization request did not preserve PKCE/OIDC requirements: %s", authorize)
	}
	f.setClaims(flow.Nonce, "subject-123", client.config.RequiredACR)
	resultHandle, session, returnTo, err := client.Complete(ctx, handle, url.Values{
		"state": {flow.State}, "iss": {f.server.URL}, "code": {"authorization-code"},
	})
	if err != nil {
		t.Fatalf("valid signed issuer/audience/nonce/PKCE transaction failed: %v", err)
	}
	if resultHandle == "" || resultHandle == handle || returnTo != flow.ReturnTo ||
		session.Issuer != f.server.URL || session.Subject != "subject-123" ||
		session.IDToken == "" || session.RefreshToken != "private-refresh-token" ||
		session.ACR != "urn:gouno:aal2" || session.CreatedAt.IsZero() {
		t.Fatalf("valid OIDC callback lost identity or session contract: handle=%q return=%q session=%#v", resultHandle, returnTo, session)
	}
	saved, err := store.GetSession(ctx, resultHandle)
	if err != nil || saved.IDToken != session.IDToken || saved.Subject != session.Subject {
		t.Fatalf("verified confidential session was not stored: %v", err)
	}
	if _, err := store.TakeFlow(ctx, handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("authorization flow was replayable after completion: %v", err)
	}
	if f.codeRequests.Load() != 1 {
		t.Fatalf("code dispatched %d times instead of once", f.codeRequests.Load())
	}
}

func TestOIDCRejectsCallbackConfusionBeforeTokenDispatch(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	for _, tc := range []struct {
		name string
		mutate func(url.Values)
	}{
		{"wrong_state", func(v url.Values) { v.Set("state", "attacker-selected-state") }},
		{"missing_state", func(v url.Values) { v.Del("state") }},
		{"wrong_issuer", func(v url.Values) { v.Set("iss", "https://attacker.example") }},
		{"missing_issuer", func(v url.Values) { v.Del("iss") }},
		{"missing_code", func(v url.Values) { v.Del("code") }},
		{"provider_error", func(v url.Values) { v.Set("error", "access_denied_confidential") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handle, _, query := f.beginCode(t, client, "/admin")
			before := f.tokenRequests.Load()
			tc.mutate(query)
			if _, _, _, err := client.Complete(context.Background(), handle, query); err == nil {
				t.Fatal("callback with invalid issuer/state/code or provider error was accepted")
			}
			if f.tokenRequests.Load() != before {
				t.Fatal("invalid callback made an upstream token-exchange request")
			}
			if _, err := store.TakeFlow(context.Background(), handle); !errors.Is(err, ErrNotFound) {
				t.Fatalf("rejected callback left an authorization flow replayable: %v", err)
			}
		})
	}
}

func TestSignedIDTokenSecurityFailuresNeverCreateBFFSession(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	for _, tc := range []struct {
		name string
		mutate func(*localOIDCFixture, AuthorizationFlow)
	}{
		{"wrong_nonce", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setClaims("nonce-of-other-flow", "subject-123", client.config.RequiredACR) }},
		{"wrong_acr", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setClaims(flow.Nonce, "subject-123", "urn:gouno:aal1") }},
		{"missing_subject", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setClaims(flow.Nonce, "", client.config.RequiredACR) }},
		{"missing_amr", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setTokenClaimPatch(map[string]any{"amr": nil}) }},
		{"missing_auth_time", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setTokenClaimPatch(map[string]any{"auth_time": nil}) }},
		{"wrong_audience", func(f *localOIDCFixture, flow AuthorizationFlow) { f.setTokenClaimPatch(map[string]any{"aud": "other-confidential-client"}) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f.setTokenClaimPatch(nil)
			handle, flow, query := f.beginCode(t, client, "/admin")
			tc.mutate(f, flow)
			resultHandle, _, _, err := client.Complete(context.Background(), handle, query)
			if err == nil || resultHandle != "" {
				t.Fatalf("invalid signed ID token established BFF session: handle=%q err=%v", resultHandle, err)
			}
			if _, err := store.TakeFlow(context.Background(), handle); !errors.Is(err, ErrNotFound) {
				t.Fatalf("rejected signed ID token left callback replayable: %v", err)
			}
		})
	}
}

func TestSignedOIDCStepUpAtomicallyRotatesOnlySameIdentitySession(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle, _, query := f.beginCode(t, client, "/admin")
	oldHandle, initial, _, err := client.Complete(ctx, handle, query)
	if err != nil {
		t.Fatal(err)
	}
	flowHandle, authorize, err := client.BeginStepUp(ctx, oldHandle, "/admin/ai-ops")
	if err != nil {
		t.Fatalf("valid step-up start failed: %v", err)
	}
	flow, err := store.PeekFlow(ctx, flowHandle)
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(authorize)
	if flow.Purpose != "step_up" || flow.SessionHandle != oldHandle ||
		parsed.Query().Get("max_age") != "600" ||
		parsed.Query().Get("acr_values") != "urn:gouno:aal2" ||
		parsed.Query().Get("login_hint") != initial.Subject ||
		strings.Contains(authorize, oldHandle) {
		t.Fatalf("step-up was not bound to the server-side session and required AAL2: flow=%#v url=%s", flow, authorize)
	}
	f.setClaims(flow.Nonce, "attacker-subject", client.config.RequiredACR)
	_, _, _, err = client.Complete(ctx, flowHandle, url.Values{
		"state": {flow.State}, "iss": {f.server.URL}, "code": {"stepup-other-subject"},
	})
	if err == nil {
		t.Fatal("step-up for another verified subject rotated existing Blog session")
	}
	if _, err := store.GetSession(ctx, oldHandle); err != nil {
		t.Fatalf("identity-confused step-up invalidated original session: %v", err)
	}
	secondHandle, _, err := client.BeginStepUp(ctx, oldHandle, "/admin")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.PeekFlow(ctx, secondHandle)
	if err != nil {
		t.Fatal(err)
	}
	f.setClaims(second.Nonce, initial.Subject, client.config.RequiredACR)
	newHandle, upgraded, _, err := client.Complete(ctx, secondHandle, url.Values{
		"state": {second.State}, "iss": {f.server.URL}, "code": {"stepup-same-subject"},
	})
	if err != nil {
		t.Fatalf("same-subject signed step-up failed: %v", err)
	}
	if newHandle == oldHandle || !upgraded.CreatedAt.Equal(initial.CreatedAt) {
		t.Fatal("step-up reused old bearer handle or extended session absolute lifetime")
	}
	if _, err := store.GetSession(ctx, oldHandle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old session handle remained valid after step-up rotation: %v", err)
	}
	if _, err := store.GetSession(ctx, newHandle); err != nil {
		t.Fatalf("step-up rotated session could not be loaded: %v", err)
	}
}

func TestRefreshTokenRaceCannotResurrectLogoutSession(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle := "refresh-logout-interleave"
	old := Session{
		Issuer: f.server.URL, Subject: "subject-123", SID: "old-sid",
		AccessToken: "old-access-token", RefreshToken: "old-refresh-token",
		IDToken: "old-verified-id-token", TokenExpiry: time.Now().Add(2 * time.Second),
		CreatedAt: time.Now(),
	}
	if err := store.PutSession(ctx, handle, old, time.Hour); err != nil {
		t.Fatal(err)
	}
	f.setClaims("fresh-nonce-not-used-for-refresh", old.Subject, client.config.RequiredACR)
	f.setTokenHook(func(r *http.Request) {
		if r.Form.Get("grant_type") == "refresh_token" {
			if err := store.DeleteSession(context.Background(), handle); err != nil {
				t.Errorf("concurrent logout delete failed: %v", err)
			}
		}
	})
	if _, err := client.Refresh(ctx, handle); err == nil {
		t.Fatal("refresh returned success after logout removed its old handle")
	}
	if _, err := store.GetSession(ctx, handle); !errors.Is(err, ErrNotFound) {
		t.Fatalf("refresh resurrected a deleted session: %v", err)
	}
	if f.refreshRequests.Load() != 1 {
		t.Fatalf("expected one token refresh request, got %d", f.refreshRequests.Load())
	}
	if f.revokeRequests.Load() != 1 {
		t.Fatalf("replacement token was not revoked after failed session CAS: %d", f.revokeRequests.Load())
	}
}

func TestRefreshTokenIdentityMismatchDoesNotReplaceExistingSession(t *testing.T) {
	f := newLocalOIDCFixture(t)
	client, store := f.newClient(t)
	ctx := context.Background()
	handle := "refresh-identity-mismatch"
	old := Session{
		Issuer: f.server.URL, Subject: "subject-123",
		RefreshToken: "old-refresh-token", IDToken: "old-id-token",
		TokenExpiry: time.Now().Add(2 * time.Second), CreatedAt: time.Now(),
	}
	if err := store.PutSession(ctx, handle, old, time.Hour); err != nil {
		t.Fatal(err)
	}
	f.setClaims("fresh-nonce", "attacker-subject", client.config.RequiredACR)
	if _, err := client.Refresh(ctx, handle); err == nil {
		t.Fatal("refreshed ID token with different subject replaced authenticated BFF identity")
	}
	current, err := store.GetSession(ctx, handle)
	if err != nil || current.Subject != old.Subject || current.RefreshToken != old.RefreshToken {
		t.Fatalf("failed identity-mismatched refresh changed session: %#v err=%v", current, err)
	}
	if f.refreshRequests.Load() != 1 || f.revokeRequests.Load() != 1 {
		t.Fatalf("new mismatched credential was not revoked exactly once: refresh=%d revocation=%d", f.refreshRequests.Load(), f.revokeRequests.Load())
	}
}
