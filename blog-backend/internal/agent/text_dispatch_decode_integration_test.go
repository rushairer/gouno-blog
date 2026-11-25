package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
)

func TestAgentTextDispatchDecodeEvidenceRejectsDuplicateCompletion(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	runID := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_text_dispatch_audits WHERE source_run_id=$1`, runID); err != nil {
			t.Errorf("cleanup dispatch evidence: %v", err)
		}
	})
	if err := repo.StartRun(ctx, runID); err != nil {
		t.Fatal(err)
	}

	calls := 0
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
	if err != nil {
		t.Fatal(err)
	}
	profile := &providerdomain.ProviderProfile{ID: 92, ProviderType: "openai", Vendor: "openai", Model: client.Model(), BaseURL: server.URL}
	for i, want := range []string{"decoded", "invalid"} {
		turnID := fmt.Sprintf("decode-run-%d-turn-%d", runID, i+1)
		audit := newRunTextDispatchAudit(repo, runID, agentID, turnID, profile)
		result, decodeErr := client.Generate(ctx, provider.Request{DispatchAudit: audit})
		if i == 0 && (decodeErr != nil || result.Text != "ok") {
			t.Fatalf("valid response: result=%#v err=%v", result, decodeErr)
		}
		if i == 1 && decodeErr == nil {
			t.Fatalf("malformed response was accepted: %#v", result)
		}
		var rowID int64
		var httpStatus int
		var decodeStatus string
		var decodedAt *time.Time
		if err := db.QueryRow(`SELECT id,http_status,decode_status,decoded_at FROM ai_text_dispatch_audits
			WHERE source_run_id=$1 AND turn_request_id=$2 AND sequence=1`, runID, turnID).
			Scan(&rowID, &httpStatus, &decodeStatus, &decodedAt); err != nil {
			t.Fatal(err)
		}
		if httpStatus != http.StatusOK || decodeStatus != want || decodedAt == nil {
			t.Fatalf("turn %d: http=%d decode=%s decoded_at=%v want=%s", i+1, httpStatus, decodeStatus, decodedAt, want)
		}
		if i == 0 {
			err := repo.CompleteTextDispatch(ctx, &domain.TextDispatchAudit{
				ID: rowID, RunID: runID, TurnRequestID: turnID, DecodeStatus: "invalid",
			})
			if !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf("decoded outcome was overwritten: %v", err)
			}
		}
	}
	if calls != 2 {
		t.Fatalf("HTTP requests=%d", calls)
	}
}
