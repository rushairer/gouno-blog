package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type HTTPProvider struct {
	name, baseURL, key, model string
	client                    *http.Client
}

func NewHTTPProvider(name, baseURL, key, model string, allowedHosts []string, timeout time.Duration) (*HTTPProvider, error) {
	if name != "openai" && name != "anthropic" {
		return nil, fmt.Errorf("unsupported provider %q", name)
	}
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
		return nil, fmt.Errorf("%s: invalid upstream base_url", name)
	}
	if net.ParseIP(u.Hostname()) != nil && u.Hostname() != "127.0.0.1" {
		return nil, fmt.Errorf("%s: IP upstream hosts are not allowed", name)
	}
	allowed := false
	for _, host := range allowedHosts {
		if strings.EqualFold(host, u.Hostname()) {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, fmt.Errorf("%s: upstream host is not allowed", name)
	}
	if key == "" || model == "" {
		return nil, fmt.Errorf("%s: API key and model are required", name)
	}
	return &HTTPProvider{
		name: name, baseURL: strings.TrimRight(baseURL, "/"), key: key, model: model,
		client: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}

func (p *HTTPProvider) Name() string  { return p.name }
func (p *HTTPProvider) Model() string { return p.model }

func (p *HTTPProvider) do(ctx context.Context, path string, body any) (*http.Response, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if p.name == "openai" {
		req.Header.Set("Authorization", "Bearer "+p.key)
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
