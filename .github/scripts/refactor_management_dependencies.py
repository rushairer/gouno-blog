from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "blog-backend"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1. Introduce consumer-sized Management ports and dependencies.
ports = BACKEND / "internal/agent/management_ports.go"
ports.write_text(
    '''package agent

import (
\t"context"
\t"time"

\t"github.com/rushairer/blog-backend/internal/domain"
)

type ManagementProviderStore interface {
\tReserveProviderID(context.Context) (int64, error)
\tCreateProvider(context.Context, *domain.ProviderProfile) error
\tUpdateProvider(context.Context, *domain.ProviderProfile, bool) error
\tGetProvider(context.Context, int64) (*domain.ProviderProfile, error)
\tListProviders(context.Context) ([]*domain.ProviderProfile, error)
\tSetDefaultProvider(context.Context, int64, string) error
\tDeleteProvider(context.Context, int64) error
}

type ManagementAgentStore interface {
\tCreateAgent(context.Context, *domain.Agent) error
\tUpdateAgent(context.Context, *domain.Agent) error
\tGetAgent(context.Context, int64) (*domain.Agent, error)
\tListAgents(context.Context) ([]*domain.Agent, error)
\tDeleteAgent(context.Context, int64) error
\tSetAgentEnabled(context.Context, int64, bool, *time.Time) error
}

type ManagementSkillStore interface {
\tListSkills(context.Context) ([]*domain.AgentSkill, error)
\tGetSkill(context.Context, int64) (*domain.AgentSkill, error)
\tCreateSkill(context.Context, *domain.AgentSkill) error
\tUpdateSkill(context.Context, *domain.AgentSkill) error
\tListSkillVersions(context.Context, int64) ([]*domain.AgentSkill, error)
\tGetSkillVersion(context.Context, int64) (*domain.AgentSkill, error)
\tDeleteSkill(context.Context, int64) error
}

type ManagementNotificationWriter interface {
\tCreate(context.Context, int64, string, string, string, string, string) error
}

type StarterPackReconciler interface {
\tBootstrapStarterPack(context.Context) (int, error)
}

type ManagementServiceDependencies struct {
\tProviders     ManagementProviderStore
\tAgents        ManagementAgentStore
\tSkills        ManagementSkillStore
\tNotifications ManagementNotificationWriter
\tStarterPack   StarterPackReconciler
}
''',
    encoding="utf-8",
)

# 2. Cut ManagementService off the flat repository.AgentRepository aggregate.
management_path = BACKEND / "internal/agent/management.go"
management = management_path.read_text(encoding="utf-8")
management = replace_once(
    management,
    '\t"github.com/rushairer/blog-backend/internal/provider"\n\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '\t"github.com/rushairer/blog-backend/internal/provider"\n\tproviderrepository "github.com/rushairer/blog-backend/internal/provider/repository"\n',
    "management imports",
)
old_service = '''type ManagementService struct {
\trepo                 *repository.AgentRepository
\tsecrets              *secretbox.Box
\tallowedHosts         []string
\tallowedCapabilities  []string
\tproposalCapabilities []string
}

func NewManagementService(repo *repository.AgentRepository, secrets *secretbox.Box, allowedHosts, allowedCapabilities, proposalCapabilities []string) *ManagementService {
\treturn &ManagementService{
\t\trepo: repo, secrets: secrets, allowedHosts: allowedHosts,
\t\tallowedCapabilities: allowedCapabilities, proposalCapabilities: proposalCapabilities,
\t}
}
'''
new_service = '''type ManagementService struct {
\tproviders            ManagementProviderStore
\tagents               ManagementAgentStore
\tskills               ManagementSkillStore
\tnotifications        ManagementNotificationWriter
\tstarterPack          StarterPackReconciler
\tsecrets              *secretbox.Box
\tallowedHosts         []string
\tallowedCapabilities  []string
\tproposalCapabilities []string
}

func NewManagementService(deps ManagementServiceDependencies, secrets *secretbox.Box, allowedHosts, allowedCapabilities, proposalCapabilities []string) *ManagementService {
\treturn &ManagementService{
\t\tproviders: deps.Providers, agents: deps.Agents, skills: deps.Skills,
\t\tnotifications: deps.Notifications, starterPack: deps.StarterPack,
\t\tsecrets: secrets, allowedHosts: allowedHosts,
\t\tallowedCapabilities: allowedCapabilities, proposalCapabilities: proposalCapabilities,
\t}
}
'''
management = replace_once(management, old_service, new_service, "ManagementService constructor")

for method in [
    "ListProviders", "GetProvider", "SetDefaultProvider", "ReserveProviderID",
    "CreateProvider", "UpdateProvider", "DeleteProvider",
]:
    management = management.replace(f"s.repo.{method}", f"s.providers.{method}")
for method in ["ListAgents", "GetAgent", "CreateAgent", "UpdateAgent", "DeleteAgent", "SetAgentEnabled"]:
    management = management.replace(f"s.repo.{method}", f"s.agents.{method}")
for method in [
    "ListSkills", "GetSkill", "CreateSkill", "UpdateSkill", "ListSkillVersions",
    "GetSkillVersion", "DeleteSkill",
]:
    management = management.replace(f"s.repo.{method}", f"s.skills.{method}")
management = management.replace(
    "s.repo.CreateSystemNotification(ctx, recipientPrincipalID, eventType, title, body, href, key)",
    "s.notifications.Create(ctx, recipientPrincipalID, eventType, title, body, href, key)",
)
management = management.replace(
    "s.repo.BootstrapStarterPack(ctx)",
    "s.starterPack.BootstrapStarterPack(ctx)",
)
management = management.replace("repository.ErrResourceInUse", "providerrepository.ErrResourceInUse")
if "s.repo." in management or 'internal/repository"' in management:
    raise SystemExit("ManagementService still depends on flat repository.AgentRepository")
management_path.write_text(management, encoding="utf-8")

# 3. Wire canonical stores in the application composition root; keep flat agentRepo only for Runner.
web_path = BACKEND / "cmd/gouno/web.go"
web = web_path.read_text(encoding="utf-8")
web = replace_once(
    web,
    '\t"github.com/rushairer/blog-backend/internal/media/service"\n\t"github.com/rushairer/blog-backend/internal/operations"\n',
    '\t"github.com/rushairer/blog-backend/internal/media/service"\n\tnotificationrepository "github.com/rushairer/blog-backend/internal/notification/repository"\n\t"github.com/rushairer/blog-backend/internal/operations"\n',
    "web notification import",
)
web = replace_once(
    web,
    '\tpostservice "github.com/rushairer/blog-backend/internal/post/service"\n\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '\tpostservice "github.com/rushairer/blog-backend/internal/post/service"\n\tproviderrepository "github.com/rushairer/blog-backend/internal/provider/repository"\n\t"github.com/rushairer/blog-backend/internal/repository"\n',
    "web provider import",
)
web = replace_once(
    web,
    '''\t\tagentRepo := repository.NewAgentRepository(cfg.DB)
\t\tagentDefinitionRepo := agentrepository.NewDefinitionRepository(cfg.DB)
\t\tagentRunRepo := agentrepository.NewRunRepository(cfg.DB)
''',
    '''\t\tagentRepo := repository.NewAgentRepository(cfg.DB)
\t\tagentDefinitionRepo := agentrepository.NewDefinitionRepository(cfg.DB)
\t\tagentSkillRepo := agentrepository.NewSkillRepository(cfg.DB)
\t\tagentStarterPackRepo := agentrepository.NewAgentRepository(cfg.DB)
\t\tproviderRepo := providerrepository.New(cfg.DB)
\t\tnotificationRepo := notificationrepository.NewSystemNotificationRepository(cfg.DB)
\t\tagentRunRepo := agentrepository.NewRunRepository(cfg.DB)
''',
    "web canonical management stores",
)
web = replace_once(
    web,
    '''\t\tmanagement := agentservice.NewManagementService(
\t\t\tagentRepo, secrets, cfg.Global.AIAgentConfig.AllowedHosts,
\t\t\ttoolRegistry.AgentNames(), toolRegistry.ProposalNames(),
\t\t)
''',
    '''\t\tmanagement := agentservice.NewManagementService(
\t\t\tagentservice.ManagementServiceDependencies{
\t\t\t\tProviders: providerRepo, Agents: agentDefinitionRepo, Skills: agentSkillRepo,
\t\t\t\tNotifications: notificationRepo, StarterPack: agentStarterPackRepo,
\t\t\t},
\t\t\tsecrets, cfg.Global.AIAgentConfig.AllowedHosts,
\t\t\ttoolRegistry.AgentNames(), toolRegistry.ProposalNames(),
\t\t)
''',
    "web ManagementService wiring",
)
web_path.write_text(web, encoding="utf-8")

# 4. Update unit tests that only exercise pure validation.
management_test_path = BACKEND / "internal/agent/management_test.go"
management_test = management_test_path.read_text(encoding="utf-8")
needle = "NewManagementService(nil, nil, nil, nil, nil)"
if needle not in management_test:
    raise SystemExit("management_test constructor call not found")
management_test = management_test.replace(
    needle,
    "NewManagementService(ManagementServiceDependencies{}, nil, nil, nil, nil)",
)
management_test_path.write_text(management_test, encoding="utf-8")

# 5. Give Workflow integration tests canonical Management dependencies too.
resource_test_path = BACKEND / "internal/workflow/resource_query_integration_test.go"
resource_test = resource_test_path.read_text(encoding="utf-8")
resource_test = replace_once(
    resource_test,
    '\tagentservice "github.com/rushairer/blog-backend/internal/agent"\n',
    '\tagentservice "github.com/rushairer/blog-backend/internal/agent"\n\tagentrepository "github.com/rushairer/blog-backend/internal/agent/repository"\n',
    "resource test agent repository import",
)
resource_test = replace_once(
    resource_test,
    '\t"github.com/rushairer/blog-backend/internal/migrations"\n\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '\t"github.com/rushairer/blog-backend/internal/migrations"\n\tnotificationrepository "github.com/rushairer/blog-backend/internal/notification/repository"\n\tproviderrepository "github.com/rushairer/blog-backend/internal/provider/repository"\n',
    "resource test canonical imports",
)
old_ctor = "agentservice.NewManagementService(repository.NewAgentRepository(db), nil, nil, nil, nil)"
if resource_test.count(old_ctor) < 1:
    raise SystemExit("resource-query ManagementService constructor calls not found")
resource_test = resource_test.replace(old_ctor, "newResourceQueryManagement(db)")
helper = '''func newResourceQueryManagement(db *sql.DB) *agentservice.ManagementService {
\treturn agentservice.NewManagementService(agentservice.ManagementServiceDependencies{
\t\tProviders: providerrepository.New(db),
\t\tAgents: agentrepository.NewDefinitionRepository(db),
\t\tSkills: agentrepository.NewSkillRepository(db),
\t\tNotifications: notificationrepository.NewSystemNotificationRepository(db),
\t\tStarterPack: agentrepository.NewAgentRepository(db),
\t}, nil, nil, nil, nil)
}

'''
marker = "func TestScheduledResourceQueryRetryKeepsSnapshotAndScope"
if marker not in resource_test:
    raise SystemExit("resource-query test insertion marker not found")
resource_test = resource_test.replace(marker, helper + marker, 1)
if "repository.NewAgentRepository" in resource_test or 'internal/repository"' in resource_test:
    raise SystemExit("resource-query tests still use flat AgentRepository")
resource_test_path.write_text(resource_test, encoding="utf-8")

# 6. Retire Management-only flat facades and the flat StarterPack forwarding method.
(BACKEND / "internal/repository/provider_repository.go").unlink()
(BACKEND / "internal/repository/skill_repository.go").unlink()
flat_agent = BACKEND / "internal/repository/agent_repository.go"
flat_agent.write_text(
    '''package repository

import "database/sql"

type AgentRepository struct {
\tdb *sql.DB
}

func NewAgentRepository(db *sql.DB) *AgentRepository {
\treturn &AgentRepository{db: db}
}
''',
    encoding="utf-8",
)

# 7. Keep the convergence map aligned with the actual dependency graph.
arch_path = BACKEND / "ARCHITECTURE_CONVERGENCE.md"
arch = arch_path.read_text(encoding="utf-8")
arch = arch.replace(
    "**In progress.** Scheduler, GenerationService and ApprovalService use explicit canonical repositories/ports. ManagementService and Runner still depend on flat `repository.AgentRepository`; Agent HTTP ownership remains flat.",
    "**In progress.** Scheduler, GenerationService, ApprovalService and ManagementService use explicit canonical repositories/ports. Runner still depends on flat `repository.AgentRepository`; Agent HTTP ownership remains flat.",
)
arch = arch.replace(
    "Agent ManagementService is still the main consumer and currently reaches persistence through the flat AgentRepository provider facade.",
    "Agent ManagementService consumes the canonical Provider repository through a narrow provider-store contract.",
)
arch = arch.replace(
    "**Persistence canonical; consumer cutover pending.** Credential validation/encryption/security behavior is not part of Capability cleanup.",
    "**Management consumer converged.** The flat Provider facade is retired; credential validation/encryption/security behavior is unchanged.",
    1,
)
arch = arch.replace(
    "Agent Management/Runner currently reach system notification writes through flat AgentRepository delegates.",
    "Agent ManagementService consumes the canonical Notification writer directly; Runner still uses the flat AgentRepository delegate.",
)
arch = arch.replace(
    "**Persistence canonical; consumer cutover pending.**",
    "**Management consumer converged; Runner cutover pending.**",
    1,
)
arch = arch.replace(
    "Agent remains intentionally mixed while migration is incomplete: the root constructs canonical Definition, Run, Approval and GenerationAudit repositories, but also constructs the flat aggregate `repository.AgentRepository` for ManagementService and Runner. That mixed graph is migration debt, not a construction pattern to copy.",
    "Agent remains intentionally mixed while migration is incomplete: the root constructs canonical Provider, Definition, Skill, Notification, StarterPack, Run, Approval and GenerationAudit dependencies for converged services, while the flat aggregate `repository.AgentRepository` remains only for Runner. That mixed graph is migration debt, not a construction pattern to copy.",
)
arch = arch.replace(
    "| `internal/repository.AgentRepository` aggregate | Accidental aggregate / transitional | Agent ManagementService, Runner, Starter Pack/bootstrap tests | Cut the remaining services to consumer-defined narrow contracts and canonical repositories; move Starter Pack orchestration to application coordinator; then delete aggregate. |",
    "| `internal/repository.AgentRepository` aggregate | Accidental aggregate / transitional | Runner | Cut Runner to consumer-defined narrow contracts and canonical repositories; then delete aggregate. |",
)
arch = arch.replace(
    "| Flat Agent Definition/Skill/Run delegates plus minimal Approval/MediaCandidate Runner adapters | Transitional | ManagementService / Runner and run compatibility code | ApprovalService delegates are retired; delete the remaining method groups as ManagementService and Runner cut over. Do not replace the aggregate with another broad interface. |",
    "| Flat Agent Definition/Run delegates plus minimal Approval/MediaCandidate Runner adapters | Transitional | Runner and run compatibility code | Provider/Skill/ApprovalService delegates are retired; delete the remaining method groups as Runner cuts over. Do not replace the aggregate with another broad interface. |",
)
arch = arch.replace(
    "| Flat Provider delegates on AgentRepository | Transitional | ManagementService | Give ManagementService a narrow Provider store, compose canonical Provider repository directly, then delete delegates and legacy error shim. |\n",
    "",
)
arch = arch.replace(
    "| Flat system-notification delegate on AgentRepository | Transitional | ManagementService / Runner paths | Inject narrow Notification writer where actually consumed; delete delegate after consumer proof. |",
    "| Flat system-notification delegate on AgentRepository | Transitional | Runner | ManagementService now uses the canonical Notification writer directly; delete the flat delegate with the Runner dependency cutover. |",
)
arch = arch.replace(
    "- **A — migrate to capability / retire facade:** Agent Definition/Skill/Run/Approval/MediaCandidate, Provider, Notification and Workflow interaction/scope repository delegates; Agent/Workflow/Operations/Knowledge controllers after their services converge.",
    "- **A — migrate to capability / retire facade:** Agent Definition/Run/Approval/MediaCandidate, Notification and Workflow scope repository delegates; Agent/Workflow/Operations/Knowledge controllers after their services converge. Provider and Skill flat delegates are retired.",
)
arch = arch.replace(
    "2. **Agent ManagementService dependency model:** split Provider, Skill/Definition, Notification and Starter Pack dependencies; assign Starter Pack transaction to an application coordinator.",
    "2. **Agent Starter Pack application coordinator:** move the remaining cross-capability Starter Pack transaction out of the Agent repository and compose canonical Provider, Skill, Agent and Workflow persistence through an explicit coordinator.",
)
arch = arch.replace(
    "Completed slice: **Agent Approval / Media Candidate / Workflow Event orchestration** now uses consumer-side Agent stores, Workflow ports, Operations-owned approval effects and explicit composition-root wiring. The superseded repository-layer PR was closed without merge.",
    "Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration** and **Agent ManagementService dependency cutover** now use consumer-side canonical contracts and explicit composition-root wiring. Management no longer depends on the flat AgentRepository aggregate; Provider and Skill flat facades are retired.",
)
arch = arch.replace("\n<!-- prior priority tail retained below only if marker replacement failed -->\n", "\n")
arch_path.write_text(arch, encoding="utf-8")

# Final fail-closed assertions for this slice.
if (BACKEND / "internal/repository/provider_repository.go").exists() or (BACKEND / "internal/repository/skill_repository.go").exists():
    raise SystemExit("Management-only flat facade retirement did not complete")
print("Management dependency refactor staged successfully")
