import { Play, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import type { Workflow, WorkflowRun } from '../../agent';
import { Button, Feedback, Modal, Select } from '../ui';
import { WorkflowInputForm } from './WorkflowInputForm';

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body.data as T;
}

function resourceField(workflow: Workflow, type: string): string | undefined {
  const properties = (workflow.input_schema.properties || {}) as Record<string, Record<string, unknown>>;
  return Object.keys(properties).find((name) => properties[name]?.['x-gouno-resource'] === type);
}

function initialInput(workflow: Workflow, type: string, keys: Array<number | string>) {
  const properties = (workflow.input_schema.properties || {}) as Record<string, Record<string, unknown>>;
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (property['x-gouno-resource'] === type) value[name] = property.type === 'array' ? keys : keys[0];
    else if (property.type === 'array') value[name] = [];
    else if (property.type === 'boolean') value[name] = false;
    else if (Array.isArray(property.enum)) value[name] = property.enum[0];
    else if (property.type === 'integer' || property.type === 'number') value[name] = 0;
    else value[name] = '';
  }
  return value;
}

export function WorkflowLauncher({ open, resourceType, resourceKeys, onClose, title = '交给 AI' }: {
  open: boolean;
  resourceType: 'post' | 'comment' | 'media_asset' | 'operational_suggestion' | 'category' | 'tag' | 'page';
  resourceKeys: Array<number | string>;
  onClose: () => void;
  title?: string;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowID, setWorkflowID] = useState<number | ''>('');
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    apiFetch('/api/admin/ai-workflows').then((response) => readData<Workflow[]>(response)).then((items) => {
      const compatible = items.filter((item) => item.enabled && resourceField(item, resourceType));
      setWorkflows(compatible);
      const first = compatible[0];
      setWorkflowID(first?.id || '');
      setInput(first ? initialInput(first, resourceType, resourceKeys) : {});
      setFeedback(null);
    }).catch((reason: Error) => setFeedback({ type: 'error', text: reason.message }));
  }, [open, resourceKeys, resourceType]);
  const workflow = useMemo(() => workflows.find((item) => item.id === workflowID), [workflowID, workflows]);
  const choose = (id: number) => {
    const next = workflows.find((item) => item.id === id);
    setWorkflowID(id);
    setInput(next ? initialInput(next, resourceType, resourceKeys) : {});
  };
  const run = async () => {
    if (!workflow) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await readData<WorkflowRun>(await apiFetch(`/api/admin/ai-workflows/${workflow.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) }));
      setFeedback({ type: 'success', text: `Workflow 已提交（Run #${result.id}）。范围已固定为本次选择的 ${resourceKeys.length} 项资源。` });
    } catch (reason) { setFeedback({ type: 'error', text: reason instanceof Error ? reason.message : 'Workflow 运行失败。' }); }
    finally { setBusy(false); }
  };
  return <Modal className="workflow-launcher-modal" open={open} title={title} description={`已选择 ${resourceKeys.length} 项资源；Workflow 默认只能访问这些目标。`} onClose={onClose}>
    <div className="workflow-launcher">
      <div className="workflow-launcher__body">
        {workflows.length ? <><label className="workflow-launcher__workflow-field">Workflow<Select value={workflowID} onChange={(event) => choose(Number(event.target.value))}>{workflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>{workflow ? <WorkflowInputForm schema={workflow.input_schema} value={input} onChange={setInput} /> : null}</> : <p className="muted">没有已启用且支持此类资源输入的 Workflow。请先在 AI 工作台创建或启用一个兼容流程。</p>}
        {feedback ? <Feedback type={feedback.type}>{feedback.text}{feedback.type === 'success' && workflow ? <a href={`/admin/agents?tab=records&record=workflow&workflow=${workflow.id}`}>打开运行中心</a> : null}</Feedback> : null}
      </div>
      <div className="workflow-launcher__footer modal-actions"><Button variant="secondary" type="button" onClick={onClose}>关闭</Button><Button variant="primary" type="button" loading={busy} disabled={!workflow} onClick={() => void run()}>{busy ? <Sparkles /> : <Play />}运行</Button></div>
    </div>
  </Modal>;
}
