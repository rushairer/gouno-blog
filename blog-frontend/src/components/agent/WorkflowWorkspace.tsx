import { CirclePause, Database, GitBranch, GitCompareArrows, History, Play, Plus, RotateCcw, Save, TestTube2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../auth';
import type { Agent, Workflow, WorkflowMetric, WorkflowRun, WorkflowStep } from '../../agent';
import { Button, ConfirmDialog, EditorPanel, EmptyState, Feedback, Field, FormActions, FormLayout, Panel, PanelHeader, Select, WorkspacePanel } from '../ui';
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

export function WorkflowWorkspace({ workflows, runs, metrics, agents, locale, onMutate, onRun, onRefresh, onSave }: {
  workflows: Workflow[];
  runs: WorkflowRun[];
  metrics: WorkflowMetric[];
  agents: Agent[];
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
  if (editing) return <WorkflowEditor initial={editing === 'new' ? undefined : editing} labels={labels} agents={agents} onCancel={() => setEditing(null)} onSave={async (value) => { await onSave(value); setEditing(null); }} />;
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

function WorkflowEditor({ initial, labels, agents, onSave, onCancel }: {
  initial?: Workflow;
  labels: Record<string, string>;
  agents: Agent[];
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
  const [discoveryTools, setDiscoveryTools] = useState((initial?.scope_policy?.discovery_tools || []).join(', '));
  const [goal, setGoal] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial));
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
  const generateDraft = async () => {
    if (!goal.trim()) {
      setPlannerMessage('先用一句话说明你希望自动化完成什么。');
      return;
    }
    setPlanning(true);
    setPlannerMessage('');
    try {
      const result = await readData<{ workflow: Workflow; provider: string; model: string }>(await apiFetch('/api/admin/ai-workflows/draft', { method: 'POST', body: JSON.stringify({ prompt: goal.trim() }) }));
      setName(result.workflow.name);
      setDescription(result.workflow.description);
      setSchema(JSON.stringify(result.workflow.input_schema, null, 2));
      setSteps(JSON.stringify(result.workflow.steps, null, 2));
      setPlannerMessage(`已由 ${result.provider} · ${result.model} 生成未启用草案。请审阅后保存。`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setPlannerMessage(message.toLowerCase().includes('timeout') ? '默认写作模型响应超时。你可以稍后重试，或先手动填写下面的名称、说明和高级设置。' : (message || '无法生成 Workflow 草案。'));
    } finally {
      setPlanning(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedSchema = JSON.parse(schema) as { properties?: Record<string, Record<string, unknown>> };
    const hasResources = Object.values(parsedSchema.properties || {}).some((property) => typeof property['x-gouno-resource'] === 'string');
    await onSave({ id: initial?.id, name, description, enabled: initial?.enabled || false, cron_expression: cronExpression.trim() || undefined, timezone, input_schema: parsedSchema, steps: JSON.parse(steps), scope_policy: { mode: hasResources ? 'strict' : scopeMode, discovery_tools: discoveryTools.split(',').map((item) => item.trim()).filter(Boolean) }, resource_query_empty_policy: emptyPolicy });
  };
  return <EditorPanel title={initial ? labels.editTitle : labels.createTitle} icon={<GitBranch />} closeLabel={labels.cancel} onClose={onCancel}><FormLayout onSubmit={submit}>
    {!initial ? <section className="workflow-planner"><div><h3>告诉 AI 你想持续完成什么</h3><p>例如：“每天检查最近发布文章的 SEO，并把需要人工确认的建议汇总出来”。AI 只生成未启用草案，不会运行或修改内容。</p></div><textarea className="input-field" rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="描述目标、频率、输入来源，以及哪些结果需要你确认…" /><FormActions><Button variant="secondary" type="button" disabled={planning} onClick={() => void generateDraft()}><GitBranch />{planning ? '正在生成草案…' : '用 AI 生成 Workflow 草案'}</Button></FormActions>{plannerMessage ? <p className="workflow-planner__message">{plannerMessage}</p> : null}</section> : null}
    <Field label="名称" hint="面向日常运营的短名称，例如“发布前内容检查”。"><input className="input-field" required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="作用说明" hint="说明此流程何时使用、会产出什么，以及人工确认边界。"><input className="input-field" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <div className="form-grid workflow-schedule-grid"><Field label="Cron 执行计划" hint="留空表示仅手动运行；例如每天 09:00：0 9 * * *"><input className="input-field mono" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 9 * * *" /></Field><Field label="时区" hint="使用 IANA 时区，例如 Asia/Shanghai"><input className="input-field mono" required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field></div>
    {parsedSteps ? <ResourceQueryBuilder step={resourceQueryStep} onAdd={addResourceQuery} onChange={updateResourceQuery} onRemove={removeResourceQuery} savedPreview={initial?.resource_query_preview?.[0]?.estimated_count} lastCount={initial?.resource_query_last_count} /> : <Feedback type="error">步骤 JSON 无法解析。请先在高级设置中修正后再使用动态资源筛选。</Feedback>}
    {resourceQueryStep ? <Field label="空结果策略" hint="筛选为空时不调用 Agent；可选择成功短路或将运行标记为失败。"><Select value={emptyPolicy} onChange={(event) => setEmptyPolicy(event.target.value as 'succeed' | 'fail')}><option value="succeed">成功并记录“无匹配资源”</option><option value="fail">失败并提醒管理员</option></Select></Field> : null}
    {forEachStep ? <Field label="单项失败处理" hint="继续处理时会保留每项状态；至少一项成功则输出部分失败汇总，全部失败仍标记运行失败。"><Select value={forEachStep.continue_on_error ? 'continue' : 'stop'} onChange={(event) => updateForEachFailurePolicy(event.target.value === 'continue')}><option value="stop">立即停止整个运行</option><option value="continue">继续处理其余资源</option></Select></Field> : null}
    <Field label="绑定 Agent" hint="每个 model 步骤必须固定绑定 Agent；Skill 和 Tool 授权在 Agent 内生效。"><Select required value={boundAgentID} onChange={(event) => event.target.value && bindAgent(Number(event.target.value))}><option value="" disabled>选择 Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.enabled ? '' : '（已停用）'}</option>)}</Select></Field>
    <details className="workflow-advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}><summary>高级设置：输入与步骤 <small>仅在需要精细控制时修改</small></summary><p>Workflow 只编排已配置的 Agent 与确定性资源查询；Tool 由 Skill 和 Agent 授权调用。JSON Pointer（如 <code>/steps/writer</code>）负责传值。</p><div className="form-grid"><Field label="运行范围"><Select value={scopeMode} onChange={(event) => setScopeMode(event.target.value as 'strict' | 'unscoped')}><option value="strict">严格限制</option><option value="unscoped">兼容模式</option></Select></Field><Field label="允许发现的只读 Tool" hint="逗号分隔；必须已被绑定 Skill 授权。"><input className="input-field mono" value={discoveryTools} onChange={(event) => setDiscoveryTools(event.target.value)} /></Field></div><Field label={labels.schema} hint="JSON Schema。资源字段使用 x-gouno-resource 和 x-gouno-widget 扩展。"><textarea className="input-field mono" rows={8} value={schema} onChange={(event) => setSchema(event.target.value)} /></Field><Field label={labels.steps} hint="允许 resource_query、model、for_each、approval_gate、output；服务端会校验每个步骤。"><textarea className="input-field mono" rows={16} value={steps} onChange={(event) => setSteps(event.target.value)} /></Field></details>
    <FormActions><Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button><Button variant="primary" type="submit"><Save />{labels.save}</Button></FormActions>
  </FormLayout></EditorPanel>;
}
