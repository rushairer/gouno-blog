// Command dbsetup prepares only the disposable database created by the CI runner.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/migrations"
)

func run() error {
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	u, err := url.Parse(dsn)
	if err != nil || u == nil || u.Scheme != "postgres" || u.Hostname() != "127.0.0.1" || u.User == nil || u.User.Username() != "blog_ci" || !strings.HasPrefix(u.Path, "/blog_ci_") {
		return fmt.Errorf("disposable loopback BLOG_TEST_POSTGRES_DSN is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("open test database: %w", err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("connect test database: %w", err)
	}
	if err := migrations.Up(ctx, db); err != nil {
		return fmt.Errorf("migrate test database: %w", err)
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
