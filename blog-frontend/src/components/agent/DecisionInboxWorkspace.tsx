import {
  ArrowLeft,
  Check,
  Clock3,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationsApi } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  AgentApproval,
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
  WorkflowInteractionTask,
} from "../../types/agent";
import {
  Alert,
  Button,
  Empty,
  Heading,
  Modal,
  Tag,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { JsonPreview } from "./AgentRunRecords";
import {
  OperationsMeta,
  OperationsObjectRow,
  OperationsPanelLead,
  OperationsRegionHeading,
} from "./OperationsPatterns";
import { ProposalPreview } from "./ProposalPreview";

type DecisionKind =
  | "interaction"
  | "approval"
  | "suggestion"
  | "candidate"
  | "media"
  | "editorial";

type DecisionFilter = "all" | "approval" | "choice" | "operation" | "follow-up";

type DecisionPayload =
  | WorkflowInteractionTask
  | AgentApproval
  | OperationalSuggestion
  | ContentCandidateSet
  | MediaCandidate
  | EditorialTask;

type DecisionItem = {
  key: string;
  kind: DecisionKind;
  id: number;
  title: string;
  status: string;
  meta: string;
  summary: string;
  createdAt: string;
  payload: DecisionPayload;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function interactionTitle(task: WorkflowInteractionTask, zh: boolean) {
  const title =
    stringValue(task.payload.title) || stringValue(task.payload.label);
  if (title) return title;
  if (task.interaction_type === "choice")
    return zh ? "选择下一步" : "Choose the next step";
  if (task.interaction_type === "input")
    return zh ? "补充运行输入" : "Provide run input";
  if (task.interaction_type === "preview_confirm")
    return zh ? "确认运行预览" : "Confirm run preview";
  return zh ? "确认运行操作" : "Confirm run action";
}

function interactionStatus(task: WorkflowInteractionTask, zh: boolean) {
  if (task.interaction_type === "choice")
    return zh ? "需要选择" : "Choice required";
  if (task.interaction_type === "input")
    return zh ? "需要输入" : "Input required";
  if (task.interaction_type === "preview_confirm")
    return zh ? "需要确认" : "Confirmation required";
  return zh ? "需要审批" : "Approval required";
}

function approvalTitle(approval: AgentApproval, zh: boolean) {
  const target = approval.target_id
    ? `${approval.target_type === "page" ? (zh ? "单页" : "Page") : zh ? "文章" : "Post"} #${approval.target_id}`
    : zh
      ? "相关内容"
      : "related content";
  const field = approval.proposed_payload.field;
  if (approval.action_type === "create_content_candidates") {
    const label =
      field === "summary" ? (zh ? "摘要" : "summary") : zh ? "标题" : "title";
    return zh
      ? `为${target}准备${label}候选`
      : `Prepare ${label} candidates for ${target}`;
  }
  if (approval.action_type === "create_media_candidate") {
    return zh
      ? `为${target}准备图片方案`
      : `Prepare an image brief for ${target}`;
  }
  return zh
    ? `对${target}应用内容建议`
    : `Apply a content proposal to ${target}`;
}

function approvalImpact(approval: AgentApproval, zh: boolean) {
  if (approval.action_type === "create_content_candidates") {
    return {
      happens: zh
        ? "创建一组可选择的内容候选，并继续形成明确的内容变更审批。"
        : "Create selectable content candidates and continue through a separate content-change approval.",
      safe: zh
        ? "不会直接修改或发布文章。"
        : "The post is not edited or published directly.",
    };
  }
  if (approval.action_type === "create_media_candidate") {
    return {
      happens: zh
        ? "创建媒体任务；后续图片生成、选择和应用仍保留人工确认。"
        : "Create a media task while keeping later generation, selection, and application under human confirmation.",
      safe: zh
        ? "不会自动生成或应用图片。"
        : "No image is generated or applied automatically.",
    };
  }
  return {
    happens: zh
      ? "应用当前展示的内容建议。"
      : "Apply the content proposal shown here.",
    safe: zh
      ? "不会影响其他文章或站点设置。"
      : "Other posts and site settings are not affected.",
  };
}

function priorityLabel(
  priority: OperationalSuggestion["priority"],
  zh: boolean,
) {
  if (priority === "high") return zh ? "优先处理" : "High priority";
  if (priority === "medium") return zh ? "建议查看" : "Review suggested";
  return zh ? "可稍后" : "Can wait";
}

function buildDecisionItems({
  locale,
  interactions,
  approvals,
  suggestions,
  candidateSets,
  mediaCandidates,
  editorialTasks,
}: {
  locale: "en" | "zh";
  interactions: WorkflowInteractionTask[];
  approvals: AgentApproval[];
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates: MediaCandidate[];
  editorialTasks: EditorialTask[];
}): DecisionItem[] {
  const zh = locale === "zh";
  const items: DecisionItem[] = [];

  interactions
    .filter((task) => task.status === "pending")
    .forEach((task) => {
      items.push({
        key: `interaction-${task.id}`,
        kind: "interaction",
        id: task.id,
        title: interactionTitle(task, zh),
        status: interactionStatus(task, zh),
        meta: `${task.workflow_run_id ? `Run #${task.workflow_run_id}` : `Agent Run #${task.agent_run_id ?? "—"}`}${task.workflow_step_id ? ` · ${task.workflow_step_id}` : ""}`,
        summary:
          stringValue(task.payload.reason) ||
          stringValue(task.payload.description) ||
          (zh
            ? "当前运行需要你的输入才能继续。"
            : "The current run needs your input before it can continue."),
        createdAt: task.created_at,
        payload: task,
      });
    });

  approvals
    .filter(
      (approval) =>
        approval.status === "pending" || approval.status === "failed",
    )
    .forEach((approval) => {
      items.push({
        key: `approval-${approval.id}`,
        kind: "approval",
        id: approval.id,
        title: approvalTitle(approval, zh),
        status:
          approval.status === "failed"
            ? zh
              ? "执行失败"
              : "Execution failed"
            : zh
              ? "待审批"
              : "Pending approval",
        meta: `Agent Run #${approval.run_id}${approval.target_id ? ` · ${approval.target_type} #${approval.target_id}` : ""}`,
        summary:
          approval.status === "failed"
            ? approval.review_note ||
              (zh
                ? "上次批准后的执行失败，提案仍然保留。"
                : "Execution after approval failed; the proposal is preserved.")
            : zh
              ? "需要确认 AI 准备的变更及其影响范围。"
              : "Confirm the AI proposal and its impact boundary.",
        createdAt: approval.created_at,
        payload: approval,
      });
    });

  suggestions
    .filter((suggestion) => suggestion.status === "new")
    .forEach((suggestion) => {
      items.push({
        key: `suggestion-${suggestion.id}`,
        kind: "suggestion",
        id: suggestion.id,
        title: suggestion.title,
        status: priorityLabel(suggestion.priority, zh),
        meta: `${suggestion.source_type} · ${suggestion.source_key}${suggestion.workflow_run_id ? ` · Run #${suggestion.workflow_run_id}` : ""}`,
        summary: suggestion.description,
        createdAt: suggestion.created_at,
        payload: suggestion,
      });
    });

  candidateSets
    .filter((set) => set.status === "pending")
    .forEach((set) => {
      items.push({
        key: `candidate-${set.id}`,
        kind: "candidate",
        id: set.id,
        title: zh
          ? `为文章 #${set.post_id} 选择内容候选`
          : `Choose content for post #${set.post_id}`,
        status: zh ? "需要选择" : "Choice required",
        meta: `Run #${set.source_run_id} · ${set.field_type}`,
        summary: zh
          ? `${set.candidates.length} 个候选；选择后只会创建下一步内容变更审批。`
          : `${set.candidates.length} candidates; choosing one only creates the next content-change approval.`,
        createdAt: set.created_at,
        payload: set,
      });
    });

  mediaCandidates
    .filter(
      (item) =>
        !item.workflow_run_id &&
        ["brief_ready", "ready_to_generate"].includes(item.generation_status),
    )
    .forEach((item) => {
      items.push({
        key: `media-${item.id}`,
        kind: "media",
        id: item.id,
        title:
          item.headline ||
          (zh
            ? `为文章 #${item.post_id} 准备配图`
            : `Prepare image for post #${item.post_id}`),
        status:
          item.generation_status === "brief_ready"
            ? zh
              ? "待审核"
              : "Review brief"
            : zh
              ? "可生成"
              : "Ready to generate",
        meta: `${zh ? "文章" : "Post"} #${item.post_id}${item.placement ? ` · ${item.placement}` : ""}`,
        summary: item.brief,
        createdAt: item.created_at,
        payload: item,
      });
    });

  editorialTasks
    .filter((task) => task.status === "open")
    .forEach((task) => {
      items.push({
        key: `editorial-${task.id}`,
        kind: "editorial",
        id: task.id,
        title: task.title,
        status: zh ? "待跟进" : "Follow-up",
        meta: task.source_suggestion_id
          ? `${zh ? "建议" : "Suggestion"} #${task.source_suggestion_id}`
          : task.source_approval_id
            ? `${zh ? "审批" : "Approval"} #${task.source_approval_id}`
            : zh
              ? "编辑任务"
              : "Editorial task",
        summary: task.description,
        createdAt: task.created_at,
        payload: task,
      });
    });

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function decisionFilter(item: DecisionItem): Exclude<DecisionFilter, "all"> {
  if (item.kind === "approval") return "approval";
  if (item.kind === "interaction" || item.kind === "candidate") return "choice";
  if (item.kind === "suggestion" || item.kind === "media") return "operation";
  return "follow-up";
}

function DecisionStatus({ item }: { item: DecisionItem }) {
  if (
    item.status.includes("失败") ||
    item.status.toLowerCase().includes("failed")
  ) {
    return <Tag color="error">{item.status}</Tag>;
  }
  if (
    item.kind === "approval" ||
    item.kind === "interaction" ||
    item.kind === "candidate" ||
    item.status === "待审核"
  ) {
    return <Tag color="warning">{item.status}</Tag>;
  }
  if (item.kind === "media") return <Tag color="primary">{item.status}</Tag>;
  return <Tag>{item.status}</Tag>;
}

export function DecisionInboxWorkspace({
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
  formatDateTime = (value) => value || "—",
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
  formatDateTime?: (value?: string) => string;
}) {
  const zh = locale === "zh";
  const items = useMemo(
    () =>
      buildDecisionItems({
        locale,
        interactions,
        approvals,
        suggestions,
        candidateSets,
        mediaCandidates,
        editorialTasks,
      }),
    [
      approvals,
      candidateSets,
      editorialTasks,
      interactions,
      locale,
      mediaCandidates,
      suggestions,
    ],
  );
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    selectedApproval ? `approval-${selectedApproval.id}` : null,
  );
  const [mobilePane, setMobilePane] =
    useState<"master" | "detail">("master");
  const [actionError, setActionError] = useState("");
  const [deferTarget, setDeferTarget] = useState<OperationalSuggestion | null>(
    null,
  );
  const [deferReason, setDeferReason] = useState("");
  const [deferError, setDeferError] = useState("");

  const visibleItems = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((item) => decisionFilter(item) === filter),
    [filter, items],
  );
  const selected =
    visibleItems.find((item) => item.key === selectedKey) ||
    visibleItems[0] ||
    null;

  useEffect(() => {
    if (!selected && selectedKey) setSelectedKey(null);
    if (selected && selected.key !== selectedKey) setSelectedKey(selected.key);
  }, [selected, selectedKey]);

  const mutate = async (operation: () => Promise<unknown>) => {
    setActionError("");
    try {
      await operation();
      await onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : zh
            ? "操作失败，请重试。"
            : "The operation failed. Please try again.",
      );
    }
  };

  const resolveInteraction = async (
    task: WorkflowInteractionTask,
    response: unknown,
  ) => {
    setActionError("");
    try {
      await workflowApi.resolveInteraction(task, response);
      await onResolvedInteraction();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : zh
            ? "提交交互结果失败。"
            : "Failed to submit the interaction result.",
      );
    }
  };

  const confirmDefer = async () => {
    if (!deferTarget || !deferReason.trim()) return;
    setDeferError("");
    try {
      await operationsApi.ignoreSuggestion(deferTarget.id, deferReason.trim());
      setDeferTarget(null);
      setDeferReason("");
      await onRefresh();
    } catch (error) {
      setDeferError(
        error instanceof Error
          ? error.message
          : zh
            ? "暂缓建议失败，请重试。"
            : "Failed to defer the suggestion. Please try again.",
      );
    }
  };

  const filterOptions: Array<{ value: DecisionFilter; label: string }> = [
    {
      value: "all",
      label: zh ? `全部 ${items.length}` : `All ${items.length}`,
    },
    { value: "approval", label: zh ? "审批" : "Approvals" },
    { value: "choice", label: zh ? "选择 / 输入" : "Choices / input" },
    { value: "operation", label: zh ? "运营建议" : "Operations" },
    { value: "follow-up", label: zh ? "后续任务" : "Follow-up" },
  ];

  return (
    <div
      className="flex flex-col gap-5"
      aria-label={zh ? "待我处理" : "Review queue"}
    >
      <OperationsPanelLead
        description={
          zh
            ? "把审批、选择、确认、运营建议和后续编辑任务放进同一人工决策队列；完成后回到原来的 Run 或业务流程。"
            : "Approvals, choices, confirmations, operational proposals, and editorial follow-up share one human decision queue before returning to the originating Run or business flow."
        }
        actions={
          <Button
            variant="outline"
            icon={<RefreshCw />}
            onClick={() => void onRefresh()}
          >
            {zh ? "刷新" : "Refresh"}
          </Button>
        }
      />

      {actionError ? (
        <Alert
          type="error"
          showIcon
          title={zh ? "操作失败" : "Action failed"}
          description={actionError}
        />
      ) : null}

      <div
        className="flex flex-wrap gap-2"
        aria-label={zh ? "待处理类型" : "Decision filters"}
      >
        {filterOptions.map((option) => (
          <Button
            key={option.value}
            size="small"
            variant={filter === option.value ? "solid" : "outline"}
            color={filter === option.value ? "primary" : undefined}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
              setMobilePane("master");
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div
        data-slot="ops-master-detail"
        data-pattern="master-detail-composition"
        data-mobile-pane={mobilePane}
        className="grid min-h-[34rem] min-w-0 items-stretch overflow-hidden rounded-lg border bg-background xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]"
      >
        <aside
          data-slot="ops-rail"
          className={`${mobilePane === "detail" ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col border-b xl:border-b-0 xl:border-r`}
          aria-label={zh ? "决策队列" : "Decision queue"}
        >
          <div className="shrink-0 border-b px-[18px] py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong className="type-body-sm type-weight-semibold">
                  {zh ? "决策队列" : "Decision queue"}
                </strong>
                <Text size="xs" tone="muted">
                  {zh
                    ? `${visibleItems.length} 项符合当前筛选`
                    : `${visibleItems.length} items match the current filter`}
                </Text>
              </div>
              <Clock3
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
          <div
            role="list"
            data-slot="ops-rail-body"
            aria-label={zh ? "待处理列表" : "Decision items"}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {visibleItems.length ? (
              visibleItems.map((item) => (
                <div key={item.key} role="listitem">
                  <OperationsObjectRow
                    title={item.title}
                    status={<DecisionStatus item={item} />}
                    meta={item.meta}
                    summary={item.summary}
                    signals={
                      <OperationsMeta>
                        {formatDateTime(item.createdAt)}
                      </OperationsMeta>
                    }
                    selected={selected?.key === item.key}
                    onClick={() => {
                      setSelectedKey(item.key);
                      setMobilePane("detail");
                      if (item.kind === "approval")
                        onSelectApproval(item.payload as AgentApproval);
                    }}
                    ariaLabel={
                      zh ? `处理：${item.title}` : `Review: ${item.title}`
                    }
                  />
                </div>
              ))
            ) : (
              <div className="p-8">
                <Empty
                  title={
                    zh ? "当前没有需要处理的事项" : "Nothing needs attention"
                  }
                />
              </div>
            )}
          </div>
        </aside>

        <main
          data-slot="ops-detail-pane"
          className={`${mobilePane === "master" ? "hidden md:block" : "block"} min-w-0 p-6`}
          aria-label={zh ? "决策工作台" : "Decision workbench"}
        >
          <div className="mb-4 md:hidden">
            <Button
              variant="ghost"
              icon={<ArrowLeft />}
              onClick={() => setMobilePane("master")}
            >
              {zh ? "返回决策队列" : "Back to decision queue"}
            </Button>
          </div>
          {!selected ? (
            <Empty
              title={zh ? "当前没有需要处理的事项" : "Nothing needs attention"}
            />
          ) : selected.kind === "interaction" ? (
            (() => {
              const task = selected.payload as WorkflowInteractionTask;
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{selected.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {selected.summary}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  <section className="border-t pt-5">
                    <OperationsRegionHeading
                      title={zh ? "为什么需要你" : "Why you are needed"}
                      description={
                        zh
                          ? "这是当前运行中的 Human Interaction。完成后 Workflow 会从原步骤继续，不会创建另一条独立 Run。"
                          : "This is a Human Interaction in the current run. Resolving it resumes the same Workflow Run from this step."
                      }
                    />
                  </section>
                  {task.interaction_type === "choice" && task.options.length ? (
                    <section className="border-t pt-5">
                      <OperationsRegionHeading
                        title={zh ? "请选择一个方向" : "Choose one option"}
                        description={
                          zh
                            ? "选择结果只提交给当前 Run；后续写入动作仍遵守各自审批边界。"
                            : "The choice is submitted only to this run; later write actions keep their own approval boundaries."
                        }
                      />
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {task.options.map((option, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            onClick={() =>
                              void resolveInteraction(task, { option })
                            }
                          >
                            {String(option)}
                          </Button>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="flex justify-end border-t pt-5">
                      <Button
                        variant="solid"
                        color="primary"
                        icon={<Check />}
                        onClick={() =>
                          void resolveInteraction(task, { confirmed: true })
                        }
                      >
                        {zh ? "确认并继续" : "Confirm and continue"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : selected.kind === "approval" ? (
            (() => {
              const approval = selected.payload as AgentApproval;
              const impact = approvalImpact(approval, zh);
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{selected.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {selected.summary}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  {approval.status === "failed" ? (
                    <Alert
                      type="error"
                      showIcon
                      title={
                        zh
                          ? "上次执行失败，提案未丢失"
                          : "The previous execution failed; the proposal is preserved"
                      }
                      description={approval.review_note || selected.summary}
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-muted/[0.18] p-4">
                      <Text size="xs" tone="muted">
                        {zh ? "批准后会发生什么" : "What happens if approved"}
                      </Text>
                      <strong className="mt-1 block text-sm">
                        {impact.happens}
                      </strong>
                    </div>
                    <div className="rounded-lg border bg-muted/[0.18] p-4">
                      <Text size="xs" tone="muted">
                        {zh ? "不会发生什么" : "What will not happen"}
                      </Text>
                      <strong className="mt-1 block text-sm">
                        {impact.safe}
                      </strong>
                    </div>
                  </div>
                  <ProposalPreview
                    actionType={approval.action_type}
                    payload={approval.proposed_payload}
                    locale={locale}
                  />
                  {approval.before_snapshot ? (
                    <details className="rounded-lg border p-4">
                      <summary className="cursor-pointer text-sm font-medium">
                        {zh ? "查看变更前原始数据" : "View previous raw data"}
                      </summary>
                      <div className="mt-4">
                        <JsonPreview value={approval.before_snapshot} />
                      </div>
                    </details>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                    <Button
                      variant="outline"
                      icon={<X />}
                      onClick={() => onReviewApproval(approval, false)}
                    >
                      {zh ? "拒绝此建议" : "Reject proposal"}
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      icon={<ShieldCheck />}
                      onClick={() => onReviewApproval(approval, true)}
                    >
                      {approval.status === "failed"
                        ? zh
                          ? "重试批准并执行"
                          : "Retry approval and execution"
                        : zh
                          ? "批准并继续"
                          : "Approve and continue"}
                    </Button>
                  </div>
                </div>
              );
            })()
          ) : selected.kind === "suggestion" ? (
            (() => {
              const suggestion = selected.payload as OperationalSuggestion;
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{suggestion.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {suggestion.description}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  <section className="border-t pt-5">
                    <OperationsRegionHeading
                      title={zh ? "AI 的判断依据" : "AI evidence"}
                      description={
                        zh
                          ? "先理解为什么产生这条建议，再决定是否进入人工编辑流程。"
                          : "Understand why this suggestion exists before deciding whether it should enter the human editorial flow."
                      }
                    />
                    <div className="mt-4">
                      <JsonPreview value={suggestion.evidence} />
                    </div>
                  </section>
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDeferTarget(suggestion);
                        setDeferReason("");
                        setDeferError("");
                      }}
                    >
                      {zh ? "暂不处理" : "Defer"}
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      icon={<Check />}
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.convertSuggestion(suggestion.id),
                        )
                      }
                    >
                      {zh ? "创建编辑任务" : "Create editorial task"}
                    </Button>
                  </div>
                </div>
              );
            })()
          ) : selected.kind === "candidate" ? (
            (() => {
              const set = selected.payload as ContentCandidateSet;
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{selected.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {selected.summary}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  <section className="border-t pt-5">
                    <OperationsRegionHeading
                      title={zh ? "请选择一个候选" : "Choose a candidate"}
                      description={
                        zh
                          ? "选择后只会创建下一步内容变更审批，不会直接修改文章。"
                          : "Choosing a candidate only creates the next content-change approval; it does not edit the post directly."
                      }
                    />
                    <div className="mt-4 grid gap-3">
                      {set.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-lg border p-4"
                        >
                          <strong className="text-sm">{candidate.value}</strong>
                          {candidate.rationale ? (
                            <Text size="xs" tone="muted" className="mt-1">
                              {candidate.rationale}
                            </Text>
                          ) : null}
                          <div className="mt-3">
                            <Button
                              size="small"
                              variant="outline"
                              onClick={() =>
                                void mutate(() =>
                                  operationsApi.selectCandidate(
                                    set.id,
                                    candidate.id,
                                  ),
                                )
                              }
                            >
                              {zh
                                ? "选择并创建审批"
                                : "Choose and create approval"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              );
            })()
          ) : selected.kind === "media" ? (
            (() => {
              const media = selected.payload as MediaCandidate;
              const ready = media.generation_status === "ready_to_generate";
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{selected.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {media.brief}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  <section className="border-t pt-5">
                    <OperationsRegionHeading
                      title={zh ? "媒体边界" : "Media boundary"}
                      description={
                        zh
                          ? "这里仅保留旧版独立媒体任务；新 Workflow 图片任务由所属 Run 和 Human Interaction 继续承载。"
                          : "Only legacy standalone media tasks remain here; new Workflow image tasks continue inside their source Run and Human Interaction."
                      }
                    />
                    <Text size="sm" tone="muted" className="mt-3">
                      Alt: {media.alt_text || "—"}
                    </Text>
                  </section>
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                    {!ready ? (
                      <Button
                        variant="outline"
                        icon={<X />}
                        onClick={() =>
                          void mutate(() =>
                            operationsApi.reviewMediaCandidate(
                              media.id,
                              "reject",
                              zh
                                ? "管理员拒绝此图片方案"
                                : "Image brief rejected by administrator",
                            ),
                          )
                        }
                      >
                        {zh ? "拒绝" : "Reject"}
                      </Button>
                    ) : null}
                    <Button
                      variant="solid"
                      color="primary"
                      icon={ready ? <Play /> : <Check />}
                      onClick={() =>
                        void mutate(() =>
                          ready
                            ? operationsApi.generateMediaCandidate(media.id)
                            : operationsApi.reviewMediaCandidate(
                                media.id,
                                "ready",
                              ),
                        )
                      }
                    >
                      {ready
                        ? zh
                          ? "生成图片"
                          : "Generate image"
                        : zh
                          ? "审核通过，进入生成"
                          : "Approve for generation"}
                    </Button>
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const task = selected.payload as EditorialTask;
              return (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{selected.meta}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Heading level={2}>{task.title}</Heading>
                      <Text className="mt-2" tone="muted">
                        {task.description}
                      </Text>
                    </div>
                    <DecisionStatus item={selected} />
                  </div>
                  <section className="border-t pt-5">
                    <OperationsRegionHeading
                      title={zh ? "人工跟进" : "Human follow-up"}
                      description={
                        zh
                          ? "编辑任务只是待办，不会因为标记状态而修改或发布内容。"
                          : "An editorial task is only a follow-up item; changing its status never edits or publishes content."
                      }
                    />
                  </section>
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                    <Button
                      variant="outline"
                      icon={<X />}
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.setEditorialTaskStatus(
                            task.id,
                            "cancelled",
                          ),
                        )
                      }
                    >
                      {zh ? "取消任务" : "Cancel task"}
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      icon={<Check />}
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.setEditorialTaskStatus(task.id, "done"),
                        )
                      }
                    >
                      {zh ? "标记完成" : "Mark complete"}
                    </Button>
                  </div>
                </div>
              );
            })()
          )}
        </main>
      </div>

      <Modal
        open={deferTarget !== null}
        title={zh ? "暂缓这条运营建议" : "Defer this operational suggestion"}
        description={
          zh
            ? "说明原因后，系统会保留该决定作为运营记录。"
            : "Provide a reason so the decision remains auditable."
        }
        onClose={() => {
          setDeferTarget(null);
          setDeferReason("");
          setDeferError("");
        }}
        onOk={() => void confirmDefer()}
        okText={zh ? "确认暂缓" : "Confirm defer"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ disabled: !deferReason.trim() }}
      >
        <div className="flex flex-col gap-3">
          {deferError ? (
            <Alert type="error" showIcon description={deferError} />
          ) : null}
          <Textarea
            aria-label={zh ? "暂缓原因" : "Defer reason"}
            value={deferReason}
            onChange={(event) => setDeferReason(event.target.value)}
            rows={4}
            placeholder={
              zh
                ? "例如：当前不是发布窗口，下一轮再评估。"
                : "For example: not in the publishing window; review next cycle."
            }
          />
        </div>
      </Modal>
    </div>
  );
}
