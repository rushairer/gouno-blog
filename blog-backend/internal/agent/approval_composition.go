package agent

import (
	"github.com/rushairer/blog-backend/internal/media"
	pageservice "github.com/rushairer/blog-backend/internal/page/service"
	postservice "github.com/rushairer/blog-backend/internal/post/service"
	"github.com/rushairer/blog-backend/internal/repository"
)

// NewApprovalServiceWithGeneration makes the GenerationService dependency
// explicit for composition roots. The legacy constructor remains temporarily
// for compatibility while remaining AgentRepository consumers are migrated.
func NewApprovalServiceWithGeneration(
	repo *repository.AgentRepository,
	posts *postservice.PostService,
	management *ManagementService,
	postVersions postVersionReader,
	mediaAssets mediaAssetGateway,
	store media.Store,
	pages *pageservice.PageService,
	generation *GenerationService,
) *ApprovalService {
	return &ApprovalService{
		repo: repo, posts: posts, pages: pages, management: management,
		postVersions: postVersions, mediaAssets: mediaAssets, media: store,
		generation: generation,
	}
}
