package controller

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func signWebhook(secret, method, event string, timestamp int64, idempotencyKey string, body []byte) string {
	bodySum := sha256.Sum256(body)
	bodyDigest := hex.EncodeToString(bodySum[:])
	canonical := canonicalWebhookPayload(method, event, timestamp, idempotencyKey, bodyDigest)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestWebhookSecurity_Validation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := "test-secret-key-that-is-at-least-32-chars-long-12345"
	os.Setenv("GOUNO_AI_WEBHOOK_SECRET", secret)
	defer os.Unsetenv("GOUNO_AI_WEBHOOK_SECRET")

	ctrl := &AgentController{}

	router := gin.New()
	router.POST("/api/ai/webhooks/:event", ctrl.ReceiveWorkflowWebhook)

	event := "post.published"
	idempotencyKey := "evt_test_12345"
	validBody := []byte(`{"post_id": 42, "title": "Security Test"}`)

	t.Run("valid signature parsing and canonical format", func(t *testing.T) {
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", ts, sig))

		parsedTs, parsedSig, err := parseWebhookHeaders(req.Header.Get("X-Gouno-Signature"), req.Header.Get("X-Gouno-Timestamp"))
		if err != nil {
			t.Fatalf("parseWebhookHeaders: %v", err)
		}
		if parsedTs != ts || parsedSig != sig {
			t.Fatalf("parsed headers mismatch: got ts=%d, sig=%s, want ts=%d, sig=%s", parsedTs, parsedSig, ts, sig)
		}
	})

	t.Run("reject modified body", func(t *testing.T) {
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, validBody)

		tamperedBody := []byte(`{"post_id": 999, "title": "Tampered"}`)
		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(tamperedBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", ts, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for tampered body, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject modified event path", func(t *testing.T) {
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/different.event", bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", ts, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for modified event, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject modified idempotency key", func(t *testing.T) {
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "tampered_key_999")
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", ts, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for modified idempotency key, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject missing timestamp", func(t *testing.T) {
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", sig) // missing timestamp

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for missing timestamp, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject expired timestamp over 5 minutes ago", func(t *testing.T) {
		expiredTs := time.Now().Add(-10 * time.Minute).Unix()
		sig := signWebhook(secret, "POST", event, expiredTs, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", expiredTs, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for expired timestamp, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject future timestamp over 5 minutes ahead", func(t *testing.T) {
		futureTs := time.Now().Add(10 * time.Minute).Unix()
		sig := signWebhook(secret, "POST", event, futureTs, idempotencyKey, validBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", futureTs, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for future timestamp, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject malformed signature", func(t *testing.T) {
		ts := time.Now().Unix()

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(validBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=not-a-valid-hex-signature", ts))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for malformed signature, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject payload larger than 1 MiB", func(t *testing.T) {
		largeBody := make([]byte, (1<<20)+10)
		for i := range largeBody {
			largeBody[i] = 'a'
		}
		ts := time.Now().Unix()
		sig := signWebhook(secret, "POST", event, ts, idempotencyKey, largeBody)

		req := httptest.NewRequest("POST", "/api/ai/webhooks/"+event, bytes.NewReader(largeBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", idempotencyKey)
		req.Header.Set("X-Gouno-Signature", fmt.Sprintf("t=%d,v1=%s", ts, sig))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for payload > 1 MiB, got %d", w.Code)
		}
	})

	t.Run("validate idempotency key rules", func(t *testing.T) {
		if !validateIdempotencyKey("evt_123_abc-456.xyz") {
			t.Error("expected valid key to pass")
		}
		if validateIdempotencyKey("") {
			t.Error("expected empty key to fail")
		}
		if validateIdempotencyKey("invalid spaces in key") {
			t.Error("expected key with spaces to fail")
		}
		if validateIdempotencyKey("invalid@special#chars!") {
			t.Error("expected key with special chars to fail")
		}
		if validateIdempotencyKey(strings.Repeat("a", 129)) {
			t.Error("expected key > 128 chars to fail")
		}
	})
}
