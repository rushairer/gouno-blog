package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProductionPostgresDSNComesFromEnvironment(t *testing.T) {
	t.Setenv("GOUNO_DATABASE_DRIVERS_POSTGRES_DSN", "host=postgres.example.test user=blog password=secret dbname=blog sslmode=require")
	manager, err := NewConfigManager(nil, ".", "production")
	if err != nil {
		t.Fatal(err)
	}
	if got := manager.Config().DatabaseConfig.GetDefaultDriver().DSN; got != "host=postgres.example.test user=blog password=secret dbname=blog sslmode=require" {
		t.Fatalf("postgres DSN = %q", got)
	}
}

func TestProductionPostgresDSNComesFromSecretFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "blog-dsn")
	const dsn = "host=db user=blog password=file-secret dbname=blog sslmode=disable"
	if err := os.WriteFile(path, []byte(dsn+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GOUNO_DATABASE_DRIVERS_POSTGRES_DSN", "")
	t.Setenv("GOUNO_DATABASE_DRIVERS_POSTGRES_DSN_FILE", path)
	manager, err := NewConfigManager(nil, ".", "production")
	if err != nil {
		t.Fatal(err)
	}
	if got := manager.Config().DatabaseConfig.GetDefaultDriver().DSN; got != dsn {
		t.Fatalf("postgres DSN = %q", got)
	}
}
