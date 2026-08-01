import { CirclePause, GitBranch, GitCompareArrows, History, Play, Plus, RotateCcw, Save, TestTube2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../auth';
import type { Workflow, WorkflowMetric, WorkflowRun, WorkflowStep } from '../../agent';
import { Button, EditorPanel, EmptyState, Field, FormActions, FormLayout, Panel, PanelHeader, WorkspacePanel } from '../ui';

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

export function WorkflowWorkspace({ workflows, runs, metrics, locale, onMutate, onSave }: {
  workflows: Workflow[];
  runs: WorkflowRun[];
  metrics: WorkflowMetric[];
  locale: 'en' | 'zh';
  onMutate: (path: string, method?: string, body?: unknown) => Promise<void>;
  onSave: (value: WorkflowValue) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null);
  const [inputByID, setInputByID] = useState<Record<number, string>>({});
  const [versions, setVersions] = useState<Record<number, Workflow[]>>({});
  const [selectedWorkflowID, setSelectedWorkflowID] = useState<number | null>(null);
  const labels = locale === 'zh' ? {
    empty: '还没有 Workflow。', add: '创建 Workflow', run: '运行', dry: 'Dry-run', enable: '启用',
    disable: '停用', versions: '版本', rollback: '回滚', input: '运行输入 JSON', steps: '步骤 JSON',
    schema: '输入 Schema', save: '保存 Workflow', cancel: '取消', metrics: '运行 / 失败 / Token',
    createTitle: '创建 Workflow', editTitle: '编辑 Workflow',
  } : {
    empty: 'No workflows yet.', add: 'Create Workflow', run: 'Run', dry: 'Dry-run', enable: 'Enable',
    disable: 'Disable', versions: 'Versions', rollback: 'Rollback', input: 'Run input JSON', steps: 'Steps JSON',
    schema: 'Input schema', save: 'Save Workflow', cancel: 'Cancel', metrics: 'Runs / failures / tokens',
    createTitle: 'Create Workflow', editTitle: 'Edit Workflow',
  };
  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.workflow_id, item])), [metrics]);
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowID) || workflows[0] || null;
  const loadVersions = async (workflow: Workflow) => {
    const items = await readData<Workflow[]>(await apiFetch(`/api/admin/ai-workflows/${workflow.id}/versions`));
    setVersions((current) => ({ ...current, [workflow.id]: items }));
  };
  if (editing) return <WorkflowEditor initial={editing === 'new' ? undefined : editing} labels={labels} onCancel={() => setEditing(null)} onSave={async (value) => { await onSave(value); setEditing(null); }} />;
  return <WorkspacePanel className="workflow-workspace">
    <PanelHeader title={locale === 'zh' ? '自动化' : 'Automation'} description={locale === 'zh' ? '选择一项持续运营目标；每次执行都可追溯、可试运行、可回滚。' : 'Choose an ongoing goal. Every run is traceable, testable, and reversible.'} actions={<Button variant="primary" type="button" onClick={() => setEditing('new')}><Plus />{labels.add}</Button>} />
    {workflows.length === 0 || !selectedWorkflow ? <EmptyState label={labels.empty} /> : <div className="agent-split-view workflow-split-view">
      <Panel className="agent-master-panel workflow-master-list">
        {workflows.map((workflow) => {
          const latestRun = runs.find((run) => run.workflow_id === workflow.id);
          return <button className={workflow.id === selectedWorkflow.id ? 'active' : ''} key={workflow.id} type="button" onClick={() => setSelectedWorkflowID(workflow.id)}>
            <span><strong>{workflow.name}</strong><small>{workflow.description}</small></span>
            <span className={`status-pill status-pill--${latestRun?.status || (workflow.enabled ? 'succeeded' : 'pending')}`}>{workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')}</span>
          </button>;
        })}
      </Panel>
      <Panel className="workflow-detail-panel">
        {(() => {
          const workflow = selectedWorkflow;
          const metric = metricMap.get(workflow.id);
          const latestRun = runs.find((run) => run.workflow_id === workflow.id);
          const inputText = inputByID[workflow.id] ?? JSON.stringify(exampleInput(workflow.input_schema), null, 2);
          return <div className="section-stack"><div className="panel-heading"><div><h2>{workflow.name}</h2><small>{workflow.description} · v{workflow.current_version}</small></div><span className={`status-pill status-pill--${workflow.enabled ? 'succeeded' : 'pending'}`}>{workflow.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : (locale === 'zh' ? '已停用' : 'Disabled')}</span></div>
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" type="button" onClick={() => setEditing(workflow)}><GitCompareArrows />Edit</Button><Button variant="secondary" type="button" onClick={() => void loadVersions(workflow)}><History />{labels.versions}</Button><Button variant="secondary" type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/${workflow.enabled ? 'disable' : 'enable'}`)}>{workflow.enabled ? <CirclePause /> : <Play />}{workflow.enabled ? labels.disable : labels.enable}</Button></div>
            <Field label={labels.input}><textarea className="input-field mono" rows={6} value={inputText} onChange={(event) => setInputByID((current) => ({ ...current, [workflow.id]: event.target.value }))} /></Field>
            <div className="row-actions workflow-detail-actions"><Button variant="secondary" type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/dry-run`, 'POST', { input: JSON.parse(inputText) })}><TestTube2 />{labels.dry}</Button><Button variant="primary" disabled={!workflow.enabled} type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/run`, 'POST', { input: JSON.parse(inputText) })}><Play />{labels.run}</Button></div>
            <div className="agent-run-metrics"><span><small>{labels.metrics}</small><strong>{metric?.runs || 0} / {metric?.failures || 0} / {metric?.tokens || 0}</strong></span><span><small>Status</small><strong>{latestRun?.status || '—'}{latestRun?.dry_run ? ' · dry-run' : ''}</strong></span></div>
            {versions[workflow.id]?.length ? <div className="agent-chip-list">{versions[workflow.id].map((version) => <button type="button" key={version.version_id} disabled={version.current_version === workflow.current_version} onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/rollback`, 'POST', { version: version.current_version })}><RotateCcw />v{version.current_version}</button>)}</div> : null}
            {latestRun?.output ? <pre className="agent-json-preview">{JSON.stringify(latestRun.output, null, 2)}</pre> : latestRun?.error_message ? <p>{latestRun.error_message}</p> : null}
          </div>;
        })()}
      </Panel>
    </div>}
  </WorkspacePanel>;
}

function WorkflowEditor({ initial, labels, onSave, onCancel }: {
  initial?: Workflow;
  labels: Record<string, string>;
  onSave: (value: WorkflowValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [schema, setSchema] = useState(JSON.stringify(initial?.input_schema || { type: 'object', additionalProperties: false }, null, 2));
  const [steps, setSteps] = useState(JSON.stringify(initial?.steps || [], null, 2));
  const [goal, setGoal] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial));
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
    await onSave({ id: initial?.id, name, description, enabled: initial?.enabled || false, input_schema: JSON.parse(schema), steps: JSON.parse(steps) });
  };
  return <EditorPanel title={initial ? labels.editTitle : labels.createTitle} icon={<GitBranch />} closeLabel={labels.cancel} onClose={onCancel}><FormLayout onSubmit={submit}>
    {!initial ? <section className="workflow-planner"><div><h3>告诉 AI 你想持续完成什么</h3><p>例如：“每天检查最近发布文章的 SEO，并把需要人工确认的建议汇总出来”。AI 只生成未启用草案，不会运行或修改内容。</p></div><textarea className="input-field" rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="描述目标、频率、输入来源，以及哪些结果需要你确认…" /><FormActions><Button variant="secondary" type="button" disabled={planning} onClick={() => void generateDraft()}><GitBranch />{planning ? '正在生成草案…' : '用 AI 生成 Workflow 草案'}</Button></FormActions>{plannerMessage ? <p className="workflow-planner__message">{plannerMessage}</p> : null}</section> : null}
    <Field label="名称" hint="面向日常运营的短名称，例如“发布前内容检查”。"><input className="input-field" required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="作用说明" hint="说明此流程何时使用、会产出什么，以及人工确认边界。"><input className="input-field" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    <details className="workflow-advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}><summary>高级设置：输入与步骤 <small>仅在需要精细控制时修改</small></summary><p>Workflow 由受版本锁定的 Agent 组成。常用步骤依次是：调用 Agent → 等待审批 → 输出结果。输入 Schema 定义运行时可以填写的字段；JSON Pointer（如 <code>/input/post_id</code>）用来把输入传给步骤。</p><Field label={labels.schema} hint="JSON Schema。示例：{&quot;type&quot;:&quot;object&quot;,&quot;properties&quot;:{&quot;post_id&quot;:{&quot;type&quot;:&quot;integer&quot;}},&quot;required&quot;:[&quot;post_id&quot;],&quot;additionalProperties&quot;:false}"><textarea className="input-field mono" rows={8} value={schema} onChange={(event) => setSchema(event.target.value)} /></Field><Field label={labels.steps} hint="允许 model、approval_gate、output；model 必须引用已保存 Skill 的 Agent。保存时服务端会校验所有步骤。"><textarea className="input-field mono" rows={16} value={steps} onChange={(event) => setSteps(event.target.value)} /></Field></details>
    <FormActions><Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button><Button variant="primary" type="submit"><Save />{labels.save}</Button></FormActions>
  </FormLayout></EditorPanel>;
}
