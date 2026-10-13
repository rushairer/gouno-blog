package access_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/access"
	"github.com/rushairer/blog-backend/internal/migrations"
)

type ownerMutationFixture struct {
	db           *sql.DB
	svc          *access.Service
	ownerID      int64
	adminID      int64
	targetID     int64
	unassignedID int64
	ids          []int64
}

func newOwnerMutationFixture(t *testing.T) *ownerMutationFixture {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOG_TEST_POSTGRES_DSN is not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	if err := migrations.Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	fixture := &ownerMutationFixture{db: db, svc: access.NewService(db, access.Bootstrap{})}
	issuer := "https://sso.dev.local"
	suffix := fmt.Sprintf("owner-mutation-%d", time.Now().UnixNano())
	for _, item := range []struct {
		tag, name, role string
	}{
		{"owner", "Original Owner", access.RoleOwner},
		{"admin", "Original Admin", access.RoleAdmin},
		{"target", "Original Editor", access.RoleEditor},
		{"unassigned", "Original Unassigned", ""},
	} {
		var id int64
		if err := db.QueryRowContext(ctx, `INSERT INTO blog_principals(issuer,subject,display_name)
			VALUES($1,$2,$3) RETURNING id`, issuer, suffix+"-"+item.tag, item.name).Scan(&id); err != nil {
			t.Fatal(err)
		}
		fixture.ids = append(fixture.ids, id)
		switch item.tag {
		case "owner":
			fixture.ownerID = id
		case "admin":
			fixture.adminID = id
		case "target":
			fixture.targetID = id
		case "unassigned":
			fixture.unassignedID = id
		}
		if item.role != "" {
			var mid int64
			if err := db.QueryRowContext(ctx, `INSERT INTO blog_memberships(principal_id,status)
				VALUES($1,'active') RETURNING id`, id).Scan(&mid); err != nil {
				t.Fatal(err)
			}
			if _, err := db.ExecContext(ctx, `INSERT INTO blog_role_bindings(membership_id,role)
				VALUES($1,$2)`, mid, item.role); err != nil {
				t.Fatal(err)
			}
		}
	}
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = db.ExecContext(ctx, `DELETE FROM blog_authorization_audits
			WHERE actor_principal_id=ANY($1) OR target_principal_id=ANY($1)`, pq.Array(fixture.ids))
		_, _ = db.ExecContext(ctx, `DELETE FROM blog_role_bindings WHERE membership_id IN
			(SELECT id FROM blog_memberships WHERE principal_id=ANY($1))`, pq.Array(fixture.ids))
		_, _ = db.ExecContext(ctx, `DELETE FROM blog_memberships WHERE principal_id=ANY($1)`, pq.Array(fixture.ids))
		_, _ = db.ExecContext(ctx, `DELETE FROM blog_principal_identities WHERE principal_id=ANY($1)`, pq.Array(fixture.ids))
		_, _ = db.ExecContext(ctx, `DELETE FROM blog_principals WHERE id=ANY($1)`, pq.Array(fixture.ids))
	})
	return fixture
}

func (f *ownerMutationFixture) snapshot(id int64, role string) access.Snapshot {
	return access.Snapshot{
		Principal: access.Principal{ID: id}, MembershipStatus: "active",
		Roles: []string{role}, Permissions: []string{access.PermissionManageMembers, access.PermissionManageSite},
	}
}

func (f *ownerMutationFixture) assertName(t *testing.T, id int64, expected string) {
	t.Helper()
	var actual string
	if err := f.db.QueryRowContext(context.Background(),
		`SELECT display_name FROM blog_principals WHERE id=$1`, id).Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		t.Fatalf("denied mutation persisted display_name for %d: got %q want %q", id, actual, expected)
	}
}

func (f *ownerMutationFixture) assertMembership(t *testing.T, id int64, expectedStatus string, expectedRoles ...string) {
	t.Helper()
	var status string
	var roles pq.StringArray
	err := f.db.QueryRowContext(context.Background(), `SELECT m.status,
		COALESCE(array_agg(b.role ORDER BY b.role) FILTER (WHERE b.role IS NOT NULL),'{}')
		FROM blog_memberships m LEFT JOIN blog_role_bindings b ON b.membership_id=m.id
		WHERE m.principal_id=$1 GROUP BY m.id`, id).Scan(&status, &roles)
	if expectedStatus == "" {
		if !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("denied mutation inserted membership for %d: err=%v status=%q roles=%v", id, err, status, roles)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if status != expectedStatus || len(roles) != len(expectedRoles) {
		t.Fatalf("unexpected membership for %d: status=%q roles=%v want status=%q roles=%v",
			id, status, roles, expectedStatus, expectedRoles)
	}
	for i, r := range roles {
		if r != expectedRoles[i] {
			t.Fatalf("unexpected roles for %d: got=%v want=%v", id, roles, expectedRoles)
		}
	}
}

func TestMemberOwnerDenialAuditsWithoutCommittingBusinessMutation(t *testing.T) {
	f := newOwnerMutationFixture(t)
	ctx := context.Background()
	admin := f.snapshot(f.adminID, access.RoleAdmin)
	changed := "admin-controlled display"
	err := f.svc.SetMember(ctx, admin, f.ownerID, &changed, "suspended",
		[]string{access.RoleAdmin}, "denied-owner-edit", "test-owner-1", "127.0.0.1")
	if !errors.Is(err, access.ErrOwnerOnly) {
		t.Fatalf("admin unexpectedly changed Owner: %v", err)
	}
	f.assertName(t, f.ownerID, "Original Owner")
	f.assertMembership(t, f.ownerID, "active", access.RoleOwner)

	// Granting Owner to a principal who has never had a membership must also
	// leave both its display name and membership untouched after denial.
	err = f.svc.SetMember(ctx, admin, f.unassignedID, &changed, "active",
		[]string{access.RoleOwner}, "denied-owner-grant", "test-owner-2", "127.0.0.1")
	if !errors.Is(err, access.ErrOwnerOnly) {
		t.Fatalf("admin unexpectedly created an Owner: %v", err)
	}
	f.assertName(t, f.unassignedID, "Original Unassigned")
	f.assertMembership(t, f.unassignedID, "")

	var denied int
	if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_authorization_audits
		WHERE actor_principal_id=$1 AND action='membership_update_denied'
		  AND request_id IN ('test-owner-1','test-owner-2') AND result='denied'`,
		f.adminID).Scan(&denied); err != nil {
		t.Fatal(err)
	}
	if denied != 2 {
		t.Fatalf("expected independently committed audit-only denials, got %d", denied)
	}
}

func TestOwnerTransferLocksValidRowsAndRejectsStaleOwner(t *testing.T) {
	f := newOwnerMutationFixture(t)
	ctx := context.Background()
	owner := f.snapshot(f.ownerID, access.RoleOwner)

	// A legitimate role-protected mutation still commits and is audited.
	updated := "Trusted Admin"
	if err := f.svc.SetMember(ctx, owner, f.adminID, &updated, "active",
		[]string{access.RoleAdmin}, "test-valid-update", "test-owner-3", "127.0.0.1"); err != nil {
		t.Fatalf("legitimate Owner update failed: %v", err)
	}
	f.assertName(t, f.adminID, updated)

	// The old query combined GROUP BY and FOR UPDATE (invalid in PostgreSQL).
	// Real PostgreSQL must execute this transfer and preserve its role invariant.
	if err := f.svc.TransferOwner(ctx, owner, f.targetID, "test-transfer",
		"test-owner-4", "127.0.0.1"); err != nil {
		t.Fatalf("valid owner transfer failed: %v", err)
	}
	f.assertMembership(t, f.ownerID, "active", access.RoleAdmin)
	f.assertMembership(t, f.targetID, "active", access.RoleEditor, access.RoleOwner)
	f.assertMembership(t, f.adminID, "active", access.RoleAdmin)

	// The stale pre-transfer snapshot still says Owner, but the locked DB row
	// proves the actor is now Admin. Neither transfer nor self-promotion works.
	err := f.svc.TransferOwner(ctx, owner, f.adminID, "stale-transfer", "test-owner-5", "127.0.0.1")
	if !errors.Is(err, access.ErrOwnerOnly) {
		t.Fatalf("stale Owner snapshot transferred ownership again: %v", err)
	}
	err = f.svc.SetMember(ctx, owner, f.unassignedID, nil, "active",
		[]string{access.RoleOwner}, "stale-promotion", "test-owner-6", "127.0.0.1")
	if !errors.Is(err, access.ErrOwnerOnly) {
		t.Fatalf("stale Owner snapshot promoted another principal: %v", err)
	}
	f.assertMembership(t, f.unassignedID, "")
	f.assertMembership(t, f.adminID, "active", access.RoleAdmin)
	f.assertMembership(t, f.targetID, "active", access.RoleEditor, access.RoleOwner)

	var successfulTransfers int
	if err := f.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blog_authorization_audits
		WHERE action='owner_transferred' AND result='success' AND actor_principal_id=$1
		  AND request_id='test-owner-4'`, f.ownerID).Scan(&successfulTransfers); err != nil {
		t.Fatal(err)
	}
	if successfulTransfers != 1 {
		t.Fatalf("expected exactly one committed owner transfer audit, got %d", successfulTransfers)
	}
}

func TestOwnerTransferRejectsMissingOrSuspendedTargetWithoutSideEffects(t *testing.T) {
	f := newOwnerMutationFixture(t)
	ctx := context.Background()
	owner := f.snapshot(f.ownerID, access.RoleOwner)
	err := f.svc.TransferOwner(ctx, owner, f.unassignedID, "missing-target", "test-owner-7", "127.0.0.1")
	if !errors.Is(err, access.ErrOwnerTargetNotActive) {
		t.Fatalf("unassigned target accepted: %v", err)
	}
	f.assertMembership(t, f.ownerID, "active", access.RoleOwner)
	f.assertMembership(t, f.unassignedID, "")
}
