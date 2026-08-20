import { useCallback, useEffect, useState } from 'react';
import { Clock3, GitBranch, RefreshCw, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { agentApi } from '../api/agent';
import { operationsApi } from '../api/operations';
import { workflowApi } from '../api/workflows';
import type {
  Agent, AgentApproval, AgentRun, AgentSkill, ContentCandidateSet, EditorialTask,
  EmbeddingProfile, MediaCandidate, OperationalSuggestion, ProviderProfile,
  ToolDefinition, Workflow, WorkflowInteractionTask, WorkflowMetric, WorkflowRun,
} from '../agent';
import type { SkillFormValue } from '../components/agent/SkillForm';
import type { ProviderFormValue } from '../components/agent/ProviderForm';
import type { EmbeddingFormValue } from '../components/agent/EmbeddingForm';
import { WorkspaceOverview } from '../components/agent/WorkspaceOverview';
import type { ConsoleTab } from '../components/agent/WorkspaceOverview';
import { InboxWorkspace } from '../components/agent/InboxWorkspace';
import { AdvancedWorkspace } from '../components/agent/AdvancedWorkspace';
import type { AdvancedSection, DeleteTarget } from '../components/agent/AdvancedWorkspace';
import { RecordsWorkspace } from '../components/agent/AgentRunRecords';
import { WorkflowWorkspace } from '../components/agent/WorkflowWorkspace';
import { WorkflowRunRecords } from '../components/agent/WorkflowRunRecords';
import { AdminPage, AdminPageHeader, AdminPageState, Button, ConfirmDialog, Feedback, SubnavTabs, Tab, TabList, TabPanel, Tabs } from '../components/ui';
import { useI18n } from '../i18n';
import '../styles/agent-console.css';

function initialConsoleTab(): ConsoleTab {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return requested && ['overview', 'inbox', 'automation', 'records', 'advanced'].includes(requested)
    ? (requested as ConsoleTab)
    : 'overview';
}

function initialRecordType(): 'agent' | 'workflow' {
  return new URLSearchParams(window.location.search).get('record') === 'agent' ? 'agent' : 'workflow';
}

const copy = {
  en: {
    title: 'AI Workspace', pageDescription: 'Let AI find opportunities, prepare work, and keep every change under your review.',
    overview: 'Overview', inbox: 'To review', automation: 'Automation', records: 'Run center', advanced: 'Advanced settings',
    agents: 'Agents', skills: 'Skills', workflows: 'Workflows', operations: 'Operations', providers: 'Providers', knowledge: 'Knowledge index', runs: 'Runs', approvals: 'Approvals',
    createAgent: 'Create Agent', createProvider: 'Add Provider', editAgent: 'Edit Agent', editProvider: 'Edit Provider',
    agentName: 'Agent name', providerName: 'Profile name', providerType: 'Provider type', provider: 'Provider / model',
    chooseProvider: 'Choose a provider', descriptionLabel: 'Description',
    instructions: 'Agent instructions', trigger: 'Trigger', manual: 'Manual', mode: 'Execution mode',
    advisory: 'Advisory only', approvalMode: 'Create approval proposals', cron: 'Cron expression',
    timezone: 'Timezone', capabilities: 'Skill / Version', maxSteps: 'Maximum steps',
    dailyRuns: 'Daily run limit', maxInput: 'Max input tokens', maxOutput: 'Max output tokens', monthlyBudget: 'Monthly token budget',
    contentPublishMode: 'Content publication', contentPublishHint: 'Applied only when the Agent is authorized to create posts.', contentPublishApproval: 'Approval before draft', contentPublishDraft: 'Create draft', contentPublishPublish: 'Publish automatically',
    enableAgent: 'Enable this Agent', saveAgent: 'Save Agent', saving: 'Saving…', cancel: 'Cancel',
    startPreset: 'Start from a preset', startSkill: 'Apply a Skill', blankAgent: 'Blank Agent', status: 'Status', schedule: 'Schedule',
    lastRun: 'Last run', nextRun: 'Next run', actions: 'Actions', active: 'Active', paused: 'Paused',
    never: 'Never', runNow: 'Run now', edit: 'Edit', disable: 'Disable', enable: 'Enable',
    delete: 'Delete', noAgents: 'No Agents yet. Add a Provider, then create your first Agent.',
    baseUrl: 'Base URL', model: 'Model', apiKey: 'API Key', leaveBlank: 'leave blank to keep the existing key',
    timeout: 'Request timeout (seconds)', providerEnabled: 'Provider is available to Agents',
    saveProvider: 'Save Provider', test: 'Test connection', connected: 'Connection succeeded',
    keyStored: 'Encrypted key', noProviders: 'No Provider profiles configured.',
    output: 'Output', usage: 'Usage', created: 'Created', noRuns: 'No Agent runs yet.',
    awaitingApproval: 'Awaiting approval', details: 'Details', toolCalls: 'Tool calls',
    noApprovals: 'No approval proposals in this view.', before: 'Before', after: 'Proposed change',
    approve: 'Approve and execute', reject: 'Reject', all: 'All', pending: 'Pending',
    noSkills: 'No saved Skills yet. Skills are reusable governed Agent configurations.', backAdmin: 'Blog admin', loading: 'Loading AI Agent workspace…', refresh: 'Refresh',
    requestFailed: 'The request failed.', deleteAgentConfirm: 'Delete this Agent and disable future runs?',
    deleteProviderConfirm: 'Delete this Provider profile?', deleteEmbeddingConfirm: 'Delete this embedding profile?', deleteSkillConfirm: 'Delete this Skill? Existing Agents keep their current configuration.', providerNeeded: 'Create a Provider profile before adding an Agent.',
    exportProviders: 'Export', importProviders: 'Import', invalidJsonFile: 'Invalid JSON configuration file.',
    protocolMode: 'Interface mode',
    protocolModeChatCompletions: 'Chat Completions (/v1/chat/completions · standard)',
    protocolModeResponses: 'Responses API (/v1/responses · OpenAI native)',
    protocolModeGenerateContent: 'GenerateContent (Gemini native multimodal / image)',
    protocolModePredict: 'Predict (Imagen 3 dedicated)',
    protocolModeMessages: 'Messages (/v1/messages · standard)',
    streamMode: 'Stream transmission',
    streamModeAuto: 'Auto adaptive (Recommended)',
    streamModeAlways: 'Always enabled (Stream: true)',
    streamModeNever: 'Always disabled (Stream: false)',
  },
  zh: {
    title: 'AI 工作台', pageDescription: '让 AI 发现问题、准备工作；每一项变更始终由你审核决定。',
    overview: '概览', inbox: '待我处理', automation: '自动化', records: '运行中心', advanced: '高级设置',
    agents: 'Agents', skills: 'Skills', workflows: 'Workflows', operations: '运营闭环', providers: '模型连接', knowledge: '知识库', runs: '运行记录', approvals: '审批箱',
    createAgent: '创建 Agent', createProvider: '添加 Provider', editAgent: '编辑 Agent', editProvider: '编辑 Provider',
    agentName: 'Agent 名称', providerName: '配置名称', providerType: 'Provider 类型', provider: 'Provider / 模型',
    chooseProvider: '选择 Provider', descriptionLabel: '说明',
    instructions: 'Agent 指令', trigger: '触发方式', manual: '手动执行', mode: '执行模式',
    advisory: '仅分析建议', approvalMode: '生成审批提案', cron: 'Cron 表达式',
    timezone: '时区', capabilities: 'Skill / Version', maxSteps: '最大执行步数',
    dailyRuns: '每日运行上限', maxInput: '最大输入 Token', maxOutput: '最大输出 Token', monthlyBudget: '每月 Token 预算',
    contentPublishMode: '内容发布策略', contentPublishHint: '仅在 Agent 被授权创建文章时生效，模型不能自行变更此策略。', contentPublishApproval: '审批后创建草稿', contentPublishDraft: '直接创建草稿', contentPublishPublish: '显式自动发布',
    enableAgent: '启用此 Agent', saveAgent: '保存 Agent', saving: '保存中…', cancel: '取消',
    startPreset: '使用预置模板', startSkill: '应用 Skill', blankAgent: '空白 Agent', status: '状态', schedule: '执行周期',
    lastRun: '上次运行', nextRun: '下次运行', actions: '操作', active: '运行中', paused: '已暂停',
    never: '从未', runNow: '立即运行', edit: '编辑', disable: '停用', enable: '启用',
    delete: '删除', noAgents: '还没有 Agent。先添加 Provider，再创建第一个 Agent。',
    baseUrl: 'Base URL', model: '模型', apiKey: 'API Key', leaveBlank: '留空则保留现有密钥',
    timeout: '请求超时（秒）', providerEnabled: '允许 Agent 使用此 Provider',
    saveProvider: '保存 Provider', test: '测试连接', connected: '连接成功',
    keyStored: '密钥已加密', noProviders: '还没有 Provider 配置。',
    output: '输出', usage: '用量', created: '创建时间', noRuns: '还没有 Agent 运行记录。',
    awaitingApproval: '等待审批', details: '详情', toolCalls: '工具调用',
    noApprovals: '当前视图没有审批提案。', before: '变更前', after: '建议变更',
    approve: '批准并执行', reject: '拒绝', all: '全部', pending: '待审批',
    noSkills: '还没有已保存的 Skill。Skill 是可复用且受治理的 Agent 配置。', backAdmin: '博客后台', loading: '正在加载 AI Agent 工作区…', refresh: '刷新',
    requestFailed: '请求失败。', deleteAgentConfirm: '删除此 Agent 并停止后续运行？',
    deleteProviderConfirm: '删除此 Provider 配置？', deleteEmbeddingConfirm: '删除此嵌入配置？', deleteSkillConfirm: '删除此 Skill？现有 Agent 会保留当前配置。', providerNeeded: '请先创建 Provider，再添加 Agent。',
    exportProviders: '导出', importProviders: '导入', invalidJsonFile: '无效的 JSON 配置文件。',
    protocolMode: '接口协议模式',
    protocolModeChatCompletions: 'Chat Completions (/v1/chat/completions · 通用标准)',
    protocolModeResponses: 'Responses API (/v1/responses · OpenAI 原生)',
    protocolModeGenerateContent: 'GenerateContent (Gemini 原生多模态出图)',
    protocolModePredict: 'Predict (Imagen 3 专属)',
    protocolModeMessages: 'Messages (/v1/messages · 标准)',
    streamMode: '流式传输 (Stream)',
    streamModeAuto: '自动自适应 (推荐)',
    streamModeAlways: '强制开启 (Stream: true)',
    streamModeNever: '强制关闭 (Stream: false)',
  },
} as const;

let toolCatalogRequest: Promise<ToolDefinition[]> | null = null;
function loadToolCatalog(): Promise<ToolDefinition[]> {
  if (!toolCatalogRequest) toolCatalogRequest = agentApi.getToolCatalog();
  return toolCatalogRequest;
}

export default function AgentConsole() {
  const { locale, formatDateTime } = useI18n();
  const labels = copy[locale];
  const [tab, setTab] = useState<ConsoleTab>(initialConsoleTab);
  const [advancedSection, setAdvancedSection] = useState<AdvancedSection>('agents');
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [indexStatus, setIndexStatus] = useState<{ queued: number; failed: number; chunks: number }>({ queued: 0, failed: 0, chunks: 0 });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetric[]>([]);
  const [recordType, setRecordType] = useState<'agent' | 'workflow'>(initialRecordType);
  const [suggestions, setSuggestions] = useState<OperationalSuggestion[]>([]);
  const [candidateSets, setCandidateSets] = useState<ContentCandidateSet[]>([]);
  const [mediaCandidates, setMediaCandidates] = useState<MediaCandidate[]>([]);
  const [interactions, setInteractions] = useState<WorkflowInteractionTask[]>([]);
  const [editorialTasks, setEditorialTasks] = useState<EditorialTask[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<AgentApproval | null>(null);
  const [selectedRun, setSelectedRun] = useState<{ run: AgentRun; tool_calls: import('../agent').AgentToolCall[] } | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | 'new' | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderProfile | 'new' | null>(null);
  const [editingEmbedding, setEditingEmbedding] = useState<EmbeddingProfile | 'new' | null>(null);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | 'new' | null>(null);
  const [skillPrefill, setSkillPrefill] = useState<Partial<SkillFormValue> | undefined>();
  const [agentPrefill, setAgentPrefill] = useState<Partial<Omit<Agent, 'id' | 'created_at' | 'updated_at'>> | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testingConnections, setTestingConnections] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const selectTab = (nextTab: ConsoleTab) => {
    setEditingAgent(null);
    setEditingProvider(null);
    setEditingEmbedding(null);
    setEditingSkill(null);
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', nextTab);
    window.history.replaceState(null, '', url);
  };

  const selectAdvanced = (section: AdvancedSection) => {
    setEditingAgent(null);
    setEditingProvider(null);
    setEditingEmbedding(null);
    setEditingSkill(null);
    setAdvancedSection(section);
    setTab('advanced');
  };

  const load = useCallback(async () => {
    const loadWorkflowRuns = async () => {
      try {
        return await workflowApi.getRuns();
      } catch {
        return [] as WorkflowRun[];
      }
    };
    const [
      providerData, embeddingData, indexData, agentData, runData, approvalData,
      toolData, skillData, workflowData, workflowRunData, workflowMetricData,
      suggestionData, candidateData, mediaCandidateData, editorialTaskData,
    ] = await Promise.all([
      agentApi.getProviderProfiles(),
      agentApi.getEmbeddingProfiles(),
      agentApi.getIndexStatus(),
      agentApi.getAgents(),
      agentApi.getAgentRuns(100),
      agentApi.getAgentApprovals('pending', 100),
      loadToolCatalog(),
      agentApi.getAgentSkills(),
      workflowApi.getWorkflows(),
      loadWorkflowRuns(),
      workflowApi.getMetrics(),
      operationsApi.getSuggestions('all'),
      operationsApi.getCandidates(),
      operationsApi.getMediaCandidates(),
      operationsApi.getEditorialTasks(),
    ]);
    setProviders(providerData);
    setEmbeddingProfiles(embeddingData);
    setIndexStatus(indexData);
    setAgents(agentData);
    setRuns(runData || []);
    setApprovals(approvalData || []);
    setTools(toolData);
    setSkills(skillData);
    setWorkflows(workflowData);
    setWorkflowRuns(workflowRunData);
    setWorkflowMetrics(workflowMetricData || []);
    setSuggestions(suggestionData);
    setCandidateSets(candidateData);
    setMediaCandidates(mediaCandidateData);
    setEditorialTasks(editorialTaskData);
    setSelectedApproval((current) => approvalData?.find((item) => item.id === current?.id) || approvalData?.[0] || null);
  }, []);

  useEffect(() => {
    if (tab !== 'inbox') return;
    void agentApi.getInteractions().then(setInteractions).catch(() => setInteractions([]));
  }, [tab]);

  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      setLoading(false);
      void redirectToAuthorize('/admin/agents');
      return;
    }
    let ignore = false;
    setLoading(true);
    load().catch((reason: Error) => {
      if (!ignore) setError(reason.message);
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pendingCount = approvals.filter((item) => item.status === 'pending').length;

  const refresh = async () => {
    setError('');
    try {
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const mutate = async (operation: () => Promise<unknown>) => {
    setError('');
    await operation();
    await refresh();
  };

  const saveProvider = async (value: ProviderFormValue) => {
    setError('');
    try {
      const result = await agentApi.saveProviderProfileWithSetup(value);
      setEditingProvider(null);
      await refresh();
      if (result.starter_agents_created > 0) {
        setNotice(locale === 'zh' ? `已初始化 ${result.starter_agents_created} 个默认 Agent，全部保持停用，等待你审核启用。` : `Initialized ${result.starter_agents_created} default Agents. They remain disabled until reviewed.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveEmbedding = async (value: EmbeddingFormValue) => {
    setError('');
    try {
      await agentApi.saveEmbeddingProfile(value);
      setEditingEmbedding(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveAgent = async (value: Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: number }) => {
    setError('');
    try {
      await agentApi.saveAgent(value);
      setEditingAgent(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveSkill = async (value: SkillFormValue) => {
    setError('');
    try {
      await agentApi.saveAgentSkill(value);
      setEditingSkill(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const exportProviders = async () => {
    const blob = await agentApi.exportProviders();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `model-connections-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProviders = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError(labels.invalidJsonFile);
        return;
      }
      const data = await agentApi.importProviders(payload);
      await refresh();
      setNotice(locale === 'zh' ? `已成功导入 ${data.imported_count} 个模型连接。` : `Successfully imported ${data.imported_count} model connections.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const handleImportSkill = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError(labels.invalidJsonFile);
        return;
      }
      const data = await agentApi.importSkill(payload);
      await refresh();
      setNotice(locale === 'zh' ? `已成功导入 Skill“${data.name || file.name}”。` : `Successfully imported Skill “${data.name || file.name}”.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const exportSkill = async (skill: AgentSkill) => {
    const blob = await agentApi.exportSkill(skill.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `skill-${skill.id}-v${skill.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copySkill = async (skill: AgentSkill) => {
    const name = window.prompt(locale === 'zh' ? '复制后的 Skill 名称' : 'Name for the copied Skill', `${skill.name} Copy`);
    if (!name?.trim()) return;
    try {
      await mutate(() => agentApi.copySkill(skill.id, name.trim()));
      setNotice(locale === 'zh' ? `已创建 Skill“${name.trim()}”的自定义副本。` : `Created custom Skill copy “${name.trim()}”.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveWorkflow = async (value: {
    id?: number; name: string; description: string; enabled: boolean;
    cron_expression?: string; timezone: string; input_schema: Record<string, unknown>;
    steps: import('../agent').WorkflowStep[]; scope_policy: import('../agent').WorkflowScopePolicy;
  }) => {
    await workflowApi.save(value);
    await refresh();
  };

  const queueWorkflow = async (workflowID: number, dryRun: boolean, input: Record<string, unknown>) => {
    setError('');
    const result = await workflowApi.run(workflowID, input, dryRun);
    await refresh();
    return result;
  };

  const preflightWorkflow = async (workflowID: number, dryRun: boolean, input: Record<string, unknown>) => {
    return workflowApi.preflight(workflowID, input, dryRun);
  };

  const runAgent = async (agent: Agent) => {
    try {
      await mutate(() => agentApi.runAgent(agent.id));
      selectTab('records');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const testConnection = async (kind: 'provider' | 'embedding', id: number, name: string) => {
    const key = `${kind}:${id}`;
    setTestingConnections((current) => (current.includes(key) ? current : [...current, key]));
    setError('');
    setNotice('');
    try {
      await (kind === 'provider' ? agentApi.testProvider(id) : agentApi.testEmbedding(id));
      setNotice(locale === 'zh' ? `${name}：连接成功` : `${name}: connection succeeded`);
    } catch (reason) {
      setError(locale === 'zh' ? `${name}：${reason instanceof Error ? reason.message : labels.requestFailed}` : `${name}: ${reason instanceof Error ? reason.message : labels.requestFailed}`);
    } finally {
      setTestingConnections((current) => current.filter((item) => item !== key));
    }
  };

  const inspectRun = async (run: AgentRun) => {
    try {
      const detail = await agentApi.getAgentRunDetail(String(run.id));
      setSelectedRun(detail);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const review = async (approval: AgentApproval, approved: boolean) => {
    try {
      await mutate(() => agentApi.reviewApproval(approval.id, approved));
      const sourceRun = runs.find((run) => run.id === approval.run_id);
      if (approved && sourceRun?.workflow_run_id) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'records');
        url.searchParams.set('record', 'workflow');
        url.searchParams.set('run', String(sourceRun.workflow_run_id));
        window.history.replaceState(null, '', url);
        setRecordType('workflow');
        setTab('records');
        setNotice(locale === 'zh' ? '已批准。图片正在本次 Workflow 运行中生成，完成后可在此选择、预览和应用。' : 'Approved. Images are generating in this Workflow Run; choose, preview, and apply them here when ready.');
        return;
      }
      setNotice(approved ? labels.approve : labels.reject);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const deleteAgentRun = async (run: AgentRun) => {
    if (!window.confirm(locale === 'zh' ? '删除这条终态 Agent 运行记录及其附属日志？文章和媒体文件不会被删除。' : 'Delete this completed Agent run and its attached logs? Posts and media files are kept.')) return;
    try {
      await mutate(() => agentApi.deleteAgentRun(String(run.id)));
      setSelectedRun(null);
      setNotice(locale === 'zh' ? '运行记录已清理。' : 'Run record deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const deleteSelected = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'agent') await mutate(() => agentApi.deleteAgent(deleteTarget.value.id));
      else if (deleteTarget.kind === 'provider') await mutate(() => agentApi.deleteProviderProfile(deleteTarget.value.id));
      else if (deleteTarget.kind === 'skill') await mutate(() => agentApi.deleteAgentSkill(deleteTarget.value.id));
      else await mutate(() => agentApi.deleteEmbeddingProfile(deleteTarget.value.id));
      setDeleteTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  if (loading) return <AdminPageState title={labels.title} description={labels.pageDescription} label={labels.loading} />;

  const tabs = [
    ['overview', Sparkles, labels.overview],
    ['inbox', ShieldCheck, labels.inbox],
    ['automation', GitBranch, labels.automation],
    ['records', Clock3, labels.records],
    ['advanced', Settings2, labels.advanced],
  ] as const;

  return (
    <AdminPage className="agent-console">
      <AdminPageHeader
        title={labels.title}
        description={labels.pageDescription}
        actions={
          <Button variant="secondary" type="button" onClick={() => void refresh()}>
            <RefreshCw />{labels.refresh}
          </Button>
        }
      />
      {error || notice ? (
        <div className="agent-console__toasts" aria-live="polite">
          {error ? (
            <div className="agent-console__toast">
              <Feedback type="error">{error}</Feedback>
              <button
                type="button"
                title={locale === 'zh' ? '关闭提示' : 'Dismiss notification'}
                aria-label={locale === 'zh' ? '关闭提示' : 'Dismiss notification'}
                onClick={() => setError('')}
              >
                <X />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="agent-console__toast">
              <Feedback type="success">{notice}</Feedback>
              <button
                type="button"
                title={locale === 'zh' ? '关闭提示' : 'Dismiss notification'}
                aria-label={locale === 'zh' ? '关闭提示' : 'Dismiss notification'}
                onClick={() => setNotice('')}
              >
                <X />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={(value) => selectTab(value as ConsoleTab)} id="agent-workspace">
        <TabList label={labels.title}>
          {tabs.map(([value, Icon, label]) => (
            <Tab key={value} value={value}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {value === 'inbox' && pendingCount > 0 ? <b>{pendingCount}</b> : null}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={tab}>
          <div className="agent-console__main">
            {tab === 'overview' ? (
              <WorkspaceOverview
                locale={locale}
                approvals={approvals}
                suggestions={suggestions}
                candidateSets={candidateSets}
                mediaCandidates={mediaCandidates}
                workflows={workflows}
                onNavigate={selectTab}
              />
            ) : null}

            {tab === 'automation' ? (
              <WorkflowWorkspace
                workflows={workflows}
                runs={workflowRuns}
                metrics={workflowMetrics}
                agents={agents}
                tools={tools}
                locale={locale}
                onRun={queueWorkflow}
                onPreflight={preflightWorkflow}
                onRefresh={refresh}
                onSave={saveWorkflow}
                onConfigureSkill={(draft) => {
                  if (!draft) return;
                  setSkillPrefill({
                    name: draft.name || '',
                    description: draft.description || '',
                    system_prompt: draft.system_prompt || '',
                    capabilities: draft.capabilities || [],
                    execution_mode: draft.execution_mode || 'approval',
                    content_publish_mode: 'approval',
                  });
                  setEditingSkill('new');
                  setAdvancedSection('skills');
                  setTab('advanced');
                }}
                onConfigureAgent={(draft) => {
                  if (!draft) return;
                  const provider =
                    providers.find((item) => item.enabled && item.is_default_writing) ||
                    providers.find((item) => item.enabled);
                  setAgentPrefill({
                    name: draft.name || '',
                    description: draft.description || '',
                    provider_profile_id: draft.provider_profile_id || provider?.id || 0,
                    skill_version_id: draft.skill_version_id || skills[0]?.version_id || 0,
                    enabled: false,
                    trigger_type: 'manual',
                    timezone: 'Asia/Shanghai',
                    daily_run_limit: 10,
                    monthly_token_budget: 1000000,
                  });
                  setEditingAgent('new');
                  setAdvancedSection('agents');
                  setTab('advanced');
                }}
              />
            ) : null}

            {tab === 'inbox' ? (
              <InboxWorkspace
                locale={locale}
                approvals={approvals}
                selectedApproval={selectedApproval}
                onSelectApproval={setSelectedApproval}
                onReviewApproval={review}
                interactions={interactions}
                onResolvedInteraction={refresh}
                suggestions={suggestions}
                candidateSets={candidateSets}
                mediaCandidates={mediaCandidates}
                editorialTasks={editorialTasks}
                onRefresh={refresh}
              />
            ) : null}

            {tab === 'records' ? (
              <div className="records-hub section-stack">
                <SubnavTabs
                  label={locale === 'zh' ? '运行中心类型' : 'Run center type'}
                  value={recordType}
                  onValueChange={(value) => {
                    const next = value as typeof recordType;
                    setRecordType(next);
                    const url = new URL(window.location.href);
                    url.searchParams.set('record', next);
                    window.history.replaceState(null, '', url);
                  }}
                  items={[
                    { value: 'workflow', label: locale === 'zh' ? 'Workflow 任务' : 'Workflow tasks' },
                    { value: 'agent', label: locale === 'zh' ? 'Agent 运行' : 'Agent runs' },
                  ]}
                />
                {recordType === 'agent' ? (
                  <RecordsWorkspace
                    locale={locale}
                    runs={runs}
                    agents={agents}
                    selectedRun={selectedRun}
                    onInspect={(run) => void inspectRun(run)}
                    onClearInspect={() => setSelectedRun(null)}
                    onDelete={(run) => void deleteAgentRun(run)}
                    formatDateTime={formatDateTime}
                  />
                ) : (
                  <WorkflowRunRecords
                    locale={locale}
                    workflows={workflows}
                    runs={workflowRuns}
                    formatDateTime={formatDateTime}
                    onRefresh={refresh}
                  />
                )}
              </div>
            ) : null}

            {tab === 'advanced' ? (
              <AdvancedWorkspace
                locale={locale}
                labels={labels}
                advancedSection={advancedSection}
                onSelectSection={selectAdvanced}
                agents={agents}
                skills={skills}
                tools={tools}
                providers={providers}
                embeddingProfiles={embeddingProfiles}
                runs={runs}
                indexStatus={indexStatus}
                editingAgent={editingAgent}
                editingProvider={editingProvider}
                editingEmbedding={editingEmbedding}
                editingSkill={editingSkill}
                agentPrefill={agentPrefill}
                skillPrefill={skillPrefill}
                testingConnections={testingConnections}
                onEditAgent={setEditingAgent}
                onEditProvider={setEditingProvider}
                onEditEmbedding={setEditingEmbedding}
                onEditSkill={setEditingSkill}
                onSaveAgent={saveAgent}
                onSaveProvider={saveProvider}
                onSaveEmbedding={saveEmbedding}
                onSaveSkill={saveSkill}
                onRunAgent={runAgent}
                onToggleAgentEnabled={(agent) =>
                  mutate(() => agentApi.setAgentEnabled(agent.id, !agent.enabled)).catch((reason: Error) =>
                    setError(reason.message)
                  )
                }
                onSetDefaultProvider={(id, usage) =>
                  mutate(() => agentApi.setDefaultProvider(id, usage))
                    .then(() => setNotice(usage === 'writing' ? '默认写作模型已更新' : '默认图片模型已更新'))
                    .catch((reason: Error) => setError(reason.message))
                }
                onTestConnection={testConnection}
                onExportProviders={exportProviders}
                onImportProviders={handleImportProviders}
                onExportSkill={(skill) => exportSkill(skill).catch((reason: Error) => setError(reason.message))}
                onImportSkill={handleImportSkill}
                onCopySkill={copySkill}
                onRetryIndex={() => mutate(() => agentApi.retryIndex())}
                onRebuildIndex={() => mutate(() => agentApi.rebuildIndex())}
                onDeleteTarget={setDeleteTarget}
                onError={setError}
                onRefresh={refresh}
                formatDateTime={formatDateTime}
              />
            ) : null}
          </div>
        </TabPanel>
      </Tabs>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === 'agent'
            ? labels.deleteAgentConfirm
            : deleteTarget?.kind === 'embedding'
            ? labels.deleteEmbeddingConfirm
            : deleteTarget?.kind === 'skill'
            ? labels.deleteSkillConfirm
            : labels.deleteProviderConfirm
        }
        description={
          deleteTarget?.kind === 'agent'
            ? labels.deleteAgentConfirm
            : deleteTarget?.kind === 'embedding'
            ? labels.deleteEmbeddingConfirm
            : deleteTarget?.kind === 'skill'
            ? labels.deleteSkillConfirm
            : labels.deleteProviderConfirm
        }
        confirmLabel={labels.delete}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteSelected}
      />
    </AdminPage>
  );
}
