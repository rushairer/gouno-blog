package testsupport

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/migrations"
)

// OpenTestDB opens the disposable PostgreSQL database configured by the CI
// harness and applies the current migrations. Integration tests own closing it.
func OpenTestDB(t testing.TB) *sql.DB {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Up(context.Background(), db); err != nil {
		db.Close()
		t.Fatal(err)
	}
	return db
}
