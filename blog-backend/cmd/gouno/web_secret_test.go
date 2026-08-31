package gouno

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadSecretFromFileOrEnvPrefersConfiguredFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(path, []byte(" file-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if got := readSecretFromFileOrEnv(path, "environment-value"); got != "file-value" {
		t.Fatalf("readSecretFromFileOrEnv() = %q, want file value", got)
	}
}

func TestReadOptionalSecretFromFileOrEnvAllowsEmptyFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "previous-keys")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	if got := readOptionalSecretFromFileOrEnv(path, "environment-value"); got != "" {
		t.Fatalf("readOptionalSecretFromFileOrEnv() = %q, want empty value", got)
	}
}
