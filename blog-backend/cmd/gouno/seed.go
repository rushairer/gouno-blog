package gouno

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
	"golang.org/x/crypto/argon2"
)

const (
	Argon2Time    = 1
	Argon2Memory  = 64 * 1024
	Argon2Threads = 4
	Argon2SaltLen = 16
	Argon2KeyLen  = 32
)

// Generate Argon2id hash for user passwords
func hashPassword(password string) (string, error) {
	salt := make([]byte, Argon2SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, Argon2Time, Argon2Memory, Argon2Threads, Argon2KeyLen)
	saltB64 := base64.RawStdEncoding.EncodeToString(salt)
	hashB64 := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		Argon2Memory, Argon2Time, Argon2Threads, saltB64, hashB64), nil
}

func bootstrapDatabase(blogDB *sql.DB, blogDSN string, logger *zap.Logger) {
	ctx := context.Background()

	// 1. Create Blog Schema
	logger.Info("Bootstrapping blog schema...")
	blogSchema := `
		CREATE TABLE IF NOT EXISTS posts (
			id SERIAL PRIMARY KEY,
			title VARCHAR(255) NOT NULL,
			slug VARCHAR(255) UNIQUE NOT NULL,
			summary TEXT,
			content TEXT,
			tags TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS comments (
			id SERIAL PRIMARY KEY,
			post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			author VARCHAR(100) NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`
	_, err := blogDB.ExecContext(ctx, blogSchema)
	if err != nil {
		logger.Fatal("Failed to create blog schema", zap.Error(err))
	}
	logger.Info("Blog schema is ready.")

	// 2. Connect to GOSSO database to seed user and client
	// We extract connection params from the blog DSN and switch the dbname to 'gosso'
	ssoDSN := strings.Replace(blogDSN, "dbname=blog", "dbname=gosso", 1)
	if ssoDSN == blogDSN {
		// Fallback or retry with env variable
		ssoDSN = "host=localhost user=gosso password=gosso dbname=gosso port=5432 sslmode=disable"
		if osHost := envOrDef("POSTGRES_HOST", ""); osHost != "" {
			ssoDSN = fmt.Sprintf("host=%s user=%s password=%s dbname=gosso port=5432 sslmode=disable",
				osHost, envOrDef("POSTGRES_USER", "gosso"), envOrDef("POSTGRES_PASSWORD", "gosso"))
		}
	}

	logger.Info("Connecting to GOSSO database for seeding...", zap.String("dsn_masked", maskDSN(ssoDSN)))
	var ssoDB *sql.DB
	for i := 0; i < 15; i++ {
		ssoDB, err = sql.Open("postgres", ssoDSN)
		if err == nil {
			err = ssoDB.PingContext(ctx)
			if err == nil {
				break
			}
		}
		logger.Warn("GOSSO database not ready for seeding yet, retrying...", zap.Error(err))
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		logger.Fatal("Failed to connect to GOSSO database for seeding", zap.Error(err))
	}
	defer ssoDB.Close()

	// 3. Wait for GOSSO migrations to be executed by the SSO container
	logger.Info("Waiting for GOSSO migrations to complete...")
	tableReady := false
	for i := 0; i < 20; i++ {
		// Check if accounts table exists
		var exists bool
		err = ssoDB.QueryRowContext(ctx, 
			"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts')",
		).Scan(&exists)
		if err == nil && exists {
			tableReady = true
			break
		}
		logger.Warn("Waiting for GOSSO tables to be created by migrations...")
		time.Sleep(3 * time.Second)
	}
	if !tableReady {
		logger.Fatal("GOSSO tables were not created in time by migrations")
	}

	// 4. Seed Admin User
	var adminCount int
	err = ssoDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM accounts WHERE username = 'admin'").Scan(&adminCount)
	if err != nil {
		logger.Fatal("Failed to query admin user count", zap.Error(err))
	}

	adminID := "00000000-0000-0000-0000-000000000001"
	if adminCount == 0 {
		logger.Info("Seeding default admin user...")
		// Insert admin account
		_, err = ssoDB.ExecContext(ctx, 
			"INSERT INTO accounts (id, username, display_name, status) VALUES ($1, 'admin', 'System Admin', 'active')",
			adminID,
		)
		if err != nil {
			logger.Fatal("Failed to seed admin account", zap.Error(err))
		}

		// Hash password "admin123"
		pwHash, err := hashPassword("admin123")
		if err != nil {
			logger.Fatal("Failed to hash password", zap.Error(err))
		}

		// Insert password credential
		_, err = ssoDB.ExecContext(ctx,
			`INSERT INTO account_credentials (account_id, credential_type, identifier, credential_value, verified, primary_credential)
			 VALUES ($1, 'password', 'admin', $2, true, true)`,
			adminID, pwHash,
		)
		if err != nil {
			logger.Fatal("Failed to seed admin password credential", zap.Error(err))
		}
		logger.Info("Admin user seeded successfully.")
	} else {
		// Get existing admin ID
		err = ssoDB.QueryRowContext(ctx, "SELECT id FROM accounts WHERE username = 'admin'").Scan(&adminID)
		if err != nil {
			logger.Fatal("Failed to scan admin ID", zap.Error(err))
		}
	}

	// 5. Seed Roles
	var roleID string
	err = ssoDB.QueryRowContext(ctx, "SELECT id FROM roles WHERE name = 'admin'").Scan(&roleID)
	if err == sql.ErrNoRows {
		logger.Info("Seeding admin role...")
		err = ssoDB.QueryRowContext(ctx, 
			"INSERT INTO roles (name, description) VALUES ('admin', 'System Administrator') RETURNING id",
		).Scan(&roleID)
		if err != nil {
			logger.Fatal("Failed to seed admin role", zap.Error(err))
		}
	} else if err != nil {
		logger.Fatal("Failed to query role id", zap.Error(err))
	}

	// Link admin account to admin role
	var linkCount int
	err = ssoDB.QueryRowContext(ctx, 
		"SELECT COUNT(*) FROM account_roles WHERE account_id = $1 AND role_id = $2",
		adminID, roleID,
	).Scan(&linkCount)
	if err != nil {
		logger.Fatal("Failed to query account_roles count", zap.Error(err))
	}
	if linkCount == 0 {
		_, err = ssoDB.ExecContext(ctx,
			"INSERT INTO account_roles (account_id, role_id) VALUES ($1, $2)",
			adminID, roleID,
		)
		if err != nil {
			logger.Fatal("Failed to link admin user to admin role", zap.Error(err))
		}
		logger.Info("Linked admin user to admin role.")
	}

	// 6. Seed OAuth2 Client
	var clientCount int
	err = ssoDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM oauth2_clients WHERE client_id = 'blog-spa'").Scan(&clientCount)
	if err != nil {
		logger.Fatal("Failed to query oauth2_clients count", zap.Error(err))
	}
	if clientCount == 0 {
		logger.Info("Seeding OAuth2 client 'blog-spa'...")
		_, err = ssoDB.ExecContext(ctx,
			`INSERT INTO oauth2_clients (account_id, client_id, name, description, redirect_uris, grant_types, scopes, is_confidential)
			 VALUES ($1, 'blog-spa', 'Personal Blog SPA', 'OAuth2 Client for React Blog Frontend', 
			         '["http://localhost:8080/callback"]'::jsonb, 
			         '["authorization_code"]'::jsonb, 
			         '["openid", "profile", "email"]'::jsonb, 
			         false)`,
			adminID,
		)
		if err != nil {
			logger.Fatal("Failed to seed OAuth2 client", zap.Error(err))
		}
		logger.Info("OAuth2 client seeded successfully.")
	}

	logger.Info("Seeding completed successfully.")
}

func envOrDef(key, def string) string {
	val := os.Getenv(key)
	if val == "" {
		return def
	}
	return val
}

func maskDSN(dsn string) string {
	parts := strings.Split(dsn, " ")
	for i, part := range parts {
		if strings.HasPrefix(part, "password=") {
			parts[i] = "password=*****"
		}
	}
	return strings.Join(parts, " ")
}
