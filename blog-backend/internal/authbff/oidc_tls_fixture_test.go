package authbff

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const localOIDCTestKeyID = "integration-test-rs256"

// localOIDCFixture serves discovery, JWKS, authorization-code token exchange,
// refresh and revocation over an actual trusted local TLS listener. The BFF
// verifier validates the resulting RS256 JWT rather than accepting mock claims.
type localOIDCFixture struct {
	server *httptest.Server
	key    *rsa.PrivateKey

	mu              sync.Mutex
	nonce           string
	subject         string
	acr             string
	metadataChange  func(map[string]any)
	tokenHook       func(*http.Request)
	tokenClaimPatch map[string]any

	tokenRequests   atomic.Int64
	codeRequests    atomic.Int64
	refreshRequests atomic.Int64
	revokeRequests  atomic.Int64
}

func newLocalOIDCFixture(t *testing.T) *localOIDCFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &localOIDCFixture{
		key: key,
		subject: "subject-123",
		acr: "urn:gouno:aal2",
	}
	f.server = httptest.NewTLSServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *localOIDCFixture) setClaims(nonce, subject, acr string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nonce, f.subject, f.acr = nonce, subject, acr
}

func (f *localOIDCFixture) setTokenHook(hook func(*http.Request)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokenHook = hook
}

func (f *localOIDCFixture) setTokenClaimPatch(patch map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokenClaimPatch = patch
}

func (f *localOIDCFixture) setMetadataChange(change func(map[string]any)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.metadataChange = change
}

func (f *localOIDCFixture) sign(t *testing.T, claims map[string]any, typ string) string {
	t.Helper()
	signed, err := f.signClaims(claims, typ)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func (f *localOIDCFixture) signClaims(claims map[string]any, typ string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(claims))
	token.Header["kid"] = localOIDCTestKeyID
	if typ != "" {
		token.Header["typ"] = typ
	}
	return token.SignedString(f.key)
}

func (f *localOIDCFixture) handle(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/.well-known/openid-configuration":
		meta := map[string]any{
			"issuer": f.server.URL,
			"authorization_endpoint": f.server.URL + "/authorize",
			"token_endpoint": f.server.URL + "/token",
			"jwks_uri": f.server.URL + "/jwks",
			"end_session_endpoint": f.server.URL + "/oidc/logout",
			"revocation_endpoint": f.server.URL + "/revoke",
			"response_types_supported": []string{"code"},
			"subject_types_supported": []string{"public"},
			"id_token_signing_alg_values_supported": []string{"RS256"},
			"authorization_response_iss_parameter_supported": true,
		}
		f.mu.Lock()
		if f.metadataChange != nil {
			f.metadataChange(meta)
		}
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(meta)
	case "/jwks":
		pub := &f.key.PublicKey
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{
			"kty": "RSA", "kid": localOIDCTestKeyID, "alg": "RS256", "use": "sig",
			"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
		}}})
	case "/token":
		f.tokenRequests.Add(1)
		if r.Method != http.MethodPost || r.ParseForm() != nil {
			http.Error(w, "invalid token request", http.StatusBadRequest)
			return
		}
		switch r.Form.Get("grant_type") {
		case "authorization_code":
			f.codeRequests.Add(1)
			if r.Form.Get("code_verifier") == "" || r.Form.Get("code") == "" ||
				r.Form.Get("resource") != "https://blog.local.test/api" {
				http.Error(w, "missing verifier, code or resource", http.StatusBadRequest)
				return
			}
		case "refresh_token":
			f.refreshRequests.Add(1)
			if r.Form.Get("refresh_token") == "" {
				http.Error(w, "missing refresh token", http.StatusBadRequest)
				return
			}
		default:
			http.Error(w, "unknown token grant", http.StatusBadRequest)
			return
		}
		f.mu.Lock()
		nonce, subject, acr, hook := f.nonce, f.subject, f.acr, f.tokenHook
		patch := make(map[string]any, len(f.tokenClaimPatch))
		for k, v := range f.tokenClaimPatch {
			patch[k] = v
		}
		f.mu.Unlock()
		if hook != nil {
			hook(r)
		}
		now := time.Now()
		claims := map[string]any{
			"iss": f.server.URL, "sub": subject, "aud": "blog-bff",
			"iat": now.Add(-time.Minute).Unix(),
			"exp": now.Add(time.Hour).Unix(),
			"nonce": nonce, "sid": "sid-123",
			"auth_time": now.Add(-time.Minute).Unix(),
			"amr": []string{"pwd", "webauthn"}, "acr": acr,
		}
		for k, v := range patch {
			if v == nil {
				delete(claims, k)
			} else {
				claims[k] = v
			}
		}
		rawIDToken, err := f.signClaims(claims, "JWT")
		if err != nil {
			http.Error(w, "token signing failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "private-access-token", "token_type": "Bearer",
			"refresh_token": "private-refresh-token", "expires_in": 3600,
			"id_token": rawIDToken,
		})
	case "/revoke":
		f.revokeRequests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(w, r)
	}
}

func (f *localOIDCFixture) newClient(t *testing.T) (*Client, *Store) {
	t.Helper()
	store, _ := testStore(t)
	config := Config{
		Issuer: f.server.URL, ClientID: "blog-bff",
		ClientSecret: "test-confidential-secret",
		RedirectURL: "https://blog.local.test/api/auth/callback",
		PostLogoutURL: "https://blog.local.test/api/auth/logout/callback",
		Resource: "https://blog.local.test/api",
		TinkKeysetPath: "/run/secrets/blog-test-only",
	}
	client, err := NewClient(context.Background(), config, store, f.server.Client())
	if err != nil {
		t.Fatalf("local TLS OIDC discovery failed: %v", err)
	}
	return client, store
}

func (f *localOIDCFixture) beginCode(t *testing.T, client *Client, returnTo string) (string, AuthorizationFlow, url.Values) {
	t.Helper()
	handle, raw, err := client.Begin(context.Background(), returnTo)
	if err != nil {
		t.Fatal(err)
	}
	flow, err := client.store.PeekFlow(context.Background(), handle)
	if err != nil {
		t.Fatal(err)
	}
	f.setClaims(flow.Nonce, "subject-123", "urn:gouno:aal2")
	auth, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if auth.Scheme != "https" || auth.Host != f.server.URL[len("https://"):] ||
		auth.Path != "/authorize" || auth.Query().Get("state") != flow.State {
		t.Fatalf("invalid OIDC authorization URL: %s", raw)
	}
	return handle, flow, url.Values{
		"state": {flow.State}, "iss": {f.server.URL}, "code": {fmt.Sprintf("code-%d", time.Now().UnixNano())},
	}
}
