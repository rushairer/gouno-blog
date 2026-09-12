package agent

import (
	"context"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

type ManagementProviderStore interface {
	ReserveProviderID(context.Context) (int64, error)
	CreateProvider(context.Context, *domain.ProviderProfile) error
	UpdateProvider(context.Context, *domain.ProviderProfile, bool) error
	GetProvider(context.Context, int64) (*domain.ProviderProfile, error)
	ListProviders(context.Context) ([]*domain.ProviderProfile, error)
	SetDefaultProvider(context.Context, int64, string) error
	DeleteProvider(context.Context, int64) error
}

type ManagementAgentStore interface {
	CreateAgent(context.Context, *domain.Agent) error
	UpdateAgent(context.Context, *domain.Agent) error
	GetAgent(context.Context, int64) (*domain.Agent, error)
	ListAgents(context.Context) ([]*domain.Agent, error)
	DeleteAgent(context.Context, int64) error
	SetAgentEnabled(context.Context, int64, bool, *time.Time) error
}

type ManagementSkillStore interface {
	ListSkills(context.Context) ([]*domain.AgentSkill, error)
	GetSkill(context.Context, int64) (*domain.AgentSkill, error)
	CreateSkill(context.Context, *domain.AgentSkill) error
	UpdateSkill(context.Context, *domain.AgentSkill) error
	ListSkillVersions(context.Context, int64) ([]*domain.AgentSkill, error)
	GetSkillVersion(context.Context, int64) (*domain.AgentSkill, error)
	DeleteSkill(context.Context, int64) error
}

type ManagementNotificationWriter interface {
	Create(context.Context, int64, string, string, string, string, string) error
}

type StarterPackReconciler interface {
	BootstrapStarterPack(context.Context) (int, error)
}

type ManagementServiceDependencies struct {
	Providers     ManagementProviderStore
	Agents        ManagementAgentStore
	Skills        ManagementSkillStore
	Notifications ManagementNotificationWriter
	StarterPack   StarterPackReconciler
}
