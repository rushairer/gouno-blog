import { CirclePause, GitCompareArrows, History, Play, Plus, RotateCcw, Save, TestTube2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../auth';
import type { Workflow, WorkflowMetric, WorkflowRun, WorkflowStep } from '../../agent';
import { Button, EmptyState, Field, Panel, PanelHeader, WorkspacePanel } from '../ui';

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
  const labels = locale === 'zh' ? {
    empty: '还没有 Workflow。', add: '创建 Workflow', run: '运行', dry: 'Dry-run', enable: '启用',
    disable: '停用', versions: '版本', rollback: '回滚', input: '运行输入 JSON', steps: '步骤 JSON',
    schema: '输入 Schema', save: '保存 Workflow', cancel: '取消', metrics: '运行 / 失败 / Token',
  } : {
    empty: 'No workflows yet.', add: 'Create Workflow', run: 'Run', dry: 'Dry-run', enable: 'Enable',
    disable: 'Disable', versions: 'Versions', rollback: 'Rollback', input: 'Run input JSON', steps: 'Steps JSON',
    schema: 'Input schema', save: 'Save Workflow', cancel: 'Cancel', metrics: 'Runs / failures / tokens',
  };
  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.workflow_id, item])), [metrics]);
  const loadVersions = async (workflow: Workflow) => {
    const items = await readData<Workflow[]>(await apiFetch(`/api/admin/ai-workflows/${workflow.id}/versions`));
    setVersions((current) => ({ ...current, [workflow.id]: items }));
  };
  if (editing) return <WorkflowEditor initial={editing === 'new' ? undefined : editing} labels={labels} onCancel={() => setEditing(null)} onSave={async (value) => { await onSave(value); setEditing(null); }} />;
  return <WorkspacePanel className="workflow-workspace">
    <PanelHeader title={locale === 'zh' ? 'Workflows' : 'Workflows'} description={locale === 'zh' ? '编排可审计、可回滚的自动化运行流程。' : 'Orchestrate auditable, reversible automation runs.'} actions={<Button variant="primary" type="button" onClick={() => setEditing('new')}><Plus />{labels.add}</Button>} />
    {workflows.length === 0 ? <EmptyState label={labels.empty} /> : <div className="workflow-list">{workflows.map((workflow) => {
      const metric = metricMap.get(workflow.id);
      const latestRun = runs.find((run) => run.workflow_id === workflow.id);
      const inputText = inputByID[workflow.id] ?? JSON.stringify({ agent_id: 0 }, null, 2);
      return <article className="workflow-card" key={workflow.id}><div className="panel-heading"><div><h2>{workflow.name}</h2><small>{workflow.description} · v{workflow.current_version}</small></div><div className="row-actions"><Button variant="secondary" type="button" onClick={() => setEditing(workflow)}><GitCompareArrows />Edit</Button><Button variant="secondary" type="button" onClick={() => void loadVersions(workflow)}><History />{labels.versions}</Button><Button variant="secondary" type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/${workflow.enabled ? 'disable' : 'enable'}`)}>{workflow.enabled ? <CirclePause /> : <Play />}{workflow.enabled ? labels.disable : labels.enable}</Button></div></div>
        <Field label={labels.input}><textarea className="input-field mono" rows={4} value={inputText} onChange={(event) => setInputByID((current) => ({ ...current, [workflow.id]: event.target.value }))} /></Field>
        <div className="row-actions"><Button variant="secondary" type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/dry-run`, 'POST', { input: JSON.parse(inputText) })}><TestTube2 />{labels.dry}</Button><Button variant="primary" disabled={!workflow.enabled} type="button" onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/run`, 'POST', { input: JSON.parse(inputText) })}><Play />{labels.run}</Button></div>
        <div className="agent-run-metrics"><span><small>{labels.metrics}</small><strong>{metric?.runs || 0} / {metric?.failures || 0} / {metric?.tokens || 0}</strong></span><span><small>Status</small><strong>{latestRun?.status || '—'}{latestRun?.dry_run ? ' · dry-run' : ''}</strong></span></div>
        {versions[workflow.id]?.length ? <div className="agent-chip-list">{versions[workflow.id].map((version) => <button type="button" key={version.version_id} disabled={version.current_version === workflow.current_version} onClick={() => void onMutate(`/api/admin/ai-workflows/${workflow.id}/rollback`, 'POST', { version: version.current_version })}><RotateCcw />v{version.current_version}</button>)}</div> : null}
        {latestRun?.output ? <pre className="agent-json-preview">{JSON.stringify(latestRun.output, null, 2)}</pre> : latestRun?.error_message ? <p>{latestRun.error_message}</p> : null}
      </article>;
    })}</div>}
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({ id: initial?.id, name, description, enabled: initial?.enabled || false, input_schema: JSON.parse(schema), steps: JSON.parse(steps) });
  };
  return <Panel><form className="form-stack" onSubmit={submit}><Field label="Name"><input className="input-field" required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Description"><input className="input-field" value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Field label={labels.schema}><textarea className="input-field mono" rows={6} value={schema} onChange={(event) => setSchema(event.target.value)} /></Field><Field label={labels.steps}><textarea className="input-field mono" rows={16} value={steps} onChange={(event) => setSteps(event.target.value)} /></Field><div className="row-actions"><button className="btn btn-secondary" type="button" onClick={onCancel}>{labels.cancel}</button><button className="btn btn-primary" type="submit"><Save />{labels.save}</button></div></form></Panel>;
}
