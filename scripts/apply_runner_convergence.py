from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


runner_path = ROOT / "blog-backend/internal/agent/runner.go"
runner = runner_path.read_text()
runner = replace_once(
    runner,
    '\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '',
    'runner root repository import',
)
runner = replace_once(
    runner,
    '''type Runner struct {\n\trepo       *repository.AgentRepository\n\tmanagement *ManagementService\n\ttools      *tool.Registry\n\tposts      *postservice.PostService\n}\n\nfunc NewRunner(repo *repository.AgentRepository, management *ManagementService, tools *tool.Registry, posts *postservice.PostService) *Runner {\n\treturn &Runner{repo: repo, management: management, tools: tools, posts: posts}\n}\n''',
    '''type Runner struct {\n\truns            RunnerRunStore\n\tapprovals       RunnerApprovalStore\n\tworkflowScopes  RunnerWorkflowScopeStore\n\tmediaCandidates RunnerMediaCandidateStore\n\tnotifications   RunnerNotificationWriter\n\tlifecycle       RunnerRunLifecycle\n\tmanagement      *ManagementService\n\ttools           *tool.Registry\n\tposts           *postservice.PostService\n}\n\nfunc NewRunner(deps RunnerDependencies, management *ManagementService, tools *tool.Registry, posts *postservice.PostService) *Runner {\n\treturn &Runner{\n\t\truns: deps.Runs, approvals: deps.Approvals, workflowScopes: deps.WorkflowScopes,\n\t\tmediaCandidates: deps.MediaCandidates, notifications: deps.Notifications, lifecycle: deps.Lifecycle,\n\t\tmanagement: management, tools: tools, posts: posts,\n\t}\n}\n''',
    'runner dependency model',
)
for old, new in {
    'r.repo.ListRuns': 'r.runs.ListRuns',
    'r.repo.GetRun': 'r.runs.GetRun',
    'r.repo.DeleteRun': 'r.lifecycle.DeleteRun',
    'r.repo.ListToolCalls': 'r.runs.ListToolCalls',
    'r.repo.DailyRunCount': 'r.runs.DailyRunCount',
    'r.repo.MonthlyTokenUsage': 'r.runs.MonthlyTokenUsage',
    'r.repo.CreateRun': 'r.runs.CreateRun',
    'r.repo.FinishRun': 'r.lifecycle.FinishRun',
    'r.repo.CreateSystemNotification': 'r.notifications.Create',
    'r.repo.StartRun': 'r.runs.StartRun',
    'r.repo.WorkflowScopePolicy': 'r.workflowScopes.WorkflowScopePolicy',
    'r.repo.RecordUsage': 'r.runs.RecordUsage',
    'r.repo.CreateToolCall': 'r.runs.CreateToolCall',
    'r.repo.FinishToolCall': 'r.runs.FinishToolCall',
    'r.repo.CreateApproval': 'r.approvals.CreateApproval',
    'r.repo.SaveRunCitations': 'r.runs.SaveRunCitations',
    'r.repo.WorkflowResourceAccess': 'r.workflowScopes.WorkflowResourceAccess',
    'r.repo.AddDiscoveredWorkflowResource': 'r.workflowScopes.AddDiscoveredWorkflowResource',
    'r.repo.CreateMediaCandidateFromRun': 'r.mediaCandidates.CreateMediaCandidateFromRun',
}.items():
    runner = runner.replace(old, new)
if 'r.repo.' in runner or 'repository.AgentRepository' in runner:
    raise SystemExit('runner still references flat AgentRepository')
runner_path.write_text(runner)

ports_path = ROOT / "blog-backend/internal/agent/runner_ports.go"
if ports_path.exists():
    raise SystemExit('runner_ports.go already exists')
ports_path.write_text('''package agent\n\nimport (\n\t"context"\n\t"database/sql"\n\t"encoding/json"\n\n\t"github.com/rushairer/blog-backend/internal/domain"\n)\n\ntype RunnerRunStore interface {\n\tCreateRun(context.Context, *domain.AgentRun) error\n\tStartRun(context.Context, int64) error\n\tSaveRunCitations(context.Context, int64, []domain.AgentCitation) error\n\tGetRun(context.Context, int64) (*domain.AgentRun, error)\n\tListRuns(context.Context, int64, int, int) ([]*domain.AgentRun, int, error)\n\tDailyRunCount(context.Context, int64) (int, error)\n\tMonthlyTokenUsage(context.Context, int64) (int64, error)\n\tCreateToolCall(context.Context, *domain.AgentToolCall) error\n\tFinishToolCall(context.Context, int64, domain.ToolCallStatus, json.RawMessage, *string) error\n\tListToolCalls(context.Context, int64) ([]*domain.AgentToolCall, error)\n\tRecordUsage(context.Context, *domain.UsageEvent) error\n}\n\ntype RunnerApprovalStore interface {\n\tCreateApproval(context.Context, *domain.AgentApproval) error\n}\n\ntype RunnerWorkflowScopeStore interface {\n\tWorkflowScopePolicy(context.Context, int64) (domain.WorkflowScopePolicy, error)\n\tWorkflowResourceAccess(context.Context, int64, string, string) (string, bool, error)\n\tAddDiscoveredWorkflowResource(context.Context, int64, string, string, string, json.RawMessage) error\n}\n\ntype RunnerMediaCandidateStore interface {\n\tCreateMediaCandidateFromRun(context.Context, int64, int64, string, string, string, string) (int64, *int64, error)\n}\n\ntype RunnerNotificationWriter interface {\n\tCreate(context.Context, int64, string, string, string, string, string) error\n}\n\ntype RunnerRunLifecycle interface {\n\tFinishRun(context.Context, int64, domain.AgentRunStatus, string, int64, int64, *string, *string) error\n\tDeleteRun(context.Context, int64) error\n}\n\ntype RunLifecycleRunStore interface {\n\tFinishRun(context.Context, int64, domain.AgentRunStatus, string, int64, int64, *string, *string) error\n\tLockRunStatus(context.Context, *sql.Tx, int64) (domain.AgentRunStatus, error)\n\tDeleteRunTx(context.Context, *sql.Tx, int64) error\n}\n\ntype RunLifecycleMediaStore interface {\n\tSyncRunTokenUsage(context.Context, int64, int64, int64) error\n\tDeleteBySourceRunTx(context.Context, *sql.Tx, int64) error\n}\n\ntype RunnerDependencies struct {\n\tRuns            RunnerRunStore\n\tApprovals       RunnerApprovalStore\n\tWorkflowScopes  RunnerWorkflowScopeStore\n\tMediaCandidates RunnerMediaCandidateStore\n\tNotifications   RunnerNotificationWriter\n\tLifecycle       RunnerRunLifecycle\n}\n''')

lifecycle_path = ROOT / "blog-backend/internal/agent/run_lifecycle.go"
if lifecycle_path.exists():
    raise SystemExit('run_lifecycle.go already exists')
lifecycle_path.write_text('''package agent\n\nimport (\n\t"context"\n\t"database/sql"\n\t"errors"\n\n\t"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/domain"\n)\n\ntype RunLifecycle struct {\n\ttransactor *dbtx.Transactor\n\truns       RunLifecycleRunStore\n\tmedia      RunLifecycleMediaStore\n}\n\nfunc NewRunLifecycle(transactor *dbtx.Transactor, runs RunLifecycleRunStore, media RunLifecycleMediaStore) *RunLifecycle {\n\treturn &RunLifecycle{transactor: transactor, runs: runs, media: media}\n}\n\nfunc (l *RunLifecycle) FinishRun(ctx context.Context, id int64, status domain.AgentRunStatus, summary string, inputTokens, outputTokens int64, errorCode, errorMessage *string) error {\n\tif err := l.runs.FinishRun(ctx, id, status, summary, inputTokens, outputTokens, errorCode, errorMessage); err != nil {\n\t\treturn err\n\t}\n\treturn l.media.SyncRunTokenUsage(ctx, id, inputTokens, outputTokens)\n}\n\nfunc (l *RunLifecycle) DeleteRun(ctx context.Context, runID int64) error {\n\treturn l.transactor.Run(ctx, func(tx *sql.Tx) error {\n\t\tstatus, err := l.runs.LockRunStatus(ctx, tx, runID)\n\t\tif err != nil {\n\t\t\treturn err\n\t\t}\n\t\tif status != domain.AgentRunSucceeded && status != domain.AgentRunFailed && status != domain.AgentRunCancelled {\n\t\t\treturn errors.New("only completed Agent runs can be deleted")\n\t\t}\n\t\tif err := l.media.DeleteBySourceRunTx(ctx, tx, runID); err != nil {\n\t\t\treturn err\n\t\t}\n\t\treturn l.runs.DeleteRunTx(ctx, tx, runID)\n\t})\n}\n''')

web_path = ROOT / "blog-backend/cmd/gouno/web.go"
web = web_path.read_text()
web = replace_once(web, '\t"github.com/rushairer/blog-backend/internal/repository"\n', '', 'web root repository import')
web = replace_once(web, '\t\tagentRepo := repository.NewAgentRepository(cfg.DB)\n', '', 'web flat agent repository construction')
web = replace_once(
    web,
    '''\t\tagentMediaCandidateRepo := agentrepository.NewMediaCandidateRepository(cfg.DB)\n\t\tworkflowInteractionRepo := workflowrepository.NewInteractionRepository(cfg.DB)\n''',
    '''\t\tagentMediaCandidateRepo := agentrepository.NewMediaCandidateRepository(cfg.DB)\n\t\tworkflowInteractionRepo := workflowrepository.NewInteractionRepository(cfg.DB)\n\t\tworkflowScopeRepo := workflowrepository.NewScopeRepository(cfg.DB)\n\t\trunLifecycle := agentservice.NewRunLifecycle(transactor, agentRunRepo, agentMediaCandidateRepo)\n''',
    'web canonical runner repositories',
)
web = replace_once(
    web,
    '\t\trunner := agentservice.NewRunner(agentRepo, management, toolRegistry, postSvc)\n',
    '''\t\trunner := agentservice.NewRunner(agentservice.RunnerDependencies{\n\t\t\tRuns: agentRunRepo, Approvals: agentApprovalRepo, WorkflowScopes: workflowScopeRepo,\n\t\t\tMediaCandidates: agentMediaCandidateRepo, Notifications: notificationRepo, Lifecycle: runLifecycle,\n\t\t}, management, toolRegistry, postSvc)\n''',
    'web runner construction',
)
if 'repository.NewAgentRepository' in web:
    raise SystemExit('web still constructs flat AgentRepository')
web_path.write_text(web)

scope_test_path = ROOT / "blog-backend/internal/agent/runner_scope_integration_test.go"
scope_test = scope_test_path.read_text()
scope_test = replace_once(
    scope_test,
    '\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '\tworkflowrepository "github.com/rushairer/blog-backend/internal/workflow/repository"\n',
    'runner scope root repository import',
)
scope_test = replace_once(
    scope_test,
    '\t\trepo: repository.NewAgentRepository(db),\n',
    '\t\tworkflowScopes: workflowrepository.NewScopeRepository(db),\n',
    'runner scope dependency',
)
scope_test = replace_once(
    scope_test,
    'runner.repo.WorkflowResourceAccess(ctx, runID, "post", "303")',
    'runner.workflowScopes.WorkflowResourceAccess(ctx, runID, "post", "303")',
    'runner scope assertion',
)
scope_test_path.write_text(scope_test)

for rel in [
    "blog-backend/internal/repository/agent_definition_repository.go",
    "blog-backend/internal/repository/agent_repository.go",
    "blog-backend/internal/repository/approval_repository.go",
    "blog-backend/internal/repository/media_candidate_repository.go",
    "blog-backend/internal/repository/run_repository.go",
    "blog-backend/internal/repository/system_notification_repository.go",
    "blog-backend/internal/repository/workflow_scope_repository.go",
]:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'expected legacy facade missing before migration: {rel}')
    path.unlink()

arch_path = ROOT / "blog-backend/ARCHITECTURE_CONVERGENCE.md"
lines = arch_path.read_text().splitlines()
out = []
for line in lines:
    if line.startswith('| **Agent** |'):
        out.append('| **Agent** | Agent definitions, Skills/versions, Runs, Tool Calls, Usage, Approvals, Media Candidates and Generation Audits; primarily `ai_agents`, `ai_skills`, `ai_skill_versions`, `ai_agent_runs`, `ai_tool_calls`, `ai_usage_events`, `ai_approvals`, `ai_media_candidates`, `ai_generation_audits` | `internal/agent` and `internal/agent/repository` | Outbound to Provider, Workflow, Media, Post, Page, PostVersion, Notification and Tool through consumer-sized service dependencies or ports. | Repository-local transactions for owned aggregates; `RunLifecycle` coordinates Run/MediaCandidate lifecycle and Starter Pack uses its application coordinator. | **Service dependency model converged.** Scheduler, GenerationService, ApprovalService, ManagementService and Runner all consume canonical repositories/ports. Agent HTTP ownership remains flat. |')
    elif line.startswith('| **Workflow** |'):
        out.append('| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow`, `internal/workflow/repository` | Uses Agent Runner/Management and Tool registry. Agent consumes canonical Workflow interaction/event/scope contracts rather than Workflow SQL or aggregate delegates. | Workflow application service owns execution-level transactions through `dbtx.Transactor`; repositories own persistence concerns. | **Persistence and Agent-consumer ownership converged.** ApprovalService and Runner consume Workflow-owned ports directly. HTTP ownership remains flat. |')
    elif line.startswith('| **Notification** |'):
        out.append('| **Notification** | Operator/system notification persistence in `notifications` | `internal/notification/repository` | Agent ManagementService and Runner consume the canonical Notification writer directly. | Single notification write operations; no cross-capability transaction required today. | **Agent consumers converged.** Flat notification delegates are retired. |')
    elif line.startswith('Agent remains intentionally mixed while migration is incomplete:'):
        out.append('Agent composition is now canonical at the service-dependency layer: the root constructs Provider, Definition, Skill, Notification, Starter Pack, Run, Approval, Media Candidate, Workflow Scope and GenerationAudit dependencies explicitly. `Runner` receives consumer-sized ports plus a narrow `RunLifecycle`; no flat `repository.AgentRepository` remains in the application graph.')
    elif line.startswith('| `internal/repository.AgentRepository` aggregate |'):
        continue
    elif line.startswith('| Flat Agent Definition/Run delegates'):
        continue
    elif line.startswith('| Flat Workflow scope delegates'):
        continue
    elif line.startswith('| Flat system-notification delegate'):
        continue
    elif line.startswith('- **A — migrate to capability / retire facade:**'):
        out.append('- **A — migrate to capability / retire facade:** Agent/Workflow/Operations/Knowledge controllers after their service contracts stabilize. Flat Agent repository delegates are retired.')
    else:
        out.append(line)
text = '\n'.join(out) + '\n'
start = text.index('## Migration debt priority\n')
end = text.index('Completed slices:', start)
text = text[:start] + '''## Migration debt priority\n\n1. **Workflow consolidation:** understand execution, preflight, scheduling, resource resolution, interactions, events, persistence and planning before any internal decomposition.\n2. **Controller / composition-root convergence:** move Agent/Workflow/Operations/Knowledge HTTP ownership only after service contracts are stable.\n3. **Transitional layer retirement:** delete remaining flat controller facades and stale adapters only after consumer proof and full gates.\n\n''' + text[end:]
text = text.replace(
    'Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, and **Starter Pack application coordination** now use consumer-side canonical contracts and explicit composition-root wiring. Starter Pack transaction ownership is application-level; the cross-capability Agent bootstrap aggregate and Agent-to-Workflow starter adapter are retired.',
    'Completed slices: **Agent Approval / Media Candidate / Workflow Event orchestration**, **Agent ManagementService dependency cutover**, **Starter Pack application coordination**, and **Runner dependency/lifecycle convergence** now use consumer-side canonical contracts and explicit composition-root wiring. The flat `repository.AgentRepository` aggregate and its Agent/Workflow/Notification delegates are retired; `internal/repository` remains only for the Connector-held Transactor alias until that Hold is explicitly lifted.'
)
arch_path.write_text(text)

# Fail closed on the intended ownership boundary.
for path in [runner_path, web_path, scope_test_path]:
    data = path.read_text()
    if 'github.com/rushairer/blog-backend/internal/repository' in data:
        raise SystemExit(f'{path}: unexpected root repository import remains')
if any((ROOT / rel).exists() for rel in [
    "blog-backend/internal/repository/agent_definition_repository.go",
    "blog-backend/internal/repository/agent_repository.go",
    "blog-backend/internal/repository/approval_repository.go",
    "blog-backend/internal/repository/media_candidate_repository.go",
    "blog-backend/internal/repository/run_repository.go",
    "blog-backend/internal/repository/system_notification_repository.go",
    "blog-backend/internal/repository/workflow_scope_repository.go",
]):
    raise SystemExit('one or more Agent flat facades still exist')
print('Runner convergence transform applied successfully')
