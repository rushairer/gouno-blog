import { useState } from 'react';
import { Check, ChevronDown, Image, Lightbulb, Play, RefreshCw, Save, ThumbsDown } from 'lucide-react';
import type { ContentCandidateSet, MediaCandidate, OperationalSuggestion, OutcomeMetrics } from '../../agent';
import { Button, EmptyState, Field, FormActions, Panel, Select } from '../ui';

type Mutate = (path: string, method?: string, body?: unknown) => Promise<void>;

function fieldLabel(value: ContentCandidateSet['field_type'], zh: boolean) {
  if (!zh) return value.replace('_', ' ');
  return value === 'title' ? '文章标题' : value === 'summary' ? '文章摘要' : '封面替代文字';
}

function priorityLabel(value: OperationalSuggestion['priority'], zh: boolean) {
  if (!zh) return value === 'high' ? 'Needs attention' : value === 'medium' ? 'Worth reviewing' : 'Optional';
  return value === 'high' ? '优先处理' : value === 'medium' ? '建议查看' : '可稍后处理';
}

export function OperationsWorkspace({ suggestions, candidateSets, mediaCandidates = [], metrics, locale, onMutate }: {
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates?: MediaCandidate[];
  metrics: OutcomeMetrics;
  locale: 'en' | 'zh';
  onMutate: Mutate;
}) {
  const [targetType, setTargetType] = useState<'run' | 'approval' | 'suggestion'>('suggestion');
  const [targetID, setTargetID] = useState('');
  const [label, setLabel] = useState<'adopted' | 'rejected' | 'invalid'>('adopted');
  const [note, setNote] = useState('');
  const zh = locale === 'zh';
  const actionableSuggestions = suggestions.filter((item) => item.status === 'new');
  const pendingSets = candidateSets.filter((item) => item.status === 'pending');
  const readyMedia = mediaCandidates.filter((item) => item.generation_status === 'ready_to_generate');
  const total = actionableSuggestions.length + pendingSets.length + readyMedia.length;
  const feedbackCount = metrics.feedback.reduce((sum, item) => sum + item.count, 0);

  const saveFeedback = async () => {
    const id = Number(targetID);
    if (!Number.isInteger(id) || id <= 0) return;
    await onMutate('/api/admin/ai-feedback', 'POST', { target_type: targetType, target_id: id, label, note });
    setNote('');
  };

  return <div className="operations-queue section-stack">
    <Panel className="operations-queue__intro">
      <div className="panel-heading"><div><h2><Lightbulb />{zh ? '运营待办' : 'Operations to review'}</h2><small>{zh ? 'AI 已准备好建议；只显示现在需要你决定的事项。' : 'AI has prepared suggestions. Only items needing your decision are shown.'}</small></div><Button variant="secondary" type="button" onClick={() => void onMutate('/api/admin/ai-suggestions/refresh')}><RefreshCw />{zh ? '刷新建议' : 'Refresh suggestions'}</Button></div>
      <div className="operations-queue__counts"><span><strong>{total}</strong>{zh ? ' 项待处理' : ' items to review'}</span><span>{zh ? '不会自动修改或发布内容。' : 'No content is changed or published automatically.'}</span></div>
    </Panel>

    {total === 0 ? <EmptyState label={zh ? '目前没有需要你处理的运营事项。' : 'There are no operational items requiring your attention.'} /> : <div className="operations-task-list">
      {actionableSuggestions.map((item) => <article className="operations-task" key={`suggestion-${item.id}`}>
        <div className="operations-task__icon"><Lightbulb /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className={`risk-label risk-label--${item.priority === 'high' ? 'propose' : 'read'}`}>{priorityLabel(item.priority, zh)}</span><h3>{item.title}</h3></div></div><p>{item.description}</p><details><summary>{zh ? '查看 AI 的判断依据' : 'View AI evidence'}<ChevronDown /></summary><pre className="agent-json-preview">{JSON.stringify(item.evidence, null, 2)}</pre></details></div><div className="operations-task__actions"><Button variant="secondary" size="compact" type="button" onClick={() => { const reason = window.prompt(zh ? '为什么暂不处理？' : 'Why ignore this for now?'); if (reason) void onMutate(`/api/admin/ai-suggestions/${item.id}/ignore`, 'POST', { reason }); }}><ThumbsDown />{zh ? '暂不处理' : 'Ignore'}</Button><Button variant="primary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-suggestions/${item.id}/convert`)}><Check />{zh ? '转为待办' : 'Make task'}</Button></div>
      </article>)}
      {pendingSets.map((set) => <article className="operations-task" key={`candidate-${set.id}`}>
        <div className="operations-task__icon"><Check /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className="risk-label risk-label--propose">{zh ? '选择建议' : 'Choose a proposal'}</span><h3>{zh ? `为文章 #${set.post_id} 选择${fieldLabel(set.field_type, true)}` : `Choose a ${fieldLabel(set.field_type, false)} for post #${set.post_id}`}</h3></div></div><p>{zh ? `AI 提供了 ${set.candidates.length} 个候选。选择后会再生成一项内容变更审批，不会立即修改文章。` : `AI prepared ${set.candidates.length} alternatives. Choosing one creates a separate change approval; it does not edit the post yet.`}</p><details><summary>{zh ? `查看 ${set.candidates.length} 个候选` : `View ${set.candidates.length} alternatives`}<ChevronDown /></summary><div className="operations-candidates">{set.candidates.map((candidate) => <div key={candidate.id}><strong>{candidate.value}</strong>{candidate.rationale ? <p>{candidate.rationale}</p> : null}<Button variant="secondary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-candidates/${set.id}/select`, 'POST', { candidate_id: candidate.id })}>{zh ? '选择此建议并创建审批' : 'Choose and create approval'}</Button></div>)}</div></details></div>
      </article>)}
      {readyMedia.map((item) => <article className="operations-task" key={`media-${item.id}`}>
        <div className="operations-task__icon"><Image /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className="risk-label risk-label--propose">{zh ? '图片已审核' : 'Image brief reviewed'}</span><h3>{item.headline || (zh ? `为文章 #${item.post_id} 生成配图` : `Generate image for post #${item.post_id}`)}</h3></div></div><p>{item.brief}</p><details><summary>{zh ? '查看图片说明与替代文字' : 'View image brief and alt text'}<ChevronDown /></summary><p><b>Alt:</b> {item.alt_text || '—'}</p></details></div><div className="operations-task__actions"><Button variant="primary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-media-candidates/${item.id}/generate`, 'POST')}><Play />{zh ? '生成图片' : 'Generate image'}</Button></div>
      </article>)}
    </div>}

    <details className="operations-history"><summary>{zh ? '已处理事项与效果反馈' : 'Handled items and outcome feedback'}<ChevronDown /></summary><div className="operations-history__body"><p>{zh ? `已转待办 ${metrics.converted} 项；已记录 ${feedbackCount} 条反馈。反馈仅用于离线效果评估，不会改写 AI 指令。` : `${metrics.converted} items were made into tasks and ${feedbackCount} feedback entries were recorded. Feedback is used only for offline evaluation and never rewrites AI instructions.`}</p><form className="form-grid feedback-form" onSubmit={(event) => { event.preventDefault(); void saveFeedback(); }}><Field label={zh ? '对象' : 'Target'}><Select value={targetType} onChange={(event) => setTargetType(event.target.value as typeof targetType)}><option value="run">Run</option><option value="approval">Approval</option><option value="suggestion">Suggestion</option></Select></Field><Field label="ID"><input className="input-field" type="number" min="1" value={targetID} onChange={(event) => setTargetID(event.target.value)} /></Field><Field label={zh ? '结果' : 'Outcome'}><Select value={label} onChange={(event) => setLabel(event.target.value as typeof label)}><option value="adopted">adopted</option><option value="rejected">rejected</option><option value="invalid">invalid</option></Select></Field><Field label={zh ? '备注' : 'Note'}><input className="input-field" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></Field><FormActions className="feedback-form__actions"><Button variant="primary" type="submit" disabled={!targetID}><Save />{zh ? '保存反馈' : 'Save feedback'}</Button></FormActions></form></div></details>
  </div>;
}
