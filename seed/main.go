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
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
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

func readSecretFromFileOrEnv(filePath, envVal string) string {
	if filePath != "" {
		if data, err := os.ReadFile(filePath); err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	return strings.TrimSpace(envVal)
}

func invalidateConsentCache(ctx context.Context, redisDSN, accountID, clientID string) error {
	options, err := redis.ParseURL(redisDSN)
	if err != nil {
		return fmt.Errorf("parse Redis DSN: %w", err)
	}
	client := redis.NewClient(options)
	defer client.Close()
	if err := client.Del(ctx, fmt.Sprintf("consent:%s|%s", accountID, clientID)).Err(); err != nil {
		return fmt.Errorf("delete consent cache: %w", err)
	}
	return nil
}

func main() {
	dsn := os.Getenv("PG_DSN")
	if dsn == "" {
		log.Fatal("PG_DSN environment variable is required")
	}
	redisDSN := os.Getenv("REDIS_DSN")
	if redisDSN == "" {
		log.Fatal("REDIS_DSN environment variable is required")
	}

	accountID := envOrDefault("BLOG_OAUTH_ACCOUNT_ID", "00000000-0000-0000-0000-000000000001")
	clientID := envOrDefault("BLOG_OAUTH_CLIENT_ID", "blog-spa")
	clientName := envOrDefault("BLOG_OAUTH_CLIENT_NAME", "Personal Blog SPA")
	clientDescription := envOrDefault("BLOG_OAUTH_CLIENT_DESCRIPTION", "OAuth2 Client for React Blog Frontend")

	redirectURIsJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_REDIRECT_URIS"), []string{"https://localhost:8443/callback"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_REDIRECT_URIS: %v", err)
	}
	grantTypesJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_GRANT_TYPES"), []string{"authorization_code", "refresh_token"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_GRANT_TYPES: %v", err)
	}
	scopesJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_SCOPES"), []string{"openid", "profile", "email"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_SCOPES: %v", err)
	}

	isConfidential := strings.EqualFold(os.Getenv("BLOG_OAUTH_CONFIDENTIAL"), "true")
	clientSecret := readSecretFromFileOrEnv(os.Getenv("BLOG_OAUTH_CLIENT_SECRET_FILE"), os.Getenv("BLOG_OAUTH_CLIENT_SECRET"))
	var clientSecretHash string
	if isConfidential && clientSecret != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(clientSecret), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("Failed to hash client secret: %v", err)
		}
		clientSecretHash = string(hash)
	}

	postLogoutRedirectURIsJSON, err := parseJSONList(os.Getenv("BLOG_OAUTH_POST_LOGOUT_REDIRECT_URIS"), []string{"https://localhost:8443/"})
	if err != nil {
		log.Fatalf("Failed to parse BLOG_OAUTH_POST_LOGOUT_REDIRECT_URIS: %v", err)
	}
	backchannelLogoutURI := envOrDefault("BLOG_OAUTH_BACKCHANNEL_LOGOUT_URI", "")

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
		log.Printf("Seeding OAuth2 client %q (confidential: %v)...\n", clientID, isConfidential)
		_, err = db.ExecContext(ctx,
			`INSERT INTO oauth2_clients (
				account_id, client_id, client_secret_hash, name, description,
				redirect_uris, post_logout_redirect_uris, grant_types, scopes,
				is_confidential, metadata, backchannel_logout_uri, backchannel_logout_session_required
			) VALUES (
				$1, $2, $3, $4, $5,
				$6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
				$10, '{}'::jsonb, $11, $12
			)`,
			accountID, clientID, clientSecretHash, clientName, clientDescription,
			redirectURIsJSON, postLogoutRedirectURIsJSON, grantTypesJSON, scopesJSON,
			isConfidential, backchannelLogoutURI, backchannelLogoutURI != "",
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
			     post_logout_redirect_uris = $5::jsonb,
			     grant_types = $6::jsonb,
			     scopes = $7::jsonb,
			     is_confidential = $8,
			     client_secret_hash = CASE WHEN $9 <> '' THEN $9 ELSE client_secret_hash END,
			     backchannel_logout_uri = $10,
			     backchannel_logout_session_required = $11,
			     metadata = COALESCE(metadata, '{}'::jsonb) - 'capability'
			 WHERE client_id = $12`,
			accountID, clientName, clientDescription,
			redirectURIsJSON, postLogoutRedirectURIsJSON, grantTypesJSON, scopesJSON,
			isConfidential, clientSecretHash, backchannelLogoutURI, backchannelLogoutURI != "",
			clientID,
		)
		if err != nil {
			log.Fatalf("Failed to update OAuth2 client policy: %v", err)
		}
		log.Printf("OAuth2 client %q policy updated.\n", clientID)
	}

	// This seed owns the local first-party blog client. Keep the development
	// administrator's stored consent in sync with the client policy. Blog
	// authorization is local and must never be represented by an OAuth scope.
	// Production clients must obtain consent through the normal OAuth
	// authorization flow instead.
	_, err = db.ExecContext(ctx,
		`INSERT INTO oauth2_consents (account_id, client_id, scopes, granted_at)
		 SELECT $1, id, $2::jsonb, NOW()
		 FROM oauth2_clients
		 WHERE client_id = $3
		 ON CONFLICT (account_id, client_id) WHERE deleted_at IS NULL
		 DO UPDATE SET scopes = EXCLUDED.scopes, granted_at = EXCLUDED.granted_at, deleted_at = NULL`,
		accountID, scopesJSON, clientID,
	)
	if err != nil {
		log.Fatalf("Failed to seed OAuth2 consent: %v", err)
	}
	if err := invalidateConsentCache(ctx, redisDSN, accountID, clientID); err != nil {
		log.Fatalf("Failed to invalidate OAuth2 consent cache: %v", err)
	}

	log.Printf("Database seeding completed successfully. Blog OAuth client: %s.", clientID)
}
