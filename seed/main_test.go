package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadSecretFromFileOrEnvPrefersConfiguredFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "dsn")
	if err := os.WriteFile(path, []byte(" secret-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := readSecretFromFileOrEnv(path, "env-value"); got != "secret-value" {
		t.Fatalf("readSecretFromFileOrEnv() = %q, want file value", got)
	}
}
