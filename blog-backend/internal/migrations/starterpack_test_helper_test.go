package migrations

import (
	"database/sql"

	agentrepository "github.com/rushairer/blog-backend/internal/agent/repository"
	"github.com/rushairer/blog-backend/internal/dbtx"
	providerrepository "github.com/rushairer/blog-backend/internal/provider/repository"
	"github.com/rushairer/blog-backend/internal/starterpack"
	workflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"
	"go.uber.org/zap"
)

func newStarterPackTestCoordinator(db *sql.DB) *starterpack.Coordinator {
	return starterpack.NewCoordinator(
		dbtx.NewTransactor(db, zap.NewNop()),
		providerrepository.New(db),
		agentrepository.NewSkillRepository(db),
		agentrepository.NewDefinitionRepository(db),
		workflowrepository.NewStarterRepository(),
	)
}
