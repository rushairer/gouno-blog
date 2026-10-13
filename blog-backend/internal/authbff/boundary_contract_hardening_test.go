package authbff

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func boundaryBFFConfig() Config {
	value := Config{
		Issuer: "https://sso.local.test", ClientID: "blog-bff",
		ClientSecret: "do-not-leak-client-secret",
		RedirectURL: "https://blog.local.test/api/auth/callback",
		PostLogoutURL: "https://blog.local.test/api/auth/logout/callback",
		Resource: "https://blog.local.test/api",
		TinkKeysetPath: "/run/secrets/blog-keyset",
	}
	value.ApplyDefaults()
	return value
}

func TestConfidentialBFFConfigDefaultsAndValidationMatrix(t *testing.T) {
	base := boundaryBFFConfig()
	if err := base.Validate(); err != nil {
		t.Fatalf("valid confidential configuration rejected: %v", err)
	}
	if base.SessionCookie != DefaultSessionCookie || base.FlowCookie != DefaultFlowCookie ||
		base.SessionTTL != 12*time.Hour || base.FlowTTL != 5*time.Minute ||
		base.RedisPrefix != "blog:auth:v1" || base.RequiredACR != "urn:gouno:aal2" ||
		!reflect.DeepEqual(base.Scopes, []string{"openid", "profile", "email"}) {
		t.Fatalf("confidential defaults changed: %#v", base)
	}
	custom := base
	custom.SessionCookie = "__Host-Http-private-session"
	custom.FlowCookie = "__Host-Http-private-flow"
	custom.Scopes = []string{"openid", "custom"}
	custom.FlowTTL = 3 * time.Minute
	custom.SessionTTL = time.Hour
	custom.RedisPrefix = "tenant:private"
	custom.ApplyDefaults()
	if custom.SessionCookie != "__Host-Http-private-session" ||
		custom.FlowCookie != "__Host-Http-private-flow" ||
		!reflect.DeepEqual(custom.Scopes, []string{"openid", "custom"}) ||
		custom.FlowTTL != 3*time.Minute || custom.SessionTTL != time.Hour ||
		custom.RedisPrefix != "tenant:private" || custom.Validate() != nil {
		t.Fatal("ApplyDefaults clobbered configured, valid BFF policy")
	}

	for _, tc := range []struct {
		name string
		mutate func(*Config)
	}{
		{"missing_issuer", func(c *Config) { c.Issuer = " " }},
		{"missing_client_id", func(c *Config) { c.ClientID = "" }},
		{"missing_client_secret", func(c *Config) { c.ClientSecret = "" }},
		{"missing_keyset", func(c *Config) { c.TinkKeysetPath = "" }},
		{"http_issuer", func(c *Config) { c.Issuer = "http://sso.local.test" }},
		{"issuer_credentials", func(c *Config) { c.Issuer = "https://alice:secret@sso.local.test" }},
		{"issuer_query", func(c *Config) { c.Issuer += "?tenant=test" }},
		{"issuer_fragment", func(c *Config) { c.Issuer += "#private" }},
		{"relative_redirect", func(c *Config) { c.RedirectURL = "/api/auth/callback" }},
		{"redirect_wrong_path", func(c *Config) { c.RedirectURL = "https://blog.local.test/oauth/callback" }},
		{"redirect_query", func(c *Config) { c.RedirectURL += "?code=exfiltrate" }},
		{"redirect_fragment", func(c *Config) { c.RedirectURL += "#state" }},
		{"redirect_userinfo", func(c *Config) { c.RedirectURL = "https://password@blog.local.test/api/auth/callback" }},
		{"resource_other_origin", func(c *Config) { c.Resource = "https://evil.example/api" }},
		{"resource_wrong_path", func(c *Config) { c.Resource = "https://blog.local.test/private" }},
		{"resource_query", func(c *Config) { c.Resource += "?scope=admin" }},
		{"resource_fragment", func(c *Config) { c.Resource += "#private" }},
		{"logout_external_origin", func(c *Config) { c.PostLogoutURL = "https://evil.example/api/auth/logout/callback" }},
		{"logout_wrong_path", func(c *Config) { c.PostLogoutURL = "https://blog.local.test/admin" }},
		{"logout_query", func(c *Config) { c.PostLogoutURL += "?return_to=/admin" }},
		{"logout_fragment", func(c *Config) { c.PostLogoutURL += "#private" }},
		{"session_cookie_without_host", func(c *Config) { c.SessionCookie = "blog-session" }},
		{"flow_cookie_without_host", func(c *Config) { c.FlowCookie = "blog-flow" }},
		{"zero_session_ttl", func(c *Config) { c.SessionTTL = 0 }},
		{"negative_session_ttl", func(c *Config) { c.SessionTTL = -time.Second }},
		{"negative_flow_ttl", func(c *Config) { c.FlowTTL = -time.Second }},
		{"oversized_flow_ttl", func(c *Config) { c.FlowTTL = 16 * time.Minute }},
		{"missing_openid", func(c *Config) { c.Scopes = []string{"profile", "openid"} }},
		{"empty_scope", func(c *Config) { c.Scopes = nil }},
		{"weaker_required_acr", func(c *Config) { c.RequiredACR = "urn:gouno:aal1" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			value := base
			tc.mutate(&value)
			err := value.Validate()
			if err == nil {
				t.Fatal("invalid BFF security setting accepted")
			}
			if strings.Contains(err.Error(), base.ClientSecret) {
				t.Fatalf("validation error disclosed configured credential: %v", err)
			}
		})
	}
}

func TestRPLogoutNeverSendsUnregisteredBrowserDestinationToOIDCProvider(t *testing.T) {
	client, store := testBFFClientWithStore(t)
	ctx := context.Background()
	session := Session{
		Issuer: client.config.Issuer, Subject: "private-subject",
		IDToken: "PRIVATE-ID-TOKEN", AccessToken: "PRIVATE-ACCESS-TOKEN",
		RefreshToken: "PRIVATE-REFRESH-TOKEN",
	}
	for _, destination := range []string{"", "/admin", "/account", "/?after=logout", "//evil.example", "https://evil.example/"} {
		t.Run(destination, func(t *testing.T) {
			raw, err := client.LogoutURL(ctx, session, destination)
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := url.Parse(raw)
			if err != nil {
				t.Fatal(err)
			}
			if parsed.Scheme != "https" || parsed.Host != "sso.local.test" ||
				parsed.Query().Get("post_logout_redirect_uri") != client.config.PostLogoutURL ||
				parsed.Query().Get("client_id") != client.config.ClientID {
				t.Fatalf("unregistered logout callback or client identity: %q", raw)
			}
			for _, secret := range []string{session.IDToken, session.AccessToken, session.RefreshToken, "id_token_hint", destination} {
				if secret != "" && strings.Contains(raw, secret) {
					t.Fatalf("private/unregistered logout information included in browser URL: %q", raw)
				}
			}
			state := parsed.Query().Get("state")
			if state == "" {
				t.Fatal("logout URL did not include server-side state nonce")
			}
			if err := store.TakeLogoutState(ctx, state); err != nil {
				t.Fatalf("first logout state acknowledgement failed: %v", err)
			}
			if err := store.TakeLogoutState(ctx, state); !errors.Is(err, ErrNotFound) {
				t.Fatalf("logout state replay accepted: %v", err)
			}
		})
	}

	// The identity provider may advertise query parameters on its endpoint,
	// but they must not override the Blog's fixed registered callback.
	client.endSession = "https://sso.local.test/oidc/logout?post_logout_redirect_uri=https%3A%2F%2Fevil.example%2F"
	raw, err := client.LogoutURL(ctx, session, "/admin")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got := parsed.Query().Get("post_logout_redirect_uri"); got != client.config.PostLogoutURL {
		t.Fatalf("provider-supplied query overrode registered callback: %q", got)
	}
	client.config.PostLogoutURL = ""
	raw, err = client.LogoutURL(ctx, session, "/admin")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err = url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Query().Has("post_logout_redirect_uri") {
		t.Fatal("missing registered logout callback must never fall back to an unregistered path")
	}
}

func TestBFFCookiesAreHostOnlySecureAndHTTPOnly(t *testing.T) {
	for _, tc := range []struct {
		name string
		cookie string
		maxAge int
		mode http.SameSite
	}{
		{"session", DefaultSessionCookie, 3600, http.SameSiteStrictMode},
		{"flow", DefaultFlowCookie, 300, http.SameSiteLaxMode},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.GET("/cookie", func(ctx *gin.Context) {
				setHostCookie(ctx, tc.cookie, "opaque", tc.maxAge, tc.mode)
				ctx.Status(http.StatusNoContent)
			})
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/cookie", nil))
			cookies := rec.Result().Cookies()
			if len(cookies) != 1 || cookies[0].Name != tc.cookie ||
				!cookies[0].Secure || !cookies[0].HttpOnly ||
				cookies[0].Path != "/" || cookies[0].Domain != "" ||
				cookies[0].SameSite != tc.mode || cookies[0].MaxAge != tc.maxAge {
				t.Fatalf("insecure Host-only cookie: %#v", cookies)
			}
			router = gin.New()
			router.GET("/clear", func(ctx *gin.Context) {
				clearHostCookie(ctx, tc.cookie, tc.mode)
				ctx.Status(http.StatusNoContent)
			})
			rec = httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/clear", nil))
			cookies = rec.Result().Cookies()
			if len(cookies) != 1 || cookies[0].Name != tc.cookie ||
				cookies[0].MaxAge >= 0 || !cookies[0].Secure || !cookies[0].HttpOnly ||
				cookies[0].Path != "/" || cookies[0].Domain != "" || cookies[0].SameSite != tc.mode {
				t.Fatalf("unsafe cookie clearing: %#v", cookies)
			}
		})
	}
}
