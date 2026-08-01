package domain

import (
	"encoding/json"
	"time"
)

type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
)

type ProviderProfile struct {
	ID                    int64        `json:"id"`
	Name                  string       `json:"name"`
	ProviderType          ProviderType `json:"provider_type"`
	BaseURL               string       `json:"base_url"`
	Model                 string       `json:"model"`
	APIKeyCiphertext      []byte       `json:"-"`
	APIKeyNonce           []byte       `json:"-"`
	APIKeyLast4           string       `json:"api_key_last4,omitempty"`
	KeyVersion            int          `json:"-"`
	HasAPIKey             bool         `json:"has_api_key"`
	Enabled               bool         `json:"enabled"`
	RequestTimeoutSeconds int          `json:"request_timeout_seconds"`
	MaxOutputTokens       int          `json:"max_output_tokens"`
	CreatedAt             time.Time    `json:"created_at"`
	UpdatedAt             time.Time    `json:"updated_at"`
}

type EmbeddingProfile struct {
	ID                    int64     `json:"id"`
	Name                  string    `json:"name"`
	BaseURL               string    `json:"base_url"`
	Model                 string    `json:"model"`
	Dimensions            int       `json:"dimensions"`
	APIKeyCiphertext      []byte    `json:"-"`
	APIKeyNonce           []byte    `json:"-"`
	APIKeyLast4           string    `json:"api_key_last4,omitempty"`
	KeyVersion            int       `json:"-"`
	HasAPIKey             bool      `json:"has_api_key"`
	Enabled               bool      `json:"enabled"`
	RequestTimeoutSeconds int       `json:"request_timeout_seconds"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type AgentCitation struct {
	CitationID    string  `json:"citation_id"`
	PostID        int64   `json:"post_id,omitempty"`
	Title         string  `json:"title,omitempty"`
	Slug          string  `json:"slug,omitempty"`
	ChunkID       int64   `json:"chunk_id,omitempty"`
	StartOffset   int     `json:"start_offset,omitempty"`
	EndOffset     int     `json:"end_offset,omitempty"`
	Snippet       string  `json:"snippet,omitempty"`
	LexicalScore  float64 `json:"lexical_score,omitempty"`
	SemanticScore float64 `json:"semantic_score,omitempty"`
	Score         float64 `json:"score,omitempty"`
	Status        string  `json:"status"`
}

type AgentTriggerType string

const (
	AgentTriggerManual AgentTriggerType = "manual"
	AgentTriggerCron   AgentTriggerType = "cron"
)

type AgentExecutionMode string

const (
	AgentModeAdvisory AgentExecutionMode = "advisory"
	AgentModeApproval AgentExecutionMode = "approval"
)

type Agent struct {
	ID                 int64              `json:"id"`
	Name               string             `json:"name"`
	Description        string             `json:"description"`
	SystemPrompt       string             `json:"system_prompt"`
	ProviderProfileID  int64              `json:"provider_profile_id"`
	SkillVersionID     *int64             `json:"skill_version_id,omitempty"`
	ProviderProfile    *ProviderProfile   `json:"provider_profile,omitempty"`
	Enabled            bool               `json:"enabled"`
	TriggerType        AgentTriggerType   `json:"trigger_type"`
	CronExpression     *string            `json:"cron_expression,omitempty"`
	Timezone           string             `json:"timezone"`
	Capabilities       []string           `json:"capabilities"`
	ExecutionMode      AgentExecutionMode `json:"execution_mode"`
	MaxSteps           int                `json:"max_steps"`
	MaxInputTokens     int                `json:"max_input_tokens"`
	MaxOutputTokens    int                `json:"max_output_tokens"`
	DailyRunLimit      int                `json:"daily_run_limit"`
	MonthlyTokenBudget int64              `json:"monthly_token_budget"`
	LastRunAt          *time.Time         `json:"last_run_at,omitempty"`
	NextRunAt          *time.Time         `json:"next_run_at,omitempty"`
	CreatedBy          *string            `json:"created_by,omitempty"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

// AgentSkill is a versioned, non-executable template for safe Agent
// configuration. It deliberately contains no provider credential or arbitrary
// code: an Agent chooses its Provider and remains subject to normal approval.
type AgentSkill struct {
	ID                 int64              `json:"id"`
	Name               string             `json:"name"`
	Description        string             `json:"description"`
	SystemPrompt       string             `json:"system_prompt"`
	Capabilities       []string           `json:"capabilities"`
	ExecutionMode      AgentExecutionMode `json:"execution_mode"`
	MaxSteps           int                `json:"max_steps"`
	MaxInputTokens     int                `json:"max_input_tokens"`
	MaxOutputTokens    int                `json:"max_output_tokens"`
	DailyRunLimit      int                `json:"daily_run_limit"`
	MonthlyTokenBudget int64              `json:"monthly_token_budget"`
	Version            int                `json:"version"`
	VersionID          int64              `json:"version_id"`
	InputSchema        json.RawMessage    `json:"input_schema"`
	AllowedTriggers    []AgentTriggerType `json:"allowed_triggers"`
	CreatedBy          *string            `json:"created_by,omitempty"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type AgentRunStatus string

const (
	AgentRunQueued           AgentRunStatus = "queued"
	AgentRunRunning          AgentRunStatus = "running"
	AgentRunAwaitingApproval AgentRunStatus = "awaiting_approval"
	AgentRunSucceeded        AgentRunStatus = "succeeded"
	AgentRunFailed           AgentRunStatus = "failed"
	AgentRunCancelled        AgentRunStatus = "cancelled"
)

type AgentRun struct {
	ID                int64            `json:"id"`
	AgentID           int64            `json:"agent_id"`
	AgentName         string           `json:"agent_name,omitempty"`
	TriggerType       AgentTriggerType `json:"trigger_type"`
	TriggeredBy       *string          `json:"triggered_by,omitempty"`
	ScheduleKey       *string          `json:"-"`
	Status            AgentRunStatus   `json:"status"`
	Input             json.RawMessage  `json:"input"`
	OutputSummary     string           `json:"output_summary"`
	Provider          ProviderType     `json:"provider"`
	Model             string           `json:"model"`
	InputTokens       int64            `json:"input_tokens"`
	OutputTokens      int64            `json:"output_tokens"`
	ErrorCode         *string          `json:"error_code,omitempty"`
	ErrorMessage      *string          `json:"error_message,omitempty"`
	StartedAt         *time.Time       `json:"started_at,omitempty"`
	FinishedAt        *time.Time       `json:"finished_at,omitempty"`
	CreatedAt         time.Time        `json:"created_at"`
	Citations         []AgentCitation  `json:"citations"`
	SkillVersionID    *int64           `json:"skill_version_id,omitempty"`
	WorkflowVersionID *int64           `json:"workflow_version_id,omitempty"`
}

type ToolRiskLevel string

const (
	ToolRiskRead    ToolRiskLevel = "read"
	ToolRiskPropose ToolRiskLevel = "propose"
	ToolRiskWrite   ToolRiskLevel = "write"
)

type ToolCallStatus string

const (
	ToolCallRequested ToolCallStatus = "requested"
	ToolCallExecuted  ToolCallStatus = "executed"
	ToolCallRejected  ToolCallStatus = "rejected"
	ToolCallFailed    ToolCallStatus = "failed"
)

type AgentToolCall struct {
	ID             int64           `json:"id"`
	RunID          int64           `json:"run_id"`
	ProviderCallID *string         `json:"provider_call_id,omitempty"`
	ToolName       string          `json:"tool_name"`
	RiskLevel      ToolRiskLevel   `json:"risk_level"`
	Arguments      json.RawMessage `json:"arguments"`
	Result         json.RawMessage `json:"result,omitempty"`
	Status         ToolCallStatus  `json:"status"`
	ErrorMessage   *string         `json:"error_message,omitempty"`
	StartedAt      *time.Time      `json:"started_at,omitempty"`
	FinishedAt     *time.Time      `json:"finished_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

type ApprovalStatus string

const (
	ApprovalPending  ApprovalStatus = "pending"
	ApprovalApproved ApprovalStatus = "approved"
	ApprovalRejected ApprovalStatus = "rejected"
	ApprovalExpired  ApprovalStatus = "expired"
	ApprovalExecuted ApprovalStatus = "executed"
	ApprovalFailed   ApprovalStatus = "failed"
)

type AgentApproval struct {
	ID              int64           `json:"id"`
	RunID           int64           `json:"run_id"`
	ToolCallID      int64           `json:"tool_call_id"`
	AgentName       string          `json:"agent_name,omitempty"`
	ActionType      string          `json:"action_type"`
	TargetType      string          `json:"target_type"`
	TargetID        *int64          `json:"target_id,omitempty"`
	ProposedPayload json.RawMessage `json:"proposed_payload"`
	BeforeSnapshot  json.RawMessage `json:"before_snapshot,omitempty"`
	Status          ApprovalStatus  `json:"status"`
	ReviewedBy      *string         `json:"reviewed_by,omitempty"`
	ReviewNote      *string         `json:"review_note,omitempty"`
	ReviewedAt      *time.Time      `json:"reviewed_at,omitempty"`
	ExpiresAt       time.Time       `json:"expires_at"`
	CreatedAt       time.Time       `json:"created_at"`
}

// MediaCandidate is a governed hand-off from an approved image brief to a
// future media generator. It deliberately has no delivery URL or credential:
// generation and publication remain separate reviewed operations.
type MediaCandidate struct {
	ID               int64        `json:"id"`
	PostID           int64        `json:"post_id"`
	SourceRunID      int64        `json:"source_run_id"`
	SourceApprovalID int64        `json:"source_approval_id"`
	Headline         string       `json:"headline"`
	Brief            string       `json:"brief"`
	Platform         string       `json:"platform,omitempty"`
	Provider         ProviderType `json:"provider"`
	Model            string       `json:"model"`
	InputTokens      int64        `json:"input_tokens"`
	OutputTokens     int64        `json:"output_tokens"`
	GenerationStatus string       `json:"generation_status"`
	SafetyStatus     string       `json:"safety_status"`
	CopyrightStatus  string       `json:"copyright_status"`
	AltText          string       `json:"alt_text"`
	ReviewedBy       *string      `json:"reviewed_by,omitempty"`
	ReviewNote       string       `json:"review_note,omitempty"`
	ReviewedAt       *time.Time   `json:"reviewed_at,omitempty"`
	CreatedAt        time.Time    `json:"created_at"`
}

type UsageEvent struct {
	ID           int64        `json:"id"`
	RunID        int64        `json:"run_id"`
	RequestID    string       `json:"request_id"`
	Provider     ProviderType `json:"provider"`
	Model        string       `json:"model"`
	InputTokens  int64        `json:"input_tokens"`
	OutputTokens int64        `json:"output_tokens"`
	CompletedAt  time.Time    `json:"completed_at"`
}
