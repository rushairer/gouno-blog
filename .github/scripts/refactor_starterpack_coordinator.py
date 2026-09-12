from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "blog-backend"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def write(rel: str, content: str) -> None:
    path = BACKEND / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# Application-level coordinator owns the cross-capability transaction and
# ai_workspace_bootstrap coordination row. Capability stores only expose
# transaction-aware operations over their own tables.
write(
    "internal/starterpack/coordinator.go",
    r'''package starterpack

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
''',
)

# Provider-owned starter selection.
write(
    "internal/provider/repository/starter.go",
    r'''package repository

import (
	"context"
	"database/sql"
)

func (r *Repository) SelectStarterProviderIDTx(ctx context.Context, tx *sql.Tx) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM ai_provider_profiles
		WHERE enabled=TRUE AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
		ORDER BY is_default_writing DESC, created_at ASC LIMIT 1`).Scan(&id)
	return id, err
}
''',
)

# Skill-owned starter read model.
write(
    "internal/agent/repository/starter_skill_repository.go",
    r'''package repository

import (
	"context"
	"database/sql"

	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *SkillRepository) ListSystemStarterSkillsTx(ctx context.Context, tx *sql.Tx) ([]*domain.AgentSkill, error) {
	rows, err := tx.QueryContext(ctx, `SELECT s.system_key, s.name, s.description,
		s.default_daily_run_limit, s.default_monthly_token_budget, sv.id
		FROM ai_skills s JOIN ai_skill_versions sv ON sv.skill_id=s.id AND sv.version=s.version
		WHERE s.system_key IS NOT NULL AND s.deleted_at IS NULL ORDER BY s.system_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*domain.AgentSkill, 0, 12)
	for rows.Next() {
		var systemKey string
		item := &domain.AgentSkill{}
		if err := rows.Scan(
			&systemKey, &item.Name, &item.Description,
			&item.DefaultDailyRunLimit, &item.DefaultMonthlyTokenBudget, &item.VersionID,
		); err != nil {
			return nil, err
		}
		item.SystemKey = &systemKey
		items = append(items, item)
	}
	return items, rows.Err()
}
''',
)

# Agent-definition-owned system Agent reconcile.
write(
    "internal/agent/repository/starter_definition_repository.go",
    r'''package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rushairer/blog-backend/internal/domain"
)

func (r *DefinitionRepository) ReconcileSystemAgentTx(ctx context.Context, tx *sql.Tx, skill *domain.AgentSkill) (int64, bool, error) {
	if skill == nil || skill.SystemKey == nil || *skill.SystemKey == "" {
		return 0, false, fmt.Errorf("system Skill key is required")
	}

	var agentID int64
	err := tx.QueryRowContext(ctx, `INSERT INTO ai_agents
		(system_key,name,description,provider_profile_id,skill_version_id,enabled,trigger_type,timezone,daily_run_limit,monthly_token_budget,creation_origin)
		VALUES ($1,$2,$3,NULL,$4,FALSE,'manual','Asia/Shanghai',$5,$6,$7)
		ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO NOTHING
		RETURNING id`, *skill.SystemKey, skill.Name, skill.Description, skill.VersionID,
		skill.DefaultDailyRunLimit, skill.DefaultMonthlyTokenBudget, "system").Scan(&agentID)
	if err == nil {
		return agentID, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	err = tx.QueryRowContext(ctx, `SELECT id FROM ai_agents WHERE system_key=$1 AND deleted_at IS NULL`, *skill.SystemKey).Scan(&agentID)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `UPDATE ai_agents
			SET deleted_at=NULL, skill_version_id=$2, updated_at=NOW()
			WHERE system_key=$1 RETURNING id`, *skill.SystemKey, skill.VersionID).Scan(&agentID)
	}
	return agentID, false, err
}
''',
)

# Workflow-owned core starter reconcile. Provider-dependent starters already live
# in this capability; StarterRepository exposes both operations to the coordinator.
write(
    "internal/workflow/repository/core_starters.go",
    r'''package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
)

type StarterRepository struct{}

func NewStarterRepository() *StarterRepository {
	return &StarterRepository{}
}

type coreStarterWorkflow struct {
	key, name, description, cron string
	approval                     bool
}

func coreStarterWorkflows() []coreStarterWorkflow {
	return []coreStarterWorkflow{
		{key: "daily_news", name: "AI 每日资讯", description: "每天 09:00 调度 AI 每日资讯 Agent。", cron: "0 9 * * *"},
		{key: "weekly_operations", name: "周度运营复盘", description: "每周调度周度运营复盘 Agent。", cron: "0 9 * * 1"},
		{key: "stale_content_refresh", name: "陈旧内容更新", description: "定期调度陈旧内容更新 Agent。", cron: "0 9 * * 2", approval: true},
		{key: "low_engagement", name: "低互动文章分析", description: "定期调度低互动文章分析 Agent。", cron: "0 9 * * 3"},
	}
}

func starterJSONEqual(left, right []byte) bool {
	var leftValue, rightValue any
	return json.Unmarshal(left, &leftValue) == nil && json.Unmarshal(right, &rightValue) == nil && reflect.DeepEqual(leftValue, rightValue)
}

func coreStarterSteps(agentID int64, approval bool) []byte {
	steps := []map[string]any{{"id": "agent", "type": "model", "agent_id": agentID}}
	if approval {
		steps = append(steps, map[string]any{"id": "approval", "type": "approval_gate"})
	}
	steps = append(steps, map[string]any{"id": "result", "type": "output", "output_pointer": "/steps/agent"})
	encoded, _ := json.Marshal(steps)
	return encoded
}

func (r *StarterRepository) ReconcileCoreStarterWorkflows(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) error {
	definitions := coreStarterWorkflows()
	for _, definition := range definitions {
		if systemAgents[definition.key] <= 0 {
			return fmt.Errorf("starter workflow Agent bindings are incomplete")
		}
	}

	for _, definition := range definitions {
		agentID := systemAgents[definition.key]
		steps := coreStarterSteps(agentID, definition.approval)
		var workflowID int64
		var currentVersion int
		var currentSteps []byte
		err := tx.QueryRowContext(ctx, `SELECT w.id, w.current_version, v.steps
			FROM ai_workflows w JOIN ai_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version
			WHERE w.template_key=$1 AND w.deleted_at IS NULL FOR UPDATE`, definition.key).
			Scan(&workflowID, &currentVersion, &currentSteps)
		if errors.Is(err, sql.ErrNoRows) {
			err = tx.QueryRowContext(ctx, `SELECT id, current_version FROM ai_workflows WHERE template_key=$1 FOR UPDATE`, definition.key).
				Scan(&workflowID, &currentVersion)
			if errors.Is(err, sql.ErrNoRows) {
				currentVersion = 1
				if err = tx.QueryRowContext(ctx, `INSERT INTO ai_workflows
					(name, description, enabled, template_key, cron_expression, timezone, current_version, creation_origin)
					VALUES ($1, $2, FALSE, $3, $4, 'Asia/Shanghai', $5, $6)
					RETURNING id`, definition.name, definition.description, definition.key, definition.cron, currentVersion, "system").Scan(&workflowID); err != nil {
					return fmt.Errorf("create starter workflow %q: %w", definition.key, err)
				}
				if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
					(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
					json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
					return fmt.Errorf("create starter workflow %q version: %w", definition.key, err)
				}
				continue
			}
			if err != nil {
				return err
			}
			if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET deleted_at=NULL, enabled=FALSE, next_run_at=NULL,
				current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
				(workflow_id, version, input_schema, steps, creation_origin) VALUES ($1, $2, $3, $4, $5)`, workflowID, currentVersion,
				json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return fmt.Errorf("starter workflow %q is unavailable: %w", definition.key, err)
		}
		if starterJSONEqual(currentSteps, steps) {
			continue
		}
		if err = tx.QueryRowContext(ctx, `UPDATE ai_workflows SET enabled=FALSE, next_run_at=NULL,
			current_version=current_version+1, updated_at=NOW() WHERE id=$1 RETURNING current_version`, workflowID).Scan(&currentVersion); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO ai_workflow_versions
			(workflow_id,version,input_schema,steps,creation_origin) VALUES ($1,$2,$3,$4,$5)`, workflowID, currentVersion,
			json.RawMessage(`{"type":"object","additionalProperties":false}`), steps, "system"); err != nil {
			return err
		}
	}
	return nil
}

func (r *StarterRepository) ReconcileProviderDependentStarters(ctx context.Context, tx *sql.Tx, systemAgents map[string]int64) (int, error) {
	return ReconcileProviderDependentStarters(ctx, tx, systemAgents)
}
''',
)

# Rewire composition root from the Agent bootstrap aggregate to the application coordinator.
web_path = BACKEND / "cmd/gouno/web.go"
web = web_path.read_text(encoding="utf-8")
web = replace_once(
    web,
    '\t"github.com/rushairer/blog-backend/internal/secretbox"\n',
    '\t"github.com/rushairer/blog-backend/internal/secretbox"\n\t"github.com/rushairer/blog-backend/internal/starterpack"\n',
    "starterpack import",
)
web = replace_once(
    web,
    '''\t\tagentDefinitionRepo := agentrepository.NewDefinitionRepository(cfg.DB)
\t\tagentSkillRepo := agentrepository.NewSkillRepository(cfg.DB)
\t\tagentStarterPackRepo := agentrepository.NewAgentRepository(cfg.DB)
\t\tproviderRepo := providerrepository.New(cfg.DB)
''',
    '''\t\tagentDefinitionRepo := agentrepository.NewDefinitionRepository(cfg.DB)
\t\tagentSkillRepo := agentrepository.NewSkillRepository(cfg.DB)
\t\tproviderRepo := providerrepository.New(cfg.DB)
\t\tworkflowStarterRepo := workflowrepository.NewStarterRepository()
\t\tstarterPackCoordinator := starterpack.NewCoordinator(transactor, providerRepo, agentSkillRepo, agentDefinitionRepo, workflowStarterRepo)
''',
    "starterpack composition",
)
web = replace_once(
    web,
    'Notifications: notificationRepo, StarterPack: agentStarterPackRepo,',
    'Notifications: notificationRepo, StarterPack: starterPackCoordinator,',
    "starterpack Management dependency",
)
web_path.write_text(web, encoding="utf-8")

# Shared integration-test coordinator factory.
write(
    "internal/migrations/starterpack_test_helper_test.go",
    r'''package migrations

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
''',
)

migrate_path = BACKEND / "internal/migrations/migrate_integration_test.go"
migrate = migrate_path.read_text(encoding="utf-8")
migrate = replace_once(
    migrate,
    '\n\t_ "github.com/lib/pq"\n\tagentrepository "github.com/rushairer/blog-backend/internal/agent/repository"\n',
    '\n\t_ "github.com/lib/pq"\n',
    "remove migrate AgentRepository import",
)
migrate = replace_once(
    migrate,
    'agentrepository.NewAgentRepository(db).BootstrapStarterPack(ctx)',
    'newStarterPackTestCoordinator(db).BootstrapStarterPack(ctx)',
    "fresh install starter coordinator",
)
migrate_path.write_text(migrate, encoding="utf-8")

identity_path = BACKEND / "internal/migrations/identity_backfill_integration_test.go"
identity = identity_path.read_text(encoding="utf-8")
identity = replace_once(
    identity,
    'starterPackRepo := agentrepository.NewAgentRepository(db)',
    'starterPackRepo := newStarterPackTestCoordinator(db)',
    "identity starter coordinator",
)
identity_path.write_text(identity, encoding="utf-8")

# Retire the cross-capability Agent bootstrap aggregate and its Workflow adapter.
for rel in [
    "internal/agent/repository/agent_repository.go",
    "internal/agent/repository/workflow_starters.go",
]:
    path = BACKEND / rel
    if not path.exists():
        raise SystemExit(f"expected transitional file missing before retirement: {rel}")
    path.unlink()

# Keep architecture Source of Truth synchronized with the new ownership model.
arch_path = BACKEND / "ARCHITECTURE_CONVERGENCE.md"
arch = arch_path.read_text(encoding="utf-8")
arch = replace_once(
    arch,
    "Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates, Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits`, plus starter bootstrap state",
    "Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates and Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits`",
    "Agent owned concepts",
)
arch = replace_once(
    arch,
    "Repository-local transactions for owned aggregates. Starter Pack is still cross-capability transaction debt.",
    "Repository-local transactions for owned aggregates. Cross-capability Starter Pack orchestration belongs to the application coordinator.",
    "Agent transaction ownership",
)
arch = replace_once(
    arch,
    "the root constructs canonical Provider, Definition, Skill, Notification, StarterPack, Run, Approval and GenerationAudit dependencies for converged services",
    "the root constructs canonical Provider, Definition, Skill, Notification, Starter Pack coordinator, Run, Approval and GenerationAudit dependencies for converged services",
    "composition Starter Pack wording",
)
arch = replace_once(
    arch,
    "- **Agent Starter Pack:** `AgentRepository.BootstrapStarterPack` still coordinates Provider, Skill, Agent and Workflow state. This is transitional cross-capability transaction ownership. Removal condition: an application/bootstrap coordinator owns `dbtx.Transactor` and invokes canonical capability persistence through narrow transaction-aware ports.\n",
    "- **Starter Pack application coordinator:** `internal/starterpack.Coordinator` owns the `dbtx.Transactor` boundary and `ai_workspace_bootstrap` coordination state; Provider, Skill, Agent Definition and Workflow repositories expose only narrow transaction-aware operations over their owned tables.\n",
    "Starter Pack transaction map",
)
arch = replace_once(
    arch,
    "2. **Agent Starter Pack application coordinator:** move the remaining cross-capability Starter Pack transaction out of the Agent repository and compose canonical Provider, Skill, Agent and Workflow persistence through an explicit coordinator.\n3. **Runner dependency model:** split RunStore, Agent reader, Workflow scope/resource ports, usage/tool-call persistence and Media Candidate creation according to actual call cohesion.\n4. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.\n5. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.\n6. **Transitional layer retirement:** delete remaining flat repository/controller facades and stale adapters only after consumer proof and full gates.",
    "2. **Runner dependency model:** split RunStore, Agent reader, Workflow scope/resource ports, usage/tool-call persistence and Media Candidate creation according to actual call cohesion.\n3. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.\n4. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.\n5. **Transitional layer retirement:** delete remaining flat repository/controller facades and stale adapters only after consumer proof and full gates.",
    "migration debt priority",
)
arch = replace_once(
    arch,
    "Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration** and **Agent ManagementService dependency cutover** now use consumer-side canonical contracts and explicit composition-root wiring. Management no longer depends on the flat AgentRepository aggregate; Provider and Skill flat facades are retired.",
    "Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, and **Starter Pack application coordination** now use consumer-side canonical contracts and explicit composition-root wiring. Starter Pack transaction ownership is application-level; the cross-capability Agent bootstrap aggregate and Agent-to-Workflow starter adapter are retired.",
    "completed slices",
)
arch_path.write_text(arch, encoding="utf-8")

# Fail closed on stale ownership.
for rel in [
    "internal/agent/repository/agent_repository.go",
    "internal/agent/repository/workflow_starters.go",
]:
    if (BACKEND / rel).exists():
        raise SystemExit(f"transitional Starter Pack ownership still exists: {rel}")
if "agentStarterPackRepo" in web or "agentrepository.NewAgentRepository" in web:
    raise SystemExit("composition root still constructs Agent StarterPack aggregate")
print("Starter Pack coordinator refactor staged successfully")
