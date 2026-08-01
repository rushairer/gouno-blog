import { Check, ChevronDown, Image, Lightbulb, Play, RefreshCw, ThumbsDown, X } from 'lucide-react';
import type { ContentCandidateSet, EditorialTask, MediaCandidate, OperationalSuggestion } from '../../agent';
import { Button, EmptyState, Panel } from '../ui';

type Mutate = (path: string, method?: string, body?: unknown) => Promise<void>;

function fieldLabel(value: ContentCandidateSet['field_type'], zh: boolean) {
  if (!zh) return value.replace('_', ' ');
  return value === 'title' ? '文章标题' : value === 'summary' ? '文章摘要' : '封面替代文字';
}

function priorityLabel(value: OperationalSuggestion['priority'], zh: boolean) {
  if (!zh) return value === 'high' ? 'Needs attention' : value === 'medium' ? 'Worth reviewing' : 'Optional';
  return value === 'high' ? '优先处理' : value === 'medium' ? '建议查看' : '可稍后处理';
}

function taskStatusLabel(status: EditorialTask['status'], zh: boolean) {
  if (!zh) return status === 'done' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'Open';
  return status === 'done' ? '已完成' : status === 'cancelled' ? '已取消' : '进行中';
}

export function OperationsWorkspace({ suggestions, candidateSets, mediaCandidates = [], editorialTasks, locale, onMutate }: {
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates?: MediaCandidate[];
  editorialTasks: EditorialTask[];
  locale: 'en' | 'zh';
  onMutate: Mutate;
}) {
  const zh = locale === 'zh';
  const actionableSuggestions = suggestions.filter((item) => item.status === 'new');
  const handledSuggestions = suggestions.filter((item) => item.status !== 'new');
  const pendingSets = candidateSets.filter((item) => item.status === 'pending');
  const readyMedia = mediaCandidates.filter((item) => item.generation_status === 'ready_to_generate');
  const openTasks = editorialTasks.filter((item) => item.status === 'open');
  const closedTasks = editorialTasks.filter((item) => item.status !== 'open');
  const total = actionableSuggestions.length + pendingSets.length + readyMedia.length;

  const ignoreSuggestion = (item: OperationalSuggestion) => {
    const reason = window.prompt(zh ? '为什么暂不处理？' : 'Why defer this suggestion?');
    if (reason?.trim()) void onMutate(`/api/admin/ai-suggestions/${item.id}/ignore`, 'POST', { reason: reason.trim() });
  };

  return <div className="operations-queue section-stack">
    <Panel className="operations-queue__intro">
      <div className="panel-heading"><div><h2><Lightbulb />{zh ? '运营建议' : 'Operational suggestions'}</h2><small>{zh ? 'AI 发现值得关注的问题；只有创建编辑任务或执行后续审批时，才会产生实际变更。' : 'AI highlights items worth attention. Changes only happen after creating an editorial task or approving a later action.'}</small></div><Button variant="secondary" type="button" onClick={() => void onMutate('/api/admin/ai-suggestions/refresh')}><RefreshCw />{zh ? '刷新建议' : 'Refresh suggestions'}</Button></div>
      <div className="operations-queue__counts"><span><strong>{total}</strong>{zh ? ' 项待决定' : ' items to decide'}</span><span>{zh ? '创建编辑任务不会修改或发布内容。' : 'Creating an editorial task never changes or publishes content.'}</span></div>
    </Panel>

    {total === 0 ? <EmptyState label={zh ? '目前没有需要你决定的运营建议。' : 'There are no operational suggestions requiring a decision.'} /> : <div className="operations-task-list">
      {actionableSuggestions.map((item) => <article className="operations-task" key={`suggestion-${item.id}`}>
        <div className="operations-task__icon"><Lightbulb /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className={`risk-label risk-label--${item.priority === 'high' ? 'propose' : 'read'}`}>{priorityLabel(item.priority, zh)}</span><h3>{item.title}</h3></div></div><p>{item.description}</p><details><summary>{zh ? '查看 AI 的判断依据' : 'View AI evidence'}<ChevronDown /></summary><pre className="agent-json-preview">{JSON.stringify(item.evidence, null, 2)}</pre></details></div><div className="operations-task__actions"><Button variant="secondary" size="compact" type="button" onClick={() => ignoreSuggestion(item)}><ThumbsDown />{zh ? '暂不处理' : 'Defer'}</Button><Button variant="primary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-suggestions/${item.id}/convert`)}><Check />{zh ? '创建编辑任务' : 'Create editorial task'}</Button></div>
      </article>)}
      {pendingSets.map((set) => <article className="operations-task" key={`candidate-${set.id}`}>
        <div className="operations-task__icon"><Check /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className="risk-label risk-label--propose">{zh ? '选择建议' : 'Choose a proposal'}</span><h3>{zh ? `为文章 #${set.post_id} 选择${fieldLabel(set.field_type, true)}` : `Choose a ${fieldLabel(set.field_type, false)} for post #${set.post_id}`}</h3></div></div><p>{zh ? `AI 提供了 ${set.candidates.length} 个候选。选择后会再生成一项内容变更审批，不会立即修改文章。` : `AI prepared ${set.candidates.length} alternatives. Choosing one creates a separate change approval; it does not edit the post yet.`}</p><details><summary>{zh ? `查看 ${set.candidates.length} 个候选` : `View ${set.candidates.length} alternatives`}<ChevronDown /></summary><div className="operations-candidates">{set.candidates.map((candidate) => <div key={candidate.id}><strong>{candidate.value}</strong>{candidate.rationale ? <p>{candidate.rationale}</p> : null}<Button variant="secondary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-candidates/${set.id}/select`, 'POST', { candidate_id: candidate.id })}>{zh ? '选择此建议并创建审批' : 'Choose and create approval'}</Button></div>)}</div></details></div>
      </article>)}
      {readyMedia.map((item) => <article className="operations-task" key={`media-${item.id}`}>
        <div className="operations-task__icon"><Image /></div><div className="operations-task__content"><div className="operations-task__heading"><div><span className="risk-label risk-label--propose">{zh ? '图片已审核' : 'Image brief reviewed'}</span><h3>{item.headline || (zh ? `为文章 #${item.post_id} 生成配图` : `Generate image for post #${item.post_id}`)}</h3></div></div><p>{item.brief}</p><details><summary>{zh ? '查看图片说明与替代文字' : 'View image brief and alt text'}<ChevronDown /></summary><p><b>Alt:</b> {item.alt_text || '—'}</p></details></div><div className="operations-task__actions"><Button variant="primary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-media-candidates/${item.id}/generate`, 'POST')}><Play />{zh ? '生成图片' : 'Generate image'}</Button></div>
      </article>)}
    </div>}

    <Panel className="editorial-task-panel"><div className="panel-heading"><div><h2>{zh ? '编辑任务' : 'Editorial tasks'}</h2><small>{zh ? '由运营建议或已批准的 Agent 操作创建；完成或取消只更新任务状态。' : 'Created from operational suggestions or approved Agent actions. Completing or cancelling only changes the task status.'}</small></div><strong>{zh ? `${openTasks.length} 项进行中` : `${openTasks.length} open`}</strong></div>{openTasks.length === 0 ? <EmptyState label={zh ? '没有进行中的编辑任务。' : 'There are no open editorial tasks.'} /> : <div className="editorial-task-list">{openTasks.map((task) => <article key={task.id}><div><span className={`risk-label risk-label--${task.priority === 'high' ? 'propose' : 'read'}`}>{priorityLabel(task.priority, zh)}</span><h3>{task.title}</h3><p>{task.description}</p></div><div className="editorial-task-list__actions"><Button variant="secondary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-editorial-tasks/${task.id}/status`, 'POST', { status: 'cancelled' })}><X />{zh ? '取消' : 'Cancel'}</Button><Button variant="primary" size="compact" type="button" onClick={() => void onMutate(`/api/admin/ai-editorial-tasks/${task.id}/status`, 'POST', { status: 'done' })}><Check />{zh ? '标记完成' : 'Mark complete'}</Button></div></article>)}</div>}</Panel>

    {handledSuggestions.length > 0 || closedTasks.length > 0 ? <details className="operations-history"><summary>{zh ? '已处理记录' : 'Handled records'}<ChevronDown /></summary><div className="operations-history__body"><p>{zh ? '这里保留建议决策和已关闭任务的审计记录；不会自动改变 AI 指令。' : 'This retains an audit trail of suggestion decisions and closed tasks. It never changes AI instructions automatically.'}</p><ul>{handledSuggestions.map((item) => <li key={`suggestion-${item.id}`}><div><strong>{item.title}</strong>{item.ignored_reason ? <small>{zh ? `暂不处理：${item.ignored_reason}` : `Deferred: ${item.ignored_reason}`}</small> : <small>{zh ? '已创建编辑任务' : 'Editorial task created'}</small>}</div><span className={`status-pill status-pill--${item.status === 'converted' ? 'succeeded' : 'cancelled'}`}>{item.status === 'converted' ? (zh ? '已转任务' : 'Task created') : (zh ? '已暂缓' : 'Deferred')}</span></li>)}{closedTasks.map((task) => <li key={`task-${task.id}`}><div><strong>{task.title}</strong><small>{zh ? '编辑任务' : 'Editorial task'}</small></div><span className={`status-pill status-pill--${task.status === 'done' ? 'succeeded' : 'cancelled'}`}>{taskStatusLabel(task.status, zh)}</span></li>)}</ul></div></details> : null}
  </div>;
}
