import { CirclePause, GitBranch, GitCompareArrows, History, Play, Plus, RotateCcw, Save, TestTube2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../auth';
import type { Agent, Workflow, WorkflowMetric, WorkflowRun, WorkflowStep } from '../../agent';
import { Button, ConfirmDialog, EditorPanel, EmptyState, Feedback, Field, FormActions, FormLayout, Panel, PanelHeader, Select, WorkspacePanel } from '../ui';

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
  const [inputByID, setInputByID] = useState<Record<number, string>>({});
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
    disable: '停用', versions: '版本', rollback: '回滚', input: '运行输入 JSON', steps: '步骤 JSON',
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
            <span className={`status-pill status-pill--${workflow.enabled ? 'succeeded' : 'pending'}`}>{workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')}</span>
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
          const inputText = inputByID[workflow.id] ?? JSON.stringify(exampleInput(workflow.input_schema), null, 2);
          const inputProperties = workflow.input_schema.properties && typeof workflow.input_schema.properties === 'object'
            ? Object.keys(workflow.input_schema.properties as Record<string, unknown>)
            : [];
          const hasRuntimeInput = inputProperties.length > 0;
          const runInput = () => hasRuntimeInput ? JSON.parse(inputText) : {};
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
          return <div className="section-stack"><div className="panel-heading"><div><h2>{workflow.name}</h2><small>{workflow.description} · v{workflow.current_version}</small></div><span className={`status-pill status-pill--${workflow.enabled ? 'succeeded' : 'pending'}`}>{workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')}</span></div>
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" type="button" onClick={() => setEditing(workflow)}><GitCompareArrows />Edit</Button><Button variant="secondary" type="button" onClick={() => void loadVersions(workflow)}><History />{labels.versions}</Button><Button variant="secondary" disabled={!workflow.enabled && Boolean(runBlockReason)} title={!workflow.enabled ? (runBlockReason || undefined) : undefined} type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/${workflow.enabled ? 'disable' : 'enable'}`)}>{workflow.enabled ? <CirclePause /> : <Play />}{workflow.enabled ? labels.disable : labels.enable}</Button><Button variant="danger" type="button" onClick={() => setDeleteTarget(workflow)}><Trash2 />{locale === 'zh' ? '删除' : 'Delete'}</Button></div>
            {hasRuntimeInput ? <Field label={labels.input}><textarea className="input-field mono" rows={6} value={inputText} onChange={(event) => setInputByID((current) => ({ ...current, [workflow.id]: event.target.value }))} /></Field> : <div className="workflow-runtime-input"><small>{labels.input}</small><strong>{locale === 'zh' ? '无需手动填写' : 'No manual input required'}</strong><p>{locale === 'zh' ? '运行值由已配置的 Agent 提供。' : 'Runtime values come from configured Agents.'}</p></div>}
            {runBlockReason ? <Feedback type="error">{runBlockReason}</Feedback> : null}
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" loading={Boolean(activeRun)} disabled={Boolean(runBlockReason)} title={runBlockReason || undefined} type="button" onClick={() => void runWorkflow(workflow, true, runInput())}>{activeRun?.dryRun ? <span className="spinner workflow-button-spinner" aria-hidden="true" /> : <TestTube2 />}{activeRun?.dryRun ? (locale === 'zh' ? '试运行中…' : 'Dry-running…') : labels.dry}</Button><Button variant="primary" loading={Boolean(activeRun)} disabled={!workflow.enabled || latestRun?.status === 'running' || Boolean(runBlockReason)} title={runBlockReason || undefined} type="button" onClick={() => void runWorkflow(workflow, false, runInput())}>{activeRun && !activeRun.dryRun ? <span className="spinner workflow-button-spinner" aria-hidden="true" /> : <Play />}{activeRun && !activeRun.dryRun ? (locale === 'zh' ? '运行中…' : 'Running…') : (latestRun?.status === 'failed' ? labels.retry : labels.run)}</Button></div>
            {activeRun ? <div className="workflow-run-progress" role="status" aria-live="polite"><span className="spinner workflow-progress-spinner" aria-hidden="true" /><span><strong>{locale === 'zh' ? `${activeRun.dryRun ? '试运行' : 'Workflow'} 正在执行` : `${activeRun.dryRun ? 'Dry-run' : 'Workflow'} is running`}</strong><small>{locale === 'zh' ? '请勿重复点击；完成后会自动刷新状态和运行记录。' : 'Do not submit again. Status and run records refresh automatically when complete.'}</small></span></div> : null}
            {feedback ? <Feedback type={feedback.type}>{feedback.message}</Feedback> : null}
            <div className="agent-run-metrics"><span><small>{labels.schedule}</small><strong>{workflow.cron_expression || (locale === 'zh' ? '仅手动' : 'Manual only')}</strong><small>{workflow.cron_expression ? workflow.timezone : ''}</small></span><span><small>{labels.next}</small><strong>{workflow.next_run_at ? new Date(workflow.next_run_at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '—'}</strong></span><span><small>{labels.metrics}</small><strong>{metric?.runs || 0} / {metric?.failures || 0} / {metric?.tokens || 0}</strong></span><span><small>{locale === 'zh' ? '最近正式运行' : 'Latest live run'}</small><strong>{latestRun?.status || '—'}</strong>{latestDryRun ? <small>{locale === 'zh' ? `最近试运行：${latestDryRun.status}` : `Latest dry-run: ${latestDryRun.status}`}</small> : null}</span></div>
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
  const [schema, setSchema] = useState(JSON.stringify(initial?.input_schema || { type: 'object', additionalProperties: false }, null, 2));
  const [steps, setSteps] = useState(JSON.stringify(initial?.steps || [], null, 2));
  const [goal, setGoal] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial));
  const [boundAgentID, setBoundAgentID] = useState<number | ''>(() => initial?.steps.find((step) => step.type === 'model')?.agent_id || '');
  const bindAgent = (id: number) => {
    const current = JSON.parse(steps) as WorkflowStep[];
    setSteps(JSON.stringify(current.map((step) => step.type === 'model' ? { ...step, agent_id: id } : step), null, 2));
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
    await onSave({ id: initial?.id, name, description, enabled: initial?.enabled || false, cron_expression: cronExpression.trim() || undefined, timezone, input_schema: JSON.parse(schema), steps: JSON.parse(steps) });
  };
  return <EditorPanel title={initial ? labels.editTitle : labels.createTitle} icon={<GitBranch />} closeLabel={labels.cancel} onClose={onCancel}><FormLayout onSubmit={submit}>
    {!initial ? <section className="workflow-planner"><div><h3>告诉 AI 你想持续完成什么</h3><p>例如：“每天检查最近发布文章的 SEO，并把需要人工确认的建议汇总出来”。AI 只生成未启用草案，不会运行或修改内容。</p></div><textarea className="input-field" rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="描述目标、频率、输入来源，以及哪些结果需要你确认…" /><FormActions><Button variant="secondary" type="button" disabled={planning} onClick={() => void generateDraft()}><GitBranch />{planning ? '正在生成草案…' : '用 AI 生成 Workflow 草案'}</Button></FormActions>{plannerMessage ? <p className="workflow-planner__message">{plannerMessage}</p> : null}</section> : null}
    <Field label="名称" hint="面向日常运营的短名称，例如“发布前内容检查”。"><input className="input-field" required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="作用说明" hint="说明此流程何时使用、会产出什么，以及人工确认边界。"><input className="input-field" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <div className="form-grid workflow-schedule-grid"><Field label="Cron 执行计划" hint="留空表示仅手动运行；例如每天 09:00：0 9 * * *"><input className="input-field mono" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 9 * * *" /></Field><Field label="时区" hint="使用 IANA 时区，例如 Asia/Shanghai"><input className="input-field mono" required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field></div>
    <Field label="绑定 Agent" hint="每个 model 步骤必须固定绑定 Agent；Skill 和 Tool 授权在 Agent 内生效。"><Select required value={boundAgentID} onChange={(event) => event.target.value && bindAgent(Number(event.target.value))}><option value="" disabled>选择 Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.enabled ? '' : '（已停用）'}</option>)}</Select></Field>
    <details className="workflow-advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}><summary>高级设置：输入与步骤 <small>仅在需要精细控制时修改</small></summary><p>Workflow 只编排已配置的 Agent 与控制流；Tool 由 Skill 和 Agent 授权调用。JSON Pointer（如 <code>/steps/writer</code>）负责传值。</p><Field label={labels.schema} hint="JSON Schema。示例：{&quot;type&quot;:&quot;object&quot;,&quot;properties&quot;:{&quot;post_id&quot;:{&quot;type&quot;:&quot;integer&quot;}},&quot;required&quot;:[&quot;post_id&quot;],&quot;additionalProperties&quot;:false}"><textarea className="input-field mono" rows={8} value={schema} onChange={(event) => setSchema(event.target.value)} /></Field><Field label={labels.steps} hint="允许 model、for_each、approval_gate、output；服务端会校验每个步骤。"><textarea className="input-field mono" rows={16} value={steps} onChange={(event) => setSteps(event.target.value)} /></Field></details>
    <FormActions><Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button><Button variant="primary" type="submit"><Save />{labels.save}</Button></FormActions>
  </FormLayout></EditorPanel>;
}
