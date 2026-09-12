package repository

import (
	"context"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
)

// Media Candidate persistence is canonical under Agent. This helper remains
// only while Runner/run compatibility code still consumes the flat aggregate.
func (r *AgentRepository) mediaCandidates() *agentrepository.MediaCandidateRepository {
	return agentrepository.NewMediaCandidateRepository(r.db)
}

func (r *AgentRepository) CreateMediaCandidateFromRun(ctx context.Context, runID, postID int64, headline, brief, platform, altText string) (int64, *int64, error) {
	return r.mediaCandidates().CreateMediaCandidateFromRun(ctx, runID, postID, headline, brief, platform, altText)
}
