package tool

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/netip"
	"strings"
	"testing"
)

type scriptedLinkClient struct {
	statuses map[string]int
	errors   map[string]error
	methods  []string
}

func (c *scriptedLinkClient) Do(request *http.Request) (*http.Response, error) {
	c.methods = append(c.methods, request.Method)
	if err := c.errors[request.Method]; err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: c.statuses[request.Method], Body: io.NopCloser(strings.NewReader(""))}, nil
}

func TestExtractPublicLinksKeepsUniqueHTTPLinks(t *testing.T) {
	markdown := `[one](https://example.com/a) [duplicate](https://example.com/a)
[relative](/posts/one) [mail](mailto:test@example.com) [credential](https://user:pass@example.com/a)
![image](http://example.org/image.png)`
	links := extractPublicLinks(markdown, 20)
	if len(links) != 2 || links[0] != "https://example.com/a" ||
		links[1] != "http://example.org/image.png" {
		t.Fatalf("links = %#v", links)
	}
}

func TestPublicLinkIPPolicyBlocksInternalRanges(t *testing.T) {
	for _, value := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::1"} {
		if isPublicLinkIP(netip.MustParseAddr(value)) {
			t.Fatalf("expected %s to be blocked", value)
		}
	}
	if !isPublicLinkIP(netip.MustParseAddr("1.1.1.1")) {
		t.Fatal("expected a public address to be allowed")
	}
}

func TestSafeLinkClientRejectsLoopbackBeforeConnecting(t *testing.T) {
	request, err := http.NewRequestWithContext(context.Background(), http.MethodHead, "http://127.0.0.1:1/private", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := newSafeLinkClient().Do(request); err == nil {
		t.Fatal("expected loopback link to be rejected")
	}
}

func TestCheckPublicLinkFallsBackToGetWhenHeadIsRejected(t *testing.T) {
	client := &scriptedLinkClient{statuses: map[string]int{http.MethodHead: http.StatusMethodNotAllowed, http.MethodGet: http.StatusOK}, errors: map[string]error{}}
	result := checkPublicLink(context.Background(), client, "https://example.com/article")
	if !result.OK || result.StatusCode != http.StatusOK || strings.Join(client.methods, ",") != "HEAD,GET" {
		t.Fatalf("unexpected fallback result: %#v methods=%v", result, client.methods)
	}
}

func TestCheckPublicLinkFallsBackToGetAfterHeadNetworkError(t *testing.T) {
	client := &scriptedLinkClient{statuses: map[string]int{http.MethodGet: http.StatusOK}, errors: map[string]error{http.MethodHead: errors.New("head blocked")}}
	result := checkPublicLink(context.Background(), client, "https://example.com/article")
	if !result.OK || result.StatusCode != http.StatusOK || strings.Join(client.methods, ",") != "HEAD,GET" {
		t.Fatalf("unexpected network fallback result: %#v methods=%v", result, client.methods)
	}
}
