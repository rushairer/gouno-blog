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

func TestConfigureMediaS3CredentialsRequiresSecretFilesInProduction(t *testing.T) {
	t.Setenv("BLOG_MEDIA_STORAGE", "s3")
	t.Setenv("AWS_ACCESS_KEY_ID", "environment-access-key")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "environment-secret-key")
	t.Setenv("AWS_ACCESS_KEY_ID_FILE", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY_FILE", "")
	if err := configureMediaS3Credentials("production"); err == nil {
		t.Fatal("production S3 credentials from environment must be rejected")
	}
}

func TestConfigureMediaS3CredentialsLoadsSecretFiles(t *testing.T) {
	dir := t.TempDir()
	accessPath := filepath.Join(dir, "access")
	secretPath := filepath.Join(dir, "secret")
	if err := os.WriteFile(accessPath, []byte("access-from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secretPath, []byte("secret-from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOG_MEDIA_STORAGE", "s3")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	t.Setenv("AWS_ACCESS_KEY_ID_FILE", accessPath)
	t.Setenv("AWS_SECRET_ACCESS_KEY_FILE", secretPath)
	if err := configureMediaS3Credentials("production"); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("AWS_ACCESS_KEY_ID"); got != "access-from-file" {
		t.Fatalf("AWS_ACCESS_KEY_ID = %q", got)
	}
	if got := os.Getenv("AWS_SECRET_ACCESS_KEY"); got != "secret-from-file" {
		t.Fatalf("AWS_SECRET_ACCESS_KEY = %q", got)
	}
}

func TestConfigureMediaS3CredentialsRejectsEmptyProductionSecret(t *testing.T) {
	dir := t.TempDir()
	accessPath := filepath.Join(dir, "access")
	secretPath := filepath.Join(dir, "secret")
	if err := os.WriteFile(accessPath, []byte("access-from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secretPath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOG_MEDIA_STORAGE", "s3")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	t.Setenv("AWS_ACCESS_KEY_ID_FILE", accessPath)
	t.Setenv("AWS_SECRET_ACCESS_KEY_FILE", secretPath)
	if err := configureMediaS3Credentials("production"); err == nil {
		t.Fatal("empty production S3 Secret must be rejected")
	}
}
