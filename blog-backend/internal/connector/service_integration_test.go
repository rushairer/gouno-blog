package connector

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/migrations"
	"github.com/rushairer/blog-backend/internal/secretbox"
)

func TestSandboxConnectorOutboxLifecycle(t *testing.T) {
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
	key := base64.StdEncoding.EncodeToString(make([]byte, 32))
	box, err := secretbox.New(key)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(db, box)
	profile := &Profile{Name: fmt.Sprintf("sandbox-connector-test-%d", time.Now().UnixNano()), Kind: "newsletter", Sandbox: true, Enabled: true, Config: json.RawMessage(`{"audience":"test","rate_limit_per_minute":1}`)}
	if err := svc.SaveProfile(ctx, profile, "mock-token-1234"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_connector_outbox WHERE connector_profile_id=$1`, profile.ID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_connector_profiles WHERE id=$1`, profile.ID)
	})
	var stored []byte
	if err := db.QueryRowContext(ctx, `SELECT credential_ciphertext FROM ai_connector_profiles WHERE id=$1`, profile.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if string(stored) == "mock-token-1234" {
		t.Fatal("connector credential was stored in plaintext")
	}
	state, err := svc.BeginOAuth(ctx, profile.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.CompleteOAuthMock(ctx, state, "oauth-code-9876"); err != nil {
		t.Fatal(err)
	}
	if err := svc.CompleteOAuthMock(ctx, state, "oauth-code-9876"); err == nil {
		t.Fatal("OAuth state must be single-use")
	}
	item, err := svc.Queue(ctx, profile.ID, "sandbox-test-key", json.RawMessage(`{"subject":"test"}`))
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := svc.Queue(ctx, profile.ID, "sandbox-test-key", json.RawMessage(`{"subject":"test"}`))
	if err != nil || duplicate.ID != item.ID {
		t.Fatalf("idempotent outbox = %#v, %v", duplicate, err)
	}
	if err := svc.DeliverMock(ctx, item.ID); err == nil {
		t.Fatal("unapproved outbox item must not deliver")
	}
	if err := svc.Approve(ctx, item.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeliverMock(ctx, item.ID); err != nil {
		t.Fatal(err)
	}
	var status string
	var audits int
	if err := db.QueryRowContext(ctx, `SELECT status FROM ai_connector_outbox WHERE id=$1`, item.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_connector_delivery_audits WHERE outbox_id=$1 AND status='delivered'`, item.ID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if status != "delivered" || audits != 1 {
		t.Fatalf("mock delivery = %q audits=%d", status, audits)
	}
	limited, err := svc.Queue(ctx, profile.ID, "sandbox-rate-limit-key", json.RawMessage(`{"subject":"second"}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Approve(ctx, limited.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeliverMock(ctx, limited.ID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT status FROM ai_connector_outbox WHERE id=$1`, limited.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "failed" {
		t.Fatalf("rate-limited outbox status = %q", status)
	}
	if err := svc.Retry(ctx, limited.ID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT status FROM ai_connector_outbox WHERE id=$1`, limited.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "approved" {
		t.Fatalf("retried outbox status = %q", status)
	}
}
