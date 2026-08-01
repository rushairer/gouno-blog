package domain

import (
	"encoding/json"
	"time"
)

type WorkflowStep struct {
	ID                string         `json:"id"`
	Type              string         `json:"type"`
	Name              string         `json:"name,omitempty"`
	AgentID           int64          `json:"agent_id,omitempty"`
	AgentIDPointer    string         `json:"agent_id_pointer,omitempty"`
	InputPointer      string         `json:"input_pointer,omitempty"`
	CollectionPointer string         `json:"collection_pointer,omitempty"`
	MaxItems          int            `json:"max_items,omitempty"`
	Steps             []WorkflowStep `json:"steps,omitempty"`
	OutputPointer     string         `json:"output_pointer,omitempty"`
}

type Workflow struct {
	ID             int64           `json:"id"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Enabled        bool            `json:"enabled"`
	CronExpression *string         `json:"cron_expression,omitempty"`
	Timezone       string          `json:"timezone"`
	NextRunAt      *time.Time      `json:"next_run_at,omitempty"`
	TemplateKey    *string         `json:"template_key,omitempty"`
	CurrentVersion int             `json:"current_version"`
	VersionID      int64           `json:"version_id"`
	InputSchema    json.RawMessage `json:"input_schema"`
	Steps          []WorkflowStep  `json:"steps"`
	CreatedBy      *string         `json:"created_by,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
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
