package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

func newExecutionFixture(t *testing.T) (*sql.DB, int64, int64) {
	t.Helper()
	db := testsupport.OpenTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	principalID := testsupport.Principal(t, db)
	var agentID, versionID int64
	if err := db.QueryRow(`INSERT INTO ai_agents(name,skill_version_id,creation_origin,created_by_principal_id)
		SELECT $1,id,'human',$2 FROM ai_skill_versions ORDER BY id LIMIT 1
		RETURNING id,skill_version_id`, fmt.Sprintf("execution-fence-%d", time.Now().UnixNano()), principalID).Scan(&agentID, &versionID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM ai_agent_runs WHERE agent_id=$1`, agentID); err != nil {
			t.Errorf("cleanup runs: %v", err)
		}
		if _, err := db.Exec(`DELETE FROM ai_agents WHERE id=$1`, agentID); err != nil {
			t.Errorf("cleanup agent: %v", err)
		}
	})
	return db, agentID, versionID
}

func createExecutionRun(t *testing.T, db *sql.DB, agentID, versionID int64, status domain.AgentRunStatus, input, output int64) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRow(`INSERT INTO ai_agent_runs(agent_id,trigger_type,status,provider,model,skill_version_id,input_tokens,output_tokens)
		VALUES($1,'manual',$2,'openai','test',$3,$4,$5) RETURNING id`,
		agentID, status, versionID, input, output).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestAgentExecutionClaimAndTerminalFence(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	lifecycle := NewRunLifecycle(dbtx.NewTransactor(db, nil), repo, agentrepository.NewMediaCandidateRepository(db))
	id := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	if err := lifecycle.FinishRun(ctx, id, domain.AgentRunFailed, "", 0, 0, nil, nil); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("unclaimed run could be finished: %v", err)
	}

	const workers = 8
	results := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results <- repo.StartRun(ctx, id)
		}()
	}
	wg.Wait()
	close(results)
	claimed := 0
	for err := range results {
		if err == nil {
			claimed++
		} else if !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("claim failure: %v", err)
		}
	}
	if claimed != 1 {
		t.Fatalf("claimed by %d workers", claimed)
	}
	if err := lifecycle.FinishRun(ctx, id, domain.AgentRunSucceeded, "confirmed", 13, 5, nil, nil); err != nil {
		t.Fatal(err)
	}
	if err := repo.StartRun(ctx, id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("completed run was reclaimed: %v", err)
	}
	if err := lifecycle.FinishRun(ctx, id, domain.AgentRunFailed, "overwritten", 0, 0, nil, nil); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("terminal run was overwritten: %v", err)
	}
	run, err := repo.GetRun(ctx, id)
	if err != nil || run.Status != domain.AgentRunSucceeded || run.OutputSummary != "confirmed" ||
		run.InputTokens != 13 || run.OutputTokens != 5 || run.FinishedAt == nil {
		t.Fatalf("terminal evidence changed: run=%#v err=%v", run, err)
	}
}

func TestAgentMonthlyUsageIncludesActiveFailedAndLegacyWithoutDoubleCounting(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	lifecycle := NewRunLifecycle(dbtx.NewTransactor(db, nil), repo, agentrepository.NewMediaCandidateRepository(db))
	// Legacy aggregate without usage events.
	createExecutionRun(t, db, agentID, versionID, domain.AgentRunSucceeded, 5, 2)
	// Failed run retained observed tokens even though the usage insert was unconfirmed.
	createExecutionRun(t, db, agentID, versionID, domain.AgentRunFailed, 10, 3)
	// Cancelled run with terminal totals and matching ledger.
	cancelled := createExecutionRun(t, db, agentID, versionID, domain.AgentRunCancelled, 6, 4)
	// Older run is outside the existing run-creation-month accounting policy.
	old := createExecutionRun(t, db, agentID, versionID, domain.AgentRunSucceeded, 1000, 500)
	if _, err := db.Exec(`UPDATE ai_agent_runs SET created_at=date_trunc('month', NOW()) - INTERVAL '1 day' WHERE id=$1`, old); err != nil {
		t.Fatal(err)
	}
	active := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	if err := repo.StartRun(ctx, active); err != nil {
		t.Fatal(err)
	}
	usage := func(id, input, output int64, sequence int) {
		t.Helper()
		event := &domain.UsageEvent{RunID: id, RequestID: fmt.Sprintf("run-fence-%d-%d", id, sequence),
			Provider: "openai", Model: "test", InputTokens: input, OutputTokens: output, CompletedAt: time.Now().UTC()}
		if err := repo.RecordUsage(ctx, event); err != nil {
			t.Fatal(err)
		}
	}
	usage(cancelled, 6, 4, 1)
	usage(active, 7, 3, 1)
	usage(active, 2, 1, 2)
	assertTotal := func(want int64) {
		t.Helper()
		got, err := repo.MonthlyTokenUsage(ctx, agentID)
		if err != nil || got != want {
			t.Fatalf("monthly total=%d want=%d err=%v", got, want, err)
		}
	}
	assertTotal(43)
	if err := lifecycle.FinishRun(ctx, active, domain.AgentRunFailed, "", 9, 4, nil, nil); err != nil {
		t.Fatal(err)
	}
	assertTotal(43)
}

type failingRunUsageSync struct {
	RunLifecycleMediaStore
}

var errRunUsageSync = errors.New("injected failure after media token update")

func (s failingRunUsageSync) SyncRunTokenUsageTx(ctx context.Context, tx *sql.Tx, id, input, output int64) error {
	if err := s.RunLifecycleMediaStore.SyncRunTokenUsageTx(ctx, tx, id, input, output); err != nil {
		return err
	}
	return errRunUsageSync
}

func TestAgentTerminalAndMediaUsageCommitTogether(t *testing.T) {
	db, agentID, versionID := newExecutionFixture(t)
	ctx := context.Background()
	repo := agentrepository.NewRunRepository(db)
	media := agentrepository.NewMediaCandidateRepository(db)
	id := createExecutionRun(t, db, agentID, versionID, domain.AgentRunQueued, 0, 0)
	if err := repo.StartRun(ctx, id); err != nil {
		t.Fatal(err)
	}
	var postID, candidateID int64
	if err := db.QueryRow(`INSERT INTO posts(title,slug,content,status) VALUES('execution fence',$1,'','draft') RETURNING id`,
		fmt.Sprintf("execution-fence-%d", id)).Scan(&postID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM ai_media_candidates WHERE post_id=$1`, postID)
		_, _ = db.Exec(`DELETE FROM posts WHERE id=$1`, postID)
	})
	if err := db.QueryRow(`INSERT INTO ai_media_candidates(post_id,source_run_id,brief,provider,model,generation_status,input_tokens,output_tokens)
		VALUES($1,$2,'brief','openai','test','brief_ready',0,0) RETURNING id`, postID, id).Scan(&candidateID); err != nil {
		t.Fatal(err)
	}
	lifecycle := NewRunLifecycle(dbtx.NewTransactor(db, nil), repo, failingRunUsageSync{media})
	if err := lifecycle.FinishRun(ctx, id, domain.AgentRunFailed, "", 17, 4, nil, nil); !errors.Is(err, errRunUsageSync) {
		t.Fatalf("expected injected rollback: %v", err)
	}
	run, err := repo.GetRun(ctx, id)
	if err != nil || run.Status != domain.AgentRunRunning || run.InputTokens != 0 || run.FinishedAt != nil {
		t.Fatalf("run escaped rollback: %#v err=%v", run, err)
	}
	var input, output int64
	if err := db.QueryRow(`SELECT input_tokens,output_tokens FROM ai_media_candidates WHERE id=$1`, candidateID).Scan(&input, &output); err != nil || input != 0 || output != 0 {
		t.Fatalf("media escaped rollback: input=%d output=%d err=%v", input, output, err)
	}

	// This is a deterministic, locally proven rollback in a disposable DB,
	// not a production policy to replay an ambiguous finalization.
	lifecycle = NewRunLifecycle(dbtx.NewTransactor(db, nil), repo, media)
	if err := lifecycle.FinishRun(ctx, id, domain.AgentRunFailed, "", 17, 4, nil, nil); err != nil {
		t.Fatal(err)
	}
	run, err = repo.GetRun(ctx, id)
	if err != nil || run.Status != domain.AgentRunFailed || run.InputTokens != 17 || run.OutputTokens != 4 {
		t.Fatalf("run terminal evidence missing: %#v err=%v", run, err)
	}
	if err := db.QueryRow(`SELECT input_tokens,output_tokens FROM ai_media_candidates WHERE id=$1`, candidateID).Scan(&input, &output); err != nil || input != 17 || output != 4 {
		t.Fatalf("media usage not synchronized: input=%d output=%d err=%v", input, output, err)
	}
}
