package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func parseJSONList(envVal string, fallback []string) (string, error) {
	envVal = strings.TrimSpace(envVal)
	if envVal == "" {
		bytes, err := json.Marshal(fallback)
		if err != nil {
			return "", err
		}
		return string(bytes), nil
	}
	if strings.HasPrefix(envVal, "[") && strings.HasSuffix(envVal, "]") {
		var items []string
		if err := json.Unmarshal([]byte(envVal), &items); err != nil {
			return "", fmt.Errorf("invalid JSON list: %w", err)
		}
		return envVal, nil
	}

	parts := strings.Split(envVal, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			items = append(items, item)
		}
	}
	bytes, err := json.Marshal(items)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func envOrDefault(name, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func main() {
	dsn := os.Getenv("PG_DSN")
	if dsn == "" {
		log.Fatal("PG_DSN environment variable is required")
	}

	accountID := envOrDefault("BLOG_OAUTH_ACCOUNT_ID", "00000000-0000-0000-0000-000000000001")
	clientID := envOrDefault("BLOG_OAUTH_CLIENT_ID", "blog-spa")
	clientName := envOrDefault("BLOG_OAUTH_CLIENT_NAME", "Personal Blog SPA")
	clientDescription := envOrDefault("BLOG_OAUTH_CLIENT_DESCRIPTION", "OAuth2 Client for React Blog Frontend")

	redirectURIsJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_REDIRECT_URIS"), []string{"http://localhost:8080/callback"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_REDIRECT_URIS: %v", err)
	}
	grantTypesJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_GRANT_TYPES"), []string{"authorization_code"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_GRANT_TYPES: %v", err)
	}
	scopesJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_SCOPES"), []string{"openid", "profile", "email"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_SCOPES: %v", err)
	}

	log.Println("Starting gouno-blog seed.")
	log.Println("Connecting to GOSSO database...")

	var db *sql.DB
	for i := 0; i < 30; i++ {
		db, err = sql.Open("pgx", dsn)
		if err == nil {
			err = db.Ping()
			if err == nil {
				break
			}
		}
		log.Printf("Database not ready yet, retrying in 1s (error: %v)...", err)
		time.Sleep(1 * time.Second)
	}
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Waiting for schema migrations to complete (checking for 'accounts' and 'oauth2_clients' tables)...")
	ctx := context.Background()

	tablesExist := false
	for i := 0; i < 30; i++ {
		var count int
		query := `SELECT COUNT(*)
			FROM information_schema.tables
			WHERE table_schema = 'public'
				AND table_name IN ('accounts', 'oauth2_clients')`
		err = db.QueryRowContext(ctx, query).Scan(&count)
		if err == nil && count == 2 {
			tablesExist = true
			break
		}
		log.Println("Required GOSSO tables do not exist yet. GOSSO migrations might be running. Retrying in 1s...")
		time.Sleep(1 * time.Second)
	}
	if !tablesExist {
		log.Fatal("Timeout waiting for required GOSSO tables to be created by migrations.")
	}
	log.Println("Schema detected. Starting database seeding...")

	// Ensure the account exists in GOSSO, or fallback to the admin user
	var exists bool
	err = db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = $1)", accountID).Scan(&exists)
	if err != nil {
		log.Fatalf("Failed to check if account exists: %v", err)
	}

	if !exists {
		log.Printf("Account %s does not exist in accounts table. Fetching admin account...", accountID)
		err = db.QueryRowContext(ctx, "SELECT id FROM accounts WHERE username = 'admin' LIMIT 1").Scan(&accountID)
		if err == sql.ErrNoRows {
			// If admin doesn't exist, fallback to the first available account
			err = db.QueryRowContext(ctx, "SELECT id FROM accounts LIMIT 1").Scan(&accountID)
		}
		if err != nil {
			log.Fatalf("Failed to find a fallback account: %v", err)
		}
		log.Printf("Using fallback owner account ID: %s", accountID)
	}

	var clientCount int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM oauth2_clients WHERE client_id = $1", clientID).Scan(&clientCount)
	if err != nil {
		log.Fatalf("Failed to query oauth2_clients count: %v", err)
	}

	if clientCount == 0 {
		log.Printf("Seeding OAuth2 client %q...\n", clientID)
		_, err = db.ExecContext(ctx,
			`INSERT INTO oauth2_clients (account_id, client_id, name, description, redirect_uris, grant_types, scopes, is_confidential)
			 VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, false)`,
			accountID, clientID, clientName, clientDescription, redirectURIsJSON, grantTypesJSON, scopesJSON,
		)
		if err != nil {
			log.Fatalf("Failed to seed OAuth2 client: %v", err)
		}
		log.Println("OAuth2 client seeded successfully.")
	} else {
		log.Printf("OAuth2 client %q already exists. Updating redirect URIs and client policy...\n", clientID)
		_, err = db.ExecContext(ctx,
			`UPDATE oauth2_clients
			 SET account_id = $1,
			     name = $2,
			     description = $3,
			     redirect_uris = $4::jsonb,
			     grant_types = $5::jsonb,
			     scopes = $6::jsonb,
			     is_confidential = false
			 WHERE client_id = $7`,
			accountID, clientName, clientDescription, redirectURIsJSON, grantTypesJSON, scopesJSON, clientID,
		)
		if err != nil {
			log.Fatalf("Failed to update OAuth2 client policy: %v", err)
		}
		log.Printf("OAuth2 client %q policy updated.\n", clientID)
	}

	log.Printf("Database seeding completed successfully. Blog OAuth client: %s.", clientID)
}
