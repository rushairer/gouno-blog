import { ChevronRight, GitBranch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../auth';
import type { MediaCandidate, Workflow, WorkflowInteractionTask, WorkflowResource, WorkflowRun, WorkflowStepRun } from '../../agent';
import { EmptyState, Panel, Select } from '../ui';
import { StatusPill } from './StatusPill';

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body.data as T;
}

function duration(start?: string, finish?: string): string {
  if (!start || !finish) return '—';
  const milliseconds = new Date(finish).getTime() - new Date(start).getTime();
  if (milliseconds < 1000) return `${Math.max(0, milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} s`;
}

function JsonLog({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <span>—</span>;
  return <pre className="agent-json-preview">{JSON.stringify(value, null, 2)}</pre>;
}

export function WorkflowRunRecords({ locale, workflows, runs, formatDateTime, onRefresh }: {
  locale: 'en' | 'zh';
  workflows: Workflow[];
  runs: WorkflowRun[];
  formatDateTime: (value: string) => string;
  onRefresh?: () => Promise<void>;
}) {
  const zh = locale === 'zh';
  const [workflowID, setWorkflowID] = useState(() => {
    const value = Number(new URLSearchParams(window.location.search).get('workflow'));
    return workflows.some((workflow) => workflow.id === value) ? value : 0;
  });
  const [selected, setSelected] = useState<{ run: WorkflowRun; steps: WorkflowStepRun[]; resources: WorkflowResource[]; interactions: WorkflowInteractionTask[]; candidates: MediaCandidate[] } | null>(null);
  const [loadingID, setLoadingID] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState('');
  const names = useMemo(() => new Map(workflows.map((item) => [item.id, item.name])), [workflows]);
  const filtered = workflowID ? runs.filter((run) => run.workflow_id === workflowID) : runs;

  const inspect = async (run: WorkflowRun) => {
    setLoadingID(run.id);
    setError('');
    try {
      const [steps, resources, interactions, candidates] = await Promise.all([
        readData<WorkflowStepRun[]>(await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/steps`)),
        readData<WorkflowResource[]>(await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/resources`)),
        readData<WorkflowInteractionTask[]>(await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/interactions`)),
        readData<MediaCandidate[]>(await apiFetch(`/api/admin/ai-workflow-runs/${run.id}/media-candidates`)),
      ]);
      setSelected({ run, steps, resources, interactions: interactions.filter((item) => ['approval', 'choice', 'input', 'preview_confirm'].includes(item.interaction_type)), candidates: candidates.filter((item) => ['brief_ready', 'ready_to_generate', 'generating', 'generated', 'rejected', 'failed'].includes(item.generation_status)) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '无法载入步骤日志。' : 'Could not load step logs.'));
    } finally {
      setLoadingID(null);
    }
  };

  const resolveInteraction = async (task: WorkflowInteractionTask, response: unknown) => {
    setError('');
    try {
      await readData<WorkflowInteractionTask>(await apiFetch(`/api/admin/ai-interactions/${task.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume_token: task.resume_token, response }) }));
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? '交互提交失败。' : 'Could not resolve interaction.')); }
  };

  const candidateAction = async (candidate: MediaCandidate, action: 'select' | 'apply' | 'regenerate') => {
    setError('');
    try {
      const path = action === 'select' ? `/api/admin/ai-image-tasks/${candidate.id}/select` : action === 'apply' ? `/api/admin/ai-image-tasks/${candidate.id}/apply` : `/api/admin/ai-image-tasks/${candidate.id}/regenerate`;
      await readData<unknown>(await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: action === 'select' ? JSON.stringify({ placement: candidate.placement || 'cover', anchor: candidate.anchor || '' }) : undefined }));
      if (selected) await inspect(selected.run);
      if (onRefresh) await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : (zh ? '图片任务操作失败。' : 'Image task action failed.')); }
  };

  const retryStep = async (step: WorkflowStepRun) => {
    if (!selected || step.iteration === undefined) return;
    const key = `${step.step_id}:${step.iteration}`;
    setRetrying(key);
    setError('');
    try {
      await readData<WorkflowRun>(await apiFetch(`/api/admin/ai-workflow-runs/${selected.run.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_id: step.step_id, iterations: [step.iteration] }),
      }));
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '重试失败。' : 'Retry failed.'));
    } finally {
      setRetrying('');
    }
  };

  const retryFailedGroup = async (stepID: string) => {
    if (!selected) return;
    const iterations = selected.steps.filter((step) => step.step_id === stepID && step.status === 'failed' && step.iteration !== undefined).map((step) => step.iteration as number);
    if (iterations.length === 0) return;
    setRetrying(`${stepID}:all`);
    setError('');
    try {
      await readData<WorkflowRun>(await apiFetch(`/api/admin/ai-workflow-runs/${selected.run.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_id: stepID, iterations }),
      }));
      if (onRefresh) await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '批量重试失败。' : 'Batch retry failed.'));
    } finally {
      setRetrying('');
    }
  };

  return <div className="workflow-records section-stack">
    <div className="workflow-records__filter"><label>{zh ? '筛选 Workflow' : 'Filter Workflow'}<Select value={workflowID} onChange={(event) => { setWorkflowID(Number(event.target.value)); setSelected(null); }}><option value={0}>{zh ? '全部 Workflow' : 'All Workflows'}</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</Select></label></div>
    {error ? <p className="workflow-records__error">{error}</p> : null}
    <div className="agent-split-view">
      <Panel className="agent-master-panel agent-run-list">{filtered.length === 0 ? <EmptyState label={zh ? '还没有 Workflow 运行记录。' : 'No Workflow runs recorded yet.'} /> : filtered.map((run) => <button className={selected?.run.id === run.id ? 'active' : ''} key={run.id} type="button" onClick={() => void inspect(run)}><span className={`run-icon run-icon--${run.status}`}><GitBranch /></span><span><strong>{names.get(run.workflow_id) || `Workflow #${run.workflow_id}`}</strong><small>{formatDateTime(run.started_at || run.created_at)} · {run.dry_run ? (zh ? '试运行' : 'Dry-run') : (run.schedule_key ? (zh ? `计划 ${run.schedule_key}` : `Scheduled ${run.schedule_key}`) : (zh ? '手动运行' : 'Manual'))}</small></span><span>{loadingID === run.id ? <b>{zh ? '载入中' : 'Loading'}</b> : <StatusPill status={run.status} locale={locale} />}<ChevronRight /></span></button>)}</Panel>
      <Panel className="agent-detail-panel">{selected ? <div className="section-stack">
        <div className="panel-heading"><div><h2>{names.get(selected.run.workflow_id) || `Workflow #${selected.run.workflow_id}`}</h2><small>Run #{selected.run.id} · Workflow v{selected.run.workflow_version_id}</small></div><StatusPill status={selected.run.status} locale={locale} /></div>
        <div className="agent-run-metrics"><span><small>{zh ? '开始时间' : 'Started'}</small><strong>{selected.run.started_at ? formatDateTime(selected.run.started_at) : '—'}</strong></span><span><small>{zh ? '结束时间' : 'Finished'}</small><strong>{selected.run.finished_at ? formatDateTime(selected.run.finished_at) : '—'}</strong></span><span><small>{zh ? '总耗时' : 'Duration'}</small><strong>{duration(selected.run.started_at, selected.run.finished_at)}</strong></span><span><small>{zh ? '步骤数' : 'Steps'}</small><strong>{selected.steps.length}</strong></span></div>
        {selected.run.error_message ? <section className="workflow-run-error"><h3>{zh ? '失败原因' : 'Failure'}</h3><p>{selected.run.error_message}</p>{selected.run.error_code ? <small>{selected.run.error_code}</small> : null}</section> : null}
        <section className="workflow-run-resources"><div className="panel-heading"><div><h3>{zh ? '运行资源' : 'Run resources'}</h3><small>{zh ? '目标可用于提案；发现资源始终只读。' : 'Targets may be proposed for change; discovered resources stay read-only.'}</small></div><strong>{selected.resources.length}</strong></div>{selected.resources.length === 0 ? <EmptyState label={zh ? '该运行没有结构化资源快照。' : 'No structured resource snapshot for this run.'} /> : <div>{selected.resources.map((resource) => <span key={resource.id}><strong>{resource.label || `${resource.type} #${resource.key}`}</strong><small>{resource.type} · {resource.source === 'manual' ? (zh ? '手选' : 'manual') : resource.source === 'query' ? (zh ? '规则命中' : 'query') : (zh ? '动态发现' : 'discovery')} · {resource.access_level === 'target' ? (zh ? '目标' : 'target') : (zh ? '只读' : 'read-only')}</small></span>)}</div>}</section>
        {selected.interactions.length > 0 ? <section className="workflow-interactions"><div className="panel-heading"><div><h3>{zh ? '需要你处理' : 'Needs your input'}</h3><small>{zh ? '交互任务属于本次运行，完成后流程会继续。' : 'Interaction tasks belong to this run and resume it when completed.'}</small></div></div>{selected.interactions.map((task) => <div className="workflow-interaction" key={task.id}><div><strong>{task.interaction_type === 'choice' ? (zh ? '请选择' : 'Choose an option') : task.interaction_type === 'preview_confirm' ? (zh ? '确认预览并继续' : 'Confirm preview') : (zh ? '请确认操作' : 'Confirmation required')}</strong><small>{task.workflow_step_id || `Task #${task.id}`} · {task.status}</small></div>{task.status === 'pending' ? <div className="agent-row-actions">{task.interaction_type === 'choice' && Array.isArray(task.options) ? task.options.map((option, index) => <button className="btn btn-secondary" type="button" key={index} onClick={() => void resolveInteraction(task, { option })}>{String(option)}</button>) : <button className="btn btn-primary" type="button" onClick={() => void resolveInteraction(task, { confirmed: true })}>{zh ? '确认并继续' : 'Confirm and continue'}</button>}</div> : task.response ? <JsonLog value={task.response} /> : null}</div>)}</section> : null}
        {selected.candidates.length > 0 ? <section className="workflow-interactions"><div className="panel-heading"><div><h3>{zh ? '图片候选' : 'Image candidates'}</h3><small>{zh ? '候选属于本次运行；确认应用后会创建文章新版本。' : 'Candidates belong to this run; applying creates a new article version.'}</small></div></div>{selected.candidates.map((candidate) => <div className="workflow-interaction" key={candidate.id}><div><strong>{candidate.headline || `Candidate #${candidate.id}`}</strong><small>{candidate.generation_status} · {candidate.selected ? (zh ? '已选择' : 'selected') : (zh ? '未选择' : 'not selected')} · {candidate.placement || 'cover'}</small>{candidate.error_message ? <small>{candidate.error_message}</small> : null}</div><div className="agent-row-actions">{candidate.generation_status === 'generated' && !candidate.selected ? <button className="btn btn-secondary" type="button" onClick={() => void candidateAction(candidate, 'select')}>{zh ? '选择' : 'Select'}</button> : null}{candidate.generation_status === 'generated' && candidate.selected && !candidate.applied_version_id ? <button className="btn btn-primary" type="button" onClick={() => void candidateAction(candidate, 'apply')}>{zh ? '确认应用' : 'Apply to article'}</button> : null}{candidate.generation_status === 'failed' || candidate.generation_status === 'ready_to_generate' ? <button className="btn btn-secondary" type="button" onClick={() => void candidateAction(candidate, 'regenerate')}>{zh ? '重新生成' : 'Regenerate'}</button> : null}</div></div>)}</section> : null}
        <details className="workflow-log-block"><summary>{zh ? '运行输入' : 'Run input'}</summary><JsonLog value={selected.run.input} /></details>
        {selected.run.output !== undefined ? <details className="workflow-log-block"><summary>{zh ? '最终输出' : 'Final output'}</summary><JsonLog value={selected.run.output} /></details> : null}
        <section className="workflow-step-log"><div className="panel-heading"><div><h3>{zh ? '步骤日志' : 'Step logs'}</h3><small>{zh ? '按实际执行顺序排列；展开查看输入、输出与错误。' : 'Ordered by execution time. Expand for input, output and errors.'}</small></div><div>{Array.from(new Set(selected.steps.filter((step) => step.status === 'failed' && step.iteration !== undefined).map((step) => step.step_id))).map((stepID) => <button className="btn btn-secondary" key={stepID} type="button" disabled={retrying !== ''} onClick={() => void retryFailedGroup(stepID)}>{retrying === `${stepID}:all` ? (zh ? '批量重试中…' : 'Retrying…') : (zh ? `重试 ${stepID} 的全部失败项` : `Retry all failed ${stepID}`)}</button>)}</div></div>{selected.steps.length === 0 ? <EmptyState label={zh ? '该运行没有步骤日志。' : 'No step logs for this run.'} /> : selected.steps.map((step, index) => <details key={step.id} open={step.status === 'failed'}><summary><span>{index + 1}</span><div><strong>{step.step_id}</strong><small>{step.step_type}{step.iteration !== undefined ? ` · #${step.iteration}` : ''}</small></div><StatusPill status={step.status} locale={locale} /><small>{duration(step.started_at, step.finished_at)}</small></summary><div className="workflow-step-log__body"><div><small>{zh ? '开始 / 结束' : 'Start / finish'}</small><p>{formatDateTime(step.started_at)} → {step.finished_at ? formatDateTime(step.finished_at) : '—'}</p></div>{step.error_message ? <div className="workflow-run-error"><small>{zh ? '错误' : 'Error'}</small><p>{step.error_message}</p>{step.status === 'failed' && step.iteration !== undefined ? <button className="btn btn-secondary" type="button" disabled={retrying !== ''} onClick={() => void retryStep(step)}>{retrying === `${step.step_id}:${step.iteration}` ? (zh ? '重试中…' : 'Retrying…') : (zh ? '重试此资源' : 'Retry resource')}</button> : null}</div> : null}<div><small>{zh ? '输入' : 'Input'}</small><JsonLog value={step.input} /></div><div><small>{zh ? '输出' : 'Output'}</small><JsonLog value={step.output} /></div></div></details>)}</section>
      </div> : <EmptyState label={zh ? '选择一条 Workflow 运行记录查看步骤日志。' : 'Select a Workflow run to inspect its step logs.'} />}</Panel>
    </div>
  </div>;
}
