package provider_test

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/secretbox"
)

// This is opt-in because it spends provider credits. It emits no API keys and
// retains no generated image; it verifies only a valid image response.
func TestLiveConfiguredProvidersGenerateImage(t *testing.T) {
	if os.Getenv("RUN_LIVE_PROVIDER_IMAGE_TESTS") != "1" {
		t.Skip("set RUN_LIVE_PROVIDER_IMAGE_TESTS=1 to run configured-provider image smoke tests")
	}
	dsn := os.Getenv("GOUNO_DATABASE_DRIVERS_POSTGRES_DSN")
	box, err := secretbox.NewKeyring(os.Getenv("BLOG_AGENT_MASTER_KEY"), os.Getenv("BLOG_AGENT_MASTER_KEY_VERSION"), os.Getenv("BLOG_AGENT_PREVIOUS_MASTER_KEYS"))
	if err != nil || dsn == "" {
		t.Fatalf("load live test configuration: %v", err)
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, name := range []string{"gemini-3.1-flash-image", "GPT-5.6-Luna"} {
		t.Run(name, func(t *testing.T) {
			var profile domain.ProviderProfile
			if err := db.QueryRowContext(context.Background(), `SELECT id, name, provider_type, base_url, model, api_key_ciphertext, api_key_nonce, key_version, enabled, request_timeout_seconds FROM ai_provider_profiles WHERE name = $1 AND deleted_at IS NULL`, name).Scan(&profile.ID, &profile.Name, &profile.ProviderType, &profile.BaseURL, &profile.Model, &profile.APIKeyCiphertext, &profile.APIKeyNonce, &profile.KeyVersion, &profile.Enabled, &profile.RequestTimeoutSeconds); err != nil {
				t.Fatalf("load %s: %v", name, err)
			}
			key, err := box.Decrypt(profile.APIKeyCiphertext, profile.APIKeyNonce, profile.KeyVersion)
			if err != nil {
				t.Fatalf("decrypt %s: %v", name, err)
			}
			client, err := provider.NewHTTPProvider(string(profile.ProviderType), profile.BaseURL, key, profile.Model, nil, time.Duration(profile.RequestTimeoutSeconds)*time.Second)
			if err != nil {
				t.Fatalf("create %s client: %v", name, err)
			}
			started := time.Now()
			image, err := client.GenerateImage(context.Background(), provider.ImageRequest{Prompt: "A simple flat blue circle icon on a white background", AspectRatio: "1:1", ImageSize: "1K"})
			if err != nil {
				t.Fatalf("image generation: %v", err)
			}
			if len(image.Data) == 0 || image.MIMEType == "" {
				t.Fatal("returned an empty image")
			}
			t.Logf("%s, %d bytes, %s", image.MIMEType, len(image.Data), time.Since(started).Round(time.Millisecond))
		})
	}
}
