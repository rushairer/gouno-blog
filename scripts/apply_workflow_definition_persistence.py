from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_region(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        raise SystemExit(f"{label}: markers start={start_count} end={end_count}")
    left = text.index(start)
    right = text.index(end, left)
    return text[:left] + replacement + text[right:]


repo_path = ROOT / "blog-backend/internal/workflow/repository/definition_repository.go"
if repo_path.exists():
    raise SystemExit("definition_repository.go already exists")
repo_path.write_text(r'''package repository

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

func (r *DefinitionRepository) VersionSteps(ctx context.Context, id int64, version int) ([]domain.WorkflowStep, error) {
	var raw []byte
	if err := r.db.QueryRowContext(ctx, `SELECT steps FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2`, id, version).Scan(&raw); err != nil {
		return nil, err
	}
	var steps []domain.WorkflowStep
	if err := json.Unmarshal(raw, &steps); err != nil {
		return nil, err
	}
	return steps, nil
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
''')

service_path = ROOT / "blog-backend/internal/workflow/service.go"
service = service_path.read_text()
service = replace_once(
    service,
    '\t"github.com/rushairer/blog-backend/internal/workflowplan"\n',
    '\tworkflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"\n\t"github.com/rushairer/blog-backend/internal/workflowplan"\n',
    "workflow repository import",
)
service = replace_once(
    service,
    '''type Service struct {\n\tdb         *sql.DB\n\trunner     *agentservice.Runner\n''',
    '''type Service struct {\n\tdb          *sql.DB\n\tdefinitions *workflowrepository.DefinitionRepository\n\trunner      *agentservice.Runner\n''',
    "service definition repository field",
)
service = replace_once(
    service,
    '''\treturn &Service{db: db, runner: runner, agents: agents, tools: registry, catalog: NewResourceCatalog(db), workerSem: make(chan struct{}, 4), transactor: transactor}\n''',
    '''\treturn &Service{db: db, definitions: workflowrepository.NewDefinitionRepository(db), runner: runner, agents: agents, tools: registry, catalog: NewResourceCatalog(db), workerSem: make(chan struct{}, 4), transactor: transactor}\n''',
    "service constructor definition repository",
)
service = replace_region(
    service,
    'const workflowColumns =',
    'func (s *Service) Save',
    '''func (s *Service) List(ctx context.Context) ([]*domain.Workflow, error) {\n\treturn s.definitions.List(ctx)\n}\n\nfunc (s *Service) Get(ctx context.Context, id int64) (*domain.Workflow, error) {\n\titem, err := s.definitions.Get(ctx, id)\n\tif errors.Is(err, sql.ErrNoRows) {\n\t\treturn nil, ErrNotFound\n\t}\n\treturn item, err\n}\n\n''',
    "definition list/get persistence",
)
service = replace_region(
    service,
    'func (s *Service) Save',
    'func workflowSaveError',
    '''func (s *Service) Save(ctx context.Context, value *domain.Workflow) error {\n\tvalue.Name, value.Description = strings.TrimSpace(value.Name), strings.TrimSpace(value.Description)\n\tif value.Timezone == "" {\n\t\tvalue.Timezone = "Asia/Shanghai"\n\t}\n\tif value.CronExpression != nil {\n\t\ttrimmed := strings.TrimSpace(*value.CronExpression)\n\t\tvalue.CronExpression = &trimmed\n\t\tif _, err := scheduledNext(trimmed, value.Timezone, time.Now()); err != nil {\n\t\t\treturn fmt.Errorf("%w: %v", ErrInvalid, err)\n\t\t}\n\t}\n\tif value.Name == "" || len(value.InputSchema) == 0 || !json.Valid(value.InputSchema) {\n\t\treturn fmt.Errorf("%w: name and input schema are required", ErrInvalid)\n\t}\n\tif len(value.InputSchema) > 32<<10 || len(value.Steps) == 0 {\n\t\treturn fmt.Errorf("%w: workflow is empty or too large", ErrInvalid)\n\t}\n\tif err := validateInputSchema(value.InputSchema); err != nil {\n\t\treturn err\n\t}\n\tfields, _ := resourceFields(value.InputSchema)\n\tvar err error\n\tvalue.ScopePolicy, err = normalizeScopePolicy(value.ScopePolicy, len(fields) > 0 || hasResourceQuery(value.Steps))\n\tif err != nil {\n\t\treturn err\n\t}\n\tif err := s.validateSteps(value.Steps, 0); err != nil {\n\t\treturn err\n\t}\n\tif err := s.validateDiscoveryTools(ctx, value); err != nil {\n\t\treturn err\n\t}\n\tif err := validateEventTriggers(value.EventTriggers); err != nil {\n\t\treturn err\n\t}\n\tif value.ResourceQueryEmptyPolicy == "" {\n\t\tvalue.ResourceQueryEmptyPolicy = "succeed"\n\t}\n\tif value.ResourceQueryEmptyPolicy != "succeed" && value.ResourceQueryEmptyPolicy != "fail" {\n\t\treturn fmt.Errorf("%w: empty resource query policy must be succeed or fail", ErrInvalid)\n\t}\n\tpreview, previewAt, err := s.previewResourceQueries(ctx, value.Steps)\n\tif err != nil {\n\t\treturn err\n\t}\n\tvalue.ResourceQueryPreview, value.ResourceQueryPreviewAt = preview, previewAt\n\trawSteps, _ := json.Marshal(value.Steps)\n\tif len(rawSteps) > 128<<10 {\n\t\treturn fmt.Errorf("%w: step definition exceeds 128 KiB", ErrInvalid)\n\t}\n\treturn workflowSaveError(s.definitions.Save(ctx, value, workflowNext(value)))\n}\n\n''',
    "definition save persistence",
)
service = replace_region(
    service,
    'func (s *Service) Versions',
    'func (s *Service) Queue',
    '''func (s *Service) Versions(ctx context.Context, id int64) ([]*domain.Workflow, error) {\n\treturn s.definitions.Versions(ctx, id)\n}\n\nfunc (s *Service) Rollback(ctx context.Context, id int64, version int) error {\n\tsteps, err := s.definitions.VersionSteps(ctx, id, version)\n\tif errors.Is(err, sql.ErrNoRows) {\n\t\treturn ErrNotFound\n\t}\n\tif err != nil {\n\t\treturn fmt.Errorf("%w: invalid historical workflow steps", ErrInvalid)\n\t}\n\tif err := s.validateSteps(steps, 0); err != nil {\n\t\treturn fmt.Errorf("%w: historical version cannot be reactivated", ErrInvalid)\n\t}\n\tchanged, err := s.definitions.SetCurrentVersion(ctx, id, version)\n\tif err != nil {\n\t\treturn err\n\t}\n\tif !changed {\n\t\treturn ErrNotFound\n\t}\n\treturn nil\n}\n\nfunc (s *Service) SetEnabled(ctx context.Context, id int64, enabled bool) error {\n\tvalue, err := s.Get(ctx, id)\n\tif err != nil {\n\t\treturn err\n\t}\n\tif enabled {\n\t\tif err := s.validateRunnableSteps(ctx, value.Steps, map[string]any{"input": map[string]any{}, "steps": map[string]any{}}); err != nil {\n\t\t\treturn err\n\t\t}\n\t}\n\tvalue.Enabled = enabled\n\tchanged, err := s.definitions.SetEnabled(ctx, id, enabled, workflowNext(value))\n\tif err != nil {\n\t\treturn err\n\t}\n\tif !changed {\n\t\treturn ErrNotFound\n\t}\n\treturn nil\n}\n\n// Delete soft-deletes a workflow so its version and run audit trail remain\n// available to administrators while preventing all future scheduled runs.\nfunc (s *Service) Delete(ctx context.Context, id int64) error {\n\tchanged, err := s.definitions.Delete(ctx, id)\n\tif err != nil {\n\t\treturn err\n\t}\n\tif !changed {\n\t\treturn ErrNotFound\n\t}\n\treturn nil\n}\n\n''',
    "definition version/enable/delete persistence",
)
if 'const workflowColumns' in service or 'scanWorkflow(' in service:
    raise SystemExit("legacy definition scanner remains in workflow service")
if 'INSERT INTO ai_workflow_versions' in service:
    raise SystemExit("workflow version writes still owned by service")
service_path.write_text(service)

arch_path = ROOT / "blog-backend/ARCHITECTURE_CONVERGENCE.md"
arch = arch_path.read_text()
arch = replace_once(
    arch,
    '**Persistence and Agent-consumer ownership converged.** ApprovalService and Runner consume Workflow-owned ports directly. HTTP ownership remains flat.',
    '**Definition/version persistence is repository-owned; Agent-consumer ownership is converged.** Run/event/execution state remains service-local pending Workflow consolidation. HTTP ownership remains flat.',
    "workflow convergence state",
)
arch = replace_once(
    arch,
    '1. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.',
    '1. **Workflow consolidation:** Definition/version persistence is now isolated. Next converge Run/Event persistence, then extract cross-capability lifecycle coordination before decomposing execution/preflight/scheduling internals.',
    "workflow migration priority",
)
arch = replace_once(
    arch,
    '**Starter Pack application coordination**, and **Runner dependency/lifecycle convergence** now use consumer-side canonical contracts and explicit composition-root wiring.',
    '**Starter Pack application coordination**, **Runner dependency/lifecycle convergence**, and **Workflow Definition/Version persistence extraction** now use canonical ownership boundaries and explicit composition-root wiring.',
    "completed workflow definition slice",
)
arch_path.write_text(arch)

# Fail closed on this slice's ownership boundary.
service = service_path.read_text()
for forbidden in [
    'INSERT INTO ai_workflow_versions',
    'current_version=current_version+1',
    'SELECT steps FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2',
]:
    if forbidden in service:
        raise SystemExit(f"workflow Service still owns Definition/Version SQL: {forbidden}")
if 'definitions *workflowrepository.DefinitionRepository' not in service:
    raise SystemExit("workflow Service is not wired to DefinitionRepository")
print("Workflow Definition/Version persistence transform applied successfully")
