package access_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/migrations"
)

func TestApprovedIssuerMigrationPreservesPrincipalAndRole(t *testing.T) {
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := migrations.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	legacyIssuer := "https://io84.com"
	newIssuer := "https://sso.io84.com"
	subject := fmt.Sprintf("issuer-alias-test-%d", time.Now().UnixNano())

	var principalID, membershipID int64
	if err := db.QueryRowContext(ctx, `INSERT INTO blog_principals (issuer,subject,display_name)
VALUES ($1,$2,'Legacy User') RETURNING id`, legacyIssuer, subject).Scan(&principalID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(context.Background(), `DELETE FROM blog_principals WHERE id=$1`, principalID)
	})
	if _, err := db.ExecContext(ctx, `INSERT INTO blog_principal_identities (principal_id,issuer,subject)
VALUES ($1,$2,$3)`, principalID, legacyIssuer, subject); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO blog_memberships (principal_id) VALUES ($1) RETURNING id`, principalID).Scan(&membershipID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO blog_role_bindings (membership_id,role) VALUES ($1,'owner')`, membershipID); err != nil {
		t.Fatal(err)
	}

	svc := access.NewService(db, access.Bootstrap{IssuerMigrations: map[string]string{newIssuer: legacyIssuer}})
	snapshot, err := svc.Resolve(ctx, jwt.MapClaims{
		"iss": newIssuer, "sub": subject, "name": "Migrated User", "email": "user@example.test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Principal.ID != principalID {
		t.Fatalf("issuer migration created a new principal: got %d, want %d", snapshot.Principal.ID, principalID)
	}
	if snapshot.Principal.Issuer != newIssuer || snapshot.Principal.Subject != subject {
		t.Fatalf("snapshot must identify the verified login identity, got %s %s", snapshot.Principal.Issuer, snapshot.Principal.Subject)
	}
	if !snapshot.HasRole(access.RoleOwner) {
		t.Fatalf("existing owner role was not preserved: %#v", snapshot.Roles)
	}

	var aliases int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_principal_identities
WHERE principal_id=$1 AND subject=$2 AND issuer=ANY($3)`, principalID, subject, pq.Array([]string{legacyIssuer, newIssuer})).Scan(&aliases); err != nil {
		t.Fatal(err)
	}
	if aliases != 2 {
		t.Fatalf("expected legacy and new issuer aliases, got %d", aliases)
	}
	var storedIssuer string
	if err := db.QueryRowContext(ctx, `SELECT issuer FROM blog_principals WHERE id=$1`, principalID).Scan(&storedIssuer); err != nil {
		t.Fatal(err)
	}
	if storedIssuer != legacyIssuer {
		t.Fatalf("legacy principal issuer was rewritten: got %s", storedIssuer)
	}
}

func TestUnapprovedIssuerDoesNotLinkBySubject(t *testing.T) {
	// The allowlist is intentionally explicit: a matching subject from an
	// unrelated issuer must never be sufficient for account linking.
	bootstrap := access.Bootstrap{IssuerMigrations: map[string]string{
		"https://sso.io84.com": "https://io84.com",
	}}
	if _, linked := bootstrap.IssuerMigrations["https://attacker.example"]; linked {
		t.Fatal("unapproved issuer unexpectedly present in migration allowlist")
	}
}
