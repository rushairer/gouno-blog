package media

import "testing"

func TestValidatedPublicBaseAcceptsOnlySafeHTTPURLs(t *testing.T) {
	valid, err := validatedPublicBase("https://cdn.example.test/blog/")
	if err != nil || valid != "https://cdn.example.test/blog" {
		t.Fatalf("valid=%q err=%v", valid, err)
	}
	for _, candidate := range []string{"javascript:alert(1)", "https://user@example.test", "https://example.test/?token=secret", "/relative"} {
		if _, err := validatedPublicBase(candidate); err == nil {
			t.Fatalf("expected %q to be rejected", candidate)
		}
	}
}
