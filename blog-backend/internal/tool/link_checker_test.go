package tool

import (
	"context"
	"net/http"
	"net/netip"
	"testing"
)

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
