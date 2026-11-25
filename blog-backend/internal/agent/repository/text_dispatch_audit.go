package repository

import (
	"context"
	"errors"

	"github.com/rushairer/blog-backend/internal/agent/domain"
)

// Insert against the acknowledged running identity. No upsert or conflict
// recovery: an ambiguous started-row acknowledgement forbids dispatch.
func (r *RunRepository) StartTextDispatch(ctx context.Context, a *domain.TextDispatchAudit) error {
	if a == nil || a.ID != 0 {
		return errors.New("invalid text dispatch audit start")
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_text_dispatch_audits
		(run_id,source_run_id,agent_id,turn_request_id,sequence,provider_profile_id,provider_type,vendor,model,config_fingerprint,operation,stream_flag)
		SELECT id,id,agent_id,$3,$4,$5,$6,$7,$8,$9,$10,$11
		FROM ai_agent_runs WHERE id=$1 AND agent_id=$2 AND status='running'
		RETURNING id`, a.RunID, a.AgentID, a.TurnRequestID, a.Sequence, a.ProviderProfileID, a.ProviderType,
		a.Vendor, a.Model, a.ConfigFingerprint, a.Operation, a.StreamFlag).Scan(&a.ID)
}

// A late writer may finish only its own started row, including when the
// historical run link has been removed. Never rewrite a terminal observation.
func (r *RunRepository) FinishTextDispatch(ctx context.Context, a *domain.TextDispatchAudit) error {
	if a == nil || a.ID <= 0 {
		return errors.New("invalid text dispatch audit finish")
	}
	switch a.Status {
	case "response_received", "http_error", "transport_unknown":
	default:
		return errors.New("invalid text dispatch outcome")
	}
	result, err := r.db.ExecContext(ctx, `UPDATE ai_text_dispatch_audits
		SET status=$4,http_status=NULLIF($5,0),upstream_request_id=NULLIF($6,''),
			upstream_account_id=NULLIF($7,''),upstream_workspace_id=NULLIF($8,''),finished_at=NOW()
		WHERE id=$1 AND source_run_id=$2 AND turn_request_id=$3 AND status='started'`,
		a.ID, a.RunID, a.TurnRequestID, a.Status, a.HTTPStatus, a.UpstreamRequestID, a.UpstreamAccountID, a.UpstreamWorkspaceID)
	if err != nil {
		return err
	}
	return requireRunTransition(result)
}
