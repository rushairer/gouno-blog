import { ChevronRight, ShieldCheck, X } from 'lucide-react';
import type { AgentApproval, ContentCandidateSet, EditorialTask, MediaCandidate, OperationalSuggestion, WorkflowInteractionTask } from '../../agent';
import { workflowApi } from '../../api/workflows';
import { ProposalPreview } from './ProposalPreview';
import { StatusPill } from './StatusPill';
import { OperationsWorkspace } from './OperationsWorkspace';
import { JsonPreview } from './AgentRunRecords';
import { Button, EmptyState, Panel } from '../ui';

function approvalSummary(approval: AgentApproval, zh: boolean): { title: string; explanation: string } {
  const isPage = approval.target_type === 'page';
  const fieldName = approval.proposed_payload.field === 'title' ? (zh ? '标题' : 'title') : (zh ? '摘要' : 'summary');
  const target = approval.target_id
    ? (isPage ? (zh ? `单页 #${approval.target_id}` : `page #${approval.target_id}`) : (zh ? `文章 #${approval.target_id}` : `post #${approval.target_id}`))
    : (isPage ? (zh ? '单页' : 'the page') : (zh ? '相关内容' : 'the related content'));
  const isImageBrief = approval.action_type === 'create_media_candidate'
    || (approval.action_type === 'create_distribution_draft' && approval.proposed_payload.format === 'image_brief');

  if (approval.action_type === 'create_content_candidates') {
    return {
      title: zh ? `为${target}准备${fieldName}候选` : `Prepare ${fieldName} alternatives for ${target}`,
      explanation: zh
        ? `AI 将创建可供你选择的${fieldName}建议。选择其中一项后，系统会再向你展示具体的内容修改审批。`
        : `AI will prepare ${fieldName} alternatives for you to choose from. Choosing one will create a separate approval with the exact content edit.`,
    };
  }
  if (isImageBrief) {
    return {
      title: zh ? `为${target}准备图片方案` : `Prepare an image brief for ${target}`,
      explanation: zh
        ? 'AI 将准备经过审核的图片说明；批准后会创建图片任务，真正生成图片仍需要你之后再次点击确认。'
        : 'AI will prepare a reviewed image brief. Approval creates an image task; generating the actual image still requires a separate confirmation.',
    };
  }
  return {
    title: zh ? `对${target}应用内容建议` : `Apply a content proposal to ${target}`,
    explanation: zh ? '批准后，系统会应用下面展示的建议变更。' : 'Approving will apply the proposed change shown below.',
  };
}

export function FriendlyApprovalQueue({
  locale,
  approvals,
  selected,
  onSelect,
  onReview,
}: {
  locale: 'en' | 'zh';
  approvals: AgentApproval[];
  selected: AgentApproval | null;
  onSelect: (approval: AgentApproval) => void;
  onReview: (approval: AgentApproval, approved: boolean) => void;
}) {
  const zh = locale === 'zh';
  const selectedSummary = selected ? approvalSummary(selected, zh) : null;
  const proposalPreview = selected ? (
    <ProposalPreview actionType={selected.action_type} payload={selected.proposed_payload} locale={locale} />
  ) : null;
  const selectedIsActionable = selected?.status === 'pending' || selected?.status === 'failed';

  return (
    <Panel className="approval-queue">
      <div className="panel-heading">
        <div>
          <h3>{zh ? '需要你决定的内容变更' : 'Changes that need your decision'}</h3>
          <small>{zh ? '先读清楚影响，再决定是否批准。AI 不会绕过你的确认。' : 'Understand the impact first, then decide. AI never bypasses your confirmation.'}</small>
        </div>
      </div>
      {approvals.length === 0 ? (
        <EmptyState label={zh ? '当前没有待审批变更。' : 'No changes awaiting approval.'} />
      ) : (
        <div className="agent-approval-workspace">
          <div className="agent-master-panel agent-approval-list">
            {approvals.map((approval) => {
              const summary = approvalSummary(approval, zh);
              return (
                <button
                  className={selected?.id === approval.id ? 'active' : ''}
                  key={approval.id}
                  type="button"
                  onClick={() => onSelect(approval)}
                >
                  <span>
                    <strong>{summary.title}</strong>
                    <small>{zh ? `来自 AI 运行 #${approval.run_id}` : `From AI run #${approval.run_id}`}</small>
                  </span>
                  <StatusPill status={approval.status} locale={locale} />
                </button>
              );
            })}
          </div>
          <div className="agent-approval-detail">
            {selected && selectedSummary ? (
              <div className="approval-decision section-stack">
                <div>
                  <span className="risk-label risk-label--propose">{zh ? '请你确认' : 'Your confirmation needed'}</span>
                  <h2>{selectedSummary.title}</h2>
                  <p>{selectedSummary.explanation}</p>
                </div>
                {selected.status === 'failed' ? (
                  <div className="approval-decision__failure" role="alert">
                    <strong>{zh ? '上次执行失败，提案未丢失' : 'The previous execution failed; the proposal is preserved'}</strong>
                    <span>{selected.review_note || (zh ? '未记录具体错误，请重试；若再次失败请查看服务日志。' : 'No specific error was recorded. Retry, then inspect service logs if it fails again.')}</span>
                  </div>
                ) : null}
                <div className="approval-decision__facts">
                  <section>
                    <small>{zh ? '批准后会发生什么' : 'What happens if approved'}</small>
                    <strong>{selectedSummary.title}</strong>
                  </section>
                  <section>
                    <small>{zh ? '不会发生什么' : 'What will not happen'}</small>
                    <strong>{selected.action_type === 'create_content_candidates' ? (zh ? '不会直接修改或发布文章' : 'No article will be edited or published') : (zh ? '不会影响其他文章或设置' : 'No other post or settings are affected')}</strong>
                  </section>
                </div>
                {proposalPreview}
                {selected.before_snapshot ? (
                  <section className="approval-decision__before">
                    <small>{zh ? '变更前原始数据' : 'Previous raw data'}</small>
                    <JsonPreview value={selected.before_snapshot} />
                  </section>
                ) : null}
                {!proposalPreview ? (
                  <section>
                    <small>{zh ? '建议的内容' : 'Proposed content'}</small>
                    <JsonPreview value={selected.proposed_payload} />
                  </section>
                ) : null}
                <details className="approval-decision__technical">
                  <summary>
                    {zh ? '查看技术详情' : 'View technical details'}
                    <ChevronRight />
                  </summary>
                  <JsonPreview value={selected.proposed_payload} />
                </details>
                {selectedIsActionable ? (
                  <div className="agent-approval-actions">
                    <Button variant="secondary" type="button" onClick={() => onReview(selected, false)}>
                      <X />{zh ? '拒绝此建议' : 'Reject proposal'}
                    </Button>
                    <Button variant="primary" type="button" onClick={() => onReview(selected, true)}>
                      <ShieldCheck />
                      {selected.status === 'failed' ? (zh ? '重试批准并执行' : 'Retry approval and execution') : (zh ? '批准并继续' : 'Approve and continue')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState label={zh ? '选择一项查看其影响。' : 'Select an item to understand its impact.'} />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function InteractionInbox({
  locale,
  tasks,
  onResolved,
}: {
  locale: 'en' | 'zh';
  tasks: WorkflowInteractionTask[];
  onResolved: () => Promise<void>;
}) {
  if (tasks.length === 0) return null;
  const zh = locale === 'zh';
  const resolve = async (task: WorkflowInteractionTask, response: unknown) => {
    await workflowApi.resolveInteraction(task, response);
    await onResolved();
  };

  return (
    <Panel className="approval-queue">
      <div className="panel-heading">
        <div>
          <h3>{zh ? '流程交互' : 'Workflow interactions'}</h3>
          <small>{zh ? '图片选择、确认和输入都在这里处理，并回到原运行。' : 'Choices, confirmations, and inputs resume their source run.'}</small>
        </div>
        <strong>{tasks.length}</strong>
      </div>
      <div className="agent-approval-list">
        {tasks.map((task) => (
          <div className="workflow-interaction" key={task.id}>
            <div>
              <strong>
                {task.interaction_type === 'choice'
                  ? (zh ? '选择项' : 'Choose an option')
                  : task.interaction_type === 'preview_confirm'
                  ? (zh ? '确认预览' : 'Confirm preview')
                  : (zh ? '确认操作' : 'Confirm action')}
              </strong>
              <small>
                {task.workflow_run_id ? `Run #${task.workflow_run_id}` : `Agent run #${task.agent_run_id}`}
                {task.workflow_step_id ? ` · ${task.workflow_step_id}` : ''}
              </small>
            </div>
            {task.interaction_type === 'choice' && Array.isArray(task.options) ? (
              task.options.map((option, index) => (
                <button
                  className="btn btn-secondary"
                  type="button"
                  key={index}
                  onClick={() => void resolve(task, { option })}
                >
                  {String(option)}
                </button>
              ))
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => void resolve(task, { confirmed: true })}>
                {zh ? '确认并继续' : 'Confirm and continue'}
              </button>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function InboxWorkspace({
  locale,
  approvals,
  selectedApproval,
  onSelectApproval,
  onReviewApproval,
  interactions,
  onResolvedInteraction,
  suggestions,
  candidateSets,
  mediaCandidates,
  editorialTasks,
  onRefresh,
}: {
  locale: 'en' | 'zh';
  approvals: AgentApproval[];
  selectedApproval: AgentApproval | null;
  onSelectApproval: (approval: AgentApproval) => void;
  onReviewApproval: (approval: AgentApproval, approved: boolean) => void;
  interactions: WorkflowInteractionTask[];
  onResolvedInteraction: () => Promise<void>;
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates: MediaCandidate[];
  editorialTasks: EditorialTask[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      <InteractionInbox locale={locale} tasks={interactions} onResolved={onResolvedInteraction} />
      <FriendlyApprovalQueue
        locale={locale}
        approvals={approvals}
        selected={selectedApproval}
        onSelect={onSelectApproval}
        onReview={onReviewApproval}
      />
      <OperationsWorkspace
        suggestions={suggestions}
        candidateSets={candidateSets}
        mediaCandidates={mediaCandidates}
        editorialTasks={editorialTasks}
        locale={locale}
        onRefresh={onRefresh}
      />
    </>
  );
}
