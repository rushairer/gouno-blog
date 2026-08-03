import { ArrowDown, ArrowUp, CirclePause, Database, GitBranch, GitCompareArrows, History, Play, Plus, RotateCcw, Save, TestTube2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../auth';
import type { Agent, ToolDefinition, Workflow, WorkflowMetric, WorkflowRun, WorkflowStep } from '../../agent';
import { Button, Checkbox, ConfirmDialog, EditorPanel, EmptyState, Feedback, Field, FormActions, FormLayout, Input, Panel, PanelHeader, Select, WorkspacePanel } from '../ui';
import { StatusPill, statusLabel } from './StatusPill';
import { WorkflowInputForm } from './WorkflowInputForm';

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body.data as T;
}

type WorkflowValue = {
  id?: number;
  name: string;
  description: string;
  enabled: boolean;
  cron_expression?: string;
  timezone: string;
  input_schema: Record<string, unknown>;
  steps: WorkflowStep[];
  scope_policy: { mode: 'strict' | 'unscoped'; discovery_tools: string[] };
  resource_query_empty_policy: 'succeed' | 'fail';
};

function exampleInput(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
  return Object.fromEntries(required.map((name) => {
    const property = properties[name] || {};
    if (property.type === 'object') return [name, {}];
    if (property.type === 'array') return [name, []];
    if (property.type === 'boolean') return [name, false];
    if (property.type === 'string') return [name, ''];
    return [name, 0];
  }));
}

function firstWorkflowAgentID(steps: WorkflowStep[]): number | undefined {
  for (const step of steps) {
    if (step.type === 'model' && step.agent_id) return step.agent_id;
    const nested = firstWorkflowAgentID(step.steps || []);
    if (nested) return nested;
  }
  return undefined;
}

function bindWorkflowAgent(steps: WorkflowStep[], agentID: number): WorkflowStep[] {
  return steps.map((step) => ({
    ...step,
    ...(step.type === 'model' ? { agent_id: agentID } : {}),
    ...(step.steps ? { steps: bindWorkflowAgent(step.steps, agentID) } : {}),
  }));
}

export function WorkflowWorkspace({ workflows, runs, metrics, agents, tools = [], locale, onMutate, onRun, onRefresh, onSave }: {
  workflows: Workflow[];
  runs: WorkflowRun[];
  metrics: WorkflowMetric[];
  agents: Agent[];
  tools?: ToolDefinition[];
  locale: 'en' | 'zh';
  onMutate: (path: string, method?: string, body?: unknown) => Promise<void>;
  onRun: (workflowID: number, dryRun: boolean, input: Record<string, unknown>) => Promise<WorkflowRun>;
  onRefresh?: () => Promise<void>;
  onSave: (value: WorkflowValue) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null);
  const [inputByID, setInputByID] = useState<Record<number, Record<string, unknown>>>({});
  const [versions, setVersions] = useState<Record<number, Workflow[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningAction, setRunningAction] = useState<{ workflowID: number; dryRun: boolean } | null>(null);
  const [runFeedback, setRunFeedback] = useState<{ workflowID: number; type: 'success' | 'error'; message: string } | null>(null);
  const [selectedWorkflowID, setSelectedWorkflowID] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get('workflow'));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const labels = locale === 'zh' ? {
    empty: '还没有 Workflow。', add: '创建 Workflow', run: '运行', dry: 'Dry-run', enable: '启用',
    disable: '停用', versions: '版本', rollback: '回滚', input: '运行输入', steps: '步骤 JSON',
    schema: '输入 Schema', save: '保存 Workflow', cancel: '取消', metrics: '运行 / 失败 / Token',
    createTitle: '创建 Workflow', editTitle: '编辑 Workflow', schedule: '执行计划', next: '下次运行', retry: '重试',
  } : {
    empty: 'No workflows yet.', add: 'Create Workflow', run: 'Run', dry: 'Dry-run', enable: 'Enable',
    disable: 'Disable', versions: 'Versions', rollback: 'Rollback', input: 'Run input JSON', steps: 'Steps JSON',
    schema: 'Input schema', save: 'Save Workflow', cancel: 'Cancel', metrics: 'Runs / failures / tokens',
    createTitle: 'Create Workflow', editTitle: 'Edit Workflow', schedule: 'Schedule', next: 'Next run', retry: 'Retry',
  };
  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.workflow_id, item])), [metrics]);
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowID) || workflows[0] || null;
  const loadVersions = async (workflow: Workflow) => {
    const items = await readData<Workflow[]>(await apiFetch(`/api/admin/ai-workflows/${workflow.id}/versions`));
    setVersions((current) => ({ ...current, [workflow.id]: items }));
  };
  const deleteWorkflow = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onMutate(`/api/admin/ai-workflows/${deleteTarget.id}`, 'DELETE');
      setSelectedWorkflowID(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('workflow');
      window.history.replaceState(null, '', url);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };
  const waitForRun = async (workflowID: number, runID: number): Promise<WorkflowRun> => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const items = await readData<WorkflowRun[]>(await apiFetch(`/api/admin/ai-workflow-runs?workflow_id=${workflowID}`));
      const current = items.find((item) => item.id === runID);
      if (current && !['queued', 'running'].includes(current.status)) return current;
    }
    throw new Error(locale === 'zh' ? `Run #${runID} 仍在后台执行，请稍后到运行记录查看。` : `Run #${runID} is still executing. Check the run records later.`);
  };
  const runWorkflow = async (workflow: Workflow, dryRun: boolean, input: Record<string, unknown>) => {
    setRunningAction({ workflowID: workflow.id, dryRun });
    setRunFeedback(null);
    try {
      const result = await onRun(workflow.id, dryRun, input);
      if (!result || typeof result !== 'object' || !('id' in result) || !('status' in result)) {
        throw new Error(locale === 'zh' ? '服务器未返回可核验的运行记录' : 'The server did not return a verifiable run record');
      }
      const accepted = result as WorkflowRun;
      const wasAlreadySucceeded = accepted.status === 'succeeded';
      const finalRun = ['queued', 'running'].includes(accepted.status)
        ? await waitForRun(workflow.id, accepted.id)
        : accepted;
      await onRefresh?.();
      if (finalRun.status === 'failed') {
        throw new Error(finalRun.error_message || `${locale === 'zh' ? '运行失败' : 'Run failed'} (Run #${finalRun.id})`);
      }
      if (finalRun.status === 'awaiting_approval') {
        setRunFeedback({ workflowID: workflow.id, type: 'success', message: locale === 'zh'
          ? `Run #${finalRun.id} 已执行并等待审批，没有自动应用内容变更。`
          : `Run #${finalRun.id} completed and is awaiting approval; no content change was applied automatically.` });
        return;
      }
      if (finalRun.status !== 'succeeded') {
        throw new Error(`${locale === 'zh' ? '未知运行状态' : 'Unknown run status'}: ${finalRun.status}`);
      }
      setRunFeedback({ workflowID: workflow.id, type: 'success', message: locale === 'zh'
        ? (wasAlreadySucceeded && !dryRun
          ? `今日已有成功运行 Run #${finalRun.id}，本次未重复执行。可到“效果与记录 → Workflow 运行”核对日志。`
          : `${dryRun ? '试运行' : '运行'}成功（Run #${finalRun.id}）。状态和运行记录已刷新。`)
        : (wasAlreadySucceeded && !dryRun
          ? `Run #${finalRun.id} already succeeded today; no duplicate run was created.`
          : `${dryRun ? 'Dry-run' : 'Run'} succeeded (Run #${finalRun.id}). Status and records were refreshed.`) });
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : (locale === 'zh' ? '未知错误' : 'Unknown error');
      setRunFeedback({
        workflowID: workflow.id,
        type: 'error',
        message: locale === 'zh'
          ? `${dryRun ? '试运行' : '运行'}失败：${detail}。请修正后重试，步骤日志可在“效果与记录 → Workflow 运行”查看。`
          : `${dryRun ? 'Dry-run' : 'Run'} failed: ${detail}. Fix the issue and retry; step logs are available under “Records → Workflow runs”.`,
      });
    } finally {
      setRunningAction(null);
    }
  };
  if (editing) return <WorkflowEditor initial={editing === 'new' ? undefined : editing} labels={labels} agents={agents} tools={tools} onCancel={() => setEditing(null)} onSave={async (value) => { await onSave(value); setEditing(null); }} />;
  return <WorkspacePanel className="workflow-workspace">
    <PanelHeader title={locale === 'zh' ? '自动化' : 'Automation'} description={locale === 'zh' ? '选择一项持续运营目标；每次执行都可追溯、可试运行、可回滚。' : 'Choose an ongoing goal. Every run is traceable, testable, and reversible.'} actions={<Button variant="primary" type="button" onClick={() => setEditing('new')}><Plus />{labels.add}</Button>} />
    {workflows.length === 0 || !selectedWorkflow ? <EmptyState label={labels.empty} /> : <div className="agent-split-view workflow-split-view">
      <Panel className="agent-master-panel workflow-master-list">
        {workflows.map((workflow) => {
          return <button className={workflow.id === selectedWorkflow.id ? 'active' : ''} key={workflow.id} type="button" onClick={() => { setSelectedWorkflowID(workflow.id); const url = new URL(window.location.href); url.searchParams.set('workflow', String(workflow.id)); window.history.replaceState(null, '', url); }}>
            <span><strong>{workflow.name}</strong><small>{workflow.description}</small></span>
            <StatusPill status={workflow.enabled ? 'succeeded' : 'pending'} locale={locale} label={workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')} />
          </button>;
        })}
      </Panel>
      <Panel className="workflow-detail-panel">
        {(() => {
          const workflow = selectedWorkflow;
          const metric = metricMap.get(workflow.id);
          // A successful dry-run must not hide the latest real publish result.
          const latestRun = runs.find((run) => run.workflow_id === workflow.id && !run.dry_run);
          const latestDryRun = runs.find((run) => run.workflow_id === workflow.id && run.dry_run);
          const inputValue = inputByID[workflow.id] ?? exampleInput(workflow.input_schema);
          const inputProperties = workflow.input_schema.properties && typeof workflow.input_schema.properties === 'object'
            ? Object.keys(workflow.input_schema.properties as Record<string, unknown>)
            : [];
          const hasRuntimeInput = inputProperties.length > 0;
          const runInput = () => hasRuntimeInput ? inputValue : {};
          const activeRun = runningAction?.workflowID === workflow.id ? runningAction : null;
          const feedback = runFeedback?.workflowID === workflow.id ? runFeedback : null;
          const modelSteps = workflow.steps.filter((step) => step.type === 'model');
          const unboundStep = modelSteps.find((step) => !step.agent_id);
          const unavailableAgent = modelSteps.map((step) => step.agent_id ? agentMap.get(step.agent_id) : undefined).find((agent) => !agent || !agent.enabled);
          const runBlockReason = unboundStep
            ? (locale === 'zh' ? '此 Workflow 尚未绑定 Agent，请先完成模型连接初始化。' : 'This Workflow has no bound Agent. Complete model setup first.')
            : unavailableAgent
              ? (locale === 'zh' ? `关联 Agent“${unavailableAgent.name}”未启用，请先在 Agent 页面启用它。` : `Linked Agent “${unavailableAgent.name}” is disabled. Enable it first.`)
              : '';
          return <div className="section-stack"><div className="panel-heading"><div><h2>{workflow.name}</h2><small>{workflow.description} · v{workflow.current_version}</small></div><StatusPill status={workflow.enabled ? 'succeeded' : 'pending'} locale={locale} label={workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')} /></div>
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" type="button" onClick={() => setEditing(workflow)}><GitCompareArrows />Edit</Button><Button variant="secondary" type="button" onClick={() => void loadVersions(workflow)}><History />{labels.versions}</Button><Button variant="secondary" disabled={!workflow.enabled && Boolean(runBlockReason)} title={!workflow.enabled ? (runBlockReason || undefined) : undefined} type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/${workflow.enabled ? 'disable' : 'enable'}`)}>{workflow.enabled ? <CirclePause /> : <Play />}{workflow.enabled ? labels.disable : labels.enable}</Button><Button variant="danger" type="button" onClick={() => setDeleteTarget(workflow)}><Trash2 />{locale === 'zh' ? '删除' : 'Delete'}</Button></div>
            {hasRuntimeInput ? <WorkflowInputForm schema={workflow.input_schema} value={inputValue} onChange={(next) => setInputByID((current) => ({ ...current, [workflow.id]: next }))} locale={locale} /> : <div className="workflow-runtime-input"><small>{labels.input}</small><strong>{locale === 'zh' ? '无需手动填写' : 'No manual input required'}</strong><p>{locale === 'zh' ? '此流程使用计划规则或 Agent 的受控只读工具获取运行上下文。' : 'This workflow obtains context from scheduled rules or governed read tools.'}</p></div>}
            <div className="workflow-scope-summary"><strong>{locale === 'zh' ? '运行范围' : 'Run scope'}</strong><span>{workflow.scope_policy?.mode === 'strict' ? (locale === 'zh' ? '严格限制所选资源' : 'Strictly limited to selected resources') : (locale === 'zh' ? '兼容模式' : 'Compatibility mode')}</span>{workflow.scope_policy?.discovery_tools?.length ? <small>{locale === 'zh' ? '允许发现：' : 'Discovery: '}{workflow.scope_policy.discovery_tools.join(', ')}</small> : null}</div>
            {runBlockReason ? <Feedback type="error">{runBlockReason}</Feedback> : null}
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" loading={Boolean(activeRun)} disabled={Boolean(runBlockReason)} title={runBlockReason || undefined} type="button" onClick={() => void runWorkflow(workflow, true, runInput())}>{activeRun?.dryRun ? <span className="spinner workflow-button-spinner" aria-hidden="true" /> : <TestTube2 />}{activeRun?.dryRun ? (locale === 'zh' ? '试运行中…' : 'Dry-running…') : labels.dry}</Button><Button variant="primary" loading={Boolean(activeRun)} disabled={!workflow.enabled || latestRun?.status === 'running' || Boolean(runBlockReason)} title={runBlockReason || undefined} type="button" onClick={() => void runWorkflow(workflow, false, runInput())}>{activeRun && !activeRun.dryRun ? <span className="spinner workflow-button-spinner" aria-hidden="true" /> : <Play />}{activeRun && !activeRun.dryRun ? (locale === 'zh' ? '运行中…' : 'Running…') : (latestRun?.status === 'failed' ? labels.retry : labels.run)}</Button></div>
            {activeRun ? <div className="workflow-run-progress" role="status" aria-live="polite"><span className="spinner workflow-progress-spinner" aria-hidden="true" /><span><strong>{locale === 'zh' ? `${activeRun.dryRun ? '试运行' : 'Workflow'} 正在执行` : `${activeRun.dryRun ? 'Dry-run' : 'Workflow'} is running`}</strong><small>{locale === 'zh' ? '请勿重复点击；完成后会自动刷新状态和运行记录。' : 'Do not submit again. Status and run records refresh automatically when complete.'}</small></span></div> : null}
            {feedback ? <Feedback type={feedback.type}>{feedback.message}</Feedback> : null}
            <div className="agent-run-metrics"><span><small>{labels.schedule}</small><strong>{workflow.cron_expression || (locale === 'zh' ? '仅手动' : 'Manual only')}</strong><small>{workflow.cron_expression ? workflow.timezone : ''}</small></span><span><small>{labels.next}</small><strong>{workflow.next_run_at ? new Date(workflow.next_run_at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '—'}</strong></span><span><small>{labels.metrics}</small><strong>{metric?.runs || 0} / {metric?.failures || 0} / {metric?.tokens || 0}</strong></span><span><small>{locale === 'zh' ? '最近正式运行' : 'Latest live run'}</small><strong>{latestRun ? statusLabel(latestRun.status, locale) : '—'}</strong>{latestDryRun ? <small>{locale === 'zh' ? `最近试运行：${statusLabel(latestDryRun.status, locale)}` : `Latest dry-run: ${statusLabel(latestDryRun.status, locale)}`}</small> : null}</span></div>
            <div className="workflow-step-summary">{workflow.steps.map((step, index) => <span key={step.id}><strong>{index + 1}. {step.name || step.id}</strong><small>{step.type}</small></span>)}</div>
            {latestRun?.output && typeof latestRun.output === 'object' && latestRun.output !== null && 'post_id' in latestRun.output ? <a className="btn btn-secondary" href={`/admin/posts/${String((latestRun.output as { post_id: number }).post_id)}/edit`}>{locale === 'zh' ? '查看已发布文章' : 'View published post'}</a> : null}
            {versions[workflow.id]?.length ? <div className="agent-chip-list">{versions[workflow.id].map((version) => <button type="button" key={version.version_id} disabled={version.current_version === workflow.current_version} onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/rollback`, 'POST', { version: version.current_version })}><RotateCcw />v{version.current_version}</button>)}</div> : null}
            {latestRun?.output ? <pre className="agent-json-preview">{JSON.stringify(latestRun.output, null, 2)}</pre> : latestRun?.error_message ? <p>{latestRun.error_message}</p> : null}
          </div>;
        })()}
      </Panel>
    </div>}
    <ConfirmDialog open={deleteTarget !== null} title={locale === 'zh' ? '删除 Workflow？' : 'Delete workflow?'} description={deleteTarget ? (locale === 'zh' ? `删除“${deleteTarget.name}”后将停止后续运行。历史版本和运行审计会保留。` : `Deleting “${deleteTarget.name}” stops future runs. Version history and run audits are retained.`) : ''} confirmLabel={locale === 'zh' ? '删除 Workflow' : 'Delete workflow'} danger busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={deleteWorkflow} />
  </WorkspacePanel>;
}

type ResourceQueryFilter = { key: string; label: string; type: 'text' | 'number' | 'select' | 'datetime-local'; options?: string[] };

const resourceQueryTypes = [
  ['post', '文章'], ['comment', '评论'], ['media_asset', '媒体'], ['operational_suggestion', '运营建议'], ['category', '分类'], ['tag', '标签'],
] as const;

const resourceQueryFilters: Record<string, ResourceQueryFilter[]> = {
  post: [
    { key: 'status', label: '状态', type: 'select', options: ['draft', 'scheduled', 'published'] },
    { key: 'category', label: '分类 Slug', type: 'text' }, { key: 'tag', label: '标签', type: 'text' },
    { key: 'updated_before_days', label: '距今未更新天数', type: 'number' }, { key: 'published_within_days', label: '最近发布天数', type: 'number' }, { key: 'min_views', label: '最低阅读量', type: 'number' },
    { key: 'low_engagement', label: '低互动', type: 'select', options: ['true'] },
    { key: 'published_after', label: '发布于此后（UTC）', type: 'datetime-local' }, { key: 'published_before', label: '发布于此前（UTC）', type: 'datetime-local' },
    { key: 'updated_after', label: '更新于此后（UTC）', type: 'datetime-local' }, { key: 'updated_before', label: '更新于此前（UTC）', type: 'datetime-local' },
  ],
  comment: [
    { key: 'status', label: '状态', type: 'select', options: ['pending', 'visible', 'hidden'] }, { key: 'post_id', label: '所属文章 ID', type: 'number' },
    { key: 'reported', label: '仅被举报', type: 'select', options: ['true'] },
    { key: 'created_after', label: '创建于此后（UTC）', type: 'datetime-local' }, { key: 'created_before', label: '创建于此前（UTC）', type: 'datetime-local' },
  ],
  media_asset: [
    { key: 'content_type', label: '内容类型', type: 'text' }, { key: 'in_use', label: '引用状态', type: 'select', options: ['true', 'false'] }, { key: 'missing_alt', label: '缺失 Alt', type: 'select', options: ['true'] },
    { key: 'created_after', label: '创建于此后（UTC）', type: 'datetime-local' }, { key: 'created_before', label: '创建于此前（UTC）', type: 'datetime-local' },
  ],
  operational_suggestion: [
    { key: 'status', label: '状态', type: 'select', options: ['new', 'selected', 'converted', 'ignored', 'resolved'] },
    { key: 'priority', label: '优先级', type: 'select', options: ['low', 'medium', 'high'] }, { key: 'source_type', label: '来源类型', type: 'text' },
    { key: 'created_after', label: '创建于此后（UTC）', type: 'datetime-local' }, { key: 'created_before', label: '创建于此前（UTC）', type: 'datetime-local' },
  ],
  category: [{ key: 'min_post_count', label: '最少文章数', type: 'number' }],
  tag: [{ key: 'min_post_count', label: '最少文章数', type: 'number' }],
};

function resourceQueryInputValue(value: unknown, type: ResourceQueryFilter['type']) {
  if (type !== 'datetime-local' || typeof value !== 'string' || !value) return String(value ?? '');
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 16);
}

function ResourceQueryBuilder({ step, onAdd, onChange, onRemove, savedPreview, lastCount }: {
  step?: WorkflowStep;
  onAdd: () => void;
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  savedPreview?: number;
  lastCount?: number;
}) {
  const resourceType = step?.resource_type || 'post';
  const filters = step?.filter || {};
  const [preview, setPreview] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState('');
  const filterSignature = JSON.stringify(filters);
  useEffect(() => {
    if (!step) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams({ page: '1', page_size: '1' });
      Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== undefined && value !== null) parameters.set(key, String(value)); });
      apiFetch(`/api/admin/ai-resources/${resourceType}?${parameters}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || 'Resource preview failed');
          setPreview(Number(body.data?.total || 0));
          setPreviewError('');
        })
        .catch((reason: Error) => { if (reason.name !== 'AbortError') { setPreview(null); setPreviewError(reason.message); } });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filterSignature, resourceType, step]);
  if (!step) return <section className="workflow-resource-query-builder"><div><strong><Database />动态资源筛选</strong><p>每次计划运行开始时固定目标集合；后续重试会复用同一快照。</p></div><Button variant="secondary" type="button" onClick={onAdd}><Plus />添加动态资源筛选</Button></section>;
  const updateFilter = (key: string, value: string, type: ResourceQueryFilter['type']) => {
    const next = { ...filters } as Record<string, unknown>;
    if (!value) delete next[key];
    else next[key] = type === 'datetime-local' ? new Date(value).toISOString() : type === 'number' ? Number(value) : value;
    onChange({ ...step, filter: next });
  };
  return <section className="workflow-resource-query-builder">
    <div className="workflow-resource-query-heading"><div><strong><Database />动态资源筛选</strong><p>计划启动时解析并固定目标；预计命中 {preview === null ? '—' : `${preview} 项`}。</p>{savedPreview !== undefined ? <small>已保存预览：{savedPreview} 项{lastCount !== undefined ? `；上次实际命中：${lastCount} 项` : ''}</small> : null}</div><Button variant="ghost" size="compact" type="button" onClick={onRemove}><X />移除</Button></div>
    <div className="form-grid workflow-resource-query-core"><Field label="资源类型"><Select value={resourceType} onChange={(event) => onChange({ ...step, resource_type: event.target.value as WorkflowStep['resource_type'], filter: {} })}>{resourceQueryTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="单次最多处理"><input className="input-field" type="number" min="1" max="100" value={step.max_items || 20} onChange={(event) => onChange({ ...step, max_items: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></Field></div>
    <div className="workflow-resource-query-filters">{(resourceQueryFilters[resourceType] || []).map((filter) => <Field key={filter.key} label={filter.label}>{filter.type === 'select' ? <Select value={String(filters[filter.key] ?? '')} onChange={(event) => updateFilter(filter.key, event.target.value, filter.type)}><option value="">全部</option>{filter.options?.map((option) => <option key={option} value={option}>{option === 'true' ? '是' : option === 'false' ? '否' : option}</option>)}</Select> : <input className="input-field" type={filter.type} min={filter.type === 'number' ? 0 : undefined} value={resourceQueryInputValue(filters[filter.key], filter.type)} onChange={(event) => updateFilter(filter.key, event.target.value, filter.type)} />}</Field>)}</div>
    {previewError ? <Feedback type="error">无法预览命中数：{previewError}</Feedback> : null}
  </section>;
}

function SchemaFieldBuilder({ schemaJSON, onChange }: { schemaJSON: string; onChange: (value: string) => void }) {
  const schema = parseJSON<{ type?: string; additionalProperties?: boolean; required?: string[]; properties?: Record<string, Record<string, unknown>> }>(schemaJSON);
  if (!schema || schema.type !== 'object') return <Feedback type="error">输入 Schema JSON 无法解析。请在高级设置中修正。</Feedback>;
  const properties = schema.properties || {};
  const save = (next: typeof schema) => onChange(JSON.stringify({ ...next, type: 'object', additionalProperties: false }, null, 2));
  const add = () => { let key = 'input'; let index = 2; while (properties[key]) key = `input_${index++}`; save({ ...schema, properties: { ...properties, [key]: { type: 'string', title: key } } }); };
  return <section className="workflow-schema-builder"><div className="workflow-resource-query-heading"><div><strong>输入字段</strong><p>资源字段会自动显示为文章、评论或媒体等选择器。</p></div><Button variant="secondary" size="compact" type="button" onClick={add}><Plus />添加字段</Button></div>{Object.entries(properties).map(([key, property]) => { const resource = String(property['x-gouno-resource'] || ''); const isArray = property.type === 'array'; const set = (next: Record<string, unknown>) => save({ ...schema, properties: { ...properties, [key]: next } }); return <article className="workflow-schema-field" key={key}><div className="form-grid"><Field label="字段名"><input value={key} onChange={(event) => { const name = event.target.value.trim(); if (!name || name === key || properties[name]) return; const next = { ...properties, [name]: property }; delete next[key]; save({ ...schema, properties: next, required: (schema.required || []).map((item) => item === key ? name : item) }); }} /></Field><Field label="标题"><input value={String(property.title || '')} onChange={(event) => set({ ...property, title: event.target.value })} /></Field><Field label="类型"><Select value={isArray ? 'array' : String(property.type || 'string')} disabled={Boolean(resource)} onChange={(event) => set({ ...property, type: event.target.value, ...(event.target.value === 'array' ? { items: { type: 'string' } } : {}) })}><option value="string">字符串</option><option value="integer">整数</option><option value="number">数字</option><option value="boolean">布尔</option><option value="array">数组</option></Select></Field><Field label="资源类型"><Select value={resource} onChange={(event) => { const type = event.target.value; if (!type) { const next = { ...property }; delete next['x-gouno-resource']; delete next['x-gouno-widget']; set(next); return; } const keyType = type === 'tag' || type === 'category' ? 'string' : 'integer'; set({ ...property, type: isArray ? 'array' : keyType, ...(isArray ? { items: { type: keyType } } : {}), 'x-gouno-resource': type, 'x-gouno-widget': isArray ? 'entity-multi-select' : 'entity-select' }); }}><option value="">普通字段</option><option value="post">文章</option><option value="comment">评论</option><option value="media_asset">媒体</option><option value="operational_suggestion">运营建议</option><option value="category">分类</option><option value="tag">标签</option></Select></Field></div><div className="form-grid"><label className="checkbox-field"><input type="checkbox" checked={(schema.required || []).includes(key)} onChange={(event) => save({ ...schema, required: event.target.checked ? [...new Set([...(schema.required || []), key])] : (schema.required || []).filter((item) => item !== key) })} />必填</label>{(resource || isArray) ? <><Field label="最少数量"><input type="number" min="0" value={Number(property.minItems || 0)} onChange={(event) => set({ ...property, minItems: Number(event.target.value) || 0 })} /></Field><Field label="最多数量"><input type="number" min="1" value={Number(property.maxItems || 20)} onChange={(event) => set({ ...property, maxItems: Number(event.target.value) || 1 })} /></Field></> : null}<Button variant="ghost" size="compact" type="button" onClick={() => { const next = { ...properties }; delete next[key]; save({ ...schema, properties: next, required: (schema.required || []).filter((item) => item !== key) }); }}><Trash2 />删除</Button></div><Field label="说明"><input value={String(property.description || '')} onChange={(event) => set({ ...property, description: event.target.value })} /></Field></article>; })}</section>;
}

function parseJSON<T>(value: string): T | null { try { return JSON.parse(value) as T; } catch { return null; } }

function WorkflowEditor({ initial, labels, agents, tools, onSave, onCancel }: {
  initial?: Workflow;
  labels: Record<string, string>;
  agents: Agent[];
  tools: ToolDefinition[];
  onSave: (value: WorkflowValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [cronExpression, setCronExpression] = useState(initial?.cron_expression || '');
  const [timezone, setTimezone] = useState(initial?.timezone || 'Asia/Shanghai');
  const [emptyPolicy, setEmptyPolicy] = useState<'succeed' | 'fail'>(initial?.resource_query_empty_policy || 'succeed');
  const [schema, setSchema] = useState(JSON.stringify(initial?.input_schema || { type: 'object', additionalProperties: false }, null, 2));
  const [steps, setSteps] = useState(JSON.stringify(initial?.steps || [], null, 2));
  const [scopeMode, setScopeMode] = useState<'strict' | 'unscoped'>(initial?.scope_policy?.mode || 'unscoped');
  const [discoveryTools, setDiscoveryTools] = useState<string[]>(initial?.scope_policy?.discovery_tools || []);
  const [goal, setGoal] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [toolQuery, setToolQuery] = useState('');
  const [boundAgentID, setBoundAgentID] = useState<number | ''>(() => firstWorkflowAgentID(initial?.steps || []) || '');
  const parsedSteps = useMemo(() => {
    try {
      const value = JSON.parse(steps);
      return Array.isArray(value) ? value as WorkflowStep[] : null;
    } catch {
      return null;
    }
  }, [steps]);
  const resourceQueryIndex = parsedSteps?.findIndex((step) => step.type === 'resource_query') ?? -1;
  const resourceQueryStep = resourceQueryIndex >= 0 ? parsedSteps?.[resourceQueryIndex] : undefined;
  const forEachIndex = parsedSteps?.findIndex((step) => step.type === 'for_each') ?? -1;
  const forEachStep = forEachIndex >= 0 ? parsedSteps?.[forEachIndex] : undefined;
  const selectedAgent = agents.find((agent) => agent.id === boundAgentID);
  const allAuthorizedDiscoveryTools = tools.filter((tool) => tool.risk_level === 'read' && tool.scope?.discovery && Boolean(selectedAgent?.skill?.capabilities.includes(tool.name)));
  const authorizedDiscoveryTools = allAuthorizedDiscoveryTools.filter((tool) => `${tool.name} ${tool.description} ${tool.description_zh || ''}`.toLowerCase().includes(toolQuery.trim().toLowerCase()));
  const unavailableDiscoveryTools = discoveryTools.filter((name) => !allAuthorizedDiscoveryTools.some((tool) => tool.name === name));
  const updateResourceQuery = (next: WorkflowStep) => {
    if (!parsedSteps || resourceQueryIndex < 0) return;
    const nextSteps = [...parsedSteps];
    nextSteps[resourceQueryIndex] = next;
    setSteps(JSON.stringify(nextSteps, null, 2));
    setScopeMode('strict');
  };
  const addResourceQuery = () => {
    if (!parsedSteps || resourceQueryIndex >= 0) return;
    const ids = new Set(parsedSteps.map((step) => step.id));
    let id = 'select_resources';
    for (let index = 2; ids.has(id); index += 1) id = `select_resources_${index}`;
    setSteps(JSON.stringify([{ id, type: 'resource_query', resource_type: 'post', filter: {}, max_items: 20 }, ...parsedSteps], null, 2));
    setScopeMode('strict');
  };
  const removeResourceQuery = () => {
    if (!parsedSteps || resourceQueryIndex < 0) return;
    setSteps(JSON.stringify(parsedSteps.filter((_, index) => index !== resourceQueryIndex), null, 2));
  };
  const updateForEachFailurePolicy = (continueOnError: boolean) => {
    if (!parsedSteps || forEachIndex < 0) return;
    const nextSteps = [...parsedSteps];
    nextSteps[forEachIndex] = { ...nextSteps[forEachIndex], continue_on_error: continueOnError };
    setSteps(JSON.stringify(nextSteps, null, 2));
  };
  const bindAgent = (id: number) => {
    const current = JSON.parse(steps) as WorkflowStep[];
    setSteps(JSON.stringify(bindWorkflowAgent(current, id), null, 2));
    const currentSchema = JSON.parse(schema) as { required?: unknown };
    if (Array.isArray(currentSchema.required)) currentSchema.required = currentSchema.required.filter((item) => item !== 'agent_id');
    setSchema(JSON.stringify(currentSchema, null, 2));
    setBoundAgentID(id);
  };
  const updateStep = (index: number, next: WorkflowStep) => {
    if (!parsedSteps) return;
    const value = [...parsedSteps]; value[index] = next; setSteps(JSON.stringify(value, null, 2));
  };
  const moveStep = (index: number, delta: number) => {
    if (!parsedSteps || index + delta < 0 || index + delta >= parsedSteps.length) return;
    const value = [...parsedSteps]; [value[index], value[index + delta]] = [value[index + delta], value[index]];
    const queryIndex = value.findIndex((step) => step.type === 'resource_query');
    const controlIndex = value.findIndex((step) => step.type === 'model' || step.type === 'for_each');
    if (queryIndex >= 0 && controlIndex >= 0 && queryIndex > controlIndex) { const [query] = value.splice(queryIndex, 1); value.unshift(query); }
    setSteps(JSON.stringify(value, null, 2));
  };
  const removeStep = (index: number) => { if (parsedSteps) setSteps(JSON.stringify(parsedSteps.filter((_, item) => item !== index), null, 2)); };
  const addStep = (type: WorkflowStep['type']) => {
    if (!parsedSteps) return;
    const ids = new Set(parsedSteps.map((step) => step.id)); let id = type === 'resource_query' ? 'select_resources' : type; let index = 2; while (ids.has(id)) id = `${type}_${index++}`;
    const step: WorkflowStep = type === 'resource_query' ? { id, type, resource_type: 'post', filter: {}, max_items: 20 } : type === 'model' ? { id, type, input_pointer: '/input', include_context: true, agent_id: boundAgentID || undefined } : type === 'for_each' ? { id, type, collection_pointer: '/steps/select_resources', max_items: 20, max_concurrency: 0, steps: [] } : type === 'approval_gate' ? { id, type, name: '人工审批', input_pointer: '/steps' } : { id, type, output_pointer: '/steps' };
    const value = type === 'resource_query' ? [step, ...parsedSteps.filter((item) => item.type !== 'resource_query')] : [...parsedSteps, step]; setSteps(JSON.stringify(value, null, 2)); if (type === 'resource_query') setScopeMode('strict');
  };
  const generateDraft = async () => {
    if (!goal.trim()) {
      setPlannerMessage('先用一句话说明你希望自动化完成什么。');
      return;
    }
    setPlanning(true);
    setPlannerMessage('');
    try {
      const result = await readData<{ workflow: Workflow; provider: string; model: string; planner_warning?: string }>(await apiFetch('/api/admin/ai-workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: goal.trim() }) }));
      setName(result.workflow.name);
      setDescription(result.workflow.description);
      setSchema(JSON.stringify(result.workflow.input_schema, null, 2));
      setSteps(JSON.stringify(result.workflow.steps, null, 2));
      setPlannerMessage(result.planner_warning || `已由 ${result.provider} · ${result.model} 生成未启用草案。请审阅后保存。`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setPlannerMessage(message.toLowerCase().includes('timeout') ? '默认写作模型响应超时。你可以稍后重试，或先手动填写下面的名称、说明和高级设置。' : (message || '无法生成 Workflow 草案。'));
    } finally {
      setPlanning(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedSchema = parseJSON<{ properties?: Record<string, Record<string, unknown>> }>(schema);
    const safeSteps = parseJSON<WorkflowStep[]>(steps);
    if (!parsedSchema || !safeSteps || !safeSteps.length) { setEditorError('输入 Schema 或步骤 JSON 无效，请在高级设置中修正。'); setShowAdvanced(true); return; }
    if (safeSteps.some((step) => [step.input_pointer, step.collection_pointer, step.output_pointer].some((pointer) => pointer !== undefined && pointer !== '' && !String(pointer).startsWith('/')))) { setEditorError('所有 JSON Pointer 必须以 / 开头。'); return; }
    const hasResources = Object.values(parsedSchema.properties || {}).some((property) => typeof property['x-gouno-resource'] === 'string') || safeSteps.some((step) => step.type === 'resource_query');
    await onSave({ id: initial?.id, name, description, enabled: initial?.enabled || false, cron_expression: cronExpression.trim() || undefined, timezone, input_schema: parsedSchema, steps: safeSteps, scope_policy: { mode: hasResources ? 'strict' : scopeMode, discovery_tools: discoveryTools }, resource_query_empty_policy: emptyPolicy });
  };
  return <EditorPanel title={initial ? labels.editTitle : labels.createTitle} icon={<GitBranch />} closeLabel={labels.cancel} onClose={onCancel}><FormLayout onSubmit={submit}>
    {!initial ? <section className="workflow-planner"><div><h3>告诉 AI 你想持续完成什么</h3><p>例如：“每天检查最近发布文章的 SEO，并把需要人工确认的建议汇总出来”。AI 只生成未启用草案，不会运行或修改内容。</p></div><textarea className="input-field" rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="描述目标、频率、输入来源，以及哪些结果需要你确认…" /><FormActions><Button variant="secondary" type="button" disabled={planning} onClick={() => void generateDraft()}><GitBranch />{planning ? '正在生成草案…' : '用 AI 生成 Workflow 草案'}</Button></FormActions>{plannerMessage ? <p className="workflow-planner__message">{plannerMessage}</p> : null}</section> : null}
    <Field label="名称" hint="面向日常运营的短名称，例如“发布前内容检查”。"><input className="input-field" required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="作用说明" hint="说明此流程何时使用、会产出什么，以及人工确认边界。"><input className="input-field" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <div className="form-grid workflow-schedule-grid"><Field label="Cron 执行计划" hint="留空表示仅手动运行；例如每天 09:00：0 9 * * *"><input className="input-field mono" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 9 * * *" /></Field><Field label="时区" hint="使用 IANA 时区，例如 Asia/Shanghai"><input className="input-field mono" required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field></div>
    <SchemaFieldBuilder schemaJSON={schema} onChange={(value) => { setSchema(value); setEditorError(''); }} />
    {parsedSteps ? <ResourceQueryBuilder step={resourceQueryStep} onAdd={addResourceQuery} onChange={updateResourceQuery} onRemove={removeResourceQuery} savedPreview={initial?.resource_query_preview?.[0]?.estimated_count} lastCount={initial?.resource_query_last_count} /> : <Feedback type="error">步骤 JSON 无法解析。请先在高级设置中修正后再使用动态资源筛选。</Feedback>}
    {resourceQueryStep ? <Field label="空结果策略" hint="筛选为空时不调用 Agent；可选择成功短路或将运行标记为失败。"><Select value={emptyPolicy} onChange={(event) => setEmptyPolicy(event.target.value as 'succeed' | 'fail')}><option value="succeed">成功并记录“无匹配资源”</option><option value="fail">失败并提醒管理员</option></Select></Field> : null}
    {forEachStep ? <Field label="单项失败处理" hint="继续处理时会保留每项状态；至少一项成功则输出部分失败汇总，全部失败仍标记运行失败。"><Select value={forEachStep.continue_on_error ? 'continue' : 'stop'} onChange={(event) => updateForEachFailurePolicy(event.target.value === 'continue')}><option value="stop">立即停止整个运行</option><option value="continue">继续处理其余资源</option></Select></Field> : null}
    {parsedSteps ? <section className="workflow-step-cards"><div className="workflow-resource-query-heading"><div><strong>步骤编排</strong><p>常用步骤可视化编辑；高级 JSON 保留复杂配置。</p></div><Select aria-label="新增步骤类型" defaultValue="model" onChange={(event) => addStep(event.target.value as WorkflowStep['type'])}><option value="model">添加模型步骤</option><option value="resource_query">添加动态资源筛选</option><option value="for_each">添加逐项处理</option><option value="approval_gate">添加审批节点</option><option value="output">添加输出节点</option></Select></div>{parsedSteps.map((step, index) => <article className="workflow-step-card" key={`${step.id}-${index}`}><header><strong>{index + 1}. {step.name || step.id}</strong><span className="risk-label risk-label--read">{step.type}</span><div className="agent-row-actions"><button type="button" title="上移" disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp /></button><button type="button" title="下移" disabled={index === parsedSteps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown /></button><button type="button" title="删除" onClick={() => removeStep(index)}><Trash2 /></button></div></header>{step.type === 'model' ? <div className="form-grid"><Field label="步骤名称"><input value={step.name || ''} onChange={(event) => updateStep(index, { ...step, name: event.target.value })} /></Field><Field label="输入 JSON Pointer"><input className="mono" value={step.input_pointer || ''} onChange={(event) => updateStep(index, { ...step, input_pointer: event.target.value })} /></Field><Field label="绑定 Agent"><Select value={step.agent_id || ''} onChange={(event) => updateStep(index, { ...step, agent_id: Number(event.target.value) || undefined })}><option value="">选择 Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.enabled ? '' : '（已停用）'}</option>)}</Select></Field><label className="checkbox-field"><input type="checkbox" checked={step.include_context !== false} onChange={(event) => updateStep(index, { ...step, include_context: event.target.checked })} />包含受控上下文</label></div> : null}{step.type === 'for_each' ? <div className="form-grid"><Field label="集合 JSON Pointer"><input className="mono" value={step.collection_pointer || ''} onChange={(event) => updateStep(index, { ...step, collection_pointer: event.target.value })} /></Field><Field label="最多处理"><input type="number" min="1" max="100" value={step.max_items || 20} onChange={(event) => updateStep(index, { ...step, max_items: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></Field><Field label="最大并发"><input type="number" min="0" max="10" value={step.max_concurrency || 0} onChange={(event) => updateStep(index, { ...step, max_concurrency: Math.max(0, Math.min(10, Number(event.target.value) || 0)) })} /></Field><label className="checkbox-field"><input type="checkbox" checked={Boolean(step.continue_on_error)} onChange={(event) => updateStep(index, { ...step, continue_on_error: event.target.checked })} />单项失败后继续</label></div> : null}{step.type === 'for_each' ? <div className="workflow-nested-steps"><strong>嵌套模型步骤</strong>{(step.steps || []).map((nested, nestedIndex) => <div className="form-grid" key={nested.id || nestedIndex}><Field label="步骤名称"><input value={nested.name || ''} onChange={(event) => { const nestedSteps = [...(step.steps || [])]; nestedSteps[nestedIndex] = { ...nested, name: event.target.value }; updateStep(index, { ...step, steps: nestedSteps }); }} /></Field><Field label="绑定 Agent"><Select value={nested.agent_id || ''} onChange={(event) => { const nestedSteps = [...(step.steps || [])]; nestedSteps[nestedIndex] = { ...nested, agent_id: Number(event.target.value) || undefined }; updateStep(index, { ...step, steps: nestedSteps }); }}><option value="">选择 Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</Select></Field><button type="button" title="删除嵌套步骤" onClick={() => updateStep(index, { ...step, steps: (step.steps || []).filter((_, item) => item !== nestedIndex) })}><Trash2 /></button></div>)}<Button variant="ghost" size="compact" type="button" onClick={() => updateStep(index, { ...step, steps: [...(step.steps || []), { id: `item_${(step.steps || []).length + 1}`, type: 'model', input_pointer: '/item', include_context: true, agent_id: boundAgentID || undefined }] })}><Plus />添加嵌套模型步骤</Button></div> : null}{step.type === 'approval_gate' ? <Field label="审批说明"><input value={step.name || ''} onChange={(event) => updateStep(index, { ...step, name: event.target.value })} /></Field> : null}{step.type === 'output' ? <Field label="输出 JSON Pointer"><input className="mono" value={step.output_pointer || ''} onChange={(event) => updateStep(index, { ...step, output_pointer: event.target.value })} /></Field> : null}</article>)}</section> : null}
    <Field label="批量绑定 Agent" hint="将所有顶层模型步骤绑定到同一个 Agent；Skill 和 Tool 授权在 Agent 内生效。"><Select required value={boundAgentID} onChange={(event) => event.target.value && bindAgent(Number(event.target.value))}><option value="" disabled>选择 Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.enabled ? '' : '（已停用）'}</option>)}</Select></Field>
    <section className="workflow-discovery-picker"><div className="workflow-resource-query-heading"><div><strong>运行范围与只读发现 Tool</strong><p>只展示当前绑定 Skill 已授权、且允许发现的只读 Tool；发现结果默认不能成为修改目标。</p></div><Select aria-label="运行范围" value={scopeMode} onChange={(event) => setScopeMode(event.target.value as 'strict' | 'unscoped')}><option value="strict">严格限制</option><option value="unscoped">兼容模式</option></Select></div><Input size="compact" value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="搜索可用 Tool" aria-label="搜索可用 Tool" /><div className="workflow-tool-picker">{authorizedDiscoveryTools.map((tool) => <label key={tool.name}><Checkbox checked={discoveryTools.includes(tool.name)} onChange={() => setDiscoveryTools((current) => current.includes(tool.name) ? current.filter((item) => item !== tool.name) : [...current, tool.name])} /><span><strong>{tool.name}</strong><small>{tool.description_zh || tool.description} · 发现后只读</small></span></label>)}{unavailableDiscoveryTools.map((tool) => <label className="workflow-tool-picker__historical" key={tool}><Checkbox checked onChange={() => setDiscoveryTools((current) => current.filter((item) => item !== tool))} /><span><strong>{tool}</strong><small>历史配置；当前 Skill 未授权，保存前请移除或切换兼容模式</small></span></label>)}{!authorizedDiscoveryTools.length && !unavailableDiscoveryTools.length ? <p className="muted">当前绑定 Skill 没有已授权的只读发现 Tool。</p> : null}</div></section>
    <details className="workflow-advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}><summary>高级：查看或编辑输入与步骤 JSON <small>仅在需要精细控制或保留未来字段时修改</small></summary><p>结构化 UI 不支持的字段会保留在这里。手工编辑后必须是合法 JSON，并继续接受服务端校验。</p><Field label={labels.schema} hint="JSON Schema。资源字段使用 x-gouno-resource 和 x-gouno-widget 扩展。"><textarea className="input-field mono" rows={8} value={schema} onChange={(event) => setSchema(event.target.value)} /></Field><Field label={labels.steps} hint="允许 resource_query、model、for_each、approval_gate、output；服务端会校验每个步骤。"><textarea className="input-field mono" rows={16} value={steps} onChange={(event) => setSteps(event.target.value)} /></Field></details>{editorError ? <Feedback type="error">{editorError}</Feedback> : null}
    <FormActions><Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button><Button variant="primary" type="submit"><Save />{labels.save}</Button></FormActions>
  </FormLayout></EditorPanel>;
}
