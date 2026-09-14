package agent

import (
	"context"
	"encoding/json"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	opsdomain "github.com/rushairer/blog-backend/internal/operations/domain"
	workflowdomain "github.com/rushairer/blog-backend/internal/workflow/domain"
)

type ApprovalStore interface {
	ListApprovals(context.Context, string, int, int) ([]*domain.AgentApproval, int, error)
	GetApproval(context.Context, int64) (*domain.AgentApproval, error)
	ClaimApproval(context.Context, int64, int64, string) error
	CompleteApproval(context.Context, int64, domain.ApprovalStatus, string) error
	SetApprovalTarget(context.Context, int64, int64) error
	RejectApproval(context.Context, int64, int64, string) error
	ReconcileApprovalRun(context.Context, int64) (*domain.AgentRun, error)
}

type MediaCandidateStore interface {
	CreateMediaCandidate(context.Context, *domain.AgentApproval) error
	ListMediaCandidates(context.Context) ([]*domain.MediaCandidate, error)
	ListMediaCandidatesByWorkflowRun(context.Context, int64) ([]*domain.MediaCandidate, error)
	GetMediaCandidate(context.Context, int64) (*domain.MediaCandidate, error)
	SelectMediaCandidate(context.Context, int64, string, string) error
	SelectMediaCandidates(context.Context, []domain.MediaCandidateSelection) error
	MarkMediaCandidateApplied(context.Context, int64, int64) error
	SyncPostVersionToken(context.Context, int64, string) error
	AttachMediaAsset(context.Context, int64, int64) error
	ReviewMediaCandidate(context.Context, int64, string, int64, string) error
	RejectMediaCandidate(context.Context, int64, string) error
	RejectMediaCandidates(context.Context, []int64) error
	SetMediaGenerationInstruction(context.Context, int64, string) error
}

type MediaGenerationStore interface {
	ClaimMediaGeneration(context.Context, int64) (*domain.MediaCandidate, error)
	CompleteMediaGeneration(context.Context, int64, int64, bool) error
	RecordMediaGenerationError(context.Context, int64, string, string) (*int64, error)
	CancelMediaGeneration(context.Context, int64) error
}

type WorkflowInteractionStore interface {
	GetInteraction(context.Context, int64) (*workflowdomain.WorkflowInteractionTask, error)
	ListInteractions(context.Context, int64) ([]*workflowdomain.WorkflowInteractionTask, error)
	ListPendingInteractions(context.Context) ([]*workflowdomain.WorkflowInteractionTask, error)
	ResolveInteraction(context.Context, int64, string, json.RawMessage, int64) (*workflowdomain.WorkflowInteractionTask, error)
	CancelInteraction(context.Context, int64, string, int64) error
}

type WorkflowEventPort interface {
	AppendWorkflowRunEvent(context.Context, *workflowdomain.WorkflowRunEvent) error
	ListWorkflowRunEvents(context.Context, int64) ([]*workflowdomain.WorkflowRunEvent, error)
}

type ApprovalEffectWriter interface {
	CreateContentCandidateSet(context.Context, *domain.AgentApproval) error
	CreateEditorialTask(context.Context, int64, string, string, string) error
	CreateReplyDraft(context.Context, int64, int64, string) error
	CreateOperationalSuggestion(context.Context, *opsdomain.OperationalSuggestion) error
}
