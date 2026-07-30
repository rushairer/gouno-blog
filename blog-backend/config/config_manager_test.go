package config

import "testing"

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
