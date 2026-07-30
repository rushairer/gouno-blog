package repository

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestDeleteProviderRevokesCredentialAfterAgentSoftDelete(t *testing.T) {
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
	name := fmt.Sprintf("provider-revocation-%d", time.Now().UnixNano())
	profile := &domain.ProviderProfile{
		Name: name, ProviderType: domain.ProviderOpenAI, BaseURL: "https://api.example.test", Model: "test-model",
		APIKeyCiphertext: []byte("ciphertext"), APIKeyNonce: []byte("nonce"), APIKeyLast4: "1234", KeyVersion: 1,
		Enabled: true, RequestTimeoutSeconds: 60, MaxOutputTokens: 32,
	}
	repo := NewAgentRepository(db)
	if err := repo.CreateProvider(ctx, profile); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_agents WHERE provider_profile_id=$1`, profile.ID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_provider_profiles WHERE id=$1`, profile.ID)
	}()

	if _, err := db.ExecContext(ctx, `INSERT INTO ai_agents
		(name, description, system_prompt, provider_profile_id, enabled, trigger_type, timezone,
		 capabilities, execution_mode, max_steps, max_input_tokens, max_output_tokens, daily_run_limit,
		 monthly_token_budget, deleted_at)
		VALUES ($1, '', 'test', $2, false, 'manual', 'Asia/Shanghai', '[]', 'advisory', 1, 128, 32, 1, 100, NOW())`,
		name+"-agent", profile.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.DeleteProvider(ctx, profile.ID); err != nil {
		t.Fatal(err)
	}

	var ciphertext, nonce []byte
	var last4 string
	var keyVersion int
	var deleted bool
	if err := db.QueryRowContext(ctx, `SELECT api_key_ciphertext, api_key_nonce, api_key_last4, key_version, deleted_at IS NOT NULL
		FROM ai_provider_profiles WHERE id=$1`, profile.ID).Scan(&ciphertext, &nonce, &last4, &keyVersion, &deleted); err != nil {
		t.Fatal(err)
	}
	if ciphertext != nil || nonce != nil || last4 != "" || keyVersion != 0 || !deleted {
		t.Fatalf("provider deletion must revoke stored credential, ciphertext=%v nonce=%v last4=%q version=%d deleted=%v", ciphertext != nil, nonce != nil, last4, keyVersion, deleted)
	}
}
