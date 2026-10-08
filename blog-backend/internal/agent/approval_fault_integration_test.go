package agent

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

// The effect is committed before the fake transport loses its acknowledgement.
type committedEditorialEffectWithLostReply struct {
	ApprovalEffectWriter
	db *sql.DB
	calls int
}

func (s *committedEditorialEffectWithLostReply) CreateEditorialTask(ctx context.Context, approvalID int64, title, description, priority string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO ai_editorial_tasks
		(title, description, priority, source_approval_id) VALUES ($1,$2,$3,$4)`,
		title, description, priority, approvalID)
	if err != nil {
		return err
	}
	s.calls++
	return errors.New("injected fault: transaction committed but acknowledgement lost")
}

func TestApprovalPersistedEffectCannotBeReplayedAfterLostReply(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()

	var agentID, runID, toolID, approvalID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE deleted_at IS NULL ORDER BY id LIMIT 1`).Scan(&agentID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_agent_runs
		(agent_id,trigger_type,status,input,provider,model,skill_version_id)
		VALUES($1,'manual','awaiting_approval','{}','openai','test-model',(SELECT skill_version_id FROM ai_agents WHERE id=$1))
		RETURNING id`, agentID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_editorial_tasks WHERE source_approval_id=$1`, approvalID)
		_, _ = db.ExecContext(ctx, `DELETE FROM ai_agent_runs WHERE id=$1`, runID)
	}()
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_tool_calls
		(run_id,tool_name,risk_level,arguments,status)
		VALUES($1,'content.create_editorial_task','propose','{}','executed') RETURNING id`, runID).Scan(&toolID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `INSERT INTO ai_approvals
		(run_id,tool_call_id,action_type,target_type,proposed_payload,status)
		VALUES($1,$2,'create_editorial_task','task',
		'{"title":"Review","description":"Draft","priority":"high"}'::jsonb,'pending') RETURNING id`,
		runID, toolID).Scan(&approvalID); err != nil {
		t.Fatal(err)
	}

	effect := &committedEditorialEffectWithLostReply{db: db}
	svc := &ApprovalService{approvals: agentrepository.NewApprovalRepository(db), effects: effect}
	principalID := testsupport.Principal(t, db)

	if err := svc.Approve(ctx, approvalID, principalID, "review"); !errors.Is(err, ErrApprovalOutcomeUncertain) {
		t.Fatalf("fault-injected approval error=%v, want uncertain outcome", err)
	}
	got, err := agentrepository.NewApprovalRepository(db).GetApproval(ctx, approvalID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != domain.ApprovalApproved {
		t.Fatalf("in-doubt persisted status=%s, want approved", got.Status)
	}
	if err := svc.Approve(ctx, approvalID, principalID, "retry"); !errors.Is(err, ErrApprovalConflict) {
		t.Fatalf("persisted retry error=%v, want conflict", err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_editorial_tasks
		WHERE source_approval_id=$1`, approvalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 || effect.calls != 1 {
		t.Fatalf("replayed persisted side effect: rows=%d writer_calls=%d", count, effect.calls)
	}
}
