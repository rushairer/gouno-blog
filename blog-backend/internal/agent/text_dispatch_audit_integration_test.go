package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
)

func TestAgentTextDispatchAuditPersistsEveryHTTPRequestAndSurvivesRunDeletion(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	id := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_text_dispatch_audits WHERE source_run_id=$1`, id); err != nil {
			t.Errorf("cleanup dispatch evidence: %v", err)
		}
	})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		n := calls.Add(1)
		var started int
		if err := db.QueryRow(`SELECT COUNT(*) FROM ai_text_dispatch_audits WHERE source_run_id=$1 AND sequence=$2 AND status='started'`, id, n).Scan(&started); err != nil || started != 1 {
			t.Errorf("dispatch %d preceded durable started evidence: count=%d err=%v", n, started, err)
		}
		w.Header().Set("x-request-id", fmt.Sprintf("fixture-%d", n))
		if n == 1 {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Stream must be set to true"}}`))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"private provider response"}}`))
	}))
	defer server.Close()
	client, err := provider.NewHTTPProviderWithConfig("openai", server.URL, "private-fixture-key", "actual-model", "responses", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	profile := &providerdomain.ProviderProfile{ID: 91, ProviderType: "openai", Vendor: "openai", Model: client.Model(), BaseURL: server.URL}
	requestID := fmt.Sprintf("run-%d-step-1", id)
	// The SQL start predicate must deny an unclaimed queued Run.
	audit := newRunTextDispatchAudit(repo, id, agentID, requestID, profile)
	_, err = client.Generate(ctx, provider.Request{DispatchAudit: audit})
	if !errors.Is(err, provider.ErrTextDispatchStartUnconfirmed) || calls.Load() != 0 {
		t.Fatalf("unclaimed run dispatched: calls=%d err=%v", calls.Load(), err)
	}
	if err := repo.StartRun(ctx, id, false); err != nil {
		t.Fatal(err)
	}
	audit = newRunTextDispatchAudit(repo, id, agentID, requestID, profile)
	_, attempts, err := generateWithRetry(ctx, client, provider.Request{Instructions: "private prompt", DispatchAudit: audit})
	if err == nil || calls.Load() != 2 || attempts != 1 {
		t.Fatalf("dispatches: calls=%d attempts=%d err=%v", calls.Load(), attempts, err)
	}
	var firstID int64
	for seq, status := range []int{400, 401} {
		var rowID, profileID int64
		var operation, stream, state, upstream, fingerprint, model string
		var observed int
		if err := db.QueryRow(`SELECT id,provider_profile_id,operation,stream_flag,status,http_status,upstream_request_id,config_fingerprint,model
			FROM ai_text_dispatch_audits WHERE source_run_id=$1 AND turn_request_id=$2 AND sequence=$3`, id, requestID, seq+1).
			Scan(&rowID, &profileID, &operation, &stream, &state, &observed, &upstream, &fingerprint, &model); err != nil {
			t.Fatal(err)
		}
		wantStream := "unspecified"
		if seq == 1 {
			wantStream = "true"
		}
		if seq == 0 {
			firstID = rowID
		}
		if profileID != 91 || operation != "openai.responses" || stream != wantStream || state != "http_error" ||
			observed != status || upstream != fmt.Sprintf("fixture-%d", seq+1) || fingerprint != providerConfigFingerprint(profile) ||
			model != "actual-model" || strings.Contains(fingerprint, server.URL) {
			t.Fatalf("wrong evidence for dispatch %d: %s %s %s %d %s", seq+1, operation, stream, state, observed, upstream)
		}
	}
	// No overwrite of the first terminal row, even by an exact identity.
	if err := repo.FinishTextDispatch(ctx, &domain.TextDispatchAudit{
		ID: firstID, RunID: id, TurnRequestID: requestID, Status: "transport_unknown",
	}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("terminal dispatch overwritten: %v", err)
	}
	// A fresh observer cannot reuse a persisted turn/sequence after an
	// ambiguous acknowledgement. No external request may follow the conflict.
	duplicate := newRunTextDispatchAudit(repo, id, agentID, requestID, profile)
	_, err = client.Generate(ctx, provider.Request{DispatchAudit: duplicate})
	if !errors.Is(err, provider.ErrTextDispatchStartUnconfirmed) || calls.Load() != 2 {
		t.Fatalf("duplicate dispatch identity replayed: calls=%d err=%v", calls.Load(), err)
	}

	if _, err := db.Exec(`DELETE FROM ai_agent_runs WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	var retained int
	if err := db.QueryRow(`SELECT COUNT(*) FROM ai_text_dispatch_audits WHERE source_run_id=$1 AND run_id IS NULL`, id).Scan(&retained); err != nil || retained != 2 {
		t.Fatalf("dispatch evidence lost with run: retained=%d err=%v", retained, err)
	}
}

func TestAgentTextDispatchDecodeEvidenceIsOneWayAndSeparateFromHTTPReceipt(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	runID := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_text_dispatch_audits WHERE source_run_id=$1`, runID); err != nil {
			t.Errorf("cleanup dispatch evidence: %v", err)
		}
	})
	if err := repo.StartRun(ctx, runID, false); err != nil { t.Fatal(err) }
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
		if calls == 1 {
			_, _ = w.Write([]byte(`{"status":"completed","output_text":"ok","usage":{"input_tokens":4,"output_tokens":2}}`))
		} else {
			_, _ = w.Write([]byte(`{"status":`))
		}
	}))
	defer server.Close()
	client, err := provider.NewHTTPProviderWithConfig("openai", server.URL, "private-fixture-key", "actual-model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil { t.Fatal(err) }
	profile := &providerdomain.ProviderProfile{ID: 92, ProviderType: "openai", Vendor: "openai", Model: client.Model(), BaseURL: server.URL}
	for i, want := range []string{"decoded", "invalid"} {
		turnID := fmt.Sprintf("decode-run-%d-turn-%d", runID, i+1)
		audit := newRunTextDispatchAudit(repo, runID, agentID, turnID, profile)
		_, _ = client.Generate(ctx, provider.Request{DispatchAudit: audit})
		var httpStatus int
		var decodeStatus string
		var decodedAt *time.Time
		if err := db.QueryRow(`SELECT http_status,decode_status,decoded_at FROM ai_text_dispatch_audits
			WHERE source_run_id=$1 AND turn_request_id=$2 AND sequence=1`, runID, turnID).
			Scan(&httpStatus, &decodeStatus, &decodedAt); err != nil {
			t.Fatal(err)
		}
		if httpStatus != http.StatusOK || decodeStatus != want || decodedAt == nil {
			t.Fatalf("turn %d: http=%d decode=%s decoded_at=%v want=%s", i+1, httpStatus, decodeStatus, decodedAt, want)
		}
	}
	if calls != 2 { t.Fatalf("HTTP requests=%d", calls) }
}
