package agent

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/domain"
)

type RunnerRunStore interface {
	CreateRun(context.Context, *domain.AgentRun) error
	StartRun(context.Context, int64) error
	SaveRunCitations(context.Context, int64, []domain.AgentCitation) error
	GetRun(context.Context, int64) (*domain.AgentRun, error)
	ListRuns(context.Context, int64, int, int) ([]*domain.AgentRun, int, error)
	DailyRunCount(context.Context, int64) (int, error)
	MonthlyTokenUsage(context.Context, int64) (int64, error)
	CreateToolCall(context.Context, *domain.AgentToolCall) error
	FinishToolCall(context.Context, int64, domain.ToolCallStatus, json.RawMessage, *string) error
	ListToolCalls(context.Context, int64) ([]*domain.AgentToolCall, error)
	RecordUsage(context.Context, *domain.UsageEvent) error
}

type RunnerApprovalStore interface {
	CreateApproval(context.Context, *domain.AgentApproval) error
}

type RunnerWorkflowScopeStore interface {
	WorkflowScopePolicy(context.Context, int64) (domain.WorkflowScopePolicy, error)
	WorkflowResourceAccess(context.Context, int64, string, string) (string, bool, error)
	AddDiscoveredWorkflowResource(context.Context, int64, string, string, string, json.RawMessage) error
}

type RunnerMediaCandidateStore interface {
	CreateMediaCandidateFromRun(context.Context, int64, int64, string, string, string, string) (int64, *int64, error)
}

type RunnerNotificationWriter interface {
	Create(context.Context, int64, string, string, string, string, string) error
}

type RunnerRunLifecycle interface {
	FinishRun(context.Context, int64, domain.AgentRunStatus, string, int64, int64, *string, *string) error
	DeleteRun(context.Context, int64) error
}

type RunLifecycleRunStore interface {
	FinishRun(context.Context, int64, domain.AgentRunStatus, string, int64, int64, *string, *string) error
	LockRunStatus(context.Context, *sql.Tx, int64) (domain.AgentRunStatus, error)
	DeleteRunTx(context.Context, *sql.Tx, int64) error
}

type RunLifecycleMediaStore interface {
	SyncRunTokenUsage(context.Context, int64, int64, int64) error
	DeleteBySourceRunTx(context.Context, *sql.Tx, int64) error
}

type RunnerDependencies struct {
	Runs            RunnerRunStore
	Approvals       RunnerApprovalStore
	WorkflowScopes  RunnerWorkflowScopeStore
	MediaCandidates RunnerMediaCandidateStore
	Notifications   RunnerNotificationWriter
	Lifecycle       RunnerRunLifecycle
}
