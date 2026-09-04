package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"time"
)

type HTTPProvider struct {
	name, baseURL, key, model, protocolMode, streamMode string
	client                                *http.Client
}

func (p *HTTPProvider) ProtocolMode() string { return p.protocolMode }
func (p *HTTPProvider) StreamMode() string   { return p.streamMode }

func NewHTTPProvider(name, baseURL, key, model string, allowedHosts []string, timeout time.Duration) (*HTTPProvider, error) {
	return NewHTTPProviderWithConfig(name, baseURL, key, model, "", "auto", allowedHosts, timeout)
}

func NewHTTPProviderWithMode(name, baseURL, key, model, protocolMode string, allowedHosts []string, timeout time.Duration) (*HTTPProvider, error) {
	return NewHTTPProviderWithConfig(name, baseURL, key, model, protocolMode, "auto", allowedHosts, timeout)
}

func NewHTTPProviderWithConfig(name, baseURL, key, model, protocolMode, streamMode string, allowedHosts []string, timeout time.Duration) (*HTTPProvider, error) {
	if name != "openai" && name != "anthropic" && name != "gemini" {
		return nil, fmt.Errorf("unsupported provider %q", name)
	}
	if err := ValidateUpstreamURL(context.Background(), baseURL, allowedHosts); err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	if key == "" || model == "" {
		return nil, fmt.Errorf("%s: API key and model are required", name)
	}
	if streamMode == "" {
		streamMode = "auto"
	}
	return &HTTPProvider{
		name: name, baseURL: strings.TrimRight(baseURL, "/"), key: key, model: model,
		protocolMode: protocolMode, streamMode: streamMode,
		client: &http.Client{
			Timeout:   timeout,
			Transport: safeTransport(allowedHosts, timeout),
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}

func ValidateUpstreamURL(ctx context.Context, baseURL string, allowedHosts []string) error {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Hostname() == "" {
		return errors.New("invalid upstream base_url")
	}
	host := strings.ToLower(parsed.Hostname())
	explicitlyAllowed := containsHost(allowedHosts, host)
	syntheticDNSAllowed := !isIPAddress(host)
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && explicitlyAllowed && isLoopbackHost(host)) {
		return errors.New("upstream URL must use HTTPS")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("upstream base_url cannot contain a query or fragment")
	}
	addresses, err := resolveHost(ctx, host)
	if err != nil {
		return err
	}
	return validateAddresses(addresses, explicitlyAllowed, syntheticDNSAllowed)
}

func safeTransport(allowedHosts []string, timeout time.Duration) *http.Transport {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, errors.New("invalid upstream address")
			}
			addresses, err := resolveHost(ctx, host)
			if err != nil {
				return nil, err
			}
			explicitlyAllowed := containsHost(allowedHosts, host)
			syntheticDNSAllowed := !isIPAddress(host)
			if err := validateAddresses(addresses, explicitlyAllowed, syntheticDNSAllowed); err != nil {
				return nil, err
			}
			for _, candidate := range addresses {
				if isUsableAddress(candidate, explicitlyAllowed, syntheticDNSAllowed) {
					return dialer.DialContext(ctx, network, net.JoinHostPort(candidate.String(), port))
				}
			}
			return nil, errors.New("upstream host has no permitted address")
		},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
	}
}

// NewSafeHTTPClient returns the same SSRF-hardened client used by chat
// providers. Callers still need to validate and normalize their base URL.
func NewSafeHTTPClient(allowedHosts []string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: safeTransport(allowedHosts, timeout),
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func resolveHost(ctx context.Context, host string) ([]netip.Addr, error) {
	if parsed, err := netip.ParseAddr(host); err == nil {
		return []netip.Addr{parsed.Unmap()}, nil
	}
	resolveCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupNetIP(resolveCtx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("upstream host could not be resolved")
	}
	for index := range addresses {
		addresses[index] = addresses[index].Unmap()
	}
	return addresses, nil
}

func validateAddresses(addresses []netip.Addr, explicitlyAllowed, syntheticDNSAllowed bool) error {
	for _, address := range addresses {
		if isNeverAllowedAddress(address) {
			return errors.New("upstream host resolves to a forbidden address")
		}
		if syntheticDNSAllowed && isSyntheticDNSAddress(address) {
			continue
		}
		if !explicitlyAllowed && !isPublicAddress(address) {
			return errors.New("private upstream host requires explicit allowlisting")
		}
	}
	return nil
}

func isUsableAddress(address netip.Addr, explicitlyAllowed, syntheticDNSAllowed bool) bool {
	return !isNeverAllowedAddress(address) &&
		(explicitlyAllowed || isPublicAddress(address) ||
			(syntheticDNSAllowed && isSyntheticDNSAddress(address)))
}

func isNeverAllowedAddress(address netip.Addr) bool {
	address = address.Unmap()
	return !address.IsValid() || address.IsUnspecified() || address.IsMulticast() ||
		address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast()
}

func isPublicAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() ||
		address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() ||
		address.IsMulticast() || address.IsUnspecified() {
		return false
	}
	return !slices.ContainsFunc(nonPublicUpstreamPrefixes, func(prefix netip.Prefix) bool {
		return prefix.Contains(address)
	})
}

var nonPublicUpstreamPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("2001:db8::/32"),
}

var syntheticDNSPrefix = netip.MustParsePrefix("198.18.0.0/15")

func isSyntheticDNSAddress(address netip.Addr) bool {
	return syntheticDNSPrefix.Contains(address.Unmap())
}

func isIPAddress(host string) bool {
	_, err := netip.ParseAddr(host)
	return err == nil
}

func containsHost(allowedHosts []string, host string) bool {
	return slices.ContainsFunc(allowedHosts, func(allowed string) bool {
		return strings.EqualFold(strings.TrimSpace(allowed), host)
	})
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	address, err := netip.ParseAddr(host)
	return err == nil && address.IsLoopback()
}

func (p *HTTPProvider) Name() string  { return p.name }
func (p *HTTPProvider) Model() string { return p.model }

func (p *HTTPProvider) do(ctx context.Context, path string, body any) (*http.Response, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	baseURL := strings.TrimRight(p.baseURL, "/")
	if strings.HasSuffix(baseURL, "/v1beta") && strings.HasPrefix(path, "/v1beta/") {
		baseURL = strings.TrimSuffix(baseURL, "/v1beta")
	} else if strings.HasSuffix(baseURL, "/v1") && (strings.HasPrefix(path, "/v1/") || strings.HasPrefix(path, "/v1beta/")) {
		baseURL = strings.TrimSuffix(baseURL, "/v1")
	}
	targetURL := baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if p.name == "openai" {
		req.Header.Set("Authorization", "Bearer "+p.key)
	} else if p.name == "gemini" {
		req.Header.Set("x-goog-api-key", p.key)
	} else {
		req.Header.Set("x-api-key", p.key)
		req.Header.Set("anthropic-version", "2023-06-01")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		limited, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("upstream %s returned %d: %s", p.name, resp.StatusCode, strings.TrimSpace(string(limited)))
	}
	return resp, nil
}
