package starterpack

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"github.com/rushairer/blog-backend/internal/domain"
)

const version = 4

type ProviderStore interface {
	SelectStarterProviderIDTx(context.Context, *sql.Tx) (int64, error)
}

type SkillStore interface {
	ListSystemStarterSkillsTx(context.Context, *sql.Tx) ([]*domain.AgentSkill, error)
}

type AgentStore interface {
	ReconcileSystemAgentTx(context.Context, *sql.Tx, *domain.AgentSkill) (int64, bool, error)
}

type WorkflowStore interface {
	ReconcileCoreStarterWorkflows(context.Context, *sql.Tx, map[string]int64) error
	ReconcileProviderDependentStarters(context.Context, *sql.Tx, map[string]int64) (int, error)
}

type Coordinator struct {
	transactor *dbtx.Transactor
	providers  ProviderStore
	skills     SkillStore
	agents     AgentStore
	workflows  WorkflowStore
}

func NewCoordinator(transactor *dbtx.Transactor, providers ProviderStore, skills SkillStore, agents AgentStore, workflows WorkflowStore) *Coordinator {
	return &Coordinator{
		transactor: transactor,
		providers:  providers,
		skills:     skills,
		agents:     agents,
		workflows:  workflows,
	}
}

func (c *Coordinator) BootstrapStarterPack(ctx context.Context) (int, error) {
	created := 0
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		providerID, err := c.providers.SelectStarterProviderIDTx(ctx, tx)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}

		var currentVersion int
		if err = tx.QueryRowContext(ctx, `INSERT INTO ai_workspace_bootstrap (singleton, version, provider_profile_id)
			VALUES (TRUE,$1,$2)
			ON CONFLICT (singleton) DO UPDATE SET version=ai_workspace_bootstrap.version
			RETURNING version`, version, providerID).Scan(&currentVersion); err != nil {
			return err
		}

		skills, err := c.skills.ListSystemStarterSkillsTx(ctx, tx)
		if err != nil {
			return err
		}
		if len(skills) == 0 {
			return fmt.Errorf("starter pack is incomplete: no system Skills found")
		}

		systemAgents := make(map[string]int64, len(skills))
		for _, skill := range skills {
			if skill.SystemKey == nil || *skill.SystemKey == "" {
				return fmt.Errorf("starter pack is incomplete: system Skill has no key")
			}
			agentID, wasCreated, err := c.agents.ReconcileSystemAgentTx(ctx, tx, skill)
			if err != nil {
				return err
			}
			systemAgents[*skill.SystemKey] = agentID
			if wasCreated {
				created++
			}
		}

		if err = c.workflows.ReconcileCoreStarterWorkflows(ctx, tx, systemAgents); err != nil {
			return err
		}
		additionalCreated, err := c.workflows.ReconcileProviderDependentStarters(ctx, tx, systemAgents)
		if err != nil {
			return err
		}
		created += additionalCreated

		_, err = tx.ExecContext(ctx, `UPDATE ai_workspace_bootstrap
			SET version=$1, provider_profile_id=$2, completed_at=NOW() WHERE singleton=TRUE`, version, providerID)
		return err
	})
	if err != nil {
		return 0, err
	}
	return created, nil
}
