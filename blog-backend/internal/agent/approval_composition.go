package agent

import (
	"github.com/rushairer/blog-backend/internal/media"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
)

type ApprovalServiceDependencies struct {
	Approvals            ApprovalStore
	MediaCandidates      MediaCandidateStore
	MediaGeneration      MediaGenerationStore
	WorkflowInteractions WorkflowInteractionStore
	WorkflowEvents       WorkflowEventPort
	Effects              ApprovalEffectWriter
	Transactor           ApprovalTransactionRunner
	Posts                *postservice.PostService
	Pages                *pageservice.PageService
	PostVersions         postVersionReader
	MediaAssets          mediaAssetGateway
	MediaStore           media.Store
	Generation           *GenerationService
}

func NewApprovalService(deps ApprovalServiceDependencies) *ApprovalService {
	if deps.Transactor == nil {
		panic("agent.NewApprovalService: transaction runner is required")
	}
	if _, ok := deps.Effects.(ApprovalEffectTransactionWriter); !ok {
		panic("agent.NewApprovalService: atomic Operations writer is required")
	}
	return &ApprovalService{
		approvals: deps.Approvals, mediaCandidates: deps.MediaCandidates, mediaGeneration: deps.MediaGeneration,
		workflowInteractions: deps.WorkflowInteractions, workflowEvents: deps.WorkflowEvents, effects: deps.Effects,
		transactor: deps.Transactor,
		posts: deps.Posts, pages: deps.Pages, postVersions: deps.PostVersions,
		mediaAssets: deps.MediaAssets, media: deps.MediaStore, generation: deps.Generation,
	}
}
