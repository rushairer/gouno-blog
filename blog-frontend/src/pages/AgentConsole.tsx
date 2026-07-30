import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot, Check, ChevronRight, CirclePause, Clock3, KeyRound, ListChecks, Play,
  Plus, RefreshCw, Settings2, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import type {
  Agent, AgentApproval, AgentPreset, AgentRun, AgentToolCall, ProviderProfile, ToolDefinition,
} from '../agent';
import { AgentForm } from '../components/agent/AgentForm';
import { ProviderForm } from '../components/agent/ProviderForm';
import type { ProviderFormValue } from '../components/agent/ProviderForm';
import { AdminPage, AdminPageHeader, AdminPageState, ConfirmDialog, EmptyState, Feedback, Panel } from '../components/ui';
import { useI18n } from '../i18n';
import '../styles/agent-console.css';

type ConsoleTab = 'agents' | 'providers' | 'runs' | 'approvals';
type DeleteTarget = { kind: 'agent'; value: Agent } | { kind: 'provider'; value: ProviderProfile } | null;

const copy = {
  en: {
    title: 'AI Workspace', pageDescription: 'Configure providers, automate blog operations, and review every proposed change.',
    agents: 'Agents', providers: 'Providers', runs: 'Runs', approvals: 'Approvals',
    createAgent: 'Create Agent', createProvider: 'Add Provider', editAgent: 'Edit Agent', editProvider: 'Edit Provider',
    agentName: 'Agent name', providerName: 'Profile name', providerType: 'Provider type', provider: 'Provider / model',
    chooseProvider: 'Choose a provider', descriptionLabel: 'Description',
    instructions: 'Agent instructions', trigger: 'Trigger', manual: 'Manual', mode: 'Execution mode',
    advisory: 'Advisory only', approvalMode: 'Create approval proposals', cron: 'Cron expression',
    timezone: 'Timezone', capabilities: 'Authorized capabilities', maxSteps: 'Maximum steps',
    dailyRuns: 'Daily run limit', maxInput: 'Max input tokens', maxOutput: 'Max output tokens', monthlyBudget: 'Monthly token budget',
    enableAgent: 'Enable this Agent', saveAgent: 'Save Agent', saving: 'Saving…', cancel: 'Cancel',
    startPreset: 'Start from a preset', blankAgent: 'Blank Agent', status: 'Status', schedule: 'Schedule',
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
    backAdmin: 'Blog admin', loading: 'Loading AI Agent workspace…', refresh: 'Refresh',
    requestFailed: 'The request failed.', deleteAgentConfirm: 'Delete this Agent and disable future runs?',
    deleteProviderConfirm: 'Delete this Provider profile?', providerNeeded: 'Create a Provider profile before adding an Agent.',
  },
  zh: {
    title: 'AI 工作台', pageDescription: '配置模型供应商、自动运营博客，并审核每一项内容变更。',
    agents: 'Agents', providers: 'Providers', runs: '运行记录', approvals: '审批箱',
    createAgent: '创建 Agent', createProvider: '添加 Provider', editAgent: '编辑 Agent', editProvider: '编辑 Provider',
    agentName: 'Agent 名称', providerName: '配置名称', providerType: 'Provider 类型', provider: 'Provider / 模型',
    chooseProvider: '选择 Provider', descriptionLabel: '说明',
    instructions: 'Agent 指令', trigger: '触发方式', manual: '手动执行', mode: '执行模式',
    advisory: '仅分析建议', approvalMode: '生成审批提案', cron: 'Cron 表达式',
    timezone: '时区', capabilities: '授权能力', maxSteps: '最大执行步数',
    dailyRuns: '每日运行上限', maxInput: '最大输入 Token', maxOutput: '最大输出 Token', monthlyBudget: '每月 Token 预算',
    enableAgent: '启用此 Agent', saveAgent: '保存 Agent', saving: '保存中…', cancel: '取消',
    startPreset: '使用预置模板', blankAgent: '空白 Agent', status: '状态', schedule: '执行周期',
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
    backAdmin: '博客后台', loading: '正在加载 AI Agent 工作区…', refresh: '刷新',
    requestFailed: '请求失败。', deleteAgentConfirm: '删除此 Agent 并停止后续运行？',
    deleteProviderConfirm: '删除此 Provider 配置？', providerNeeded: '请先创建 Provider，再添加 Agent。',
  },
} as const;

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || copy.en.requestFailed);
  return body.data as T;
}

function formatCapability(value: string) {
  return value.replace('.', ' / ').replaceAll('_', ' ');
}

function JsonPreview({ value }: { value: unknown }) {
  return <pre className="agent-json-preview">{JSON.stringify(value || {}, null, 2)}</pre>;
}

type AuditCheck = { code?: string; severity?: string; message?: string };
type AuditResult = { post_id?: number; metrics?: Record<string, unknown>; checks?: AuditCheck[] };

function contentAuditResult(value: unknown): AuditResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as AuditResult;
  if (!result.metrics || !Array.isArray(result.checks)) return null;
  return result;
}

function ContentAudit({ value, locale }: { value: unknown; locale: 'en' | 'zh' }) {
  const result = contentAuditResult(value);
  if (!result) return null;
	const checks = result.checks || [];
  const labels = locale === 'zh' ? {
    title: '内容检查', clear: '未发现需要处理的问题', issues: '检查项',
    titleCharacters: '标题字符', summaryCharacters: '摘要字符', seoTitleCharacters: 'SEO 标题字符',
    seoDescriptionCharacters: 'SEO 描述字符', contentCharacters: '正文字数', headings: '标题数',
    images: '图片数', missingAlt: '缺失 Alt', internalLinks: '站内链接', externalLinks: '外部链接',
  } : {
    title: 'Content audit', clear: 'No issues detected', issues: 'Checks',
    titleCharacters: 'Title chars', summaryCharacters: 'Summary chars', seoTitleCharacters: 'SEO title chars',
    seoDescriptionCharacters: 'SEO description chars', contentCharacters: 'Content chars', headings: 'Headings',
    images: 'Images', missingAlt: 'Missing alt', internalLinks: 'Internal links', externalLinks: 'External links',
  };
  const metricLabels: Array<[string, string]> = [
    ['title_characters', labels.titleCharacters], ['summary_characters', labels.summaryCharacters],
    ['seo_title_characters', labels.seoTitleCharacters], ['seo_description_characters', labels.seoDescriptionCharacters],
    ['content_characters', labels.contentCharacters], ['heading_count', labels.headings], ['image_count', labels.images],
    ['images_missing_alt', labels.missingAlt], ['internal_link_count', labels.internalLinks], ['external_link_count', labels.externalLinks],
  ];
  return <section className="content-audit" aria-label={labels.title}>
    <div className="content-audit__heading"><h3>{labels.title}</h3>{result.post_id ? <small>#{result.post_id}</small> : null}</div>
    <dl className="content-audit__metrics">{metricLabels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(result.metrics?.[key] ?? 0)}</dd></div>)}</dl>
    <div className="content-audit__checks"><strong>{labels.issues}</strong>{checks.length === 0 ? <p>{labels.clear}</p> : <ul>{checks.map((check, index) => <li key={`${check.code}-${index}`} className={`content-audit__check--${check.severity || 'info'}`}><span>{check.severity || 'info'}</span><div><b>{check.code?.replaceAll('_', ' ')}</b><p>{check.message}</p></div></li>)}</ul>}</div>
  </section>;
}

type InternalLinkSuggestion = { post_id?: number; title?: string; slug?: string; summary?: string; score?: number; match_hints?: string[] };

function internalLinkSuggestions(value: unknown): InternalLinkSuggestion[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions) ? suggestions as InternalLinkSuggestion[] : null;
}

function InternalLinkSuggestions({ value, locale }: { value: unknown; locale: 'en' | 'zh' }) {
  const suggestions = internalLinkSuggestions(value);
  if (!suggestions) return null;
  const labels = locale === 'zh'
    ? { title: '站内链接建议', empty: '未找到尚未链接的相关文章。', score: '匹配分', evidence: '匹配依据', open: '打开文章' }
    : { title: 'Internal link suggestions', empty: 'No relevant, unlinked articles found.', score: 'Match score', evidence: 'Evidence', open: 'Open article' };
  return <section className="internal-link-suggestions" aria-label={labels.title}>
    <div className="content-audit__heading"><h3>{labels.title}</h3></div>
    {suggestions.length === 0 ? <p>{labels.empty}</p> : <ul>{suggestions.map((suggestion) => <li key={suggestion.post_id || suggestion.slug}>
      <div><a href={`/articles/${encodeURIComponent(suggestion.slug || '')}`} aria-label={`${labels.open}: ${suggestion.title || suggestion.slug}`}>{suggestion.title || suggestion.slug}</a>{suggestion.summary ? <p>{suggestion.summary}</p> : null}</div>
      <div className="internal-link-suggestions__meta"><span>{labels.score} {suggestion.score || 0}</span>{suggestion.match_hints?.length ? <small>{labels.evidence}: {suggestion.match_hints.join(' · ')}</small> : null}</div>
    </li>)}</ul>}
  </section>;
}

export default function AgentConsole() {
  const { locale, formatDateTime } = useI18n();
  const labels = copy[locale];
  const [tab, setTab] = useState<ConsoleTab>('agents');
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<AgentApproval | null>(null);
  const [selectedRun, setSelectedRun] = useState<{ run: AgentRun; tool_calls: AgentToolCall[] } | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | 'new' | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderProfile | 'new' | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const load = useCallback(async () => {
    const approvalStatus = approvalFilter;
    const [providerData, agentData, runData, approvalData, toolData, presetData] = await Promise.all([
      readData<ProviderProfile[]>(await apiFetch('/api/admin/provider-profiles')),
      readData<Agent[]>(await apiFetch('/api/admin/agents')),
      readData<{ list: AgentRun[] }>(await apiFetch('/api/admin/agent-runs?pageSize=100')),
      readData<{ list: AgentApproval[] }>(await apiFetch(`/api/admin/agent-approvals?status=${approvalStatus}&pageSize=100`)),
      readData<ToolDefinition[]>(await apiFetch('/api/admin/agent-tools')),
      readData<AgentPreset[]>(await apiFetch('/api/admin/agent-presets')),
    ]);
    setProviders(providerData);
    setAgents(agentData);
    setRuns(runData.list || []);
    setApprovals(approvalData.list || []);
    setTools(toolData);
    setPresets(presetData);
    setSelectedApproval((current) => approvalData.list?.find((item) => item.id === current?.id) || approvalData.list?.[0] || null);
  }, [approvalFilter]);

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

  const providerMap = useMemo(() => new Map(providers.map((item) => [item.id, item])), [providers]);
  const agentMap = useMemo(() => new Map(agents.map((item) => [item.id, item])), [agents]);
  const pendingCount = approvals.filter((item) => item.status === 'pending').length;

  const refresh = async () => {
    setError('');
    try {
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveProvider = async (value: ProviderFormValue) => {
    setError('');
    try {
      const response = await apiFetch(value.id ? `/api/admin/provider-profiles/${value.id}` : '/api/admin/provider-profiles', {
        method: value.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      await readData<ProviderProfile>(response);
      setEditingProvider(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveAgent = async (value: Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: number }) => {
    setError('');
    try {
      const response = await apiFetch(value.id ? `/api/admin/agents/${value.id}` : '/api/admin/agents', {
        method: value.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      await readData<Agent>(response);
      setEditingAgent(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const mutate = async (path: string, method = 'POST', body?: unknown) => {
    setError('');
    const response = await apiFetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    await readData<unknown>(response);
    await refresh();
  };

  const runAgent = async (agent: Agent) => {
    try {
      await mutate(`/api/admin/agents/${agent.id}/run`);
      setTab('runs');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const inspectRun = async (run: AgentRun) => {
    try {
      const detail = await readData<{ run: AgentRun; tool_calls: AgentToolCall[] }>(await apiFetch(`/api/admin/agent-runs/${run.id}`));
      setSelectedRun(detail);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const review = async (approval: AgentApproval, approved: boolean) => {
    try {
      await mutate(`/api/admin/agent-approvals/${approval.id}/${approved ? 'approve' : 'reject'}`, 'POST', { note: '' });
      setNotice(approved ? labels.approve : labels.reject);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  if (loading) return <AdminPageState title={labels.title} description={labels.pageDescription} label={labels.loading} />;

  const deleteSelected = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'agent') await mutate(`/api/admin/agents/${deleteTarget.value.id}`, 'DELETE');
      else await mutate(`/api/admin/provider-profiles/${deleteTarget.value.id}`, 'DELETE');
      setDeleteTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const tabs = [
    ['agents', Bot, labels.agents],
    ['providers', KeyRound, labels.providers],
    ['runs', Clock3, labels.runs],
    ['approvals', ShieldCheck, labels.approvals],
  ] as const;

  return <AdminPage className="agent-console">
    <AdminPageHeader title={labels.title} description={labels.pageDescription} actions={<div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => void refresh()}><RefreshCw />{labels.refresh}</button>{tab === 'agents' ? <button className="btn btn-primary" type="button" onClick={() => providers.length > 0 ? setEditingAgent('new') : setError(labels.providerNeeded)}><Plus />{labels.createAgent}</button> : tab === 'providers' ? <button className="btn btn-primary" type="button" onClick={() => setEditingProvider('new')}><Plus />{labels.createProvider}</button> : null}</div>} />
    {error ? <Feedback type="error">{error}</Feedback> : null}
    {notice ? <Feedback type="success">{notice}</Feedback> : null}
    <div className="agent-console__layout">
      <nav className="agent-console__nav" aria-label={labels.title}>
        {tabs.map(([value, Icon, label]) => <button key={value} aria-label={label} className={tab === value ? 'active' : ''} type="button" onClick={() => setTab(value)}><Icon /><span>{label}</span>{value === 'approvals' && pendingCount > 0 ? <b>{pendingCount}</b> : null}</button>)}
      </nav>

      <div className="agent-console__main">
        {editingProvider ? <ProviderForm key={editingProvider === 'new' ? 'new' : editingProvider.id} initial={editingProvider === 'new' ? undefined : editingProvider} labels={labels} onSave={saveProvider} onCancel={() => setEditingProvider(null)} /> : null}
        {editingAgent ? <AgentForm key={editingAgent === 'new' ? 'new' : editingAgent.id} initial={editingAgent === 'new' ? undefined : editingAgent} providers={providers} tools={tools} presets={presets} labels={labels} onSave={saveAgent} onCancel={() => setEditingAgent(null)} /> : null}

        {!editingAgent && !editingProvider && tab === 'agents' ? <Panel className="agent-table-panel">
          {agents.length === 0 ? <div className="agent-empty-state"><Bot aria-hidden="true" /><h2>{locale === 'zh' ? '还没有 Agent' : 'No Agents yet'}</h2><p>{labels.noAgents}</p><button className="text-link" type="button" onClick={() => setTab('providers')}><KeyRound />{locale === 'zh' ? '先配置 Provider' : 'Configure a Provider first'}<ChevronRight /></button></div> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.agents}</th><th>{labels.status}</th><th>{labels.provider}</th><th>{labels.schedule}</th><th>{labels.capabilities}</th><th>{labels.lastRun}</th><th>{labels.nextRun}</th><th>{labels.actions}</th></tr></thead><tbody>{agents.map((agent) => {
            const provider = providerMap.get(agent.provider_profile_id);
            const latestRun = runs.find((run) => run.agent_id === agent.id);
            return <tr key={agent.id}><td><div className="agent-identity"><span><Bot /></span><div><strong>{agent.name}</strong><small>{agent.description}</small></div></div></td><td><span className={`agent-state agent-state--${agent.enabled ? 'active' : 'paused'}`}><i />{agent.enabled ? labels.active : labels.paused}</span></td><td><strong>{provider?.name || '—'}</strong><small className="mono">{provider?.model || '—'}</small></td><td><strong>{agent.trigger_type === 'cron' ? agent.cron_expression : labels.manual}</strong><small>{agent.timezone}</small></td><td><div className="agent-chip-list">{agent.capabilities.slice(0, 3).map((item) => <span key={item}>{formatCapability(item)}</span>)}{agent.capabilities.length > 3 ? <span>+{agent.capabilities.length - 3}</span> : null}</div></td><td>{latestRun ? <><span className={`status-pill status-pill--${latestRun.status}`}>{latestRun.status.replace('_', ' ')}</span><small>{formatDateTime(latestRun.created_at)}</small></> : <small>{labels.never}</small>}</td><td><strong>{agent.next_run_at ? formatDateTime(agent.next_run_at) : '—'}</strong></td><td><div className="agent-row-actions"><button type="button" title={labels.runNow} onClick={() => void runAgent(agent)} disabled={!agent.enabled}><Play /></button><button type="button" title={labels.edit} onClick={() => setEditingAgent(agent)}><Settings2 /></button><button type="button" title={agent.enabled ? labels.disable : labels.enable} onClick={() => void mutate(`/api/admin/agents/${agent.id}/${agent.enabled ? 'disable' : 'enable'}`).catch((reason: Error) => setError(reason.message))}>{agent.enabled ? <CirclePause /> : <Check />}</button><button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'agent', value: agent })}><Trash2 /></button></div></td></tr>;
          })}</tbody></table></div>}
        </Panel> : null}

        {!editingAgent && !editingProvider && tab === 'providers' ? <Panel className="agent-table-panel">
          {providers.length === 0 ? <EmptyState label={labels.noProviders} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.providerName}</th><th>{labels.providerType}</th><th>{labels.baseUrl}</th><th>{labels.model}</th><th>{labels.apiKey}</th><th>{labels.status}</th><th>{labels.actions}</th></tr></thead><tbody>{providers.map((provider) => <tr key={provider.id}><td><strong>{provider.name}</strong></td><td>{provider.provider_type}</td><td className="mono">{provider.base_url}</td><td className="mono">{provider.model}</td><td><span className="secret-mask">•••• {provider.api_key_last4}</span><small>{labels.keyStored}</small></td><td><span className={`agent-state agent-state--${provider.enabled ? 'active' : 'paused'}`}><i />{provider.enabled ? labels.active : labels.paused}</span></td><td><div className="agent-row-actions"><button type="button" title={labels.test} onClick={async () => { try { await mutate(`/api/admin/provider-profiles/${provider.id}/test`); setNotice(labels.connected); } catch (reason) { setError(reason instanceof Error ? reason.message : labels.requestFailed); } }}><RefreshCw /></button><button type="button" title={labels.edit} onClick={() => setEditingProvider(provider)}><Settings2 /></button><button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'provider', value: provider })}><Trash2 /></button></div></td></tr>)}</tbody></table></div>}
        </Panel> : null}

        {!editingAgent && !editingProvider && tab === 'runs' ? <div className="agent-split-view"><Panel className="agent-run-list">{runs.length === 0 ? <EmptyState label={labels.noRuns} /> : runs.map((run) => <button className={selectedRun?.run.id === run.id ? 'active' : ''} key={run.id} type="button" onClick={() => void inspectRun(run)}><span className={`run-icon run-icon--${run.status}`}><Play /></span><span><strong>{agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`}</strong><small>{formatDateTime(run.created_at)} · {run.provider}/{run.model}</small></span><span><b>{run.status.replace('_', ' ')}</b><ChevronRight /></span></button>)}</Panel><Panel className="agent-detail-panel">{selectedRun ? <div className="section-stack"><div className="panel-heading"><h2>{agentMap.get(selectedRun.run.agent_id)?.name}</h2><span className={`status-pill status-pill--${selectedRun.run.status}`}>{selectedRun.run.status.replace('_', ' ')}</span></div><section><h3>{labels.output}</h3><p className="agent-output">{selectedRun.run.output_summary || selectedRun.run.error_message || '—'}</p></section><div className="agent-run-metrics"><span><small>{labels.usage}</small><strong>{selectedRun.run.input_tokens + selectedRun.run.output_tokens} tokens</strong></span><span><small>{labels.toolCalls}</small><strong>{selectedRun.tool_calls.length}</strong></span><span><small>{labels.created}</small><strong>{formatDateTime(selectedRun.run.created_at)}</strong></span></div>{selectedRun.tool_calls.map((call) => <details className="tool-call-detail" key={call.id}><summary><ListChecks />{call.tool_name}<span className={`risk-label risk-label--${call.risk_level}`}>{call.risk_level}</span></summary>{call.tool_name === 'content.audit_post' ? <ContentAudit value={call.result} locale={locale} /> : null}{call.tool_name === 'content.find_internal_links' ? <InternalLinkSuggestions value={call.result} locale={locale} /> : null}<JsonPreview value={{ arguments: call.arguments, result: call.result, error: call.error_message }} /></details>)}</div> : <EmptyState label={labels.details} />}</Panel></div> : null}

        {!editingAgent && !editingProvider && tab === 'approvals' ? <div className="agent-approval-workspace"><Panel className="agent-approval-list"><div className="agent-filter"><button className={approvalFilter === 'pending' ? 'active' : ''} type="button" onClick={() => setApprovalFilter('pending')}>{labels.pending}</button><button className={approvalFilter === 'all' ? 'active' : ''} type="button" onClick={() => setApprovalFilter('all')}>{labels.all}</button></div>{approvals.length === 0 ? <EmptyState label={labels.noApprovals} /> : approvals.map((approval) => <button className={selectedApproval?.id === approval.id ? 'active' : ''} key={approval.id} type="button" onClick={() => setSelectedApproval(approval)}><span><strong>{approval.action_type.replaceAll('_', ' ')}</strong><small>Run #{approval.run_id} · {formatDateTime(approval.created_at)}</small></span><span className={`status-pill status-pill--${approval.status}`}>{approval.status}</span></button>)}</Panel><Panel className="agent-approval-detail">{selectedApproval ? <div className="section-stack"><div className="panel-heading"><div><h2>{selectedApproval.action_type.replaceAll('_', ' ')}</h2><small>{selectedApproval.target_type} {selectedApproval.target_id ? `#${selectedApproval.target_id}` : ''}</small></div><span className={`status-pill status-pill--${selectedApproval.status}`}>{selectedApproval.status}</span></div>{selectedApproval.before_snapshot ? <section><h3>{labels.before}</h3><JsonPreview value={selectedApproval.before_snapshot} /></section> : null}<section><h3>{labels.after}</h3><JsonPreview value={selectedApproval.proposed_payload} /></section>{selectedApproval.status === 'pending' ? <div className="agent-approval-actions"><button className="btn btn-secondary" type="button" onClick={() => void review(selectedApproval, false)}><X />{labels.reject}</button><button className="btn btn-primary" type="button" onClick={() => void review(selectedApproval, true)}><ShieldCheck />{labels.approve}</button></div> : null}</div> : <EmptyState label={labels.details} />}</Panel></div> : null}
      </div>
    </div>
    <ConfirmDialog open={deleteTarget !== null} title={deleteTarget?.kind === 'agent' ? labels.deleteAgentConfirm : labels.deleteProviderConfirm} description={deleteTarget?.kind === 'agent' ? labels.deleteAgentConfirm : labels.deleteProviderConfirm} confirmLabel={labels.delete} danger onClose={() => setDeleteTarget(null)} onConfirm={deleteSelected} />
  </AdminPage>;
}
