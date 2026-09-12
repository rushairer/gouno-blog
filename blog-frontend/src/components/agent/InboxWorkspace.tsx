import { ChevronRight, ShieldCheck, X } from "lucide-react";
import type {
  AgentApproval,
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
  WorkflowInteractionTask,
} from "../../types/agent";
import { workflowApi } from "../../api/workflows";
import { ProposalPreview } from "./ProposalPreview";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { JsonPreview } from "./AgentRunRecords";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  Heading,
  Tag,
  Text,
} from "@gouno/ui/core";

function approvalSummary(
  approval: AgentApproval,
  zh: boolean,
): { title: string; explanation: string } {
  const isPage = approval.target_type === "page";
  const fieldName =
    approval.proposed_payload.field === "title"
      ? zh
        ? "标题"
        : "title"
      : zh
        ? "摘要"
        : "summary";
  const target = approval.target_id
    ? isPage
      ? zh
        ? `单页 #${approval.target_id}`
        : `page #${approval.target_id}`
      : zh
        ? `文章 #${approval.target_id}`
        : `post #${approval.target_id}`
    : isPage
      ? zh
        ? "单页"
        : "the page"
      : zh
        ? "相关内容"
        : "the related content";
  const isImageBrief =
    approval.action_type === "create_media_candidate" ||
    (approval.action_type === "create_distribution_draft" &&
      approval.proposed_payload.format === "image_brief");

  if (approval.action_type === "create_content_candidates") {
    return {
      title: zh
        ? `为${target}准备${fieldName}候选`
        : `Prepare ${fieldName} alternatives for ${target}`,
      explanation: zh
        ? `AI 将创建可供你选择的${fieldName}建议。选择其中一项后，系统会再向你展示具体的内容修改审批。`
        : `AI will prepare ${fieldName} alternatives for you to choose from. Choosing one will create a separate approval with the exact content edit.`,
    };
  }
  if (isImageBrief) {
    return {
      title: zh
        ? `为${target}准备图片方案`
        : `Prepare an image brief for ${target}`,
      explanation: zh
        ? "AI 将准备经过审核的图片说明；批准后会创建图片任务，真正生成图片仍需要你之后再次点击确认。"
        : "AI will prepare a reviewed image brief. Approval creates an image task; generating the actual image still requires a separate confirmation.",
    };
  }
  return {
    title: zh
      ? `对${target}应用内容建议`
      : `Apply a content proposal to ${target}`,
    explanation: zh
      ? "批准后，系统会应用下面展示的建议变更。"
      : "Approving will apply the proposed change shown below.",
  };
}

function approvalStatusLabel(approval: AgentApproval, zh: boolean) {
  if (approval.status === "failed") return zh ? "执行失败" : "Execution failed";
  if (approval.status === "pending") return zh ? "待审批" : "Pending";
  if (approval.status === "approved") return zh ? "已批准" : "Approved";
  if (approval.status === "rejected") return zh ? "已拒绝" : "Rejected";
  return approval.status;
}

function approvalStatusColor(
  approval: AgentApproval,
): "error" | "warning" | "default" {
  if (approval.status === "failed") return "error";
  if (approval.status === "pending") return "warning";
  return "default";
}

export function FriendlyApprovalQueue({
  locale,
  approvals,
  selected,
  onSelect,
  onReview,
}: {
  locale: "en" | "zh";
  approvals: AgentApproval[];
  selected: AgentApproval | null;
  onSelect: (approval: AgentApproval) => void;
  onReview: (approval: AgentApproval, approved: boolean) => void;
}) {
  const zh = locale === "zh";
  const selectedSummary = selected ? approvalSummary(selected, zh) : null;
  const proposalPreview = selected ? (
    <ProposalPreview
      actionType={selected.action_type}
      payload={selected.proposed_payload}
      locale={locale}
    />
  ) : null;
  const selectedIsActionable =
    selected?.status === "pending" || selected?.status === "failed";

  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader
        className="border-b p-6"
        title={zh ? "需要你决定的内容变更" : "Changes that need your decision"}
        description={
          zh
            ? "先读清楚影响，再决定是否批准。AI 不会绕过你的确认。"
            : "Understand the impact first, then decide. AI never bypasses your confirmation."
        }
      />
      <CardContent className="p-0">
        {approvals.length === 0 ? (
          <div className="p-6">
            <Empty
              title={zh ? "当前没有待审批变更" : "No changes awaiting approval"}
            />
          </div>
        ) : (
          <div className="grid min-h-96 grid-cols-1 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.8fr)]">
            <div className="border-b lg:border-b-0 lg:border-r">
              {approvals.map((approval) => {
                const summary = approvalSummary(approval, zh);
                return (
                  <Button
                    key={approval.id}
                    type="button"
                    variant="ghost"
                    aria-pressed={selected?.id === approval.id}
                    className={`h-auto w-full justify-start rounded-none border-b p-4 text-left transition-colors last:border-b-0 hover:bg-muted/40 ${selected?.id === approval.id ? "bg-muted/50" : ""}`}
                    onClick={() => onSelect(approval)}
                  >
                    <span className="flex w-full items-start justify-between gap-3 text-left">
                      <span className="min-w-0">
                        <strong className="block text-sm">
                          {summary.title}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {zh
                            ? `来自 AI 运行 #${approval.run_id}`
                            : `From AI run #${approval.run_id}`}
                        </span>
                      </span>
                      <Tag color={approvalStatusColor(approval)}>
                        {approvalStatusLabel(approval, zh)}
                      </Tag>
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="min-w-0 p-6">
              {selected && selectedSummary ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <Tag color="warning">
                      {zh ? "请你确认" : "Your confirmation needed"}
                    </Tag>
                    <Heading level={2}>{selectedSummary.title}</Heading>
                    <Text tone="muted">{selectedSummary.explanation}</Text>
                  </div>
                  {selected.status === "failed" ? (
                    <Alert
                      type="error"
                      showIcon
                      title={
                        zh
                          ? "上次执行失败，提案未丢失"
                          : "The previous execution failed; the proposal is preserved"
                      }
                      description={
                        selected.review_note ||
                        (zh
                          ? "未记录具体错误，请重试；若再次失败请查看服务日志。"
                          : "No specific error was recorded. Retry, then inspect service logs if it fails again.")
                      }
                    />
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Card padding="sm" variant="subtle">
                      <Text size="xs" tone="muted">
                        {zh ? "批准后会发生什么" : "What happens if approved"}
                      </Text>
                      <strong className="mt-1 block text-sm">
                        {selectedSummary.title}
                      </strong>
                    </Card>
                    <Card padding="sm" variant="subtle">
                      <Text size="xs" tone="muted">
                        {zh ? "不会发生什么" : "What will not happen"}
                      </Text>
                      <strong className="mt-1 block text-sm">
                        {selected.action_type === "create_content_candidates"
                          ? zh
                            ? "不会直接修改或发布文章"
                            : "No article will be edited or published"
                          : zh
                            ? "不会影响其他文章或设置"
                            : "No other post or settings are affected"}
                      </strong>
                    </Card>
                  </div>
                  {proposalPreview}
                  {selected.before_snapshot ? (
                    <Card padding="base" variant="subtle">
                      <Text size="xs" tone="muted">
                        {zh ? "变更前原始数据" : "Previous raw data"}
                      </Text>
                      <div className="mt-3">
                        <JsonPreview value={selected.before_snapshot} />
                      </div>
                    </Card>
                  ) : null}
                  {!proposalPreview ? (
                    <Card padding="base" variant="subtle">
                      <Text size="xs" tone="muted">
                        {zh ? "建议的内容" : "Proposed content"}
                      </Text>
                      <div className="mt-3">
                        <JsonPreview value={selected.proposed_payload} />
                      </div>
                    </Card>
                  ) : null}
                  <details className="rounded-md border p-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                      {zh ? "查看技术详情" : "View technical details"}
                      <ChevronRight className="size-4" />
                    </summary>
                    <div className="mt-4">
                      <JsonPreview value={selected.proposed_payload} />
                    </div>
                  </details>
                  {selectedIsActionable ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => onReview(selected, false)}
                        icon={<X />}
                      >
                        {zh ? "拒绝此建议" : "Reject proposal"}
                      </Button>
                      <Button
                        variant="solid"
                        color="primary"
                        type="button"
                        onClick={() => onReview(selected, true)}
                        icon={<ShieldCheck />}
                      >
                        {selected.status === "failed"
                          ? zh
                            ? "重试批准并执行"
                            : "Retry approval and execution"
                          : zh
                            ? "批准并继续"
                            : "Approve and continue"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Empty
                  title={
                    zh
                      ? "选择一项查看其影响"
                      : "Select an item to understand its impact"
                  }
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function InteractionInbox({
  locale,
  tasks,
  onResolved,
}: {
  locale: "en" | "zh";
  tasks: WorkflowInteractionTask[];
  onResolved: () => Promise<void>;
}) {
  if (tasks.length === 0) return null;
  const zh = locale === "zh";
  const resolve = async (task: WorkflowInteractionTask, response: unknown) => {
    await workflowApi.resolveInteraction(task, response);
    await onResolved();
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader
        className="border-b p-6"
        title={zh ? "流程交互" : "Workflow interactions"}
        description={
          zh
            ? "图片选择、确认和输入都在这里处理，并回到原运行。"
            : "Choices, confirmations, and inputs resume their source run."
        }
        action={<Tag color="primary">{tasks.length}</Tag>}
      />
      <CardContent className="divide-y p-0">
        {tasks.map((task) => (
          <div key={task.id} className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-sm">
                  {task.interaction_type === "choice"
                    ? zh
                      ? "选择项"
                      : "Choose an option"
                    : task.interaction_type === "preview_confirm"
                      ? zh
                        ? "确认预览"
                        : "Confirm preview"
                      : zh
                        ? "确认操作"
                        : "Confirm action"}
                </strong>
                <Text size="xs" tone="muted">
                  {task.workflow_run_id
                    ? `Run #${task.workflow_run_id}`
                    : `Agent run #${task.agent_run_id}`}
                  {task.workflow_step_id ? ` · ${task.workflow_step_id}` : ""}
                </Text>
              </div>
              <Tag>
                {task.interaction_type === "choice"
                  ? zh
                    ? "选择项"
                    : "Choice"
                  : zh
                    ? "确认"
                    : "Confirmation"}
              </Tag>
            </div>
            <div className="flex flex-wrap gap-2">
              {task.interaction_type === "choice" &&
              Array.isArray(task.options) ? (
                task.options.map((option, index) => (
                  <Button
                    size="small"
                    variant="outline"
                    key={index}
                    onClick={() => void resolve(task, { option })}
                  >
                    {String(option)}
                  </Button>
                ))
              ) : (
                <Button
                  size="small"
                  variant="solid"
                  color="primary"
                  onClick={() => void resolve(task, { confirmed: true })}
                >
                  {zh ? "确认并继续" : "Confirm and continue"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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
  locale: "en" | "zh";
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
    <div className="flex flex-col gap-6">
      <InteractionInbox
        locale={locale}
        tasks={interactions}
        onResolved={onResolvedInteraction}
      />
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
    </div>
  );
}
