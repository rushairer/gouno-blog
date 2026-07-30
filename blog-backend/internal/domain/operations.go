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
