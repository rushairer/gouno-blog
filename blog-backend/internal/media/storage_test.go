package media

import (
	"os"
	"strings"
	"testing"
)

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

func TestLocalStoreWritesPrivateMediaFiles(t *testing.T) {
	dir := t.TempDir() + "/media"
	store := NewLocal(dir)
	if err := store.Put(t.Context(), "example.txt", strings.NewReader("content"), "text/plain"); err != nil {
		t.Fatal(err)
	}
	file, err := os.Stat(dir + "/example.txt")
	if err != nil {
		t.Fatal(err)
	}
	if got := file.Mode().Perm(); got != 0o640 {
		t.Fatalf("file mode=%#o, want %#o", got, os.FileMode(0o640))
	}
	directory, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := directory.Mode().Perm(); got != 0o750 {
		t.Fatalf("directory mode=%#o, want %#o", got, os.FileMode(0o750))
	}
}
