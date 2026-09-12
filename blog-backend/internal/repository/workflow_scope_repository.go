package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/rushairer/blog-backend/internal/domain"
)

// These Workflow scope/resource methods remain transitional until their
// consumers move to the canonical Workflow repository. They are kept out of
// Agent Run persistence so the ownership boundary is explicit.
func (r *AgentRepository) WorkflowScopePolicy(ctx context.Context, workflowVersionID int64) (domain.WorkflowScopePolicy, error) {
	var raw []byte
	if err := r.db.QueryRowContext(ctx, `SELECT scope_policy FROM ai_workflow_versions WHERE id=$1`, workflowVersionID).Scan(&raw); err != nil {
		return domain.WorkflowScopePolicy{}, err
	}
	var policy domain.WorkflowScopePolicy
	err := json.Unmarshal(raw, &policy)
	return policy, err
}

func (r *AgentRepository) WorkflowResourceAccess(ctx context.Context, workflowRunID int64, resourceType, key string) (string, bool, error) {
	var access string
	err := r.db.QueryRowContext(ctx, `SELECT access_level FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND resource_type=$2 AND resource_key=$3`, workflowRunID, resourceType, key).Scan(&access)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return access, err == nil, err
}

func (r *AgentRepository) AddDiscoveredWorkflowResource(ctx context.Context, workflowRunID int64, resourceType, key, label string, snapshot json.RawMessage) error {
	if len(snapshot) == 0 {
		snapshot = json.RawMessage(`{}`)
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources(workflow_run_id,resource_type,resource_key,source,access_level,label,snapshot)
		VALUES($1,$2,$3,'discovery','read',$4,$5) ON CONFLICT(workflow_run_id,resource_type,resource_key) DO NOTHING`, workflowRunID, resourceType, key, label, snapshot)
	return err
}
