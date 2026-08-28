package gouno

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rushairer/blog-backend/internal/authbff"
)

func TestWriteBFFKeysetCreatesExclusive0600TinkKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "blog-bff-tink.json")
	if err := writeBFFKeyset(path); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("keyset permissions=%o, want 600", info.Mode().Perm())
	}
	if _, err := authbff.LoadAEAD(path); err != nil {
		t.Fatalf("generated keyset is not a valid Tink AEAD keyset: %v", err)
	}
	if err := writeBFFKeyset(path); err == nil {
		t.Fatal("key generation overwrote an existing keyset")
	}
}
