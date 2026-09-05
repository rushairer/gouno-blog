// Package testsupport provides explicit human actors for post-migration tests.
package testsupport

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"
)

// Principal creates an ordinary identity, never an Owner. Fixtures live only in
// the disposable per-package database owned by check-db-integration.py.
func Principal(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRowContext(context.Background(), `INSERT INTO blog_principals(issuer,subject) VALUES('https://fixture.example.test',$1) RETURNING id`, fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano())).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
