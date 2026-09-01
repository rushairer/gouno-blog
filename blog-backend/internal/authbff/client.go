package authbff

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
	"golang.org/x/sync/singleflight"
)

type providerMetadata struct {
	EndSessionEndpoint                        string `json:"end_session_endpoint"`
	JWKSURI                                   string `json:"jwks_uri"`
	AuthorizationResponseIssuerParamSupported bool   `json:"authorization_response_iss_parameter_supported"`
}

type Client struct {
	config       Config
	store        *Store
	oauth        oauth2.Config
	verifier     *oidc.IDTokenVerifier
	endSession   string
	httpClient   *http.Client
	flowNow      func() time.Time
	refreshGroup singleflight.Group
}

var ErrSessionExpired = errors.New("BFF session has reached its absolute lifetime")

// sessionRemainingTTL enforces SessionTTL as an absolute lifetime from the
// original authorization callback. Redis persistence must never turn the
// browser's fixed-lifetime session cookie into a renewable bearer credential.
func (c *Client) sessionRemainingTTL(session Session) (time.Duration, error) {
	if session.CreatedAt.IsZero() {
		return 0, ErrSessionExpired
	}
	remaining := session.CreatedAt.Add(c.config.SessionTTL).Sub(c.flowNow())
	if remaining <= 0 {
		return 0, ErrSessionExpired
	}
	return remaining, nil
}

func (c *Client) withHTTPClient(ctx context.Context) context.Context {
	if c.httpClient != nil {
		ctx = oidc.ClientContext(ctx, c.httpClient)
		ctx = context.WithValue(ctx, oauth2.HTTPClient, c.httpClient)
	}
	return ctx
}

func NewClient(ctx context.Context, config Config, store *Store, httpClient *http.Client) (*Client, error) {
	config.ApplyDefaults()
	if err := config.Validate(); err != nil {
		return nil, err
	}
	if store == nil {
		return nil, errors.New("BFF store is required")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	ctx = oidc.ClientContext(ctx, httpClient)
	ctx = context.WithValue(ctx, oauth2.HTTPClient, httpClient)
	provider, err := oidc.NewProvider(ctx, config.Issuer)
	if err != nil {
		return nil, fmt.Errorf("discover OIDC provider: %w", err)
	}
	var metadata providerMetadata
	if err := provider.Claims(&metadata); err != nil {
		return nil, fmt.Errorf("decode OIDC metadata: %w", err)
	}
	if !metadata.AuthorizationResponseIssuerParamSupported {
		return nil, errors.New("OIDC provider must support the RFC 9207 authorization response iss parameter")
	}
	endpoint := provider.Endpoint()
	issuerURL, _ := absoluteHTTPSURL(config.Issuer)
	for label, rawEndpoint := range map[string]string{
		"authorization endpoint": endpoint.AuthURL,
		"token endpoint":         endpoint.TokenURL,
		"JWKS URI":               metadata.JWKSURI,
		"end-session endpoint":   metadata.EndSessionEndpoint,
	} {
		parsed, endpointErr := absoluteHTTPSURL(rawEndpoint)
		if endpointErr != nil || !sameOrigin(issuerURL, parsed) {
			return nil, fmt.Errorf("OIDC %s must use the configured issuer HTTPS origin", label)
		}
	}
	endpoint.AuthStyle = oauth2.AuthStyleInHeader
	return &Client{
		config: config,
		store:  store,
		oauth: oauth2.Config{
			ClientID: config.ClientID, ClientSecret: config.ClientSecret,
			RedirectURL: config.RedirectURL, Scopes: append([]string(nil), config.Scopes...), Endpoint: endpoint,
		},
		verifier:   provider.Verifier(&oidc.Config{ClientID: config.ClientID}),
		endSession: metadata.EndSessionEndpoint,
		httpClient: httpClient,
		flowNow:    time.Now,
	}, nil
}

func (c *Client) Begin(ctx context.Context, returnTo string) (handle, authorizationURL string, err error) {
	returnTo, err = SafeReturnTo(returnTo)
	if err != nil {
		return "", "", err
	}
	handle, err = RandomHandle()
	if err != nil {
		return "", "", err
	}
	state, err := RandomHandle()
	if err != nil {
		return "", "", err
	}
	nonce, err := RandomHandle()
	if err != nil {
		return "", "", err
	}
	verifier := oauth2.GenerateVerifier()
	flow := AuthorizationFlow{
		State: state, Nonce: nonce, PKCEVerifier: verifier, ReturnTo: returnTo, CreatedAt: c.flowNow().UTC(),
	}
	if err := c.store.PutFlow(ctx, handle, flow, c.config.FlowTTL); err != nil {
		return "", "", err
	}
	return handle, c.oauth.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("resource", c.config.Resource),
	), nil
}

func (c *Client) Complete(ctx context.Context, flowHandle string, query url.Values) (sessionHandle string, session Session, returnTo string, err error) {
	ctx = c.withHTTPClient(ctx)
	flow, err := c.store.TakeFlow(ctx, flowHandle)
	if err != nil {
		return "", session, "", err
	}
	if providerError := query.Get("error"); providerError != "" {
		return "", session, "", fmt.Errorf("authorization failed: %s", providerError)
	}
	if !constantTimeEqual(query.Get("state"), flow.State) {
		return "", session, "", errors.New("invalid OAuth state")
	}
	if !constantTimeEqual(query.Get("iss"), c.config.Issuer) {
		return "", session, "", errors.New("invalid authorization response issuer")
	}
	code := query.Get("code")
	if code == "" {
		return "", session, "", errors.New("authorization code is missing")
	}
	token, err := c.oauth.Exchange(ctx, code,
		oauth2.VerifierOption(flow.PKCEVerifier),
		oauth2.SetAuthURLParam("resource", c.config.Resource),
	)
	if err != nil {
		return "", session, "", fmt.Errorf("exchange authorization code: %w", err)
	}
	rawIDToken, _ := token.Extra("id_token").(string)
	if rawIDToken == "" {
		return "", session, "", errors.New("token response is missing id_token")
	}
	idToken, err := c.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return "", session, "", fmt.Errorf("verify ID token: %w", err)
	}
	if !constantTimeEqual(idToken.Nonce, flow.Nonce) {
		return "", session, "", errors.New("invalid ID token nonce")
	}
	var claims struct {
		Issuer   string   `json:"iss"`
		Subject  string   `json:"sub"`
		SID      string   `json:"sid"`
		AuthTime int64    `json:"auth_time"`
		AMR      []string `json:"amr"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return "", session, "", fmt.Errorf("decode ID token claims: %w", err)
	}
	allClaims := map[string]any{}
	if err := idToken.Claims(&allClaims); err != nil {
		return "", session, "", fmt.Errorf("decode verified ID token claims: %w", err)
	}
	if claims.Issuer != c.config.Issuer || claims.Subject == "" {
		return "", session, "", errors.New("ID token identity claims are incomplete")
	}
	sessionHandle, err = RandomHandle()
	if err != nil {
		return "", session, "", err
	}
	session = Session{
		Issuer: claims.Issuer, Subject: claims.Subject, SID: claims.SID,
		AccessToken: token.AccessToken, RefreshToken: token.RefreshToken, IDToken: rawIDToken,
		TokenExpiry: token.Expiry, AuthTime: claims.AuthTime, AMR: claims.AMR, CreatedAt: c.flowNow().UTC(),
		Claims: allClaims,
	}
	if err := c.store.PutSession(ctx, sessionHandle, session, c.config.SessionTTL); err != nil {
		return "", Session{}, "", err
	}
	return sessionHandle, session, flow.ReturnTo, nil
}

func (c *Client) Refresh(ctx context.Context, sessionHandle string) (Session, error) {
	ctx = c.withHTTPClient(ctx)
	res, err, _ := c.refreshGroup.Do(sessionHandle, func() (any, error) {
		session, err := c.store.GetSession(ctx, sessionHandle)
		if err != nil {
			return Session{}, err
		}
		if _, err := c.sessionRemainingTTL(session); err != nil {
			return Session{}, err
		}
		// If a concurrent request in this process already refreshed the session, return it.
		if session.TokenExpiry.After(c.flowNow().Add(30 * time.Second)) {
			return session, nil
		}
		if session.RefreshToken == "" {
			return Session{}, errors.New("no refresh token in session")
		}

		// Acquire distributed lock across replicas
		// Keep the lock longer than the configured OAuth HTTP timeout (30s), so
		// a slow token response cannot allow a second replica to reuse a rotated
		// refresh token. The owner-bound Lua release remains safe after expiry.
		lockTTL := 45 * time.Second
		lockOwner, acquired, err := c.store.AcquireRefreshLock(ctx, sessionHandle, lockTTL)
		if err != nil {
			return Session{}, fmt.Errorf("acquire refresh lock: %w", err)
		}
		if !acquired {
			// Another replica is refreshing this token. Wait and re-check session.
			waitStart := time.Now()
			for time.Since(waitStart) < 5*time.Second {
				select {
				case <-ctx.Done():
					return Session{}, ctx.Err()
				case <-time.After(100 * time.Millisecond):
				}
				session, err = c.store.GetSession(ctx, sessionHandle)
				if err == nil && session.TokenExpiry.After(c.flowNow().Add(30*time.Second)) {
					return session, nil
				}
				lockOwner, acquired, err = c.store.AcquireRefreshLock(ctx, sessionHandle, lockTTL)
				if err != nil {
					return Session{}, fmt.Errorf("re-acquire refresh lock: %w", err)
				}
				if acquired {
					break
				}
			}
			if !acquired {
				return Session{}, errors.New("concurrent session refresh in progress")
			}
		}
		defer func() {
			_ = c.store.ReleaseRefreshLock(context.Background(), sessionHandle, lockOwner)
		}()

		// Double-check session after acquiring distributed lock
		session, err = c.store.GetSession(ctx, sessionHandle)
		if err != nil {
			return Session{}, err
		}
		if _, err := c.sessionRemainingTTL(session); err != nil {
			return Session{}, err
		}
		if session.TokenExpiry.After(c.flowNow().Add(30 * time.Second)) {
			return session, nil
		}
		if session.RefreshToken == "" {
			return Session{}, errors.New("no refresh token in session")
		}

		previousSession := session
		t := &oauth2.Token{
			RefreshToken: session.RefreshToken,
			Expiry:       session.TokenExpiry,
		}
		tokenSource := c.oauth.TokenSource(ctx, t)
		newToken, err := tokenSource.Token()
		if err != nil {
			return Session{}, fmt.Errorf("refresh token exchange: %w", err)
		}

		session.AccessToken = newToken.AccessToken
		if newToken.RefreshToken != "" {
			session.RefreshToken = newToken.RefreshToken
		}
		session.TokenExpiry = newToken.Expiry

		if rawIDToken, ok := newToken.Extra("id_token").(string); ok && rawIDToken != "" {
			idToken, verifyErr := c.verifier.Verify(ctx, rawIDToken)
			if verifyErr != nil {
				_ = c.revokeReplacementToken(context.Background(), newToken)
				return Session{}, fmt.Errorf("verify refreshed ID token: %w", verifyErr)
			}
			var claims struct {
				Issuer   string   `json:"iss"`
				Subject  string   `json:"sub"`
				SID      string   `json:"sid"`
				AuthTime int64    `json:"auth_time"`
				AMR      []string `json:"amr"`
			}
			if claimsErr := idToken.Claims(&claims); claimsErr != nil {
				_ = c.revokeReplacementToken(context.Background(), newToken)
				return Session{}, fmt.Errorf("decode refreshed ID token claims: %w", claimsErr)
			}
			if claims.Issuer != session.Issuer || claims.Subject != session.Subject {
				_ = c.revokeReplacementToken(context.Background(), newToken)
				return Session{}, errors.New("refreshed ID token identity mismatch")
			}
			allClaims := map[string]any{}
			if claimsErr := idToken.Claims(&allClaims); claimsErr != nil {
				_ = c.revokeReplacementToken(context.Background(), newToken)
				return Session{}, fmt.Errorf("decode refreshed ID token: %w", claimsErr)
			}
			session.IDToken = rawIDToken
			session.SID = claims.SID
			session.AuthTime = claims.AuthTime
			session.AMR = claims.AMR
			session.Claims = allClaims
		}

		remainingTTL, err := c.sessionRemainingTTL(session)
		if err != nil {
			_ = c.revokeReplacementToken(context.Background(), newToken)
			return Session{}, err
		}
		if err := c.store.ReplaceSession(ctx, sessionHandle, previousSession, session, remainingTTL); err != nil {
			_ = c.revokeReplacementToken(context.Background(), newToken)
			return Session{}, err
		}
		return session, nil
	})
	if err != nil {
		return Session{}, err
	}
	return res.(Session), nil
}

func (c *Client) revokeReplacementToken(ctx context.Context, token *oauth2.Token) error {
	if token == nil {
		return nil
	}
	if token.RefreshToken != "" {
		return c.RevokeToken(ctx, token.RefreshToken, "refresh_token")
	}
	return c.RevokeToken(ctx, token.AccessToken, "access_token")
}

func (c *Client) LogoutURL(ctx context.Context, session Session, postLogoutRedirect string) (string, error) {
	if c.endSession == "" {
		return "", nil
	}
	endSessionURL, err := url.Parse(c.endSession)
	if err != nil {
		return "", err
	}
	q := endSessionURL.Query()
	// Do NOT put id_token_hint in the URL to prevent token leakage in browser history, referer, or logs.
	targetRedirect := c.config.PostLogoutURL
	if postLogoutRedirect != "" {
		if safe, err := SafeReturnTo(postLogoutRedirect); err == nil {
			targetRedirect = safe
		}
	}
	if targetRedirect != "" {
		q.Set("post_logout_redirect_uri", targetRedirect)
	}
	q.Set("client_id", c.config.ClientID)
	// Generate and store a state parameter for CSRF protection on the
	// RP-initiated logout flow. The OP will echo it back in the post-logout
	// redirect, allowing the BFF to verify the response authenticity.
	logoutState, err := RandomHandle()
	if err != nil {
		return "", fmt.Errorf("generate logout state: %w", err)
	}
	if err := c.store.PutLogoutState(ctx, logoutState, c.config.FlowTTL); err != nil {
		return "", fmt.Errorf("store logout state: %w", err)
	}
	q.Set("state", logoutState)
	endSessionURL.RawQuery = q.Encode()
	return endSessionURL.String(), nil
}

func (c *Client) BackChannelLogout(ctx context.Context, rawLogoutToken string) error {
	ctx = c.withHTTPClient(ctx)
	if rawLogoutToken == "" {
		return errors.New("logout_token is required")
	}
	idToken, err := c.verifier.Verify(ctx, rawLogoutToken)
	if err != nil {
		return fmt.Errorf("verify logout token: %w", err)
	}
	if idToken.Nonce != "" {
		return errors.New("logout token must not contain a nonce claim")
	}
	if err := validateLogoutTokenType(rawLogoutToken); err != nil {
		return err
	}
	var claims struct {
		Issuer    string                    `json:"iss"`
		Subject   string                    `json:"sub"`
		SID       string                    `json:"sid"`
		Events    map[string]map[string]any `json:"events"`
		JWTID     string                    `json:"jti"`
		IssuedAt  int64                     `json:"iat"`
		ExpiresAt int64                     `json:"exp"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return fmt.Errorf("decode logout token claims: %w", err)
	}
	if claims.Issuer != c.config.Issuer {
		return errors.New("logout token issuer mismatch")
	}
	if claims.JWTID == "" {
		return errors.New("logout token missing jti claim")
	}
	now := c.flowNow()
	if err := validateLogoutTokenIssuedAt(claims.IssuedAt, now); err != nil {
		return err
	}
	if _, ok := claims.Events["http://schemas.openid.net/event/backchannel-logout"]; !ok {
		return errors.New("logout token missing backchannel-logout event claim")
	}
	if claims.SID == "" && claims.Subject == "" {
		return errors.New("logout token must contain sid or sub")
	}

	// Replay protection is committed only after session deletion succeeds. A
	// duplicate delivery of an already-processed logout token is idempotent.
	replayTTL := 24 * time.Hour
	if claims.ExpiresAt > 0 {
		expTime := time.Unix(claims.ExpiresAt, 0)
		if rem := expTime.Sub(now); rem > 0 && rem < replayTTL {
			replayTTL = rem
		}
	}
	claimOwner, acquired, processed, err := c.store.ClaimLogoutToken(ctx, claims.JWTID, time.Minute)
	if err != nil {
		return fmt.Errorf("claim logout token: %w", err)
	}
	if processed {
		return nil
	}
	if !acquired {
		return errors.New("logout token is already being processed")
	}
	completed := false
	defer func() {
		if !completed {
			_ = c.store.ReleaseLogoutToken(context.Background(), claims.JWTID, claimOwner)
		}
	}()

	// If SID is present, isolate logout to that specific session only.
	if claims.SID != "" {
		err = c.store.DeleteBySID(ctx, claims.Issuer, claims.SID)
	} else if claims.Subject != "" {
		// Otherwise fallback to revoking all sessions for the subject.
		err = c.store.DeleteByIdentity(ctx, claims.Issuer, claims.Subject)
	}
	if err != nil {
		return err
	}
	if err := c.store.FinishLogoutToken(ctx, claims.JWTID, claimOwner, replayTTL); err != nil {
		return fmt.Errorf("mark logout token processed: %w", err)
	}
	completed = true
	return nil
}

func validateLogoutTokenType(rawLogoutToken string) error {
	parsedToken, _, err := jwt.NewParser().ParseUnverified(rawLogoutToken, jwt.MapClaims{})
	if err != nil {
		return fmt.Errorf("parse verified logout token header: %w", err)
	}
	if tokenType, _ := parsedToken.Header["typ"].(string); tokenType != "logout+jwt" {
		return errors.New("logout token typ must be logout+jwt")
	}
	return nil
}

func validateLogoutTokenIssuedAt(rawIssuedAt int64, now time.Time) error {
	if rawIssuedAt == 0 {
		return errors.New("logout token missing iat claim")
	}
	issuedAt := time.Unix(rawIssuedAt, 0)
	if issuedAt.After(now.Add(time.Minute)) || issuedAt.Before(now.Add(-5*time.Minute)) {
		return errors.New("logout token iat is outside the accepted window")
	}
	return nil
}

// RevokeToken calls the OP's RFC 7009 revocation endpoint to immediately invalidate a token server-to-server.
func (c *Client) RevokeToken(ctx context.Context, token string, tokenTypeHint string) error {
	if token == "" {
		return nil
	}
	ctx = c.withHTTPClient(ctx)
	revokeEndpoint := strings.TrimRight(c.config.Issuer, "/") + "/oauth2/revoke"
	form := url.Values{
		"token": {token},
	}
	if tokenTypeHint != "" {
		form.Set("token_type_hint", tokenTypeHint)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, revokeEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("create revoke request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.config.ClientID != "" && c.config.ClientSecret != "" {
		req.SetBasicAuth(c.config.ClientID, c.config.ClientSecret)
	}

	client := c.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("execute revoke request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("token revocation returned status %d", resp.StatusCode)
	}
	return nil
}

func SafeReturnTo(value string) (string, error) {
	if value == "" {
		return "/", nil
	}
	u, err := url.Parse(value)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/") || strings.HasPrefix(u.Path, "//") || strings.Contains(u.Path, "\\") || strings.ContainsAny(value, "\r\n") {
		return "", errors.New("return_to must be a local absolute path")
	}
	return u.RequestURI(), nil
}

func constantTimeEqual(left, right string) bool {
	if len(left) != len(right) || left == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}
