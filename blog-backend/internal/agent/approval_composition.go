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
	Posts                *postservice.PostService
	Pages                *pageservice.PageService
	PostVersions         postVersionReader
	MediaAssets          mediaAssetGateway
	MediaStore           media.Store
	Generation           *GenerationService
}

func NewApprovalService(deps ApprovalServiceDependencies) *ApprovalService {
	return &ApprovalService{
		approvals: deps.Approvals, mediaCandidates: deps.MediaCandidates, mediaGeneration: deps.MediaGeneration,
		workflowInteractions: deps.WorkflowInteractions, workflowEvents: deps.WorkflowEvents, effects: deps.Effects,
		posts: deps.Posts, pages: deps.Pages, postVersions: deps.PostVersions,
		mediaAssets: deps.MediaAssets, media: deps.MediaStore, generation: deps.Generation,
	}
}
