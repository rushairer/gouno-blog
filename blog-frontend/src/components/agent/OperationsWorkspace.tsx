import { useState } from 'react';
import { Check, ClipboardList, RefreshCw, ThumbsDown } from 'lucide-react';
import type { ContentCandidateSet, OperationalSuggestion, OutcomeMetrics } from '../../agent';
import { EmptyState, Field, Panel } from '../ui';

type Mutate = (path: string, method?: string, body?: unknown) => Promise<void>;

export function OperationsWorkspace({ suggestions, candidateSets, metrics, locale, onMutate }: {
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  metrics: OutcomeMetrics;
  locale: 'en' | 'zh';
  onMutate: Mutate;
}) {
  const [targetType, setTargetType] = useState<'run' | 'approval' | 'suggestion'>('suggestion');
  const [targetID, setTargetID] = useState('');
  const [label, setLabel] = useState<'adopted' | 'rejected' | 'invalid'>('adopted');
  const [note, setNote] = useState('');
  const zh = locale === 'zh';
  const feedbackCount = metrics.feedback.reduce((sum, item) => sum + item.count, 0);

  const saveFeedback = async () => {
    const id = Number(targetID);
    if (!Number.isInteger(id) || id <= 0) return;
    await onMutate('/api/admin/ai-feedback', 'POST', {
      target_type: targetType, target_id: id, label, note,
    });
    setNote('');
  };

  return <div className="section-stack">
    <Panel>
      <div className="panel-heading">
        <div><h2><ClipboardList />{zh ? '运营闭环' : 'Operations loop'}</h2><small>{zh ? '所有建议和内容候选均需人工处理。' : 'Every suggestion and content candidate remains human-controlled.'}</small></div>
        <button className="btn btn-secondary" type="button" onClick={() => void onMutate('/api/admin/ai-suggestions/refresh')}><RefreshCw />{zh ? '刷新检测建议' : 'Refresh detected suggestions'}</button>
      </div>
      <div className="agent-run-metrics agent-run-metrics--operations">
        <span><small>{zh ? '建议' : 'Suggestions'}</small><strong>{metrics.suggestions}</strong></span>
        <span><small>{zh ? '已转任务' : 'Converted'}</small><strong>{metrics.converted}</strong></span>
        <span><small>{zh ? '已选候选集' : 'Selected sets'}</small><strong>{metrics.selected_candidate_sets}/{metrics.candidate_sets}</strong></span>
        <span><small>{zh ? '反馈' : 'Feedback'}</small><strong>{feedbackCount}</strong></span>
      </div>
    </Panel>

    <Panel className="agent-table-panel">
      <div className="panel-heading"><h3>{zh ? '站内建议' : 'Internal suggestions'}</h3></div>
      {suggestions.length === 0 ? <EmptyState label={zh ? '当前没有运营建议。' : 'No operational suggestions.'} /> :
        <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{zh ? '建议' : 'Suggestion'}</th><th>{zh ? '依据' : 'Evidence'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead><tbody>
          {suggestions.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.description}</small><small>{item.source_type} · {item.priority}</small></td><td><code>{JSON.stringify(item.evidence)}</code></td><td><span className={`status-pill status-pill--${item.status}`}>{item.status}</span>{item.ignored_reason ? <small>{item.ignored_reason}</small> : null}</td><td><div className="row-actions">{item.status === 'new' ? <>
            <button className="btn btn-secondary" type="button" onClick={() => { const reason = window.prompt(zh ? '忽略原因' : 'Reason for ignoring'); if (reason) void onMutate(`/api/admin/ai-suggestions/${item.id}/ignore`, 'POST', { reason }); }}><ThumbsDown />{zh ? '忽略' : 'Ignore'}</button>
            <button className="btn btn-primary" type="button" onClick={() => void onMutate(`/api/admin/ai-suggestions/${item.id}/convert`)}><Check />{zh ? '转任务' : 'Convert'}</button>
          </> : null}<button className="btn btn-secondary" type="button" onClick={() => { setTargetType('suggestion'); setTargetID(String(item.id)); }}>{zh ? '反馈' : 'Feedback'}</button></div></td></tr>)}
        </tbody></table></div>}
    </Panel>

    <Panel className="agent-table-panel">
      <div className="panel-heading"><h3>{zh ? '内容候选集' : 'Content candidate sets'}</h3></div>
      {candidateSets.length === 0 ? <EmptyState label={zh ? '当前没有待选内容候选。' : 'No content candidates awaiting selection.'} /> :
        <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{zh ? '文章 / 字段' : 'Post / field'}</th><th>{zh ? '当前值' : 'Current value'}</th><th>{zh ? '候选' : 'Candidates'}</th><th>{zh ? '状态' : 'Status'}</th></tr></thead><tbody>
          {candidateSets.map((set) => <tr key={set.id}><td><strong>#{set.post_id}</strong><small>{set.field_type} · Run #{set.source_run_id}</small></td><td>{set.before_value || '—'}</td><td><div className="section-stack">{set.candidates.map((candidate) => <div key={candidate.id}><strong>{candidate.value}</strong>{candidate.rationale ? <small>{candidate.rationale}</small> : null}{set.status === 'pending' ? <button className="btn btn-secondary" type="button" onClick={() => void onMutate(`/api/admin/ai-candidates/${set.id}/select`, 'POST', { candidate_id: candidate.id })}>{zh ? '选择并生成审批' : 'Select and create approval'}</button> : null}</div>)}</div></td><td><span className={`status-pill status-pill--${set.status}`}>{set.status}</span></td></tr>)}
        </tbody></table></div>}
    </Panel>

    <Panel>
      <div className="panel-heading"><div><h3>{zh ? '结果反馈' : 'Outcome feedback'}</h3><small>{zh ? '反馈仅用于离线指标，不会自动修改 Prompt。' : 'Feedback powers offline metrics only and never rewrites prompts.'}</small></div></div>
      <div className="form-grid feedback-form">
        <Field label={zh ? '对象' : 'Target'}><select className="input-field" value={targetType} onChange={(event) => setTargetType(event.target.value as typeof targetType)}><option value="run">Run</option><option value="approval">Approval</option><option value="suggestion">Suggestion</option></select></Field>
        <Field label="ID"><input className="input-field" type="number" min="1" value={targetID} onChange={(event) => setTargetID(event.target.value)} /></Field>
        <Field label={zh ? '标签' : 'Label'}><select className="input-field" value={label} onChange={(event) => setLabel(event.target.value as typeof label)}><option value="adopted">adopted</option><option value="rejected">rejected</option><option value="invalid">invalid</option></select></Field>
        <Field label={zh ? '备注' : 'Note'}><input className="input-field" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></Field>
        <div className="feedback-form__actions">
          <button className="btn btn-primary" type="button" disabled={!targetID} onClick={() => void saveFeedback()}>{zh ? '保存反馈' : 'Save feedback'}</button>
        </div>
      </div>
    </Panel>
  </div>;
}
