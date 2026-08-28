// Package authbff implements the Blog's confidential OIDC client boundary.
// Browser code never receives provider tokens or identity-provider cookies.
package authbff

import (
	"errors"
	"net/url"
	"strings"
	"time"
)

const (
	DefaultSessionCookie = "__Host-Http-blog-session"
	DefaultFlowCookie    = "__Host-Http-blog-oidc-flow"
)

type Config struct {
	Issuer         string
	ClientID       string
	ClientSecret   string
	RedirectURL    string
	PostLogoutURL  string
	Resource       string
	Scopes         []string
	SessionCookie  string
	FlowCookie     string
	SessionTTL     time.Duration
	FlowTTL        time.Duration
	RedisPrefix      string
	TinkKeysetPath   string
	InternalEndpoint string
}

func (c *Config) ApplyDefaults() {
	if len(c.Scopes) == 0 {
		c.Scopes = []string{"openid", "profile", "email"}
	}
	if c.SessionCookie == "" {
		c.SessionCookie = DefaultSessionCookie
	}
	if c.FlowCookie == "" {
		c.FlowCookie = DefaultFlowCookie
	}
	if c.SessionTTL == 0 {
		c.SessionTTL = 12 * time.Hour
	}
	if c.FlowTTL == 0 {
		c.FlowTTL = 5 * time.Minute
	}
	if c.RedisPrefix == "" {
		c.RedisPrefix = "blog:auth:v1"
	}
}

func (c Config) Validate() error {
	for label, value := range map[string]string{
		"issuer": c.Issuer, "client ID": c.ClientID, "client secret": c.ClientSecret,
		"redirect URL": c.RedirectURL, "resource": c.Resource, "Tink keyset path": c.TinkKeysetPath,
	} {
		if strings.TrimSpace(value) == "" {
			return errors.New(label + " is required")
		}
	}
	issuer, err := absoluteHTTPSURL(c.Issuer)
	if err != nil || issuer.RawQuery != "" || issuer.Fragment != "" {
		return errors.New("issuer must be an absolute HTTPS URL without query or fragment")
	}
	redirect, err := absoluteHTTPSURL(c.RedirectURL)
	if err != nil || redirect.RawQuery != "" || redirect.Fragment != "" {
		return errors.New("redirect URL must be an exact absolute HTTPS URL without query or fragment")
	}
	if _, err := absoluteHTTPSURL(c.Resource); err != nil {
		return errors.New("resource must be an absolute HTTPS URI")
	}
	if c.PostLogoutURL != "" {
		if _, err := absoluteHTTPSURL(c.PostLogoutURL); err != nil {
			return errors.New("post logout URL must be an absolute HTTPS URL")
		}
	}
	if c.SessionTTL <= 0 || c.FlowTTL <= 0 || c.FlowTTL > 15*time.Minute {
		return errors.New("session TTL must be positive and flow TTL must be between zero and 15 minutes")
	}
	if !strings.HasPrefix(c.SessionCookie, "__Host-") || !strings.HasPrefix(c.FlowCookie, "__Host-") {
		return errors.New("BFF cookies must use the __Host- prefix")
	}
	if len(c.Scopes) == 0 || c.Scopes[0] != "openid" {
		return errors.New("OIDC scopes must start with openid")
	}
	return nil
}

func absoluteHTTPSURL(value string) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return nil, errors.New("absolute HTTPS URL required")
	}
	return u, nil
}
