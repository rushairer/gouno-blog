package domain

import (
	"encoding/json"
	"time"
)

type WorkflowStep struct {
	ID                string          `json:"id"`
	Type              string          `json:"type"`
	Name              string          `json:"name,omitempty"`
	AgentID           int64           `json:"agent_id,omitempty"`
	InputPointer      string          `json:"input_pointer,omitempty"`
	IncludeContext    bool            `json:"include_context,omitempty"`
	CollectionPointer string          `json:"collection_pointer,omitempty"`
	MaxItems          int             `json:"max_items,omitempty"`
	MaxConcurrency    int             `json:"max_concurrency,omitempty"`
	ContinueOnError   bool            `json:"continue_on_error,omitempty"`
	Steps             []WorkflowStep  `json:"steps,omitempty"`
	OutputPointer     string          `json:"output_pointer,omitempty"`
	ResourceType      string          `json:"resource_type,omitempty"`
	Filter            json.RawMessage `json:"filter,omitempty"`
}

type WorkflowScopePolicy struct {
	Mode           string   `json:"mode"`
	DiscoveryTools []string `json:"discovery_tools"`
}

type WorkflowEventTrigger struct {
	Event              string                 `json:"event"`
	Filter             map[string]interface{} `json:"filter,omitempty"`
	DedupeField        string                 `json:"dedupe_field,omitempty"`
	CooldownSeconds    int                    `json:"cooldown_seconds,omitempty"`
	BatchWindowSeconds int                    `json:"batch_window_seconds,omitempty"`
}

type Workflow struct {
	ID                       int64                  `json:"id"`
	Name                     string                 `json:"name"`
	Description              string                 `json:"description"`
	Enabled                  bool                   `json:"enabled"`
	CronExpression           *string                `json:"cron_expression,omitempty"`
	EventTriggers            []WorkflowEventTrigger `json:"event_triggers,omitempty"`
	Timezone                 string                 `json:"timezone"`
	NextRunAt                *time.Time             `json:"next_run_at,omitempty"`
	TemplateKey              *string                `json:"template_key,omitempty"`
	CurrentVersion           int                    `json:"current_version"`
	VersionID                int64                  `json:"version_id"`
	InputSchema              json.RawMessage        `json:"input_schema"`
	Steps                    []WorkflowStep         `json:"steps"`
	ScopePolicy              WorkflowScopePolicy    `json:"scope_policy"`
	ResourceQueryPreview     json.RawMessage        `json:"resource_query_preview,omitempty"`
	ResourceQueryPreviewAt   *time.Time             `json:"resource_query_preview_at,omitempty"`
	ResourceQueryLastCount   *int                   `json:"resource_query_last_count,omitempty"`
	ResourceQueryLastRunAt   *time.Time             `json:"resource_query_last_run_at,omitempty"`
	ResourceQueryEmptyPolicy string                 `json:"resource_query_empty_policy"`
	CreatedBy                *string                `json:"created_by,omitempty"`
	CreatedAt                time.Time              `json:"created_at"`
	UpdatedAt                time.Time              `json:"updated_at"`
}

type WorkflowResource struct {
	ID            int64           `json:"id"`
	WorkflowRunID int64           `json:"workflow_run_id"`
	ResourceType  string          `json:"type"`
	ResourceKey   string          `json:"key"`
	Source        string          `json:"source"`
	AccessLevel   string          `json:"access_level"`
	Label         string          `json:"label"`
	VersionToken  string          `json:"version_token"`
	Snapshot      json.RawMessage `json:"snapshot"`
	CreatedAt     time.Time       `json:"created_at"`
}

type ResourceOption struct {
	Type         string         `json:"type"`
	Key          string         `json:"key"`
	Label        string         `json:"label"`
	Description  string         `json:"description,omitempty"`
	Status       string         `json:"status,omitempty"`
	VersionToken string         `json:"version_token"`
	Metadata     map[string]any `json:"metadata"`
}

type ResourceQuery struct {
	Query    string
	Page     int
	PageSize int
	Filters  map[string]string
	Keys     []string
}

type WorkflowRun struct {
	ID                int64           `json:"id"`
	WorkflowID        int64           `json:"workflow_id"`
	WorkflowVersionID int64           `json:"workflow_version_id"`
	DryRun            bool            `json:"dry_run"`
	Status            string          `json:"status"`
	Input             json.RawMessage `json:"input"`
	Output            json.RawMessage `json:"output,omitempty"`
	ErrorCode         *string         `json:"error_code,omitempty"`
	ErrorMessage      *string         `json:"error_message,omitempty"`
	InputTokens       int64           `json:"input_tokens"`
	OutputTokens      int64           `json:"output_tokens"`
	TriggeredBy       *string         `json:"triggered_by,omitempty"`
	ScheduleKey       *string         `json:"schedule_key,omitempty"`
	RetryOfRunID      *int64          `json:"retry_of_run_id,omitempty"`
	RetryStepID       *string         `json:"retry_step_id,omitempty"`
	RetryIterations   []int           `json:"retry_iterations,omitempty"`
	StartedAt         *time.Time      `json:"started_at,omitempty"`
	FinishedAt        *time.Time      `json:"finished_at,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}

type WorkflowStepRun struct {
	ID            int64           `json:"id"`
	WorkflowRunID int64           `json:"workflow_run_id"`
	StepID        string          `json:"step_id"`
	StepType      string          `json:"step_type"`
	Iteration     *int            `json:"iteration,omitempty"`
	Status        string          `json:"status"`
	Input         json.RawMessage `json:"input,omitempty"`
	Output        json.RawMessage `json:"output,omitempty"`
	ErrorMessage  *string         `json:"error_message,omitempty"`
	StartedAt     time.Time       `json:"started_at"`
	FinishedAt    *time.Time      `json:"finished_at,omitempty"`
}
