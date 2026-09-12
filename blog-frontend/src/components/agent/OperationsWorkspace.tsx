import {
  Bot,
  Check,
  ChevronDown,
  Image,
  Lightbulb,
  Play,
  RefreshCw,
  ThumbsDown,
  X,
} from "lucide-react";
import { useState } from "react";
import type {
  ContentCandidateSet,
  EditorialTask,
  MediaCandidate,
  OperationalSuggestion,
} from "../../types/agent";
import { operationsApi } from "../../api/operations";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Empty,
  FormField,
  Modal,
  Tag,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { BulkActionBar } from "@gouno/ui/patterns";
import { WorkflowLauncher } from "./WorkflowLauncher";

function fieldLabel(value: ContentCandidateSet["field_type"], zh: boolean) {
  if (!zh) return value.replace("_", " ");
  return value === "title"
    ? "文章标题"
    : value === "summary"
      ? "文章摘要"
      : "封面替代文字";
}

function priorityLabel(value: OperationalSuggestion["priority"], zh: boolean) {
  if (!zh)
    return value === "high"
      ? "Needs attention"
      : value === "medium"
        ? "Worth reviewing"
        : "Optional";
  return value === "high"
    ? "优先处理"
    : value === "medium"
      ? "建议查看"
      : "可稍后处理";
}

function priorityColor(
  value: OperationalSuggestion["priority"],
): "warning" | "primary" | "default" {
  if (value === "high") return "warning";
  if (value === "medium") return "primary";
  return "default";
}

function taskStatusLabel(status: EditorialTask["status"], zh: boolean) {
  if (!zh)
    return status === "done"
      ? "Completed"
      : status === "cancelled"
        ? "Cancelled"
        : "Open";
  return status === "done"
    ? "已完成"
    : status === "cancelled"
      ? "已取消"
      : "进行中";
}

function suggestionStatusLabel(status: string, zh: boolean) {
  if (status === "converted") return zh ? "已创建编辑任务" : "Task created";
  if (status === "resolved")
    return zh ? "自动已解决" : "Automatically resolved";
  if (status === "selected") return zh ? "已完成选择" : "Selection completed";
  return zh ? "已暂缓" : "Deferred";
}

function suggestionStatusColor(
  status: string,
): "success" | "primary" | "default" {
  if (status === "resolved" || status === "selected") return "success";
  if (status === "converted") return "primary";
  return "default";
}

function ReviewCard({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader
        className="border-b p-6"
        title={title}
        description={description}
        action={<Tag color={count > 0 ? "primary" : "default"}>{count}</Tag>}
      />
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export function OperationsWorkspace({
  suggestions,
  candidateSets,
  mediaCandidates = [],
  editorialTasks,
  locale,
  onRefresh,
}: {
  suggestions: OperationalSuggestion[];
  candidateSets: ContentCandidateSet[];
  mediaCandidates?: MediaCandidate[];
  editorialTasks: EditorialTask[];
  locale: "en" | "zh";
  onRefresh: () => Promise<void>;
}) {
  const zh = locale === "zh";
  const actionableSuggestions = suggestions.filter(
    (item) => item.status === "new",
  );
  const handledSuggestions = suggestions.filter(
    (item) => item.status !== "new",
  );
  const pendingSets = candidateSets.filter((item) => item.status === "pending");
  // New image tasks are owned by their Workflow Run. Keep only legacy rows in
  // this compatibility workspace so historical records remain inspectable.
  const legacyMedia = mediaCandidates.filter((item) => !item.workflow_run_id);
  const pendingMedia = legacyMedia.filter(
    (item) => item.generation_status === "brief_ready",
  );
  const readyMedia = legacyMedia.filter(
    (item) => item.generation_status === "ready_to_generate",
  );
  const openTasks = editorialTasks.filter((item) => item.status === "open");
  const closedTasks = editorialTasks.filter((item) => item.status !== "open");
  const total =
    actionableSuggestions.length +
    pendingSets.length +
    pendingMedia.length +
    readyMedia.length;
  const mediaReviewCount = pendingMedia.length + readyMedia.length;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<number[]>([]);
  const [deferTarget, setDeferTarget] = useState<OperationalSuggestion | null>(
    null,
  );
  const [deferReason, setDeferReason] = useState("");
  const [deferError, setDeferError] = useState("");
  const [aiOpen, setAIOpen] = useState(false);

  const mutate = async (operation: () => Promise<unknown>) => {
    await operation();
    await onRefresh();
  };

  const refreshSuggestions = async () => {
    setRefreshing(true);
    try {
      await mutate(() => operationsApi.refreshSuggestions());
    } finally {
      setRefreshing(false);
    }
  };

  const requestSuggestionDefer = (item: OperationalSuggestion) => {
    setDeferTarget(item);
    setDeferReason("");
    setDeferError("");
  };

  const confirmSuggestionDefer = async () => {
    if (!deferTarget) return;
    const reason = deferReason.trim();
    if (!reason) return;
    setDeferError("");
    try {
      await operationsApi.ignoreSuggestion(deferTarget.id, reason);
    } catch (error) {
      setDeferError(
        error instanceof Error
          ? error.message
          : zh
            ? "暂缓建议失败，请重试。"
            : "Failed to defer the suggestion. Please try again.",
      );
      return;
    }

    setDeferTarget(null);
    setDeferReason("");
    try {
      await onRefresh();
    } catch {
      // The mutation already succeeded. Never reopen the modal or make the
      // operator retry the same ignore request just because refresh failed.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card padding="none" className="overflow-hidden">
        <CardHeader
          className="border-b p-6"
          title={zh ? "运营建议与候选" : "Operational review"}
          description={
            zh
              ? "AI 发现问题并准备候选；只有你明确创建任务、选择候选、审核或生成时才会产生后续动作。"
              : "AI finds issues and prepares options. Follow-up work only happens after your explicit task, selection, review, or generation action."
          }
          action={
            <Button
              size="small"
              variant="outline"
              type="button"
              loading={refreshing}
              disabled={refreshing}
              onClick={() => void refreshSuggestions()}
              icon={<RefreshCw />}
            >
              {zh ? "刷新建议" : "Refresh suggestions"}
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <strong className="text-2xl tabular-nums">{total}</strong>
            <Text size="sm" tone="muted">
              {zh ? "项待决定" : "items to decide"}
            </Text>
          </div>
          <Text size="xs" tone="muted">
            {zh
              ? "创建编辑任务不会修改或发布内容。"
              : "Creating an editorial task never changes or publishes content."}
          </Text>
        </CardContent>
      </Card>

      {selectedSuggestions.length ? (
        <BulkActionBar
          selectionLabel={
            zh
              ? `已选择 ${selectedSuggestions.length} 条建议`
              : `${selectedSuggestions.length} suggestions selected`
          }
          onCancel={() => setSelectedSuggestions([])}
          cancelLabel={zh ? "取消" : "Cancel"}
        >
          <Button size="small" icon={<Bot />} onClick={() => setAIOpen(true)}>
            {zh ? "交给 AI" : "Send to AI"}
          </Button>
        </BulkActionBar>
      ) : null}

      {total === 0 ? (
        <Card padding="base">
          <Empty
            title={
              zh
                ? "目前没有需要你决定的运营建议。"
                : "There are no operational suggestions requiring a decision."
            }
          />
        </Card>
      ) : null}

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-label={
          zh ? "运营建议与候选" : "Operational suggestions and candidates"
        }
      >
        <ReviewCard
          title={zh ? "运营建议" : "Operational suggestions"}
          description={
            zh
              ? "AI 找到的内容维护机会。"
              : "Content maintenance opportunities found by AI."
          }
          count={actionableSuggestions.length}
        >
          {actionableSuggestions.length === 0 ? (
            <div className="p-6">
              <Empty
                title={zh ? "暂无运营建议" : "No operational suggestions"}
              />
            </div>
          ) : (
            <div className="divide-y">
              {actionableSuggestions.map((item) => {
                const selected = selectedSuggestions.includes(item.id);
                return (
                  <article
                    key={`suggestion-${item.id}`}
                    className={`flex flex-col gap-4 p-6 ${selected ? "bg-muted/40" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        aria-label={`${zh ? "选择建议" : "Select suggestion"} ${item.title}`}
                        checked={selected}
                        onChange={(event) =>
                          setSelectedSuggestions((current) =>
                            event.target.checked
                              ? [...new Set([...current, item.id])]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Lightbulb className="size-4 text-muted-foreground" />
                          <strong className="text-sm">{item.title}</strong>
                          <Tag color={priorityColor(item.priority)}>
                            {priorityLabel(item.priority, zh)}
                          </Tag>
                        </div>
                        <Text size="sm" tone="muted">
                          {item.description}
                        </Text>
                        <details className="rounded-md border p-3">
                          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                            {zh ? "查看 AI 的判断依据" : "View AI evidence"}
                            <ChevronDown className="size-4" />
                          </summary>
                          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                            {JSON.stringify(item.evidence, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Button
                        variant="outline"
                        size="small"
                        type="button"
                        onClick={() => requestSuggestionDefer(item)}
                        icon={<ThumbsDown />}
                      >
                        {zh ? "暂不处理" : "Defer"}
                      </Button>
                      <Button
                        variant="solid"
                        color="primary"
                        size="small"
                        type="button"
                        onClick={() =>
                          void mutate(() =>
                            operationsApi.convertSuggestion(item.id),
                          )
                        }
                        icon={<Check />}
                      >
                        {zh ? "创建编辑任务" : "Create editorial task"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </ReviewCard>

        <ReviewCard
          title={zh ? "内容候选" : "Content candidates"}
          description={
            zh
              ? "需要你选择的标题、摘要或封面替代文字候选。"
              : "Title, summary, or cover-alt candidates that need your choice."
          }
          count={pendingSets.length}
        >
          {pendingSets.length === 0 ? (
            <div className="p-6">
              <Empty title={zh ? "暂无内容候选" : "No content candidates"} />
            </div>
          ) : (
            <div className="divide-y">
              {pendingSets.map((set) => (
                <article
                  key={`candidate-${set.id}`}
                  className="flex flex-col gap-3 p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Check className="size-4 text-muted-foreground" />
                    <strong className="text-sm">
                      {zh
                        ? `为文章 #${set.post_id} 选择${fieldLabel(set.field_type, true)}`
                        : `Choose a ${fieldLabel(set.field_type, false)} for post #${set.post_id}`}
                    </strong>
                    <Tag color="warning">
                      {zh ? "选择建议" : "Choose a proposal"}
                    </Tag>
                  </div>
                  <Text size="sm" tone="muted">
                    {zh
                      ? `AI 提供了 ${set.candidates.length} 个候选。选择后会生成内容变更审批，不会立即修改文章。`
                      : `AI prepared ${set.candidates.length} alternatives. Choosing one creates a separate change approval; it does not edit the post yet.`}
                  </Text>
                  <details className="rounded-md border p-3">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                      {zh
                        ? `查看 ${set.candidates.length} 个候选`
                        : `View ${set.candidates.length} alternatives`}
                      <ChevronDown className="size-4" />
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      {set.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="rounded-md border p-4"
                        >
                          <strong className="text-sm">{candidate.value}</strong>
                          {candidate.rationale ? (
                            <Text size="xs" tone="muted" className="mt-1">
                              {candidate.rationale}
                            </Text>
                          ) : null}
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              size="small"
                              type="button"
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
                                ? "选择此建议并创建审批"
                                : "Choose and create approval"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </ReviewCard>

        <ReviewCard
          title={zh ? "图片任务" : "Image tasks"}
          description={
            zh
              ? "经过审批后等待人工审核或明确生成的媒体方案。"
              : "Approved media briefs waiting for review or an explicit generation action."
          }
          count={mediaReviewCount}
        >
          {mediaReviewCount === 0 ? (
            <div className="p-6">
              <Empty title={zh ? "暂无图片任务" : "No image tasks"} />
            </div>
          ) : (
            <div className="divide-y">
              {pendingMedia.map((item) => (
                <article
                  key={`media-brief-${item.id}`}
                  className="flex flex-col gap-4 p-6"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Image className="size-4 text-muted-foreground" />
                      <strong className="text-sm">
                        {item.headline ||
                          (zh
                            ? `为文章 #${item.post_id} 准备配图`
                            : `Review image brief for post #${item.post_id}`)}
                      </strong>
                      <Tag color="warning">
                        {zh ? "图片方案待审核" : "Image brief to review"}
                      </Tag>
                    </div>
                    <Text size="sm" tone="muted">
                      {item.brief}
                    </Text>
                    <Text size="xs" tone="muted">
                      Alt: {item.alt_text || "—"}
                    </Text>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      size="small"
                      type="button"
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.reviewMediaCandidate(
                            item.id,
                            "reject",
                            zh
                              ? "管理员拒绝此图片方案"
                              : "Image brief rejected by administrator",
                          ),
                        )
                      }
                      icon={<ThumbsDown />}
                    >
                      {zh ? "拒绝" : "Reject"}
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      size="small"
                      type="button"
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.reviewMediaCandidate(item.id, "ready"),
                        )
                      }
                      icon={<Check />}
                    >
                      {zh ? "审核通过，进入生成" : "Approve for generation"}
                    </Button>
                  </div>
                </article>
              ))}
              {readyMedia.map((item) => (
                <article
                  key={`media-${item.id}`}
                  className="flex flex-col gap-4 p-6"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Image className="size-4 text-muted-foreground" />
                      <strong className="text-sm">
                        {item.headline ||
                          (zh
                            ? `为文章 #${item.post_id} 生成配图`
                            : `Generate image for post #${item.post_id}`)}
                      </strong>
                      <Tag color="primary">
                        {zh ? "图片已审核" : "Image brief reviewed"}
                      </Tag>
                    </div>
                    <Text size="sm" tone="muted">
                      {item.brief}
                    </Text>
                    <Text size="xs" tone="muted">
                      Alt: {item.alt_text || "—"}
                    </Text>
                  </div>
                  <div className="flex justify-end border-t pt-4">
                    <Button
                      variant="solid"
                      color="primary"
                      size="small"
                      type="button"
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.generateMediaCandidate(item.id),
                        )
                      }
                      icon={<Play />}
                    >
                      {zh ? "生成图片" : "Generate image"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </ReviewCard>

        <ReviewCard
          title={zh ? "编辑任务" : "Editorial tasks"}
          description={
            zh
              ? "由运营建议或已批准的 Agent 操作创建；完成或取消只更新任务状态。"
              : "Created from operational suggestions or approved Agent actions. Completing or cancelling only changes task status."
          }
          count={openTasks.length}
        >
          {openTasks.length === 0 ? (
            <div className="p-6">
              <Empty
                title={
                  zh
                    ? "没有进行中的编辑任务。"
                    : "There are no open editorial tasks."
                }
              />
            </div>
          ) : (
            <div className="divide-y">
              {openTasks.map((task) => (
                <article key={task.id} className="flex flex-col gap-4 p-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{task.title}</strong>
                      <Tag color={priorityColor(task.priority)}>
                        {priorityLabel(task.priority, zh)}
                      </Tag>
                    </div>
                    <Text size="sm" tone="muted">
                      {task.description}
                    </Text>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      size="small"
                      type="button"
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.setEditorialTaskStatus(
                            task.id,
                            "cancelled",
                          ),
                        )
                      }
                      icon={<X />}
                    >
                      {zh ? "取消" : "Cancel"}
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      size="small"
                      type="button"
                      onClick={() =>
                        void mutate(() =>
                          operationsApi.setEditorialTaskStatus(task.id, "done"),
                        )
                      }
                      icon={<Check />}
                    >
                      {zh ? "标记完成" : "Mark complete"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </ReviewCard>
      </section>

      {handledSuggestions.length > 0 || closedTasks.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <details>
            <summary className="flex cursor-pointer items-center justify-between gap-3 border-b p-6 text-sm font-medium">
              <span>{zh ? "已处理记录" : "Handled records"}</span>
              <ChevronDown className="size-4" />
            </summary>
            <CardContent className="flex flex-col gap-4 p-6">
              <Text size="sm" tone="muted">
                {zh
                  ? "这里保留建议决策和已关闭任务的审计记录；不会自动改变 AI 指令。"
                  : "This retains an audit trail of suggestion decisions and closed tasks. It never changes AI instructions automatically."}
              </Text>
              <div className="divide-y rounded-md border">
                {handledSuggestions.map((item) => (
                  <div
                    key={`suggestion-${item.id}`}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <strong className="text-sm">{item.title}</strong>
                      <Text size="xs" tone="muted">
                        {item.ignored_reason
                          ? zh
                            ? `暂不处理：${item.ignored_reason}`
                            : `Deferred: ${item.ignored_reason}`
                          : suggestionStatusLabel(item.status, zh)}
                      </Text>
                    </div>
                    <Tag color={suggestionStatusColor(item.status)}>
                      {suggestionStatusLabel(item.status, zh)}
                    </Tag>
                  </div>
                ))}
                {closedTasks.map((task) => (
                  <div
                    key={`task-${task.id}`}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <strong className="text-sm">{task.title}</strong>
                      <Text size="xs" tone="muted">
                        {zh ? "编辑任务" : "Editorial task"}
                      </Text>
                    </div>
                    <Tag color={task.status === "done" ? "success" : "default"}>
                      {taskStatusLabel(task.status, zh)}
                    </Tag>
                  </div>
                ))}
              </div>
            </CardContent>
          </details>
        </Card>
      ) : null}

      <Modal
        open={deferTarget !== null}
        title={zh ? "暂不处理建议" : "Defer suggestion"}
        description={
          deferTarget
            ? zh
              ? `记录“${deferTarget.title}”暂不处理的原因，便于后续审计和重新判断。`
              : `Record why “${deferTarget.title}” is being deferred so the decision can be audited and revisited.`
            : undefined
        }
        onClose={() => {
          setDeferTarget(null);
          setDeferReason("");
          setDeferError("");
        }}
        onOk={() => void confirmSuggestionDefer()}
        okText={zh ? "确认暂缓" : "Confirm defer"}
        cancelText={zh ? "取消" : "Cancel"}
        okButtonProps={{ disabled: !deferReason.trim() }}
      >
        <div className="flex flex-col gap-3">
          {deferError ? (
            <Alert
              type="error"
              showIcon
              title={zh ? "暂缓失败" : "Unable to defer suggestion"}
              description={deferError}
            />
          ) : null}
          <FormField
            label={zh ? "暂不处理原因" : "Reason for deferring"}
            required
          >
            <Textarea
              autoFocus
              rows={4}
              aria-label={zh ? "暂不处理原因" : "Reason for deferring"}
              value={deferReason}
              onChange={(event) => setDeferReason(event.target.value)}
              placeholder={
                zh
                  ? "例如：等待上游数据刷新后再判断"
                  : "For example: wait for the upstream data refresh before revisiting"
              }
            />
          </FormField>
        </div>
      </Modal>

      <WorkflowLauncher
        open={aiOpen}
        resourceType="operational_suggestion"
        resourceKeys={selectedSuggestions}
        onClose={() => setAIOpen(false)}
        title={zh ? "将运营建议交给 AI" : "Send suggestions to AI"}
      />
    </div>
  );
}
