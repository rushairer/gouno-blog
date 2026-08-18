package tool

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const maxCheckedLinks = 20

var markdownLinkPattern = regexp.MustCompile(`!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)`)

type linkHTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

type linkCheckResult struct {
	URL        string `json:"url"`
	StatusCode int    `json:"status_code,omitempty"`
	OK         bool   `json:"ok"`
	Error      string `json:"error,omitempty"`
}

func (t *BlogTools) checkLinks(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	links := extractPublicLinks(post.Content, maxCheckedLinks)
	results := make([]linkCheckResult, 0, len(links))
	for _, target := range links {
		result := checkPublicLink(ctx, t.linkClient, target)
		results = append(results, result)
	}
	return map[string]any{
		"post_id": args.ID, "checked": len(results),
		"truncated": len(extractPublicLinks(post.Content, maxCheckedLinks+1)) > maxCheckedLinks,
		"results":   results,
	}, nil
}

func (t *BlogTools) checkPageLinks(ctx context.Context, raw json.RawMessage) (any, error) {
	if t.pages == nil {
		return nil, ErrInvalidArgument
	}
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	page, err := t.pages.GetPage(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	links := extractPublicLinks(page.Content, maxCheckedLinks)
	results := make([]linkCheckResult, 0, len(links))
	for _, target := range links {
		result := checkPublicLink(ctx, t.linkClient, target)
		results = append(results, result)
	}
	return map[string]any{
		"page_id": args.ID, "checked": len(results),
		"truncated": len(extractPublicLinks(page.Content, maxCheckedLinks+1)) > maxCheckedLinks,
		"results":   results,
	}, nil
}

func checkPublicLink(ctx context.Context, client linkHTTPClient, target string) linkCheckResult {
	result := linkCheckResult{URL: target}
	request, requestErr := http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
	if requestErr != nil {
		result.Error = "invalid URL"
		return result
	}
	response, requestErr := client.Do(request)
	if requestErr == nil {
		result.StatusCode = response.StatusCode
		result.OK = response.StatusCode >= 200 && response.StatusCode < 400
		_ = response.Body.Close()
		if result.OK || (response.StatusCode != http.StatusForbidden && response.StatusCode != http.StatusMethodNotAllowed && response.StatusCode != http.StatusNotImplemented) {
			return result
		}
		// Some publishers reject HEAD while serving the same URL normally.
		// Continue with a bounded GET before reporting a broken source.
	} else {
		result.Error = safeLinkError(requestErr)
	}

	getRequest, getErr := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if getErr != nil {
		return result
	}
	getRequest.Header.Set("Range", "bytes=0-0")
	getResponse, getErr := client.Do(getRequest)
	if getErr != nil {
		if result.Error == "" {
			result.Error = safeLinkError(getErr)
		}
		return result
	}
	result.StatusCode = getResponse.StatusCode
	result.OK = getResponse.StatusCode >= 200 && getResponse.StatusCode < 400
	result.Error = ""
	_ = getResponse.Body.Close()
	return result
}

func extractPublicLinks(markdown string, limit int) []string {
	matches := markdownLinkPattern.FindAllStringSubmatch(markdown, -1)
	result := make([]string, 0, min(len(matches), limit))
	seen := make(map[string]struct{})
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		parsed, err := url.Parse(strings.TrimSpace(match[1]))
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") ||
			parsed.Host == "" || parsed.User != nil {
			continue
		}
		target := parsed.String()
		if _, exists := seen[target]; exists {
			continue
		}
		seen[target] = struct{}{}
		result = append(result, target)
		if len(result) == limit {
			break
		}
	}
	return result
}

func newSafeLinkClient() *http.Client {
	dialer := &net.Dialer{Timeout: 4 * time.Second, KeepAlive: 15 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, errors.New("invalid link address")
			}
			addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil || len(addresses) == 0 {
				return nil, errors.New("link host could not be resolved")
			}
			for _, address := range addresses {
				if isPublicLinkIP(address) {
					return dialer.DialContext(ctx, network, net.JoinHostPort(address.String(), port))
				}
			}
			return nil, errors.New("link target is not public")
		},
		TLSHandshakeTimeout:   4 * time.Second,
		ResponseHeaderTimeout: 4 * time.Second,
		DisableKeepAlives:     true,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   5 * time.Second,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many link redirects")
			}
			if request.URL.Scheme != "http" && request.URL.Scheme != "https" {
				return errors.New("link redirect scheme is not allowed")
			}
			if request.URL.User != nil || request.URL.Hostname() == "" {
				return errors.New("invalid link redirect")
			}
			return nil
		},
	}
}

var nonPublicLinkPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("2001:db8::/32"),
}

func isPublicLinkIP(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || !address.IsGlobalUnicast() || address.IsPrivate() ||
		address.IsLoopback() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() ||
		address.IsMulticast() || address.IsUnspecified() {
		return false
	}
	for _, prefix := range nonPublicLinkPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

func safeLinkError(err error) string {
	message := err.Error()
	for _, allowed := range []string{
		"invalid link address", "link host could not be resolved", "link target is not public",
		"too many link redirects", "link redirect scheme is not allowed", "invalid link redirect",
	} {
		if strings.Contains(message, allowed) {
			return allowed
		}
	}
	if timeout, ok := err.(net.Error); ok && timeout.Timeout() {
		return "link check timed out"
	}
	return "link check failed"
}
