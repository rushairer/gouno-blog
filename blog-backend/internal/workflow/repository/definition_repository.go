package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

type DefinitionRepository struct {
	db *sql.DB
}

func NewDefinitionRepository(db *sql.DB) *DefinitionRepository {
	return &DefinitionRepository{db: db}
}

const definitionColumns = `w.id, w.name, w.description, w.enabled, w.cron_expression, w.timezone, w.next_run_at, w.template_key,
	w.current_version, v.id, v.input_schema, v.steps, v.scope_policy, w.event_triggers, w.resource_query_preview, w.resource_query_preview_at,
	w.resource_query_last_count, w.resource_query_last_run_at, w.resource_query_empty_policy, w.created_by_principal_id, w.creation_origin, w.created_at, w.updated_at`

func scanDefinition(scanner interface{ Scan(...any) error }) (*domain.Workflow, error) {
	var value domain.Workflow
	var steps, scopePolicy, eventTriggers, queryPreview []byte
	err := scanner.Scan(&value.ID, &value.Name, &value.Description, &value.Enabled, &value.CronExpression, &value.Timezone, &value.NextRunAt, &value.TemplateKey,
		&value.CurrentVersion, &value.VersionID, &value.InputSchema, &steps, &scopePolicy, &eventTriggers, &queryPreview, &value.ResourceQueryPreviewAt,
		&value.ResourceQueryLastCount, &value.ResourceQueryLastRunAt, &value.ResourceQueryEmptyPolicy, &value.CreatedByPrincipalID, &value.CreationOrigin,
		&value.CreatedAt, &value.UpdatedAt)
	if err == nil {
		err = json.Unmarshal(steps, &value.Steps)
	}
	if err == nil {
		err = json.Unmarshal(scopePolicy, &value.ScopePolicy)
	}
	if err == nil && len(eventTriggers) > 0 {
		err = json.Unmarshal(eventTriggers, &value.EventTriggers)
	}
	if err == nil {
		value.ResourceQueryPreview = json.RawMessage(queryPreview)
	}
	return &value, err
}

func (r *DefinitionRepository) List(ctx context.Context) ([]*domain.Workflow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+definitionColumns+`
		FROM ai_workflows w JOIN ai_workflow_versions v
		ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.deleted_at IS NULL ORDER BY w.created_at, w.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.Workflow, 0)
	for rows.Next() {
		item, err := scanDefinition(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *DefinitionRepository) Get(ctx context.Context, id int64) (*domain.Workflow, error) {
	return scanDefinition(r.db.QueryRowContext(ctx, `SELECT `+definitionColumns+`
		FROM ai_workflows w JOIN ai_workflow_versions v
		ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.id=$1 AND w.deleted_at IS NULL`, id))
}

func (r *DefinitionRepository) Save(ctx context.Context, value *domain.Workflow, nextRun *time.Time) error {
	rawSteps, err := json.Marshal(value.Steps)
	if err != nil {
		return err
	}
	rawScope, err := json.Marshal(value.ScopePolicy)
	if err != nil {
		return err
	}
	rawEvents, err := json.Marshal(value.EventTriggers)
	if err != nil {
		return err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if value.ID == 0 {
		err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
			(name, description, enabled, cron_expression, timezone, next_run_at, template_key, event_triggers, resource_query_preview, resource_query_preview_at, resource_query_empty_policy, created_by_principal_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			RETURNING id, current_version, created_at, updated_at`, value.Name, value.Description,
			value.Enabled, value.CronExpression, value.Timezone, nextRun, value.TemplateKey, rawEvents, value.ResourceQueryPreview, value.ResourceQueryPreviewAt, value.ResourceQueryEmptyPolicy, value.CreatedByPrincipalID).Scan(&value.ID, &value.CurrentVersion, &value.CreatedAt, &value.UpdatedAt)
	} else {
		err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET name=$2, description=$3,
			enabled=$4, cron_expression=$5, timezone=$6, next_run_at=$7, template_key=$8, event_triggers=$9, resource_query_preview=$10, resource_query_preview_at=$11,
			resource_query_empty_policy=$12, current_version=current_version+1, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL
			RETURNING current_version, created_at, updated_at`, value.ID, value.Name,
			value.Description, value.Enabled, value.CronExpression, value.Timezone, nextRun, value.TemplateKey, rawEvents, value.ResourceQueryPreview, value.ResourceQueryPreviewAt, value.ResourceQueryEmptyPolicy).Scan(&value.CurrentVersion, &value.CreatedAt, &value.UpdatedAt)
	}
	if err == nil {
		err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflow_versions
			(workflow_id, version, input_schema, steps, scope_policy, created_by_principal_id)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, value.ID, value.CurrentVersion,
			value.InputSchema, rawSteps, rawScope, value.CreatedByPrincipalID).Scan(&value.VersionID)
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (r *DefinitionRepository) Versions(ctx context.Context, id int64) ([]*domain.Workflow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT w.id, w.name, w.description, w.enabled, w.cron_expression, w.timezone, w.next_run_at, w.template_key,
		v.version, v.id, v.input_schema, v.steps, v.scope_policy, w.event_triggers, w.resource_query_preview, w.resource_query_preview_at,
		w.resource_query_last_count, w.resource_query_last_run_at, w.resource_query_empty_policy, v.created_by_principal_id, v.creation_origin, w.created_at, v.created_at
		FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id
		WHERE w.id=$1 ORDER BY v.version DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.Workflow, 0)
	for rows.Next() {
		item, err := scanDefinition(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *DefinitionRepository) VersionStepsRaw(ctx context.Context, id int64, version int) (json.RawMessage, error) {
	var raw json.RawMessage
	err := r.db.QueryRowContext(ctx, `SELECT steps FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2`, id, version).Scan(&raw)
	return raw, err
}

func (r *DefinitionRepository) SetCurrentVersion(ctx context.Context, id int64, version int) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflows SET current_version=$2,
		updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL
		AND EXISTS (SELECT 1 FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2)`, id, version)
	if err != nil {
		return false, err
	}
	changed, _ := result.RowsAffected()
	return changed > 0, nil
}

func (r *DefinitionRepository) SetEnabled(ctx context.Context, id int64, enabled bool, nextRun *time.Time) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflows SET enabled=$2, next_run_at=$3,
		updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id, enabled, nextRun)
	if err != nil {
		return false, err
	}
	changed, _ := result.RowsAffected()
	return changed > 0, nil
}

func (r *DefinitionRepository) Delete(ctx context.Context, id int64) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE ai_workflows
		SET enabled=FALSE, next_run_at=NULL, deleted_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return false, err
	}
	changed, _ := result.RowsAffected()
	return changed > 0, nil
}
