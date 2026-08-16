import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Check, ChevronRight, CirclePause, Clock3, DatabaseZap, GitBranch, KeyRound, Lightbulb, ListChecks, Play,
  Download, LockKeyhole, Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import type {
  Agent, AgentApproval, AgentRun, AgentSkill, AgentToolCall, ContentCandidateSet, EditorialTask, EmbeddingProfile, MediaCandidate, OperationalSuggestion, ProviderProfile, ToolDefinition, Workflow, WorkflowInteractionTask, WorkflowMetric, WorkflowRun,
} from '../agent';
import { EmbeddingForm } from '../components/agent/EmbeddingForm';
import type { EmbeddingFormValue } from '../components/agent/EmbeddingForm';
import { AgentForm } from '../components/agent/AgentForm';
import { SkillForm } from '../components/agent/SkillForm';
import type { SkillFormValue } from '../components/agent/SkillForm';
import { ProviderForm } from '../components/agent/ProviderForm';
import type { ProviderFormValue } from '../components/agent/ProviderForm';
import { WorkflowWorkspace } from '../components/agent/WorkflowWorkspace';
import { WorkflowRunRecords } from '../components/agent/WorkflowRunRecords';
import { OperationsWorkspace } from '../components/agent/OperationsWorkspace';
import { ConnectorWorkspace } from '../components/agent/ConnectorWorkspace';
import { ProposalPreview } from '../components/agent/ProposalPreview';
import { RiskPill, StatusPill } from '../components/agent/StatusPill';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import {
  AdminPage, AdminPageHeader, AdminPageState, Button, ConfirmDialog, EmptyState, Feedback, Panel, PanelHeader,
  Select, SubnavTabs, Tab, TabList, TabPanel, Tabs, WorkspacePanel,
} from '../components/ui';
import { useI18n } from '../i18n';
import '../styles/agent-console.css';

type ConsoleTab = 'overview' | 'inbox' | 'automation' | 'records' | 'advanced' | 'runs' | 'approvals';
type AdvancedSection = 'agents' | 'skills' | 'tools' | 'knowledge' | 'providers' | 'connectors';
type DeleteTarget = { kind: 'agent'; value: Agent } | { kind: 'provider'; value: ProviderProfile } | { kind: 'embedding'; value: EmbeddingProfile } | { kind: 'skill'; value: AgentSkill } | null;

function initialConsoleTab(): ConsoleTab {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return requested && ['overview', 'inbox', 'automation', 'records', 'advanced'].includes(requested)
    ? requested as ConsoleTab
    : 'overview';
}

function initialRecordType(): 'agent' | 'workflow' {
  return new URLSearchParams(window.location.search).get('record') === 'agent' ? 'agent' : 'workflow';
}

const copy = {
  en: {
    title: 'AI Workspace', pageDescription: 'Let AI find opportunities, prepare work, and keep every change under your review.',
    overview: 'Overview', inbox: 'To review', automation: 'Automation', records: 'Results & records', advanced: 'Advanced settings',
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
  },
  zh: {
    title: 'AI 工作台', pageDescription: '让 AI 发现问题、准备工作；每一项变更始终由你审核决定。',
    overview: '概览', inbox: '待我处理', automation: '自动化', records: '效果与记录', advanced: '高级设置',
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
  },
} as const;

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || copy.en.requestFailed);
  return body.data as T;
}

// Tool definitions are code-published and cannot change during a browser session.
// Reusing the request avoids refetching the same catalog after every mutation.
let toolCatalogRequest: Promise<ToolDefinition[]> | null = null;
function loadToolCatalog(): Promise<ToolDefinition[]> {
  if (!toolCatalogRequest) toolCatalogRequest = apiFetch('/api/admin/agent-tools').then(readData<ToolDefinition[]>);
  return toolCatalogRequest;
}

function formatCapability(value: string) {
  return value.replace('.', ' / ').replaceAll('_', ' ');
}

function JsonPreview({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as { qa?: unknown }).qa === true && typeof (value as { field_type?: unknown }).field_type === 'string') {
    return <div className="agent-json-preview agent-json-preview--explanation">这是创建候选的准备步骤，尚未包含具体内容修改。下一步会生成候选项，供你选择后再提交明确的变更审批。</div>;
  }
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

type RelatedContentSuggestion = { post_id?: number; title?: string; slug?: string; summary?: string; snippet?: string; score?: number; tags?: string[] };

function relatedContentSuggestions(value: unknown): RelatedContentSuggestion[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions) ? suggestions as RelatedContentSuggestion[] : null;
}

function RelatedContentSuggestions({ value, locale }: { value: unknown; locale: 'en' | 'zh' }) {
  const suggestions = relatedContentSuggestions(value);
  if (!suggestions) return null;
  const labels = locale === 'zh'
    ? { title: '相关文章', empty: '未找到相关文章。', score: '相关度', open: '打开文章' }
    : { title: 'Related content', empty: 'No related articles found.', score: 'Relevance', open: 'Open article' };
  return <section className="related-content-suggestions" aria-label={labels.title}>
    <div className="content-audit__heading"><h3>{labels.title}</h3></div>
    {suggestions.length === 0 ? <p>{labels.empty}</p> : <ul>{suggestions.map((suggestion) => <li key={suggestion.post_id || suggestion.slug}>
      <div><a href={`/articles/${encodeURIComponent(suggestion.slug || '')}`} aria-label={`${labels.open}: ${suggestion.title || suggestion.slug}`}>{suggestion.title || suggestion.slug}</a>{suggestion.snippet ? <p>{suggestion.snippet}</p> : suggestion.summary ? <p>{suggestion.summary}</p> : null}{suggestion.tags?.length ? <small>{suggestion.tags.join(' · ')}</small> : null}</div>
      <span>{labels.score} {Number(suggestion.score || 0).toFixed(2)}</span>
    </li>)}</ul>}
  </section>;
}

type StalePost = { id?: number; title?: string; slug?: string; summary?: string; updated_at?: string; views_count?: number; likes_count?: number };

function stalePosts(value: unknown): { olderThanDays: number; posts: StalePost[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as { older_than_days?: unknown; list?: unknown };
  if (!Array.isArray(result.list)) return null;
  return { olderThanDays: typeof result.older_than_days === 'number' ? result.older_than_days : 0, posts: result.list as StalePost[] };
}

function StalePostSuggestions({ value, locale, formatDateTime }: { value: unknown; locale: 'en' | 'zh'; formatDateTime: (value: string) => string }) {
  const result = stalePosts(value);
  if (!result) return null;
  const labels = locale === 'zh'
    ? { title: '待刷新旧文', empty: '未找到需要刷新的旧文。', updated: '最后更新', views: '浏览', likes: '点赞', open: '打开文章' }
    : { title: 'Stale content', empty: 'No stale articles found.', updated: 'Last updated', views: 'views', likes: 'likes', open: 'Open article' };
  return <section className="stale-post-suggestions" aria-label={labels.title}>
    <div className="content-audit__heading"><h3>{labels.title}</h3>{result.olderThanDays ? <small>{result.olderThanDays} days</small> : null}</div>
    {result.posts.length === 0 ? <p>{labels.empty}</p> : <ul>{result.posts.map((post) => <li key={post.id || post.slug}>
      <div><a href={`/articles/${encodeURIComponent(post.slug || '')}`} aria-label={`${labels.open}: ${post.title || post.slug}`}>{post.title || post.slug}</a>{post.summary ? <p>{post.summary}</p> : null}</div>
      <small>{labels.updated}: {post.updated_at ? formatDateTime(post.updated_at) : '—'} · {post.views_count || 0} {labels.views} · {post.likes_count || 0} {labels.likes}</small>
    </li>)}</ul>}
  </section>;
}

function OrphanPostSuggestions({ value, locale }: { value: unknown; locale: 'en' | 'zh' }) {
  const result = stalePosts(value);
  if (!result) return null;
  const rule = typeof (value as { match_rule?: unknown }).match_rule === 'string' ? (value as { match_rule: string }).match_rule : '';
  const labels = locale === 'zh'
    ? { title: '孤岛文章候选', empty: '未找到孤岛文章候选。', rule: '识别规则', open: '打开文章' }
    : { title: 'Orphan-content candidates', empty: 'No orphan-content candidates found.', rule: 'Detection rule', open: 'Open article' };
  return <section className="orphan-post-suggestions" aria-label={labels.title}>
    <div className="content-audit__heading"><h3>{labels.title}</h3></div>
    {rule ? <p><b>{labels.rule}:</b> {rule}</p> : null}
    {result.posts.length === 0 ? <p>{labels.empty}</p> : <ul>{result.posts.map((post) => <li key={post.id || post.slug}>
      <div><a href={`/articles/${encodeURIComponent(post.slug || '')}`} aria-label={`${labels.open}: ${post.title || post.slug}`}>{post.title || post.slug}</a>{post.summary ? <p>{post.summary}</p> : null}</div>
      <small>{post.views_count || 0} {locale === 'zh' ? '浏览' : 'views'} · {post.likes_count || 0} {locale === 'zh' ? '点赞' : 'likes'}</small>
    </li>)}</ul>}
  </section>;
}

function RunCitations({ run, locale }: { run: AgentRun; locale: 'en' | 'zh' }) {
  if (!run.citations?.length) return null;
  return <Panel><section className="related-content-suggestions" aria-label={locale === 'zh' ? '引用依据' : 'Citations'}>
    <h3>{locale === 'zh' ? '引用依据' : 'Citations'}</h3>
    <ul>{run.citations.map((citation) => <li key={citation.citation_id}>
      <div>{citation.status === 'validated' && citation.slug ? <a href={`/articles/${encodeURIComponent(citation.slug)}`}>{citation.title || citation.slug}</a> : <strong>{citation.citation_id}</strong>}{citation.snippet ? <p>{citation.snippet}</p> : null}</div>
      <RiskPill risk={citation.status === 'validated' ? 'read' : 'propose'} locale={locale} label={citation.status === 'validated' ? (locale === 'zh' ? '已验证' : 'Validated') : (locale === 'zh' ? '待验证' : 'Unverified')} />
    </li>)}</ul>
  </section></Panel>;
}

function WorkspaceOverview({ locale, approvals, suggestions, candidateSets, mediaCandidates, workflows, onNavigate }: {
  locale: 'en' | 'zh'; approvals: AgentApproval[]; suggestions: OperationalSuggestion[]; candidateSets: ContentCandidateSet[]; mediaCandidates: MediaCandidate[]; workflows: Workflow[]; onNavigate: (tab: ConsoleTab) => void;
}) {
  const zh = locale === 'zh';
  const pendingApprovals = approvals.filter((item) => item.status === 'pending').length;
  const newSuggestions = suggestions.filter((item) => item.status === 'new').length;
  const pendingCandidates = candidateSets.filter((item) => item.status === 'pending').length;
  const readyMedia = mediaCandidates.filter((item) => item.generation_status === 'ready_to_generate').length;
  const enabledWorkflows = workflows.filter((item) => item.enabled).length;
  const reviewCount = pendingApprovals + newSuggestions + pendingCandidates + readyMedia;
  return <div className="workspace-overview section-stack">
    <Panel className="workspace-overview__hero">
      <div><h2>{zh ? '从一件想改善的事开始' : 'Start with what you want to improve'}</h2><p>{zh ? 'AI 会找出机会、准备建议；发布、修改和生成始终由你决定。' : 'AI finds opportunities and prepares proposals. You decide every publish, edit, and generation.'}</p></div>
      <Button variant="primary" type="button" onClick={() => onNavigate('automation')}><GitBranch />{zh ? '查看自动化' : 'Explore automation'}</Button>
    </Panel>
    <section className="workspace-overview__summary" aria-label={zh ? '当前待办' : 'Current work'}>
      <button type="button" onClick={() => onNavigate('inbox')}><ShieldCheck /><strong>{pendingApprovals}</strong><span>{zh ? '项等待审批' : 'awaiting approval'}</span></button>
      <button type="button" onClick={() => onNavigate('inbox')}><Lightbulb /><strong>{newSuggestions + pendingCandidates}</strong><span>{zh ? '条内容建议待处理' : 'content suggestions to review'}</span></button>
      <button type="button" onClick={() => onNavigate('inbox')}><Sparkles /><strong>{readyMedia}</strong><span>{zh ? '个图片任务可生成' : 'image tasks ready'}</span></button>
    </section>
    <div className="workspace-overview__columns">
      <Panel>
        <div className="panel-heading"><div><h3>{zh ? '下一步做什么？' : 'What should I do next?'}</h3><small>{zh ? '按影响与人工决策优先级排序。' : 'Sorted by impact and the decisions only you can make.'}</small></div></div>
        <div className="workspace-overview__next"><strong>{reviewCount ? (zh ? `有 ${reviewCount} 项工作等你决定` : `${reviewCount} items need your decision`) : (zh ? '当前没有需要你处理的事项' : 'Nothing needs your decision right now')}</strong><p>{zh ? '先审阅 AI 准备好的建议；它不会自行修改博客内容。' : 'Review AI-prepared proposals first; it never changes blog content on its own.'}</p><Button variant="secondary" type="button" onClick={() => onNavigate('inbox')}><ShieldCheck />{zh ? '进入待我处理' : 'Open review queue'}</Button></div>
      </Panel>
      <Panel>
        <div className="panel-heading"><div><h3>{zh ? '让 AI 持续帮忙' : 'Keep AI working for you'}</h3><small>{zh ? `已启用 ${enabledWorkflows} 个自动化流程。` : `${enabledWorkflows} automations are enabled.`}</small></div></div>
        <ul className="workspace-overview__goals"><li><b>{zh ? '发布前检查' : 'Pre-publish checks'}</b><span>{zh ? '发现 SEO、链接和内容问题。' : 'Catch SEO, links, and content issues.'}</span></li><li><b>{zh ? '旧文更新' : 'Refresh older posts'}</b><span>{zh ? '发现需要维护的文章。' : 'Find posts that need maintenance.'}</span></li><li><b>{zh ? '运营周报' : 'Operations reporting'}</b><span>{zh ? '汇总值得关注的变化。' : 'Summarize changes worth attention.'}</span></li></ul>
        <Button variant="secondary" type="button" onClick={() => onNavigate('automation')}><Play />{zh ? '配置自动化' : 'Configure automation'}</Button>
      </Panel>
    </div>
  </div>;
}

function RecordsWorkspace({ locale, runs, agents, selectedRun, onInspect, onDelete, formatDateTime }: {
  locale: 'en' | 'zh'; runs: AgentRun[]; agents: Agent[]; selectedRun: { run: AgentRun; tool_calls: AgentToolCall[] } | null; onInspect: (run: AgentRun) => void; onDelete: (run: AgentRun) => void; formatDateTime: (value: string) => string;
}) {
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const zh = locale === 'zh';
  return <div className="agent-split-view">
    <Panel className="agent-master-panel agent-run-list">
      {runs.length === 0 ? <EmptyState label={zh ? '还没有 AI 工作记录。' : 'No AI work recorded yet.'} /> : runs.map((run) => <button className={selectedRun?.run.id === run.id ? 'active' : ''} key={run.id} type="button" onClick={() => onInspect(run)}><span className={`run-icon run-icon--${run.status}`}><Play /></span><span><strong>{agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`}</strong><small>{formatDateTime(run.created_at)} · {run.provider}/{run.model}</small></span><span><StatusPill status={run.status} locale={locale} /><ChevronRight /></span></button>)}
    </Panel>
    <Panel className="agent-detail-panel">
      {selectedRun ? <div className="section-stack"><div className="panel-heading"><div><h2>{agentMap.get(selectedRun.run.agent_id)?.name}</h2><small>{zh ? '本次运行的结果、执行步骤与依据' : 'Results, execution steps, and evidence for this run'}</small></div><div className="row-actions"><StatusPill status={selectedRun.run.status} locale={locale} />{['succeeded', 'failed', 'cancelled'].includes(selectedRun.run.status) ? <Button variant="secondary" type="button" onClick={() => onDelete(selectedRun.run)}><Trash2 />{zh ? '删除记录' : 'Delete record'}</Button> : null}</div></div><section><h3>{zh ? 'AI 输出' : 'AI output'}</h3><div className="agent-output">{selectedRun.run.output_summary ? <MarkdownRenderer content={selectedRun.run.output_summary} /> : selectedRun.run.error_message ? <pre>{selectedRun.run.error_message}</pre> : '—'}</div></section><div className="agent-run-metrics"><span><small>{zh ? '用量' : 'Usage'}</small><strong>{selectedRun.run.input_tokens + selectedRun.run.output_tokens} tokens</strong></span><span><small>{zh ? '工具调用' : 'Tool calls'}</small><strong>{selectedRun.tool_calls.length}</strong></span><span><small>{zh ? '执行时间' : 'Created'}</small><strong>{formatDateTime(selectedRun.run.created_at)}</strong></span></div><RecordEvidence run={selectedRun} locale={locale} formatDateTime={formatDateTime} /></div> : <EmptyState label={zh ? '选择一条记录查看 AI 的工作过程。' : 'Select a record to inspect the AI work.'} />}
    </Panel>
  </div>;
}

function ApprovalQueue({ locale, approvals, selected, onSelect, onReview }: {
  locale: 'en' | 'zh'; approvals: AgentApproval[]; selected: AgentApproval | null; onSelect: (approval: AgentApproval) => void; onReview: (approval: AgentApproval, approved: boolean) => void;
}) {
  const zh = locale === 'zh';
  return <Panel className="approval-queue"><div className="panel-heading"><div><h3>{zh ? '需要你决定的内容变更' : 'Changes that need your decision'}</h3><small>{zh ? 'AI 只能提出建议，不能自行应用。' : 'AI can propose changes, never apply them on its own.'}</small></div></div>{approvals.length === 0 ? <EmptyState label={zh ? '当前没有待审批变更。' : 'No changes awaiting approval.'} /> : <div className="agent-approval-workspace"><div className="agent-master-panel agent-approval-list">{approvals.map((approval) => <button className={selected?.id === approval.id ? 'active' : ''} key={approval.id} type="button" onClick={() => onSelect(approval)}><span><strong>{approval.action_type.replaceAll('_', ' ')}</strong><small>Run #{approval.run_id}</small></span><span className={`status-pill status-pill--${approval.status}`}>{approval.status}</span></button>)}</div><div className="agent-approval-detail">{selected ? <div className="section-stack"><section><h4>{zh ? '建议变更' : 'Proposed change'}</h4><JsonPreview value={selected.proposed_payload} /></section>{selected.status === 'pending' ? <div className="agent-approval-actions"><Button variant="secondary" type="button" onClick={() => onReview(selected, false)}><X />{zh ? '拒绝' : 'Reject'}</Button><Button variant="primary" type="button" onClick={() => onReview(selected, true)}><ShieldCheck />{zh ? '批准并执行' : 'Approve and execute'}</Button></div> : null}</div> : <EmptyState label={zh ? '选择一项查看变更内容。' : 'Select a change to review it.'} />}</div></div>}</Panel>;
}

// Kept temporarily as a stable fallback while the human-readable queue is
// rolled out; the active inbox uses FriendlyApprovalQueue below.
void ApprovalQueue;

function approvalSummary(approval: AgentApproval, zh: boolean) {
  const field = typeof approval.proposed_payload.field_type === 'string' ? approval.proposed_payload.field_type : '';
  const fieldName = field === 'title' ? (zh ? '文章标题' : 'article title') : field === 'summary' ? (zh ? '文章摘要' : 'article summary') : field === 'cover_alt' ? (zh ? '封面替代文字' : 'cover alt text') : (zh ? '内容' : 'content');
  const target = approval.target_id ? (zh ? `文章 #${approval.target_id}` : `post #${approval.target_id}`) : (zh ? '相关内容' : 'the related content');
  const isImageBrief = approval.action_type === 'create_media_candidate'
    || (approval.action_type === 'create_distribution_draft' && approval.proposed_payload.format === 'image_brief');
  if (approval.action_type === 'create_content_candidates') return { title: zh ? `为${target}准备${fieldName}候选` : `Prepare ${fieldName} alternatives for ${target}`, explanation: zh ? `AI 将创建可供你选择的${fieldName}建议。选择其中一项后，系统会再向你展示具体的内容修改审批。` : `AI will prepare ${fieldName} alternatives for you to choose from. Choosing one will create a separate approval with the exact content edit.` };
  if (isImageBrief) return { title: zh ? `为${target}准备图片方案` : `Prepare an image brief for ${target}`, explanation: zh ? 'AI 将准备经过审核的图片说明；批准后会创建图片任务，真正生成图片仍需要你之后再次点击确认。' : 'AI will prepare a reviewed image brief. Approval creates an image task; generating the actual image still requires a separate confirmation.' };
  return { title: zh ? `对${target}应用内容建议` : `Apply a content proposal to ${target}`, explanation: zh ? '批准后，系统会应用下面展示的建议变更。' : 'Approving will apply the proposed change shown below.' };
}

function FriendlyApprovalQueue({ locale, approvals, selected, onSelect, onReview }: {
  locale: 'en' | 'zh'; approvals: AgentApproval[]; selected: AgentApproval | null; onSelect: (approval: AgentApproval) => void; onReview: (approval: AgentApproval, approved: boolean) => void;
}) {
  const zh = locale === 'zh';
  const selectedSummary = selected ? approvalSummary(selected, zh) : null;
  const proposalPreview = selected ? <ProposalPreview actionType={selected.action_type} payload={selected.proposed_payload} locale={locale} /> : null;
  return <Panel className="approval-queue">
    <div className="panel-heading"><div><h3>{zh ? '需要你决定的内容变更' : 'Changes that need your decision'}</h3><small>{zh ? '先读清楚影响，再决定是否批准。AI 不会绕过你的确认。' : 'Understand the impact first, then decide. AI never bypasses your confirmation.'}</small></div></div>
    {approvals.length === 0 ? <EmptyState label={zh ? '当前没有待审批变更。' : 'No changes awaiting approval.'} /> : <div className="agent-approval-workspace">
      <div className="agent-master-panel agent-approval-list">{approvals.map((approval) => {
        const summary = approvalSummary(approval, zh);
        return <button className={selected?.id === approval.id ? 'active' : ''} key={approval.id} type="button" onClick={() => onSelect(approval)}><span><strong>{summary.title}</strong><small>{zh ? `来自 AI 运行 #${approval.run_id}` : `From AI run #${approval.run_id}`}</small></span><StatusPill status={approval.status} locale={locale} /></button>;
      })}</div>
      <div className="agent-approval-detail">{selected && selectedSummary ? <div className="approval-decision section-stack"><div><span className="risk-label risk-label--propose">{zh ? '请你确认' : 'Your confirmation needed'}</span><h2>{selectedSummary.title}</h2><p>{selectedSummary.explanation}</p></div><div className="approval-decision__facts"><section><small>{zh ? '批准后会发生什么' : 'What happens if approved'}</small><strong>{selectedSummary.title}</strong></section><section><small>{zh ? '不会发生什么' : 'What will not happen'}</small><strong>{selected.action_type === 'create_content_candidates' ? (zh ? '不会直接修改或发布文章' : 'No article will be edited or published') : (zh ? '不会影响其他文章或设置' : 'No other post or settings are affected')}</strong></section></div>{proposalPreview}{selected.before_snapshot ? <section className="approval-decision__before"><small>{zh ? '变更前原始数据' : 'Previous raw data'}</small><JsonPreview value={selected.before_snapshot} /></section> : null}{!proposalPreview ? <section><small>{zh ? '建议的内容' : 'Proposed content'}</small><JsonPreview value={selected.proposed_payload} /></section> : null}<details className="approval-decision__technical"><summary>{zh ? '查看技术详情' : 'View technical details'}<ChevronRight /></summary><JsonPreview value={selected.proposed_payload} /></details>{selected.status === 'pending' ? <div className="agent-approval-actions"><Button variant="secondary" type="button" onClick={() => onReview(selected, false)}><X />{zh ? '拒绝此建议' : 'Reject proposal'}</Button><Button variant="primary" type="button" onClick={() => onReview(selected, true)}><ShieldCheck />{zh ? '批准并继续' : 'Approve and continue'}</Button></div> : null}</div> : <EmptyState label={zh ? '选择一项查看其影响。' : 'Select an item to understand its impact.'} />}</div>
    </div>}
  </Panel>;
}

function InteractionInbox({ locale, tasks, onResolved }: { locale: 'en' | 'zh'; tasks: WorkflowInteractionTask[]; onResolved: () => Promise<void> }) {
  const zh = locale === 'zh';
  const resolve = async (task: WorkflowInteractionTask, response: unknown) => {
    await readData<WorkflowInteractionTask>(await apiFetch(`/api/admin/ai-interactions/${task.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume_token: task.resume_token, response }) }));
    await onResolved();
  };
  return <Panel className="approval-queue"><div className="panel-heading"><div><h3>{zh ? '流程交互' : 'Workflow interactions'}</h3><small>{zh ? '图片选择、确认和输入都在这里处理，并回到原运行。' : 'Choices, confirmations, and inputs resume their source run.'}</small></div><strong>{tasks.length}</strong></div>{tasks.length === 0 ? <EmptyState label={zh ? '当前没有待处理的流程交互。' : 'No workflow interactions need attention.'} /> : <div className="agent-approval-list">{tasks.map((task) => <div className="workflow-interaction" key={task.id}><div><strong>{task.interaction_type === 'choice' ? (zh ? '选择项' : 'Choose an option') : task.interaction_type === 'preview_confirm' ? (zh ? '确认预览' : 'Confirm preview') : (zh ? '确认操作' : 'Confirm action')}</strong><small>{task.workflow_run_id ? `Run #${task.workflow_run_id}` : `Agent run #${task.agent_run_id}`}{task.workflow_step_id ? ` · ${task.workflow_step_id}` : ''}</small></div>{task.interaction_type === 'choice' && Array.isArray(task.options) ? task.options.map((option, index) => <button className="btn btn-secondary" type="button" key={index} onClick={() => void resolve(task, { option })}>{String(option)}</button>) : <button className="btn btn-primary" type="button" onClick={() => void resolve(task, { confirmed: true })}>{zh ? '确认并继续' : 'Confirm and continue'}</button>}</div>)}</div>}</Panel>;
}

function RecordEvidence({ run, locale, formatDateTime }: { run: { run: AgentRun; tool_calls: AgentToolCall[] }; locale: 'en' | 'zh'; formatDateTime: (value: string) => string }) {
  const zh = locale === 'zh';
  return <section className="record-evidence" aria-label={zh ? '本次运行的执行日志' : 'Execution log for this run'}>
    <div className="record-evidence__heading"><div><h3>{zh ? '本次运行的执行日志' : 'Execution log for this run'}</h3><small>{zh ? '每一步都属于上方当前选中的运行；展开可查看输入、结果与错误信息。' : 'Every step belongs to the selected run above. Expand a step to inspect its input, result, and errors.'}</small></div><strong>{zh ? `${run.tool_calls.length} 步` : `${run.tool_calls.length} steps`}</strong></div>
    <div className="section-stack">{run.tool_calls.map((call, index) => <details className="tool-call-detail" key={call.id}>
      <summary><span className="tool-call-index">#{index + 1}</span><ListChecks /><span className="tool-call-name">{call.tool_name}</span><div className="tool-call-meta">{call.created_at ? <small className="tool-call-time">{formatDateTime(call.created_at)}</small> : null}<RiskPill risk={call.risk_level} locale={locale} /></div></summary>
      {call.tool_name === 'content.audit_post' ? <ContentAudit value={call.result} locale={locale} /> : null}{call.tool_name === 'content.find_internal_links' ? <InternalLinkSuggestions value={call.result} locale={locale} /> : null}{call.tool_name === 'content.find_related' ? <RelatedContentSuggestions value={call.result} locale={locale} /> : null}{call.tool_name === 'content.list_stale_posts' ? <StalePostSuggestions value={call.result} locale={locale} formatDateTime={formatDateTime} /> : null}{call.tool_name === 'content.list_orphan_posts' ? <OrphanPostSuggestions value={call.result} locale={locale} /> : null}<JsonPreview value={{ arguments: call.arguments, result: call.result, error: call.error_message }} />
    </details>)}</div><RunCitations run={run.run} locale={locale} />
  </section>;
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
  const [selectedRun, setSelectedRun] = useState<{ run: AgentRun; tool_calls: AgentToolCall[] } | null>(null);

  const sortedToolCalls = useMemo(() => {
    if (!selectedRun?.tool_calls?.length) return [];
    const withStep = selectedRun.tool_calls.map((call, idx) => ({ call, step: idx + 1 }));
    return withStep.sort((a, b) => {
      const timeA = new Date(a.call.created_at || 0).getTime() || a.call.id;
      const timeB = new Date(b.call.created_at || 0).getTime() || b.call.id;
      return timeB - timeA;
    });
  }, [selectedRun?.tool_calls]);
  const [editingAgent, setEditingAgent] = useState<Agent | 'new' | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderProfile | 'new' | null>(null);
  const [editingEmbedding, setEditingEmbedding] = useState<EmbeddingProfile | 'new' | null>(null);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | 'new' | null>(null);
  const [skillPrefill, setSkillPrefill] = useState<Partial<SkillFormValue> | undefined>();
  const [agentPrefill, setAgentPrefill] = useState<Partial<Omit<Agent, 'id' | 'created_at' | 'updated_at'>> | undefined>();
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testingConnections, setTestingConnections] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const providerFileInputRef = useRef<HTMLInputElement>(null);

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
    const approvalStatus = approvalFilter;
    // A historical workflow run must not prevent the rest of the console from
    // loading. The backend records a failure for that run and the operator can
    // still use every other workspace while the run list is unavailable.
    const loadWorkflowRuns = async () => {
      try {
        return await readData<WorkflowRun[]>(await apiFetch('/api/admin/ai-workflow-runs'));
      } catch {
        return [] as WorkflowRun[];
      }
    };
    const [providerData, embeddingData, indexData, agentData, runData, approvalData, toolData, skillData, workflowData, workflowRunData, workflowMetricData, suggestionData, candidateData, mediaCandidateData, editorialTaskData] = await Promise.all([
      readData<ProviderProfile[]>(await apiFetch('/api/admin/provider-profiles')),
      readData<EmbeddingProfile[]>(await apiFetch('/api/admin/embedding-profiles')),
      readData<{ queued: number; failed: number; chunks: number }>(await apiFetch('/api/admin/ai-index/status')),
      readData<Agent[]>(await apiFetch('/api/admin/agents')),
      readData<{ list: AgentRun[] }>(await apiFetch('/api/admin/agent-runs?pageSize=100')),
      readData<{ list: AgentApproval[] }>(await apiFetch(`/api/admin/agent-approvals?status=${approvalStatus}&pageSize=100`)),
      loadToolCatalog(),
      readData<AgentSkill[]>(await apiFetch('/api/admin/agent-skills')),
      readData<Workflow[]>(await apiFetch('/api/admin/ai-workflows')),
      loadWorkflowRuns(),
      readData<{ workflows: WorkflowMetric[] }>(await apiFetch('/api/admin/ai-workflow-metrics')),
      readData<OperationalSuggestion[]>(await apiFetch('/api/admin/ai-suggestions?status=all')),
      readData<ContentCandidateSet[]>(await apiFetch('/api/admin/ai-candidates')),
      readData<MediaCandidate[]>(await apiFetch('/api/admin/ai-media-candidates')),
      readData<EditorialTask[]>(await apiFetch('/api/admin/ai-editorial-tasks')),
    ]);
    setProviders(providerData);
    setEmbeddingProfiles(embeddingData);
    setIndexStatus(indexData);
    setAgents(agentData);
    setRuns(runData.list || []);
    setApprovals(approvalData.list || []);
    setTools(toolData);
    setSkills(skillData);
    setWorkflows(workflowData);
    setWorkflowRuns(workflowRunData);
    setWorkflowMetrics(workflowMetricData.workflows || []);
    setSuggestions(suggestionData);
    setCandidateSets(candidateData);
    setMediaCandidates(mediaCandidateData);
    setEditorialTasks(editorialTaskData);
    setSelectedApproval((current) => approvalData.list?.find((item) => item.id === current?.id) || approvalData.list?.[0] || null);
  }, [approvalFilter]);

  useEffect(() => {
    if (tab !== 'inbox') return;
    void apiFetch('/api/admin/ai-interactions').then((response) => response.ok ? readData<WorkflowInteractionTask[]>(response) : []).then(setInteractions).catch(() => setInteractions([]));
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
      const { id, ...payload } = value;
      const response = await apiFetch(id ? `/api/admin/provider-profiles/${id}` : '/api/admin/provider-profiles', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await readData<{ profile: ProviderProfile; starter_agents_created: number }>(response);
      setEditingProvider(null);
      await refresh();
	  if (result.starter_agents_created > 0) setNotice(locale === 'zh' ? `已初始化 ${result.starter_agents_created} 个默认 Agent，全部保持停用，等待你审核启用。` : `Initialized ${result.starter_agents_created} default Agents. They remain disabled until reviewed.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveEmbedding = async (value: EmbeddingFormValue) => {
    setError('');
    try {
      await readData<EmbeddingProfile>(await apiFetch(value.id ? `/api/admin/embedding-profiles/${value.id}` : '/api/admin/embedding-profiles', {
        method: value.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      }));
      setEditingEmbedding(null);
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

  const saveSkill = async (value: SkillFormValue) => {
    setError('');
    try {
      const response = await apiFetch(value.id ? `/api/admin/agent-skills/${value.id}` : '/api/admin/agent-skills', { method: value.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      await readData<AgentSkill>(response);
      setEditingSkill(null);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : labels.requestFailed); }
  };

  const exportProviders = async () => {
    const response = await apiFetch('/api/admin/provider-profiles/export');
    if (!response.ok) throw new Error(labels.requestFailed);
    const blob = new Blob([await response.text()], { type: 'application/json' });
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
      const response = await apiFetch('/api/admin/provider-profiles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readData<{ imported_count: number }>(response);
      await refresh();
      setNotice(
        locale === 'zh'
          ? `已成功导入 ${data.imported_count} 个模型连接。`
          : `Successfully imported ${data.imported_count} model connection${data.imported_count > 1 ? 's' : ''}.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const importSkill = async () => {
    const raw = window.prompt(locale === 'zh' ? '粘贴 Skill JSON' : 'Paste Skill JSON');
    if (!raw) return;
    await mutate('/api/admin/agent-skills/import', 'POST', JSON.parse(raw));
  };

  const exportSkill = async (skill: AgentSkill) => {
    const response = await apiFetch(`/api/admin/agent-skills/${skill.id}/export`);
    if (!response.ok) throw new Error(labels.requestFailed);
    const blob = new Blob([await response.text()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `skill-${skill.id}-v${skill.version}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const copySkill = async (skill: AgentSkill) => {
    const name = window.prompt(locale === 'zh' ? '复制后的 Skill 名称' : 'Name for the copied Skill', `${skill.name} Copy`);
    if (!name?.trim()) return;
    try {
      await mutate(`/api/admin/agent-skills/${skill.id}/copy`, 'POST', { name: name.trim() });
      setNotice(locale === 'zh' ? `已创建 Skill“${name.trim()}”的自定义副本。` : `Created custom Skill copy “${name.trim()}”.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const saveWorkflow = async (value: { id?: number; name: string; description: string; enabled: boolean; cron_expression?: string; timezone: string; input_schema: Record<string, unknown>; steps: import('../agent').WorkflowStep[]; scope_policy: import('../agent').WorkflowScopePolicy }) => {
    await readData<Workflow>(await apiFetch(value.id ? `/api/admin/ai-workflows/${value.id}` : '/api/admin/ai-workflows', {
      method: value.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    }));
    await refresh();
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

  const queueWorkflow = async (workflowID: number, dryRun: boolean, input: Record<string, unknown>) => {
    setError('');
    const response = await apiFetch(`/api/admin/ai-workflows/${workflowID}/${dryRun ? 'dry-run' : 'run'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
    });
    const result = await readData<WorkflowRun>(response);
    await refresh();
    return result;
  };

  const preflightWorkflow = async (workflowID: number, dryRun: boolean, input: Record<string, unknown>) => {
    return readData<{ ready: boolean; checks: Array<{ key: string; status: string; message?: string }> }>(await apiFetch(`/api/admin/ai-workflows/${workflowID}/preflight`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, dry_run: dryRun }),
    }));
  };

  const runAgent = async (agent: Agent) => {
    try {
      await mutate(`/api/admin/agents/${agent.id}/run`);
      selectTab('records');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const testConnection = async (kind: 'provider' | 'embedding', id: number, name: string) => {
    const key = `${kind}:${id}`;
    setTestingConnections((current) => current.includes(key) ? current : [...current, key]);
    setError('');
    setNotice('');
    try {
      const path = kind === 'provider' ? `/api/admin/provider-profiles/${id}/test` : `/api/admin/embedding-profiles/${id}/test`;
      await readData<unknown>(await apiFetch(path, { method: 'POST' }));
      setNotice(locale === 'zh' ? `${name}：连接成功` : `${name}: connection succeeded`);
    } catch (reason) {
      setError(locale === 'zh' ? `${name}：${reason instanceof Error ? reason.message : labels.requestFailed}` : `${name}: ${reason instanceof Error ? reason.message : labels.requestFailed}`);
    } finally {
      setTestingConnections((current) => current.filter((item) => item !== key));
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
      await mutate(`/api/admin/agent-runs/${run.id}`, 'DELETE');
      setSelectedRun(null);
      setNotice(locale === 'zh' ? '运行记录已清理。' : 'Run record deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  if (loading) return <AdminPageState title={labels.title} description={labels.pageDescription} label={labels.loading} />;

  const deleteSelected = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'agent') await mutate(`/api/admin/agents/${deleteTarget.value.id}`, 'DELETE');
      else if (deleteTarget.kind === 'provider') await mutate(`/api/admin/provider-profiles/${deleteTarget.value.id}`, 'DELETE');
      else if (deleteTarget.kind === 'skill') await mutate(`/api/admin/agent-skills/${deleteTarget.value.id}`, 'DELETE');
      else await mutate(`/api/admin/embedding-profiles/${deleteTarget.value.id}`, 'DELETE');
      setDeleteTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : labels.requestFailed);
    }
  };

  const tabs = [
    ['overview', Sparkles, labels.overview],
    ['inbox', ShieldCheck, labels.inbox],
    ['automation', GitBranch, labels.automation],
    ['records', Clock3, labels.records],
    ['advanced', Settings2, labels.advanced],
  ] as const;

  return <AdminPage className="agent-console">
    <AdminPageHeader title={labels.title} description={labels.pageDescription} actions={<Button variant="secondary" type="button" onClick={() => void refresh()}><RefreshCw />{labels.refresh}</Button>} />
    {error || notice ? <div className="agent-console__toasts" aria-live="polite">{error ? <div className="agent-console__toast"><Feedback type="error">{error}</Feedback><button type="button" title={locale === 'zh' ? '关闭提示' : 'Dismiss notification'} aria-label={locale === 'zh' ? '关闭提示' : 'Dismiss notification'} onClick={() => setError('')}><X /></button></div> : null}{notice ? <div className="agent-console__toast"><Feedback type="success">{notice}</Feedback><button type="button" title={locale === 'zh' ? '关闭提示' : 'Dismiss notification'} aria-label={locale === 'zh' ? '关闭提示' : 'Dismiss notification'} onClick={() => setNotice('')}><X /></button></div> : null}</div> : null}
    <Tabs value={tab} onValueChange={(value) => selectTab(value as ConsoleTab)} id="agent-workspace">
      <TabList label={labels.title}>
        {tabs.map(([value, Icon, label]) => <Tab key={value} value={value}><Icon aria-hidden="true" /><span>{label}</span>{value === 'inbox' && pendingCount > 0 ? <b>{pendingCount}</b> : null}</Tab>)}
      </TabList>
      <TabPanel value={tab}>
        <div className="agent-console__main">
        {tab === 'overview' ? <WorkspaceOverview locale={locale} approvals={approvals} suggestions={suggestions} candidateSets={candidateSets} mediaCandidates={mediaCandidates} workflows={workflows} onNavigate={selectTab} /> : null}
        {tab === 'advanced' ? <SubnavTabs label={labels.advanced} value={advancedSection} onValueChange={(value) => selectAdvanced(value as AdvancedSection)} items={[{ value: 'agents', label: labels.agents, icon: <Bot /> }, { value: 'skills', label: labels.skills, icon: <ListChecks /> }, { value: 'tools', label: 'Tools', icon: <GitBranch /> }, { value: 'knowledge', label: labels.knowledge, icon: <DatabaseZap /> }, { value: 'providers', label: labels.providers, icon: <KeyRound /> }, { value: 'connectors', label: locale === 'zh' ? 'Sandbox 连接器' : 'Sandbox connectors', icon: <LockKeyhole /> }]} /> : null}
        {tab === 'advanced' && advancedSection === 'providers' && editingProvider ? <ProviderForm key={editingProvider === 'new' ? 'new' : editingProvider.id} initial={editingProvider === 'new' ? undefined : editingProvider} labels={labels} onSave={saveProvider} onCancel={() => setEditingProvider(null)} /> : null}
        {tab === 'advanced' && advancedSection === 'knowledge' && editingEmbedding ? <EmbeddingForm key={editingEmbedding === 'new' ? 'new' : editingEmbedding.id} initial={editingEmbedding === 'new' ? undefined : editingEmbedding} locale={locale} onSave={saveEmbedding} onCancel={() => setEditingEmbedding(null)} /> : null}
        {tab === 'advanced' && advancedSection === 'agents' && editingAgent ? <AgentForm key={editingAgent === 'new' ? 'new' : editingAgent.id} initial={editingAgent === 'new' ? undefined : editingAgent} prefill={editingAgent === 'new' ? agentPrefill : undefined} providers={providers} skills={skills} locale={locale} labels={labels} onSave={saveAgent} onCancel={() => { setEditingAgent(null); setAgentPrefill(undefined); }} /> : null}
        {tab === 'advanced' && advancedSection === 'skills' && editingSkill ? <SkillForm key={editingSkill === 'new' ? 'new' : editingSkill.id} initial={editingSkill === 'new' ? undefined : editingSkill} prefill={editingSkill === 'new' ? skillPrefill : undefined} tools={tools} locale={locale} onSave={saveSkill} onCancel={() => { setEditingSkill(null); setSkillPrefill(undefined); }} /> : null}

        {!editingAgent && !editingProvider && tab === 'advanced' && advancedSection === 'tools' ? <WorkspacePanel className="agent-table-panel"><PanelHeader title="Tools" description={locale === 'zh' ? '由代码发布的受控能力目录，供 Skill 和 Agent 授权、审计与测试；Workflow 不直接调用 Tool。' : 'Code-published governed capabilities for Skill and Agent authorization, audit, and testing. Workflows do not invoke Tools directly.'} />{tools.length === 0 ? <EmptyState label={locale === 'zh' ? '暂无 Tool' : 'No Tools'} /> : <div className="table-scroll"><table className="content-table agent-table agent-table--tools"><thead><tr><th>Tool</th><th>{locale === 'zh' ? '范围' : 'Surface'}</th><th>{locale === 'zh' ? '风险' : 'Risk'}</th></tr></thead><tbody>{tools.map((tool) => <tr key={tool.name}><td><strong>{tool.name}</strong><small>{locale === 'zh' ? tool.description_zh || tool.description : tool.description}</small></td><td>{tool.surfaces?.join(', ') || 'agent'}</td><td><RiskPill risk={tool.risk_level} locale={locale} /></td></tr>)}</tbody></table></div>}</WorkspacePanel> : null}
        {!editingAgent && !editingProvider && tab === 'advanced' && advancedSection === 'agents' ? <WorkspacePanel className="agent-table-panel">
          <PanelHeader title={labels.agents} description={locale === 'zh' ? '将 Skill Version 部署到模型连接，并配置运行配额、计划与启停。' : 'Deploy a Skill Version to a model connection, then configure scheduling, quotas, and state.'} actions={<Button variant="primary" onClick={() => providers.length > 0 ? setEditingAgent('new') : setError(labels.providerNeeded)}><Plus />{labels.createAgent}</Button>} />
          {agents.length === 0 ? <div className="agent-empty-state"><Bot aria-hidden="true" /><h2>{locale === 'zh' ? '先添加模型连接' : 'Add a model connection first'}</h2><p>{locale === 'zh' ? '保存首个可用模型连接后，系统会自动创建 8 个停用的默认 Agent，供你审核后启用。' : 'Saving the first usable model connection creates eight disabled default Agents for review.'}</p><button className="text-link" type="button" onClick={() => selectAdvanced('providers')}><KeyRound />{locale === 'zh' ? '配置模型连接' : 'Configure a model connection'}<ChevronRight /></button></div> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.agents}</th><th>{labels.status}</th><th>{labels.provider}</th><th>{labels.schedule}</th><th>{labels.capabilities}</th><th>{labels.lastRun}</th><th>{labels.nextRun}</th><th>{labels.actions}</th></tr></thead><tbody>{agents.map((agent) => {
            const provider = providerMap.get(agent.provider_profile_id);
            const latestRun = runs.find((run) => run.agent_id === agent.id);
            const toolsForSkill = agent.skill?.capabilities || [];
            return <tr key={agent.id}><td><div className="agent-identity"><span><Bot /></span><div><strong>{agent.name}</strong>{agent.system_key ? <small>{locale === 'zh' ? '默认能力' : 'Default capability'}</small> : null}<small>{agent.description}</small></div></div></td><td><span className={`agent-state agent-state--${agent.enabled ? 'active' : 'paused'}`}><i />{agent.enabled ? labels.active : labels.paused}</span></td><td><strong>{provider?.name || '—'}</strong><small className="mono">{provider?.model || '—'}</small></td><td><strong>{agent.trigger_type === 'cron' ? agent.cron_expression : labels.manual}</strong><small>{agent.timezone}</small></td><td><strong>{agent.skill?.name || '—'}</strong><small>v{agent.skill?.version || '—'} · {toolsForSkill.length} Tools</small></td><td>{latestRun ? <><StatusPill status={latestRun.status} locale={locale} /><small>{formatDateTime(latestRun.created_at)}</small></> : <small>{labels.never}</small>}</td><td><strong>{agent.next_run_at ? formatDateTime(agent.next_run_at) : '—'}</strong></td><td><div className="agent-row-actions"><button type="button" title={labels.runNow} onClick={() => void runAgent(agent)} disabled={!agent.enabled}><Play /></button><button type="button" title={labels.edit} onClick={() => setEditingAgent(agent)}><Settings2 /></button><button type="button" title={agent.enabled ? labels.disable : labels.enable} onClick={() => void mutate(`/api/admin/agents/${agent.id}/${agent.enabled ? 'disable' : 'enable'}`).catch((reason: Error) => setError(reason.message))}>{agent.enabled ? <CirclePause /> : <Check />}</button>{!agent.system_key ? <button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'agent', value: agent })}><Trash2 /></button> : null}</div></td></tr>;
          })}</tbody></table></div>}
        </WorkspacePanel> : null}

        {!editingAgent && !editingProvider && !editingSkill && tab === 'advanced' && advancedSection === 'skills' ? <WorkspacePanel className="agent-table-panel">
          <PanelHeader title={labels.skills} description={locale === 'zh' ? '管理可复用能力定义与执行边界。' : 'Manage reusable capability definitions and execution boundaries.'} actions={<><Button variant="secondary" type="button" onClick={() => void importSkill()}>{locale === 'zh' ? '导入 JSON' : 'Import JSON'}</Button><Button variant="primary" type="button" onClick={() => setEditingSkill('new')}><Plus />{locale === 'zh' ? '创建 Skill' : 'Create Skill'}</Button></>} />
          {skills.length === 0 ? <EmptyState label={labels.noSkills} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.skills}</th><th>{labels.mode}</th><th>{labels.capabilities}</th><th>Version</th><th>{labels.created}</th><th>{labels.actions}</th></tr></thead><tbody>{skills.map((skill) => <tr key={skill.id}><td><strong>{skill.name}</strong>{skill.system_key ? <small>{locale === 'zh' ? '系统 Skill' : 'System Skill'}</small> : null}<small>{skill.description}</small></td><td><span className={`risk-label risk-label--${skill.execution_mode === 'approval' ? 'propose' : 'read'}`}>{skill.execution_mode === 'approval' ? labels.approvalMode : labels.advisory}</span></td><td><div className="agent-chip-list">{skill.capabilities.slice(0, 4).map((item) => <span key={item}>{formatCapability(item)}</span>)}{skill.capabilities.length > 4 ? <span>+{skill.capabilities.length - 4}</span> : null}</div></td><td><strong>v{skill.version}</strong></td><td><small>{formatDateTime(skill.updated_at)}</small></td><td><div className="agent-row-actions"><button type="button" title={locale === 'zh' ? '导出 Skill' : 'Export Skill'} onClick={() => void exportSkill(skill).catch((reason: Error) => setError(reason.message))}><Download /></button><button type="button" title={locale === 'zh' ? '复制 Skill' : 'Copy Skill'} onClick={() => void copySkill(skill)}><Sparkles /></button><button type="button" title={labels.edit} onClick={() => setEditingSkill(skill)}><Settings2 /></button>{!skill.system_key ? <button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'skill', value: skill })}><Trash2 /></button> : null}</div></td></tr>)}</tbody></table></div>}
        </WorkspacePanel> : null}

        {!editingAgent && !editingProvider && tab === 'advanced' && advancedSection === 'providers' ? <WorkspacePanel className="agent-table-panel">
          <input
            ref={providerFileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => void handleImportProviders(event)}
          />
          <PanelHeader
            title={labels.providers}
            description={locale === 'zh' ? '管理模型连接，并分别指定写作与图片生成的默认模型。' : 'Manage model connections and defaults.'}
            actions={<><Button variant="secondary" type="button" onClick={() => void exportProviders().catch((reason: Error) => setError(reason.message))}><Download />{labels.exportProviders}</Button><Button variant="secondary" type="button" onClick={() => providerFileInputRef.current?.click()}><Upload />{labels.importProviders}</Button><Button variant="primary" onClick={() => setEditingProvider('new')}><Plus />{locale === 'zh' ? '添加模型连接' : labels.createProvider}</Button></>}
          />
          {providers.length > 0 ? <section className="provider-defaults"><div className="provider-defaults__intro"><h3>默认用途</h3><p>决定编辑器与图片生成使用的模型。</p></div><label>写作辅助<Select value={providers.find((item) => item.is_default_writing)?.id || ''} onChange={(event) => { if (event.target.value) void mutate(`/api/admin/provider-profiles/${event.target.value}/default/writing`, 'POST').then(() => setNotice('默认写作模型已更新')).catch((reason: Error) => setError(reason.message)); }}><option value="">请选择模型</option>{providers.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}</Select></label><label>图片生成<Select value={providers.find((item) => item.is_default_image)?.id || ''} onChange={(event) => { if (event.target.value) void mutate(`/api/admin/provider-profiles/${event.target.value}/default/image`, 'POST').then(() => setNotice('默认图片模型已更新')).catch((reason: Error) => setError(reason.message)); }}><option value="">请选择模型</option>{providers.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}</Select></label></section> : null}
          {providers.length === 0 ? <EmptyState label={labels.noProviders} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.providerName}</th><th>{labels.providerType}</th><th>{labels.baseUrl}</th><th>{labels.model}</th><th>{labels.apiKey}</th><th>{labels.status}</th><th>{labels.actions}</th></tr></thead><tbody>{providers.map((provider) => <tr key={provider.id}><td><strong>{provider.name}</strong>{provider.is_default_writing ? <small className="provider-default">默认写作模型</small> : null}{provider.is_default_image ? <small className="provider-default">默认图片模型</small> : null}</td><td>{provider.provider_type}</td><td className="mono">{provider.base_url}</td><td className="mono">{provider.model}</td><td><span className="secret-mask">•••• {provider.api_key_last4}</span><small>{labels.keyStored}</small></td><td><span className={`agent-state agent-state--${provider.enabled ? 'active' : 'paused'}`}><i />{provider.enabled ? labels.active : labels.paused}</span></td><td><div className="agent-row-actions">{!provider.is_default_writing ? <button type="button" title="设为默认写作模型" disabled={!provider.enabled} onClick={() => void mutate(`/api/admin/provider-profiles/${provider.id}/default/writing`, 'POST').then(() => setNotice('已设为默认写作模型')).catch((reason: Error) => setError(reason.message))}><Sparkles /></button> : <span className="provider-default-mark"><Check />写作</span>}{!provider.is_default_image ? <button type="button" title="设为默认图片生成模型" disabled={!provider.enabled} onClick={() => void mutate(`/api/admin/provider-profiles/${provider.id}/default/image`, 'POST').then(() => setNotice('已设为默认图片生成模型')).catch((reason: Error) => setError(reason.message))}><Sparkles /></button> : <span className="provider-default-mark"><Check />图片</span>}<button type="button" title={testingConnections.includes(`provider:${provider.id}`) ? (locale === 'zh' ? '正在测试连接' : 'Testing connection') : labels.test} aria-busy={testingConnections.includes(`provider:${provider.id}`)} disabled={testingConnections.includes(`provider:${provider.id}`)} onClick={() => void testConnection('provider', provider.id, provider.name)}><RefreshCw className={testingConnections.includes(`provider:${provider.id}`) ? 'agent-row-actions__spinner' : undefined} /></button><button type="button" title={labels.edit} onClick={() => setEditingProvider(provider)}><Settings2 /></button><button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'provider', value: provider })}><Trash2 /></button></div></td></tr>)}</tbody></table></div>}
        </WorkspacePanel> : null}

        {!editingAgent && !editingProvider && !editingEmbedding && !editingSkill && tab === 'automation' ? <WorkflowWorkspace workflows={workflows} runs={workflowRuns} metrics={workflowMetrics} agents={agents} tools={tools} locale={locale} onMutate={mutate} onRun={queueWorkflow} onPreflight={preflightWorkflow} onRefresh={refresh} onSave={saveWorkflow} onConfigureSkill={(draft) => { if (!draft) return; setSkillPrefill({ name: draft.name || '', description: draft.description || '', system_prompt: draft.system_prompt || '', capabilities: draft.capabilities || [], execution_mode: draft.execution_mode || 'approval', content_publish_mode: 'approval' }); setEditingSkill('new'); setAdvancedSection('skills'); setTab('advanced'); }} onConfigureAgent={(draft) => { if (!draft) return; const provider = providers.find((item) => item.enabled && item.is_default_writing) || providers.find((item) => item.enabled); setAgentPrefill({ name: draft.name || '', description: draft.description || '', provider_profile_id: draft.provider_profile_id || provider?.id || 0, skill_version_id: draft.skill_version_id || skills[0]?.version_id || 0, enabled: false, trigger_type: 'manual', timezone: 'Asia/Shanghai', daily_run_limit: 10, monthly_token_budget: 1000000 }); setEditingAgent('new'); setAdvancedSection('agents'); setTab('advanced'); }} /> : null}
        {!editingAgent && !editingProvider && !editingEmbedding && !editingSkill && tab === 'advanced' && advancedSection === 'connectors' ? <ConnectorWorkspace locale={locale} readData={readData} onRefresh={refresh} /> : null}
        {!editingAgent && !editingProvider && !editingEmbedding && !editingSkill && tab === 'inbox' ? <><InteractionInbox locale={locale} tasks={interactions} onResolved={refresh} /><FriendlyApprovalQueue locale={locale} approvals={approvals} selected={selectedApproval} onSelect={setSelectedApproval} onReview={review} /><OperationsWorkspace suggestions={suggestions} candidateSets={candidateSets} mediaCandidates={mediaCandidates} editorialTasks={editorialTasks} locale={locale} onMutate={mutate} /></> : null}
        {!editingAgent && !editingProvider && tab === 'records' ? <div className="records-hub section-stack"><SubnavTabs label={locale === 'zh' ? '运行记录类型' : 'Run record type'} value={recordType} onValueChange={(value) => { const next = value as typeof recordType; setRecordType(next); const url = new URL(window.location.href); url.searchParams.set('record', next); window.history.replaceState(null, '', url); }} items={[{ value: 'workflow', label: locale === 'zh' ? 'Workflow 运行' : 'Workflow runs' }, { value: 'agent', label: locale === 'zh' ? 'Agent 运行' : 'Agent runs' }]} />{recordType === 'agent' ? <RecordsWorkspace locale={locale} runs={runs} agents={agents} selectedRun={selectedRun} onInspect={(run) => void inspectRun(run)} onDelete={(run) => void deleteAgentRun(run)} formatDateTime={formatDateTime} /> : <WorkflowRunRecords locale={locale} workflows={workflows} runs={workflowRuns} formatDateTime={formatDateTime} onRefresh={refresh} />}</div> : null}

        {!editingAgent && !editingProvider && !editingEmbedding && tab === 'advanced' && advancedSection === 'knowledge' ? <WorkspacePanel className="agent-table-panel knowledge-workspace">
          <PanelHeader title={<><DatabaseZap />{labels.knowledge}</>} description={locale === 'zh' ? '仅索引已发布文章；Embedding 模型负责把文章转换为可检索的知识库。' : 'Published content only; jobs run asynchronously.'} actions={<><Button variant="secondary" type="button" onClick={() => void mutate('/api/admin/ai-index/retry')}><RefreshCw />{locale === 'zh' ? '重试失败任务' : 'Retry failed'}</Button><Button variant="secondary" type="button" onClick={() => void mutate('/api/admin/ai-index/rebuild')}><RefreshCw />{locale === 'zh' ? '全量重建' : 'Rebuild all'}</Button><Button variant="primary" type="button" onClick={() => setEditingEmbedding('new')}><Plus />{locale === 'zh' ? '添加 Embedding 模型' : 'Add embedding profile'}</Button></>} />
          <div className="agent-run-metrics"><span><small>{locale === 'zh' ? '分段' : 'Chunks'}</small><strong>{indexStatus.chunks}</strong></span><span><small>{locale === 'zh' ? '队列' : 'Queued'}</small><strong>{indexStatus.queued}</strong></span><span><small>{locale === 'zh' ? '失败' : 'Failed'}</small><strong>{indexStatus.failed}</strong></span></div>
          <section className="knowledge-embedding-config">
            {embeddingProfiles.length === 0 ? <EmptyState label={locale === 'zh' ? '还没有嵌入配置。' : 'No embedding profiles configured.'} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{labels.providerName}</th><th>{labels.baseUrl}</th><th>{labels.model}</th><th>{locale === 'zh' ? '维度' : 'Dimensions'}</th><th>{labels.status}</th><th>{labels.actions}</th></tr></thead><tbody>{embeddingProfiles.map((profile) => <tr key={profile.id}><td><strong>{profile.name}</strong><small className="secret-mask">•••• {profile.api_key_last4}</small></td><td className="mono">{profile.base_url}</td><td className="mono">{profile.model}</td><td>{profile.dimensions}</td><td><span className={`agent-state agent-state--${profile.enabled ? 'active' : 'paused'}`}><i />{profile.enabled ? labels.active : labels.paused}</span></td><td><div className="agent-row-actions"><button type="button" title={testingConnections.includes(`embedding:${profile.id}`) ? (locale === 'zh' ? '正在测试连接' : 'Testing connection') : labels.test} aria-busy={testingConnections.includes(`embedding:${profile.id}`)} disabled={testingConnections.includes(`embedding:${profile.id}`)} onClick={() => void testConnection('embedding', profile.id, profile.name)}><RefreshCw className={testingConnections.includes(`embedding:${profile.id}`) ? 'agent-row-actions__spinner' : undefined} /></button><button type="button" title={labels.edit} onClick={() => setEditingEmbedding(profile)}><Settings2 /></button><button type="button" title={labels.delete} onClick={() => setDeleteTarget({ kind: 'embedding', value: profile })}><Trash2 /></button></div></td></tr>)}</tbody></table></div>}
          </section>
        </WorkspacePanel> : null}

        {!editingAgent && !editingProvider && tab === 'runs' ? <div className="agent-split-view"><Panel className="agent-master-panel agent-run-list">{runs.length === 0 ? <EmptyState label={labels.noRuns} /> : runs.map((run) => <button className={selectedRun?.run.id === run.id ? 'active' : ''} key={run.id} type="button" onClick={() => void inspectRun(run)}><span className={`run-icon run-icon--${run.status}`}><Play /></span><span><strong>{agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`}</strong><small>{formatDateTime(run.created_at)} · {run.provider}/{run.model}</small></span><span><b>{run.status.replace('_', ' ')}</b><ChevronRight /></span></button>)}</Panel><Panel className="agent-detail-panel">{selectedRun ? <div className="section-stack"><div className="panel-heading"><h2>{agentMap.get(selectedRun.run.agent_id)?.name}</h2><span className={`status-pill status-pill--${selectedRun.run.status}`}>{selectedRun.run.status.replace('_', ' ')}</span></div><section><h3>{labels.output}</h3><div className="agent-output">{selectedRun.run.output_summary ? <MarkdownRenderer content={selectedRun.run.output_summary} /> : selectedRun.run.error_message ? <pre>{selectedRun.run.error_message}</pre> : '—'}</div></section><div className="agent-run-metrics"><span><small>{labels.usage}</small><strong>{selectedRun.run.input_tokens + selectedRun.run.output_tokens} tokens</strong></span><span><small>{labels.toolCalls}</small><strong>{selectedRun.tool_calls.length}</strong></span><span><small>{labels.created}</small><strong>{formatDateTime(selectedRun.run.created_at)}</strong></span></div>{sortedToolCalls.map(({ call, step }) => <details className="tool-call-detail" key={call.id}><summary><span className="tool-call-index">#{step}</span><ListChecks /><span className="tool-call-name">{call.tool_name}</span><div className="tool-call-meta">{call.created_at ? <small className="tool-call-time">{formatDateTime(call.created_at)}</small> : null}<span className={`risk-label risk-label--${call.risk_level}`}>{call.risk_level}</span></div></summary>{call.tool_name === 'content.audit_post' ? <ContentAudit value={call.result} locale={locale} /> : null}{call.tool_name === 'content.find_internal_links' ? <InternalLinkSuggestions value={call.result} locale={locale} /> : null}{call.tool_name === 'content.find_related' ? <RelatedContentSuggestions value={call.result} locale={locale} /> : null}{call.tool_name === 'content.list_stale_posts' ? <StalePostSuggestions value={call.result} locale={locale} formatDateTime={formatDateTime} /> : null}{call.tool_name === 'content.list_orphan_posts' ? <OrphanPostSuggestions value={call.result} locale={locale} /> : null}<JsonPreview value={{ arguments: call.arguments, result: call.result, error: call.error_message }} /></details>)}</div> : <EmptyState label={labels.details} />}</Panel></div> : null}
        {tab === 'runs' && selectedRun ? <RunCitations run={selectedRun.run} locale={locale} /> : null}

        {!editingAgent && !editingProvider && tab === 'approvals' ? <div className="agent-approval-workspace"><Panel className="agent-master-panel agent-approval-list"><div className="agent-filter"><button className={approvalFilter === 'pending' ? 'active' : ''} type="button" onClick={() => setApprovalFilter('pending')}>{labels.pending}</button><button className={approvalFilter === 'all' ? 'active' : ''} type="button" onClick={() => setApprovalFilter('all')}>{labels.all}</button></div>{approvals.length === 0 ? <EmptyState label={labels.noApprovals} /> : approvals.map((approval) => <button className={selectedApproval?.id === approval.id ? 'active' : ''} key={approval.id} type="button" onClick={() => setSelectedApproval(approval)}><span><strong>{approval.action_type.replaceAll('_', ' ')}</strong><small>Run #{approval.run_id} · {formatDateTime(approval.created_at)}</small></span><span className={`status-pill status-pill--${approval.status}`}>{approval.status}</span></button>)}</Panel><Panel className="agent-approval-detail">{selectedApproval ? <div className="section-stack"><div className="panel-heading"><div><h2>{selectedApproval.action_type.replaceAll('_', ' ')}</h2><small>{selectedApproval.target_type} {selectedApproval.target_id ? `#${selectedApproval.target_id}` : ''}</small></div><span className={`status-pill status-pill--${selectedApproval.status}`}>{selectedApproval.status}</span></div>{selectedApproval.before_snapshot ? <section><h3>{labels.before}</h3><JsonPreview value={selectedApproval.before_snapshot} /></section> : null}<section><h3>{labels.after}</h3><JsonPreview value={selectedApproval.proposed_payload} /></section>{selectedApproval.status === 'pending' ? <div className="agent-approval-actions"><button className="btn btn-secondary" type="button" onClick={() => void review(selectedApproval, false)}><X />{labels.reject}</button><button className="btn btn-primary" type="button" onClick={() => void review(selectedApproval, true)}><ShieldCheck />{labels.approve}</button></div> : null}</div> : <EmptyState label={labels.details} />}</Panel></div> : null}
        </div>
      </TabPanel>
    </Tabs>
    <ConfirmDialog open={deleteTarget !== null} title={deleteTarget?.kind === 'agent' ? labels.deleteAgentConfirm : deleteTarget?.kind === 'embedding' ? labels.deleteEmbeddingConfirm : deleteTarget?.kind === 'skill' ? labels.deleteSkillConfirm : labels.deleteProviderConfirm} description={deleteTarget?.kind === 'agent' ? labels.deleteAgentConfirm : deleteTarget?.kind === 'embedding' ? labels.deleteEmbeddingConfirm : deleteTarget?.kind === 'skill' ? labels.deleteSkillConfirm : labels.deleteProviderConfirm} confirmLabel={labels.delete} danger onClose={() => setDeleteTarget(null)} onConfirm={deleteSelected} />
  </AdminPage>;
}
