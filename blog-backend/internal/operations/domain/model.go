package domain

import (
	"encoding/json"
	"time"
)

type OperationalSuggestion struct {
	ID            int64           `json:"id"`
	SourceType    string          `json:"source_type"`
	SourceKey     string          `json:"source_key"`
	SourceRunID   *int64          `json:"source_run_id,omitempty"`
	WorkflowRunID *int64          `json:"workflow_run_id,omitempty"`
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Priority      string          `json:"priority"`
	Evidence      json.RawMessage `json:"evidence"`
	WindowStart   *time.Time      `json:"window_start,omitempty"`
	WindowEnd     *time.Time      `json:"window_end,omitempty"`
	Status        string          `json:"status"`
	IgnoredReason *string         `json:"ignored_reason,omitempty"`
	DedupeKey     string          `json:"-"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type EditorialTask struct {
	ID                 int64     `json:"id"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Priority           string    `json:"priority"`
	Status             string    `json:"status"`
	SourceApprovalID   *int64    `json:"source_approval_id,omitempty"`
	SourceSuggestionID *int64    `json:"source_suggestion_id,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}

type ContentCandidate struct {
	ID        int64     `json:"id"`
	Value     string    `json:"value"`
	Rationale string    `json:"rationale"`
	CreatedAt time.Time `json:"created_at"`
}

type ContentCandidateSet struct {
	ID                  int64              `json:"id"`
	PostID              int64              `json:"post_id"`
	SourceRunID         int64              `json:"source_run_id"`
	SourceApprovalID    int64              `json:"source_approval_id"`
	FieldType           string             `json:"field_type"`
	BeforeValue         string             `json:"before_value"`
	Status              string             `json:"status"`
	SelectedCandidateID *int64             `json:"selected_candidate_id,omitempty"`
	Candidates          []ContentCandidate `json:"candidates"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}

type AIFeedback struct {
	ID                   int64     `json:"id"`
	TargetType           string    `json:"target_type"`
	TargetID             int64     `json:"target_id"`
	Label                string    `json:"label"`
	Note                 string    `json:"note"`
	CreatedByPrincipalID int64     `json:"created_by_principal_id"`
	CreatedAt            time.Time `json:"created_at"`
}
