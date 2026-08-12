package controller

import "testing"

func TestValidSiteURLRejectsScriptAndProtocolRelativeURLs(t *testing.T) {
	for _, value := range []string{"javascript:alert(1)", "//attacker.example", "https://user@example.test", "/\\attacker.example"} {
		if validSiteURL(value, true) {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
	if !validSiteURL("/feed.xml", true) || !validSiteURL("https://example.test/feed.xml", true) || !validSiteURL("https://github.com/rushairer", false) {
		t.Fatal("expected valid local and HTTPS URLs")
	}
}
