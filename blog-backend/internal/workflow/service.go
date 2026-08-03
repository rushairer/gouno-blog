package workflow

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	agentservice "github.com/rushairer/blog-backend/internal/agent"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
)

var (
	ErrInvalid  = errors.New("invalid workflow")
	ErrNotFound = errors.New("workflow not found")
	ErrConflict = errors.New("workflow conflict")
)

type Service struct {
	db      *sql.DB
	runner  *agentservice.Runner
	agents  *agentservice.ManagementService
	tools   *tool.Registry
	catalog *ResourceCatalog
}

type PreflightCheck struct {
	Key     string `json:"key"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type PreflightResult struct {
	Ready  bool             `json:"ready"`
	Checks []PreflightCheck `json:"checks"`
}

// Preflight validates a prospective run without creating a run, consuming a
// token, resolving dynamic resources, or invoking an Agent.
func (s *Service) Preflight(ctx context.Context, id int64, input json.RawMessage, dryRun bool) (PreflightResult, error) {
	value, err := s.Get(ctx, id)
	if err != nil {
		return PreflightResult{}, err
	}
	result := PreflightResult{Ready: true, Checks: []PreflightCheck{}}
	add := func(key, status, message string) {
		result.Checks = append(result.Checks, PreflightCheck{Key: key, Status: status, Message: message})
		if status == "error" {
			result.Ready = false
		}
	}
	if !value.Enabled && !dryRun {
		add("workflow_enabled", "error", "workflow is disabled")
	} else {
		add("workflow_enabled", "ok", "workflow state allows this run")
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	var inputValue any
	if len(input) > 64<<10 || !json.Valid(input) || json.Unmarshal(input, &inputValue) != nil {
		add("input_json", "error", "input must be valid JSON under 64 KiB")
	} else if err := validateWorkflowInput(value.InputSchema, inputValue); err != nil {
		add("input_schema", "error", err.Error())
	} else {
		add("input_schema", "ok", "input matches the Workflow schema")
	}
	if err := s.validateRunnableSteps(ctx, value.Steps, map[string]any{"input": inputValue, "steps": map[string]any{}}); err != nil {
		add("agent_bindings", "error", err.Error())
	} else {
		add("agent_bindings", "ok", "all bound Agents are available and enabled")
	}
	if err := s.validateDiscoveryTools(ctx, value); err != nil {
		add("discovery_tools", "error", err.Error())
	} else {
		add("discovery_tools", "ok", "discovery permissions are authorized and read-only")
	}
	return result, nil
}

func NewService(db *sql.DB, runner *agentservice.Runner, agents *agentservice.ManagementService, registries ...*tool.Registry) *Service {
	var registry *tool.Registry
	if len(registries) > 0 {
		registry = registries[0]
	}
	return &Service{db: db, runner: runner, agents: agents, tools: registry, catalog: NewResourceCatalog(db)}
}

const workflowColumns = `w.id, w.name, w.description, w.enabled, w.cron_expression, w.timezone, w.next_run_at, w.template_key,
	w.current_version, v.id, v.input_schema, v.steps, v.scope_policy, w.event_triggers, w.resource_query_preview, w.resource_query_preview_at,
	w.resource_query_last_count, w.resource_query_last_run_at, w.resource_query_empty_policy, w.created_by, w.created_at, w.updated_at`

func scanWorkflow(scanner interface{ Scan(...any) error }) (*domain.Workflow, error) {
	var value domain.Workflow
	var steps, scopePolicy, eventTriggers, queryPreview []byte
	err := scanner.Scan(&value.ID, &value.Name, &value.Description, &value.Enabled, &value.CronExpression, &value.Timezone, &value.NextRunAt, &value.TemplateKey,
		&value.CurrentVersion, &value.VersionID, &value.InputSchema, &steps, &scopePolicy, &eventTriggers, &queryPreview, &value.ResourceQueryPreviewAt,
		&value.ResourceQueryLastCount, &value.ResourceQueryLastRunAt, &value.ResourceQueryEmptyPolicy, &value.CreatedBy,
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

func (s *Service) List(ctx context.Context) ([]*domain.Workflow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+workflowColumns+`
		FROM ai_workflows w JOIN ai_workflow_versions v
		ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.deleted_at IS NULL ORDER BY w.created_at, w.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.Workflow, 0)
	for rows.Next() {
		item, err := scanWorkflow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Get(ctx context.Context, id int64) (*domain.Workflow, error) {
	item, err := scanWorkflow(s.db.QueryRowContext(ctx, `SELECT `+workflowColumns+`
		FROM ai_workflows w JOIN ai_workflow_versions v
		ON v.workflow_id=w.id AND v.version=w.current_version
		WHERE w.id=$1 AND w.deleted_at IS NULL`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return item, err
}

func (s *Service) Save(ctx context.Context, value *domain.Workflow) error {
	value.Name, value.Description = strings.TrimSpace(value.Name), strings.TrimSpace(value.Description)
	if value.Timezone == "" {
		value.Timezone = "Asia/Shanghai"
	}
	if value.CronExpression != nil {
		trimmed := strings.TrimSpace(*value.CronExpression)
		value.CronExpression = &trimmed
		if _, err := scheduledNext(trimmed, value.Timezone, time.Now()); err != nil {
			return fmt.Errorf("%w: %v", ErrInvalid, err)
		}
	}
	if value.Name == "" || len(value.InputSchema) == 0 || !json.Valid(value.InputSchema) {
		return fmt.Errorf("%w: name and input schema are required", ErrInvalid)
	}
	if len(value.InputSchema) > 32<<10 || len(value.Steps) == 0 {
		return fmt.Errorf("%w: workflow is empty or too large", ErrInvalid)
	}
	if err := validateInputSchema(value.InputSchema); err != nil {
		return err
	}
	fields, _ := resourceFields(value.InputSchema)
	var err error
	value.ScopePolicy, err = normalizeScopePolicy(value.ScopePolicy, len(fields) > 0 || hasResourceQuery(value.Steps))
	if err != nil {
		return err
	}
	if err := s.validateSteps(value.Steps, 0); err != nil {
		return err
	}
	if err := s.validateDiscoveryTools(ctx, value); err != nil {
		return err
	}
	if err := validateEventTriggers(value.EventTriggers); err != nil {
		return err
	}
	if value.ResourceQueryEmptyPolicy == "" {
		value.ResourceQueryEmptyPolicy = "succeed"
	}
	if value.ResourceQueryEmptyPolicy != "succeed" && value.ResourceQueryEmptyPolicy != "fail" {
		return fmt.Errorf("%w: empty resource query policy must be succeed or fail", ErrInvalid)
	}
	preview, previewAt, err := s.previewResourceQueries(ctx, value.Steps)
	if err != nil {
		return err
	}
	value.ResourceQueryPreview, value.ResourceQueryPreviewAt = preview, previewAt
	rawSteps, _ := json.Marshal(value.Steps)
	rawScope, _ := json.Marshal(value.ScopePolicy)
	rawEvents, _ := json.Marshal(value.EventTriggers)
	if len(rawSteps) > 128<<10 {
		return fmt.Errorf("%w: step definition exceeds 128 KiB", ErrInvalid)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if value.ID == 0 {
		err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
			(name, description, enabled, cron_expression, timezone, next_run_at, event_triggers, resource_query_preview, resource_query_preview_at, resource_query_empty_policy, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			RETURNING id, current_version, created_at, updated_at`, value.Name, value.Description,
			value.Enabled, value.CronExpression, value.Timezone, workflowNext(value), rawEvents, value.ResourceQueryPreview, value.ResourceQueryPreviewAt, value.ResourceQueryEmptyPolicy, value.CreatedBy).Scan(&value.ID, &value.CurrentVersion, &value.CreatedAt, &value.UpdatedAt)
	} else {
		err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET name=$2, description=$3,
			enabled=$4, cron_expression=$5, timezone=$6, next_run_at=$7, event_triggers=$8, resource_query_preview=$9, resource_query_preview_at=$10,
			resource_query_empty_policy=$11, current_version=current_version+1, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL
			RETURNING current_version, created_by, created_at, updated_at`, value.ID, value.Name,
			value.Description, value.Enabled, value.CronExpression, value.Timezone, workflowNext(value), rawEvents, value.ResourceQueryPreview, value.ResourceQueryPreviewAt, value.ResourceQueryEmptyPolicy).Scan(&value.CurrentVersion, &value.CreatedBy,
			&value.CreatedAt, &value.UpdatedAt)
	}
	if err == nil {
		err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflow_versions
			(workflow_id, version, input_schema, steps, scope_policy, created_by)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, value.ID, value.CurrentVersion,
			value.InputSchema, rawSteps, rawScope, value.CreatedBy).Scan(&value.VersionID)
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func validateEventTriggers(triggers []domain.WorkflowEventTrigger) error {
	if len(triggers) > 20 {
		return fmt.Errorf("%w: at most 20 event triggers are allowed", ErrInvalid)
	}
	for _, trigger := range triggers {
		if strings.TrimSpace(trigger.Event) == "" || len(trigger.Event) > 80 || trigger.CooldownSeconds < 0 || trigger.CooldownSeconds > 86400 || trigger.BatchWindowSeconds < 0 || trigger.BatchWindowSeconds > 3600 {
			return fmt.Errorf("%w: invalid event trigger", ErrInvalid)
		}
		if trigger.DedupeField != "" && !strings.HasPrefix(trigger.DedupeField, "/") {
			return fmt.Errorf("%w: event dedupe_field must be a JSON pointer", ErrInvalid)
		}
	}
	return nil
}

// EmitEvent accepts a signed/internal domain event, deduplicates it, and queues
// every enabled Workflow whose event trigger matches the payload.
func (s *Service) EmitEvent(ctx context.Context, eventKey, eventType string, payload json.RawMessage, triggeredBy *string) (int, error) {
	eventKey, eventType = strings.TrimSpace(eventKey), strings.TrimSpace(eventType)
	if eventKey == "" || eventType == "" || len(eventKey) > 180 || len(eventType) > 80 || len(payload) == 0 || !json.Valid(payload) {
		return 0, fmt.Errorf("%w: invalid workflow event", ErrInvalid)
	}
	var inserted bool
	if err := s.db.QueryRowContext(ctx, `INSERT INTO ai_workflow_events(event_key,event_type,payload) VALUES($1,$2,$3)
		ON CONFLICT (event_key) DO NOTHING RETURNING TRUE`, eventKey, eventType, payload).Scan(&inserted); errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}
	ready, err := s.prepareEventBatch(ctx, eventKey, eventType, payload)
	if err != nil || !ready {
		return 0, err
	}
	queued, err := s.processStoredEvent(ctx, eventKey, eventType, payload, triggeredBy)
	if err != nil {
		s.markEventFailure(ctx, eventKey, err)
	}
	return queued, err
}

func (s *Service) prepareEventBatch(ctx context.Context, eventKey, eventType string, payload json.RawMessage) (bool, error) {
	var input any
	if err := json.Unmarshal(payload, &input); err != nil {
		return false, fmt.Errorf("%w: event payload must be an object", ErrInvalid)
	}
	workflows, err := s.List(ctx)
	if err != nil {
		return false, err
	}
	window := 0
	for _, workflow := range workflows {
		for _, trigger := range workflow.EventTriggers {
			if trigger.Event == eventType && eventFilterMatches(trigger.Filter, input) && trigger.BatchWindowSeconds > window {
				window = trigger.BatchWindowSeconds
			}
		}
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE ai_workflow_events SET batch_prepared=TRUE,available_at=NOW()+make_interval(secs=>$2)
		WHERE event_key=$1 AND status='accepted' AND batch_prepared=FALSE`, eventKey, window); err != nil {
		return false, err
	}
	return window == 0, nil
}

func (s *Service) processStoredEvent(ctx context.Context, eventKey, eventType string, payload json.RawMessage, triggeredBy *string) (int, error) {
	var input any
	if err := json.Unmarshal(payload, &input); err != nil {
		return 0, fmt.Errorf("%w: event payload must be an object", ErrInvalid)
	}
	workflows, err := s.List(ctx)
	if err != nil {
		return 0, err
	}
	queued := 0
	matched := 0
	for _, workflow := range workflows {
		for _, trigger := range workflow.EventTriggers {
			if trigger.Event != eventType || !eventFilterMatches(trigger.Filter, input) {
				continue
			}
			matched++
			if trigger.CooldownSeconds > 0 {
				var recent bool
				if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_runs WHERE workflow_id=$1 AND triggered_by=$2 AND created_at >= NOW()-make_interval(secs=>$3))`, workflow.ID, "event:"+eventKey, trigger.CooldownSeconds).Scan(&recent); err != nil {
					return queued, err
				}
				if recent {
					continue
				}
			}
			run, queueErr := s.Queue(ctx, workflow.ID, false, payload, triggeredBy)
			if queueErr != nil {
				continue
			}
			if run.Status == "queued" {
				go s.Execute(context.Background(), run.ID)
			}
			queued++
			break
		}
	}
	if matched > 0 && queued == 0 {
		return 0, fmt.Errorf("%w: no matching Workflow could be queued for event %s", ErrInvalid, eventType)
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE ai_workflow_events SET status='processed',processed_at=NOW() WHERE event_key=$1`, eventKey)
	return queued, nil
}

func (s *Service) markEventFailure(ctx context.Context, eventKey string, eventErr error) {
	message := safeError(eventErr)
	_, _ = s.db.ExecContext(ctx, `UPDATE ai_workflow_events
		SET attempts=attempts+1,last_error=$2,available_at=NOW()+make_interval(secs=>LEAST(3600,POWER(2,attempts)))
		WHERE event_key=$1 AND status='accepted'`, eventKey, message)
}

func eventFilterMatches(filter map[string]interface{}, payload any) bool {
	for key, expected := range filter {
		actual, err := resolvePointer(map[string]any{"payload": payload}, "/payload/"+strings.TrimPrefix(key, "/"))
		if err != nil || fmt.Sprint(actual) != fmt.Sprint(expected) {
			return false
		}
	}
	return true
}

// ValidateDraft applies the exact validation used by Save without changing any
// persistent state. AI workflow planning is intentionally suggestion-only.
func (s *Service) ValidateDraft(value *domain.Workflow) error {
	value.Name = strings.TrimSpace(value.Name)
	if value.Name == "" || len(value.InputSchema) == 0 || !json.Valid(value.InputSchema) {
		return fmt.Errorf("%w: name and input schema are required", ErrInvalid)
	}
	if len(value.InputSchema) > 32<<10 || len(value.Steps) == 0 {
		return fmt.Errorf("%w: workflow is empty or too large", ErrInvalid)
	}
	if err := validateInputSchema(value.InputSchema); err != nil {
		return err
	}
	fields, _ := resourceFields(value.InputSchema)
	var err error
	value.ScopePolicy, err = normalizeScopePolicy(value.ScopePolicy, len(fields) > 0 || hasResourceQuery(value.Steps))
	if err != nil {
		return err
	}
	return s.validateSteps(value.Steps, 0)
}

func (s *Service) validateSteps(steps []domain.WorkflowStep, depth int) error {
	if depth > 3 || len(steps) > 50 {
		return fmt.Errorf("%w: workflow nesting or step limit exceeded", ErrInvalid)
	}
	seen := map[string]bool{}
	seenControl := false
	for _, step := range steps {
		if step.ID == "" || seen[step.ID] {
			return fmt.Errorf("%w: step IDs must be unique and non-empty", ErrInvalid)
		}
		if step.ContinueOnError && step.Type != "for_each" {
			return fmt.Errorf("%w: continue_on_error is only valid for for_each", ErrInvalid)
		}
		seen[step.ID] = true
		switch step.Type {
		case "resource_query":
			if depth > 0 || seenControl || !supportedResourceTypes[step.ResourceType] || step.MaxItems < 1 || step.MaxItems > 100 {
				return fmt.Errorf("%w: resource_query must be a bounded top-level prefix step", ErrInvalid)
			}
			filters, err := filtersFromRaw(step.Filter)
			if err != nil {
				return err
			}
			if err := validateResourceFilters(step.ResourceType, filters); err != nil {
				return err
			}
		case "model":
			seenControl = true
			if step.AgentID <= 0 {
				return fmt.Errorf("%w: model step must bind an Agent", ErrInvalid)
			}
		case "for_each":
			seenControl = true
			if step.CollectionPointer == "" || step.MaxItems < 1 || step.MaxItems > 100 {
				return fmt.Errorf("%w: for_each requires a bounded collection", ErrInvalid)
			}
			if step.MaxConcurrency < 0 || step.MaxConcurrency > 10 {
				return fmt.Errorf("%w: for_each max_concurrency must be between 0 and 10", ErrInvalid)
			}
			if err := s.validateSteps(step.Steps, depth+1); err != nil {
				return err
			}
		case "approval_gate", "output":
			seenControl = true
		default:
			return fmt.Errorf("%w: unsupported step type %q", ErrInvalid, step.Type)
		}
		for _, pointer := range []string{step.InputPointer, step.CollectionPointer, step.OutputPointer} {
			if pointer != "" && !strings.HasPrefix(pointer, "/") {
				return fmt.Errorf("%w: JSON pointers must start with /", ErrInvalid)
			}
		}
	}
	return nil
}

func hasResourceQuery(steps []domain.WorkflowStep) bool {
	for _, step := range steps {
		if step.Type == "resource_query" || hasResourceQuery(step.Steps) {
			return true
		}
	}
	return false
}

func (s *Service) previewResourceQueries(ctx context.Context, steps []domain.WorkflowStep) (json.RawMessage, *time.Time, error) {
	type preview struct {
		StepID         string            `json:"step_id"`
		ResourceType   string            `json:"resource_type"`
		Filter         map[string]string `json:"filter,omitempty"`
		MaxItems       int               `json:"max_items"`
		EstimatedCount int               `json:"estimated_count"`
	}
	items := make([]preview, 0)
	for _, step := range steps {
		if step.Type != "resource_query" {
			continue
		}
		filters, err := filtersFromRaw(step.Filter)
		if err != nil {
			return nil, nil, err
		}
		_, total, err := s.catalog.List(ctx, step.ResourceType, domain.ResourceQuery{Page: 1, PageSize: 1, Filters: filters})
		if err != nil {
			return nil, nil, err
		}
		items = append(items, preview{StepID: step.ID, ResourceType: step.ResourceType, Filter: filters, MaxItems: step.MaxItems, EstimatedCount: total})
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return nil, nil, err
	}
	if len(items) == 0 {
		return raw, nil, nil
	}
	now := time.Now()
	return raw, &now, nil
}

func (s *Service) validateDiscoveryTools(ctx context.Context, value *domain.Workflow) error {
	if len(value.ScopePolicy.DiscoveryTools) == 0 {
		return nil
	}
	allowed := map[string]bool{}
	for _, agentID := range workflowAgentIDs(value.Steps) {
		agent, err := s.agents.GetAgent(ctx, agentID)
		if err != nil || agent.Skill == nil {
			return fmt.Errorf("%w: cannot validate discovery tools for Agent", ErrInvalid)
		}
		for _, name := range agent.Skill.Capabilities {
			allowed[name] = true
		}
	}
	for _, name := range value.ScopePolicy.DiscoveryTools {
		if !allowed[name] {
			return fmt.Errorf("%w: discovery tool %q is not authorized by a bound Skill", ErrInvalid, name)
		}
		if s.tools != nil {
			risk, ok := s.tools.Risk(name)
			if !ok || risk != domain.ToolRiskRead {
				return fmt.Errorf("%w: discovery tool %q must be read-only", ErrInvalid, name)
			}
		}
	}
	return nil
}

func workflowAgentIDs(steps []domain.WorkflowStep) []int64 {
	seen := map[int64]bool{}
	result := make([]int64, 0)
	var walk func([]domain.WorkflowStep)
	walk = func(items []domain.WorkflowStep) {
		for _, step := range items {
			if step.Type == "model" && step.AgentID > 0 && !seen[step.AgentID] {
				seen[step.AgentID] = true
				result = append(result, step.AgentID)
			}
			walk(step.Steps)
		}
	}
	walk(steps)
	return result
}

func (s *Service) Versions(ctx context.Context, id int64) ([]*domain.Workflow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT w.id, w.name, w.description, w.enabled, w.cron_expression, w.timezone, w.next_run_at, w.template_key,
		v.version, v.id, v.input_schema, v.steps, v.scope_policy, v.created_by, w.created_at, v.created_at
		FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id
		WHERE w.id=$1 ORDER BY v.version DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.Workflow, 0)
	for rows.Next() {
		item, err := scanWorkflow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) Rollback(ctx context.Context, id int64, version int) error {
	var rawSteps []byte
	if err := s.db.QueryRowContext(ctx, `SELECT steps FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2`, id, version).Scan(&rawSteps); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var steps []domain.WorkflowStep
	if err := json.Unmarshal(rawSteps, &steps); err != nil {
		return fmt.Errorf("%w: invalid historical workflow steps", ErrInvalid)
	}
	if err := s.validateSteps(steps, 0); err != nil {
		return fmt.Errorf("%w: historical version cannot be reactivated", ErrInvalid)
	}
	result, err := s.db.ExecContext(ctx, `UPDATE ai_workflows SET current_version=$2,
		updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL
		AND EXISTS (SELECT 1 FROM ai_workflow_versions WHERE workflow_id=$1 AND version=$2)`, id, version)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) SetEnabled(ctx context.Context, id int64, enabled bool, actor *string) error {
	value, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if enabled {
		if err := s.validateRunnableSteps(ctx, value.Steps, map[string]any{"input": map[string]any{}, "steps": map[string]any{}}); err != nil {
			return err
		}
	}
	value.Enabled = enabled
	result, err := s.db.ExecContext(ctx, `UPDATE ai_workflows SET enabled=$2, next_run_at=$3,
		created_by=COALESCE(created_by,$4), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,
		id, enabled, workflowNext(value), actor)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete soft-deletes a workflow so its version and run audit trail remain
// available to administrators while preventing all future scheduled runs.
func (s *Service) Delete(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `UPDATE ai_workflows
		SET enabled=FALSE, next_run_at=NULL, deleted_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) Queue(ctx context.Context, id int64, dryRun bool, input json.RawMessage, triggeredBy *string) (*domain.WorkflowRun, error) {
	return s.queue(ctx, id, dryRun, input, triggeredBy, true, false)
}

// RetryFailed reruns only failed iterations from a partial for_each run. Query
// step outputs and resource snapshots are copied so a retry cannot drift with
// a changing dynamic collection.
func (s *Service) RetryFailed(ctx context.Context, runID int64, childStepID string, iterations []int, triggeredBy *string) (*domain.WorkflowRun, error) {
	if strings.TrimSpace(childStepID) == "" || len(iterations) == 0 || len(iterations) > maxRunResources {
		return nil, fmt.Errorf("%w: retry requires one child step and 1-100 iterations", ErrInvalid)
	}
	unique := make([]int, 0, len(iterations))
	seen := map[int]bool{}
	for _, iteration := range iterations {
		if iteration < 0 || seen[iteration] {
			continue
		}
		seen[iteration] = true
		unique = append(unique, iteration)
	}
	if len(unique) == 0 {
		return nil, fmt.Errorf("%w: retry iterations are invalid", ErrInvalid)
	}
	var workflowID, versionID int64
	var dryRun bool
	var input json.RawMessage
	var status string
	if err := s.db.QueryRowContext(ctx, `SELECT workflow_id,workflow_version_id,dry_run,input,status FROM ai_workflow_runs WHERE id=$1`, runID).
		Scan(&workflowID, &versionID, &dryRun, &input, &status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if status != "succeeded" {
		return nil, fmt.Errorf("%w: only a completed partial run can be retried", ErrInvalid)
	}
	workflow, err := s.Get(ctx, workflowID)
	if err != nil {
		return nil, err
	}
	parentStepID := findForEachParent(workflow.Steps, childStepID)
	if parentStepID == "" {
		return nil, fmt.Errorf("%w: child step %q is not inside a for_each", ErrInvalid, childStepID)
	}
	failed := 0
	for _, iteration := range unique {
		var exists bool
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ai_workflow_step_runs WHERE workflow_run_id=$1 AND step_id=$2 AND iteration=$3 AND status='failed')`, runID, childStepID, iteration).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			failed++
		}
	}
	if failed != len(unique) {
		return nil, fmt.Errorf("%w: retry can target only failed resource iterations", ErrInvalid)
	}
	rawIterations, _ := json.Marshal(unique)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var retry domain.WorkflowRun
	retry.WorkflowID, retry.WorkflowVersionID, retry.DryRun, retry.Status = workflowID, versionID, dryRun, "queued"
	retry.Input, retry.TriggeredBy, retry.RetryOfRunID, retry.RetryStepID, retry.RetryIterations = input, triggeredBy, &runID, &parentStepID, unique
	if err := tx.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs(workflow_id,workflow_version_id,dry_run,input,triggered_by,retry_of_run_id,retry_step_id,retry_iterations)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at`, workflowID, versionID, dryRun, input, triggeredBy, runID, parentStepID, rawIterations).
		Scan(&retry.ID, &retry.CreatedAt); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_run_resources(workflow_run_id,resource_type,resource_key,source,access_level,label,version_token,snapshot)
		SELECT $2,resource_type,resource_key,source,access_level,label,version_token,snapshot FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND source IN ('manual','query')`, runID, retry.ID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs(workflow_run_id,step_id,step_type,iteration,status,input,output,error_message,started_at,finished_at)
		SELECT $2,step_id,step_type,iteration,status,input,output,error_message,started_at,finished_at FROM ai_workflow_step_runs
		WHERE workflow_run_id=$1 AND step_type='resource_query' AND iteration=-1 AND status='succeeded'`, runID, retry.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &retry, nil
}

func findForEachParent(steps []domain.WorkflowStep, childID string) string {
	for _, step := range steps {
		if step.Type != "for_each" {
			continue
		}
		if containsStepID(step.Steps, childID) {
			return step.ID
		}
		if parent := findForEachParent(step.Steps, childID); parent != "" {
			return parent
		}
	}
	return ""
}

func containsStepID(steps []domain.WorkflowStep, id string) bool {
	for _, step := range steps {
		if step.ID == id {
			return true
		}
	}
	return false
}

func retryIterationSelected(run *domain.WorkflowRun, stepID string, index int) bool {
	if run == nil || run.RetryStepID == nil || *run.RetryStepID != stepID || len(run.RetryIterations) == 0 {
		return true
	}
	for _, allowed := range run.RetryIterations {
		if allowed == index {
			return true
		}
	}
	return false
}

func (s *Service) queue(ctx context.Context, id int64, dryRun bool, input json.RawMessage, triggeredBy *string, retryFailed, scheduled bool) (*domain.WorkflowRun, error) {
	value, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if !value.Enabled && !dryRun {
		return nil, fmt.Errorf("%w: workflow is disabled", ErrInvalid)
	}
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	if len(input) > 64<<10 || !json.Valid(input) {
		return nil, fmt.Errorf("%w: invalid input", ErrInvalid)
	}
	var inputValue any
	if err := json.Unmarshal(input, &inputValue); err != nil {
		return nil, fmt.Errorf("%w: invalid input", ErrInvalid)
	}
	if err := validateWorkflowInput(value.InputSchema, inputValue); err != nil {
		return nil, err
	}
	if err := s.validateRunnableSteps(ctx, value.Steps, map[string]any{"input": inputValue, "steps": map[string]any{}}); err != nil {
		return nil, err
	}
	run := &domain.WorkflowRun{WorkflowID: id, WorkflowVersionID: value.VersionID,
		DryRun: dryRun, Status: "queued", Input: input, TriggeredBy: triggeredBy}
	if scheduled && !dryRun && value.CronExpression != nil {
		key := time.Now().In(workflowLocation(value.Timezone)).Format("2006-01-02")
		run.ScheduleKey = &key
	}
	err = s.db.QueryRowContext(ctx, `INSERT INTO ai_workflow_runs
		(workflow_id, workflow_version_id, dry_run, input, triggered_by, schedule_key)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`, run.WorkflowID, run.WorkflowVersionID,
		run.DryRun, run.Input, run.TriggeredBy, run.ScheduleKey).Scan(&run.ID, &run.CreatedAt)
	if err != nil && run.ScheduleKey != nil {
		existingErr := s.db.QueryRowContext(ctx, `SELECT id,status,created_at FROM ai_workflow_runs
			WHERE workflow_id=$1 AND schedule_key=$2`, id, *run.ScheduleKey).Scan(&run.ID, &run.Status, &run.CreatedAt)
		if existingErr == nil {
			if run.Status == "failed" && retryFailed {
				err = s.db.QueryRowContext(ctx, `UPDATE ai_workflow_runs SET workflow_version_id=$2,
					dry_run=FALSE,status='queued',input=$3,output=NULL,error_code=NULL,error_message=NULL,
					input_tokens=0,output_tokens=0,triggered_by=$4,started_at=NULL,finished_at=NULL
					WHERE id=$1 AND status='failed' RETURNING status,created_at`, run.ID, value.VersionID,
					input, triggeredBy).Scan(&run.Status, &run.CreatedAt)
				if errors.Is(err, sql.ErrNoRows) {
					return s.queue(ctx, id, dryRun, input, triggeredBy, retryFailed, scheduled)
				}
				if err == nil {
					// Resource queries are resolved once per Workflow Run. Keep their
					// target snapshot when retrying the same scheduled run so the
					// replayed Step output and Run Scope remain identical. Discovery
					// is read-only and may be recomputed on the next Agent attempt.
					_, _ = s.db.ExecContext(ctx, `DELETE FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND source <> 'query'`, run.ID)
					err = s.persistManualResources(ctx, run.ID, value.InputSchema, inputValue)
				}
				return run, err
			}
			return run, nil
		}
	}
	if err == nil {
		if resourceErr := s.persistManualResources(ctx, run.ID, value.InputSchema, inputValue); resourceErr != nil {
			_, _ = s.db.ExecContext(ctx, `DELETE FROM ai_workflow_runs WHERE id=$1 AND status='queued'`, run.ID)
			return nil, resourceErr
		}
	}
	return run, err
}

// validateRunnableSteps rejects malformed or paused Agent bindings before a
// workflow run is persisted. This keeps disabled starter templates harmless
// until their linked Agent has been deliberately enabled.
func (s *Service) validateRunnableSteps(ctx context.Context, steps []domain.WorkflowStep, document map[string]any) error {
	for _, step := range steps {
		switch step.Type {
		case "model":
			agent, err := s.agents.GetAgent(ctx, step.AgentID)
			if err != nil {
				return fmt.Errorf("%w: model step %q Agent is unavailable", ErrInvalid, step.ID)
			}
			if !agent.Enabled {
				return fmt.Errorf("%w: linked Agent %q is disabled", ErrInvalid, agent.Name)
			}
		case "for_each":
			if err := s.validateRunnableSteps(ctx, step.Steps, document); err != nil {
				return err
			}
		}
	}
	return nil
}

func workflowLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}
func scheduledNext(expression, timezone string, from time.Time) (time.Time, error) {
	schedule, err := cron.ParseStandard(expression)
	if err != nil {
		return time.Time{}, err
	}
	return schedule.Next(from.In(workflowLocation(timezone))), nil
}
func workflowNext(value *domain.Workflow) *time.Time {
	if !value.Enabled || value.CronExpression == nil {
		return nil
	}
	next, err := scheduledNext(*value.CronExpression, value.Timezone, time.Now())
	if err != nil {
		return nil
	}
	return &next
}

func (s *Service) StartScheduler(ctx context.Context, interval time.Duration) {
	// A process restart invalidates every in-memory worker. Leaving those rows as
	// running/queued would make the idempotency key return a run that can never
	// finish, so preserve the audit and make it explicitly retryable.
	_, _ = s.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='failed',
		error_code='worker_interrupted',
		error_message='Workflow execution was interrupted by a service restart. Retry the run.',
		finished_at=NOW()
		WHERE status IN ('queued','running')`)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		s.tick(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.tick(ctx)
			}
		}
	}()
}

func (s *Service) tick(ctx context.Context) {
	s.processPendingEvents(ctx)
	// Claim due rows before queueing. SKIP LOCKED keeps multiple web instances
	// from returning the same queued run to two in-memory workers.
	rows, err := s.db.QueryContext(ctx, `UPDATE ai_workflows SET next_run_at=NULL
		WHERE id IN (SELECT id FROM ai_workflows WHERE enabled=TRUE AND cron_expression IS NOT NULL
		AND next_run_at<=NOW() AND deleted_at IS NULL ORDER BY next_run_at LIMIT 20 FOR UPDATE SKIP LOCKED)
		RETURNING id`)
	if err != nil {
		return
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	for _, id := range ids {
		value, err := s.Get(ctx, id)
		if err != nil {
			continue
		}
		next := workflowNext(value)
		if next != nil {
			_, _ = s.db.ExecContext(ctx, `UPDATE ai_workflows SET next_run_at=$2,updated_at=NOW() WHERE id=$1`, id, next)
		}
		run, err := s.queue(ctx, id, false, json.RawMessage(`{}`), nil, false, true)
		if err == nil && run.Status == "queued" {
			go s.Execute(ctx, run.ID)
		}
	}
}

func (s *Service) processPendingEvents(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `SELECT event_key,event_type,payload,batch_prepared FROM ai_workflow_events
		WHERE status='accepted' AND available_at<=NOW() ORDER BY id LIMIT 20`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var key, eventType string
		var payload []byte
		var prepared bool
		if rows.Scan(&key, &eventType, &payload, &prepared) == nil {
			if !prepared {
				ready, prepareErr := s.prepareEventBatch(ctx, key, eventType, payload)
				if prepareErr != nil {
					s.markEventFailure(ctx, key, prepareErr)
				}
				if prepareErr != nil || !ready {
					continue
				}
			}
			if _, eventErr := s.processStoredEvent(ctx, key, eventType, payload, nil); eventErr != nil {
				s.markEventFailure(ctx, key, eventErr)
			}
		}
	}
}

func (s *Service) Execute(ctx context.Context, runID int64) {
	if err := s.execute(ctx, runID); err != nil {
		code, message := "workflow_failed", safeError(err)
		result, updateErr := s.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status='failed',
			error_code=$2, error_message=$3, finished_at=NOW() WHERE id=$1 AND status='running'`, runID, code, message)
		if updateErr != nil || result == nil {
			return
		}
		if changed, _ := result.RowsAffected(); changed == 0 {
			return
		}
		var recipient *string
		var name string
		var workflowID int64
		if queryErr := s.db.QueryRowContext(ctx, `SELECT COALESCE(r.triggered_by,w.created_by),w.name,w.id
			FROM ai_workflow_runs r JOIN ai_workflows w ON w.id=r.workflow_id WHERE r.id=$1`, runID).
			Scan(&recipient, &name, &workflowID); queryErr == nil && recipient != nil {
			_ = s.agents.Notify(ctx, *recipient, "ai_workflow_failed", "Workflow 运行失败："+name, message,
				"/admin/agents?tab=records&workflow="+strconv.FormatInt(workflowID, 10), "workflow-run-"+strconv.FormatInt(runID, 10))
		}
	}
}

func (s *Service) execute(ctx context.Context, runID int64) error {
	var run domain.WorkflowRun
	var retryIterations []byte
	run.ID = runID
	err := s.db.QueryRowContext(ctx, `UPDATE ai_workflow_runs SET status='running', started_at=NOW()
		WHERE id=$1 AND status='queued'
		RETURNING workflow_id, workflow_version_id, dry_run, input, triggered_by, retry_of_run_id, retry_step_id, retry_iterations, created_at`,
		runID).Scan(&run.WorkflowID, &run.WorkflowVersionID, &run.DryRun, &run.Input, &run.TriggeredBy, &run.RetryOfRunID, &run.RetryStepID, &retryIterations, &run.CreatedAt)
	if err != nil {
		return err
	}
	if len(retryIterations) > 0 {
		if err := json.Unmarshal(retryIterations, &run.RetryIterations); err != nil {
			return err
		}
	}
	var stepsRaw []byte
	if err := s.db.QueryRowContext(ctx, `SELECT steps FROM ai_workflow_versions WHERE id=$1`,
		run.WorkflowVersionID).Scan(&stepsRaw); err != nil {
		return err
	}
	var steps []domain.WorkflowStep
	if err := json.Unmarshal(stepsRaw, &steps); err != nil {
		return err
	}
	var input any
	if err := json.Unmarshal(run.Input, &input); err != nil {
		return err
	}
	if hasResourceQuery(steps) {
		// Retries replay the query snapshot, so only reset the aggregate for a new run.
		if _, err := s.db.ExecContext(ctx, `UPDATE ai_workflows SET resource_query_last_count=0,resource_query_last_run_at=NOW()
			WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM ai_workflow_run_resources WHERE workflow_run_id=$2 AND source='query')`, run.WorkflowID, run.ID); err != nil {
			return err
		}
	}
	document := map[string]any{"input": input, "steps": map[string]any{}}
	output, awaiting, inputTokens, outputTokens, err := s.executeSteps(ctx, &run, steps, document, nil, nil)
	if err != nil {
		return err
	}
	status := "succeeded"
	if awaiting {
		status = "awaiting_approval"
	}
	rawOutput, _ := json.Marshal(output)
	_, err = s.db.ExecContext(ctx, `UPDATE ai_workflow_runs SET status=$2, output=$3,
		input_tokens=$4, output_tokens=$5, finished_at=NOW() WHERE id=$1`, runID, status,
		rawOutput, inputTokens, outputTokens)
	return err
}

func (s *Service) executeSteps(ctx context.Context, run *domain.WorkflowRun, steps []domain.WorkflowStep, document map[string]any, item any, iteration *int) (any, bool, int64, int64, error) {
	var output any
	var totalInput, totalOutput int64
	awaiting := false
	for _, step := range steps {
		started := time.Now()
		stepInput := any(nil)
		var stepOutput any
		var err error
		switch step.Type {
		case "resource_query":
			if replay, found, replayErr := s.replayedResourceQuery(ctx, run.ID, step.ID); replayErr != nil {
				err = replayErr
				break
			} else if found {
				stepOutput = replay
				if len(replay) == 0 {
					var emptyPolicy string
					if policyErr := s.db.QueryRowContext(ctx, `SELECT resource_query_empty_policy FROM ai_workflows WHERE id=$1`, run.WorkflowID).Scan(&emptyPolicy); policyErr != nil {
						err = policyErr
						break
					}
					if emptyPolicy == "fail" {
						err = fmt.Errorf("%w: resource query returned no matching resources", ErrInvalid)
						break
					}
					document["steps"].(map[string]any)[step.ID] = stepOutput
					return map[string]any{"status": "no_matching_resources", "resource_type": step.ResourceType}, awaiting, totalInput, totalOutput, nil
				}
				break
			}
			filters, filterErr := filtersFromRaw(step.Filter)
			if filterErr != nil {
				err = filterErr
				break
			}
			items, _, queryErr := s.catalog.List(ctx, step.ResourceType, domain.ResourceQuery{Page: 1, PageSize: step.MaxItems, Filters: filters})
			if queryErr != nil {
				err = queryErr
				break
			}
			existing := map[string]bool{}
			rows, countErr := s.db.QueryContext(ctx, `SELECT resource_type,resource_key FROM ai_workflow_run_resources WHERE workflow_run_id=$1 AND access_level='target'`, run.ID)
			if countErr != nil {
				err = countErr
				break
			}
			for rows.Next() {
				var resourceType, resourceKey string
				if scanErr := rows.Scan(&resourceType, &resourceKey); scanErr != nil {
					err = scanErr
					break
				}
				existing[resourceType+"\x00"+resourceKey] = true
			}
			_ = rows.Close()
			if err != nil || rows.Err() != nil {
				if err == nil {
					err = rows.Err()
				}
				break
			}
			newCount := 0
			existingByType := map[string]int{}
			for key := range existing {
				parts := strings.SplitN(key, "\x00", 2)
				if len(parts) == 2 {
					existingByType[parts[0]]++
				}
			}
			newByType := map[string]int{}
			for _, candidate := range items {
				if !existing[candidate.Type+"\x00"+candidate.Key] {
					newCount++
					newByType[candidate.Type]++
				}
			}
			if len(existing)+newCount > maxRunResources {
				err = fmt.Errorf("%w: workflow query exceeds 100 resources", ErrInvalid)
				break
			}
			for resourceType, count := range newByType {
				if existingByType[resourceType]+count > maxRunResourcesPerType {
					err = fmt.Errorf("%w: workflow query exceeds %d %s resources", ErrInvalid, maxRunResourcesPerType, resourceType)
					break
				}
			}
			if err != nil {
				break
			}
			for index := range items {
				if persistErr := s.persistResource(ctx, run.ID, &items[index], "query", "target"); persistErr != nil {
					err = persistErr
					break
				}
			}
			if err != nil {
				break
			}
			if _, updateErr := s.db.ExecContext(ctx, `UPDATE ai_workflows SET resource_query_last_count=(SELECT COUNT(*) FROM ai_workflow_run_resources
				WHERE workflow_run_id=$2 AND source='query' AND access_level='target'),resource_query_last_run_at=NOW() WHERE id=$1`, run.WorkflowID, run.ID); updateErr != nil {
				err = updateErr
				break
			}
			stepOutput = queryOutput(items)
			if len(items) == 0 {
				var emptyPolicy string
				if policyErr := s.db.QueryRowContext(ctx, `SELECT resource_query_empty_policy FROM ai_workflows WHERE id=$1`, run.WorkflowID).Scan(&emptyPolicy); policyErr != nil {
					err = policyErr
					break
				}
				if emptyPolicy == "fail" {
					err = fmt.Errorf("%w: resource query returned no matching resources", ErrInvalid)
					break
				}
				s.recordStep(ctx, run.ID, step, iteration, nil, stepOutput, started, nil)
				document["steps"].(map[string]any)[step.ID] = stepOutput
				return map[string]any{"status": "no_matching_resources", "resource_type": step.ResourceType}, awaiting, totalInput, totalOutput, nil
			}
		case "model":
			stepInput = inputForStep(document, item, step.InputPointer, step.IncludeContext)
			if err == nil {
				agent, getErr := s.agents.GetAgent(ctx, step.AgentID)
				if getErr != nil {
					err = getErr
				} else if agent.SkillVersionID == nil {
					err = fmt.Errorf("%w: workflow Agents must lock a Skill version", ErrInvalid)
				}
			}
			if err == nil {
				raw, _ := json.Marshal(stepInput)
				agentRun, queueErr := s.runner.QueueWorkflow(ctx, step.AgentID, run.TriggeredBy, raw, run.WorkflowVersionID, run.ID)
				if queueErr != nil {
					err = queueErr
				} else {
					if run.DryRun {
						s.runner.ExecutePreview(ctx, agentRun.ID)
					} else {
						s.runner.Execute(ctx, agentRun.ID)
					}
					agentRun, err = s.runner.GetRun(ctx, agentRun.ID)
					if err == nil {
						stepOutput = agentRun
						totalInput += agentRun.InputTokens
						totalOutput += agentRun.OutputTokens
						if agentRun.Status == domain.AgentRunFailed || agentRun.Status == domain.AgentRunCancelled {
							err = fmt.Errorf("%w: Agent run %d %s", ErrInvalid, agentRun.ID, agentRun.Status)
						} else {
							awaiting = awaiting || agentRun.Status == domain.AgentRunAwaitingApproval
						}
					}
				}
			}
		case "for_each":
			var collection any
			collection, err = resolvePointer(document, step.CollectionPointer)
			if err == nil {
				items, ok := collection.([]any)
				if !ok {
					err = fmt.Errorf("%w: for_each collection is not an array", ErrInvalid)
				} else {
					count := min(len(items), step.MaxItems)
					selected := make([]int, 0, count)
					for index := 0; index < count; index++ {
						if retryIterationSelected(run, step.ID, index) {
							selected = append(selected, index)
						}
					}
					results := make([]any, 0, len(selected))
					succeeded, failed := 0, 0
					type iterationResult struct {
						index     int
						output    any
						awaiting  bool
						inTokens  int64
						outTokens int64
						err       error
					}
					resultsByIndex := make(map[int]iterationResult, len(selected))
					resultCh := make(chan iterationResult, len(selected))
					concurrency := step.MaxConcurrency
					if concurrency < 1 {
						concurrency = 1
					}
					jobs := make(chan int)
					var workers sync.WaitGroup
					for worker := 0; worker < concurrency && worker < len(selected); worker++ {
						workers.Add(1)
						go func() {
							defer workers.Done()
							for index := range jobs {
								childDocument := cloneDocument(document)
								childDocument["item"] = items[index]
								childIteration := index
								childOutput, childAwaiting, inTokens, outTokens, childErr := s.executeSteps(ctx, run, step.Steps, childDocument, items[index], &childIteration)
								resultCh <- iterationResult{index: index, output: childOutput, awaiting: childAwaiting, inTokens: inTokens, outTokens: outTokens, err: childErr}
							}
						}()
					}
					for _, index := range selected {
						jobs <- index
					}
					close(jobs)
					workers.Wait()
					close(resultCh)
					for result := range resultCh {
						resultsByIndex[result.index] = result
					}
					for _, index := range selected {
						result := resultsByIndex[index]
						childOutput, childAwaiting, inTokens, outTokens, childErr := result.output, result.awaiting, result.inTokens, result.outTokens, result.err
						totalInput += inTokens
						totalOutput += outTokens
						awaiting = awaiting || childAwaiting
						if childErr != nil {
							if !step.ContinueOnError {
								err = childErr
								break
							}
							failed++
							results = append(results, map[string]any{"index": index, "status": "failed", "item": items[index], "error": safeError(childErr)})
							continue
						}
						succeeded++
						if step.ContinueOnError {
							results = append(results, map[string]any{"index": index, "status": "succeeded", "item": items[index], "output": childOutput})
						} else {
							results = append(results, childOutput)
						}
					}
					if step.ContinueOnError {
						status := "succeeded"
						if failed > 0 {
							status = "partial_failure"
						}
						stepOutput = map[string]any{"status": status, "total": len(selected), "succeeded": succeeded, "failed": failed, "items": results}
						if failed > 0 && succeeded == 0 {
							err = fmt.Errorf("%w: all %d for_each items failed", ErrInvalid, failed)
						}
					} else {
						stepOutput = results
					}
				}
			}
		case "approval_gate":
			stepOutput = map[string]any{"awaiting_approval": awaiting}
		case "output":
			stepOutput, err = resolvePointer(document, step.OutputPointer)
			output = stepOutput
		}
		s.recordStep(ctx, run.ID, step, iteration, stepInput, stepOutput, started, err)
		if err != nil {
			return nil, awaiting, totalInput, totalOutput, err
		}
		document["steps"].(map[string]any)[step.ID] = stepOutput
		if step.Type != "output" {
			output = stepOutput
		}
	}
	return output, awaiting, totalInput, totalOutput, nil
}

func inputForStep(document map[string]any, item any, pointer string, includeContext bool) any {
	if pointer == "" {
		if item != nil {
			if includeContext {
				return map[string]any{"item": item, "input": document["input"]}
			}
			return item
		}
		return document["input"]
	}
	value, err := resolvePointer(document, pointer)
	if err != nil {
		return map[string]any{"pointer_error": true}
	}
	return value
}

func (s *Service) replayedResourceQuery(ctx context.Context, runID int64, stepID string) ([]map[string]any, bool, error) {
	var raw json.RawMessage
	err := s.db.QueryRowContext(ctx, `SELECT output FROM ai_workflow_step_runs
		WHERE workflow_run_id=$1 AND step_id=$2 AND iteration=-1 AND status='succeeded'
		ORDER BY id DESC LIMIT 1`, runID, stepID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var output []map[string]any
	if err := json.Unmarshal(raw, &output); err != nil {
		return nil, false, err
	}
	return output, true, nil
}

func cloneDocument(document map[string]any) map[string]any {
	clone := map[string]any{"input": document["input"], "steps": map[string]any{}}
	for key, value := range document["steps"].(map[string]any) {
		clone["steps"].(map[string]any)[key] = value
	}
	return clone
}

func resolvePointer(document any, pointer string) (any, error) {
	if pointer == "" {
		return document, nil
	}
	current := document
	for _, part := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		switch typed := current.(type) {
		case map[string]any:
			value, ok := typed[part]
			if !ok {
				return nil, fmt.Errorf("%w: unresolved pointer", ErrInvalid)
			}
			current = value
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(typed) {
				return nil, fmt.Errorf("%w: invalid array pointer", ErrInvalid)
			}
			current = typed[index]
		default:
			return nil, fmt.Errorf("%w: pointer crosses scalar", ErrInvalid)
		}
	}
	return current, nil
}

func (s *Service) recordStep(ctx context.Context, runID int64, step domain.WorkflowStep, iteration *int, input, output any, started time.Time, stepErr error) {
	rawInput, _ := json.Marshal(input)
	rawOutput, _ := json.Marshal(output)
	status, errorMessage := "succeeded", any(nil)
	if stepErr != nil {
		status, errorMessage = "failed", safeError(stepErr)
	}
	iterationValue := -1
	if iteration != nil {
		iterationValue = *iteration
	}
	_, _ = s.db.ExecContext(ctx, `INSERT INTO ai_workflow_step_runs
		(workflow_run_id, step_id, step_type, status, input, output, error_message, started_at, iteration, finished_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
		ON CONFLICT (workflow_run_id, step_id, iteration) DO NOTHING`,
		runID, step.ID, step.Type, status, rawInput, rawOutput, errorMessage, started, iterationValue)
}

func safeError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if len(message) > 1000 {
		message = message[:1000]
	}
	return message
}

func (s *Service) ListRuns(ctx context.Context, workflowID int64) ([]*domain.WorkflowRun, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, workflow_id, workflow_version_id, dry_run,
		status, input, output, error_code, error_message, input_tokens, output_tokens, triggered_by,
		schedule_key, retry_of_run_id, retry_step_id, retry_iterations, started_at, finished_at, created_at FROM ai_workflow_runs
		WHERE ($1=0 OR workflow_id=$1) ORDER BY COALESCE(started_at,created_at) DESC, id DESC LIMIT 100`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowRun, 0)
	for rows.Next() {
		var item domain.WorkflowRun
		var output, retryIterations []byte
		if err := rows.Scan(&item.ID, &item.WorkflowID, &item.WorkflowVersionID, &item.DryRun,
			&item.Status, &item.Input, &output, &item.ErrorCode, &item.ErrorMessage,
			&item.InputTokens, &item.OutputTokens, &item.TriggeredBy, &item.ScheduleKey, &item.RetryOfRunID, &item.RetryStepID, &retryIterations, &item.StartedAt,
			&item.FinishedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		if len(output) > 0 {
			item.Output = json.RawMessage(output)
		}
		if len(retryIterations) > 0 {
			_ = json.Unmarshal(retryIterations, &item.RetryIterations)
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (s *Service) RunSteps(ctx context.Context, runID int64) ([]*domain.WorkflowStepRun, error) {
	var exists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM ai_workflow_runs WHERE id=$1)`, runID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,workflow_run_id,step_id,step_type,NULLIF(iteration,-1),
		status,input,output,error_message,started_at,finished_at FROM ai_workflow_step_runs
		WHERE workflow_run_id=$1 ORDER BY started_at,id`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*domain.WorkflowStepRun, 0)
	for rows.Next() {
		var item domain.WorkflowStepRun
		var input, output []byte
		if err := rows.Scan(&item.ID, &item.WorkflowRunID, &item.StepID, &item.StepType,
			&item.Iteration, &item.Status, &input, &output, &item.ErrorMessage,
			&item.StartedAt, &item.FinishedAt); err != nil {
			return nil, err
		}
		if len(input) > 0 {
			item.Input = json.RawMessage(input)
		}
		if len(output) > 0 {
			item.Output = json.RawMessage(output)
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

func (s *Service) Metrics(ctx context.Context) (map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT w.id, w.name, COUNT(r.id),
		COUNT(r.id) FILTER (WHERE r.status='failed'),
		COALESCE(SUM(r.input_tokens+r.output_tokens),0)
		FROM ai_workflows w LEFT JOIN ai_workflow_runs r ON r.workflow_id=w.id
		WHERE w.deleted_at IS NULL GROUP BY w.id, w.name ORDER BY w.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, runs, failures, tokens int64
		var name string
		if err := rows.Scan(&id, &name, &runs, &failures, &tokens); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"workflow_id": id, "name": name, "runs": runs,
			"failures": failures, "tokens": tokens})
	}
	return map[string]any{"workflows": items}, rows.Err()
}
