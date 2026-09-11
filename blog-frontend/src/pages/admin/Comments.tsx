import { useCallback, useEffect, useState } from "react";
import { Bot, Check, EyeOff, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { commentsApi } from "../../api/comments";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Modal,
  Select,
  Skeleton,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";

interface Comment {
  id: number;
  post_id: number;
  author: string;
  content: string;
  status: string;
  is_visible: boolean;
  report_count?: number;
  created_at: string;
}

type CommentStatus = "pending" | "visible" | "hidden";
type BatchDeleteTarget = { kind: "batch" };
type DeleteTarget = Comment | BatchDeleteTarget | null;
type Notice = { type: "success" | "info" | "error"; text: string } | null;

const statusLabels: Record<CommentStatus, string> = {
  pending: "待审核",
  visible: "已通过",
  hidden: "已隐藏",
};

function isBatchDeleteTarget(
  target: DeleteTarget,
): target is BatchDeleteTarget {
  return Boolean(target && "kind" in target && target.kind === "batch");
}

function statusColor(status: string) {
  if (status === "visible") return "success" as const;
  if (status === "pending") return "warning" as const;
  return "default" as const;
}

function LoadingComments() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="评论加载中"
      aria-live="polite"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} padding="base">
          <div className="flex gap-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminComments() {
  const allowed = useAdminGuard("/admin/comments");
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "pending";
  const reported = params.get("reported") === "true";
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    commentsApi
      .getAdminComments({ status, reported })
      .then((items) => {
        setComments(items as unknown as Comment[]);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [allowed, reported, status]);

  useEffect(load, [load]);

  const moderate = async (comment: Comment, next: "visible" | "hidden") => {
    try {
      await commentsApi.moderateComment(comment.id, next);
      setComments((current) =>
        current.filter((item) => item.id !== comment.id),
      );
      setSelected((current) => current.filter((id) => id !== comment.id));
      setNotice({
        type: "success",
        text: next === "visible" ? "评论已通过。" : "评论已隐藏。",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论处理失败。");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const ids = isBatchDeleteTarget(deleteTarget)
      ? selected
      : [deleteTarget.id];
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        await commentsApi.deleteComment(id);
        return id;
      }),
    );
    const removed = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failed = ids.filter((id) => !removed.includes(id));
    setComments((current) =>
      current.filter((item) => !removed.includes(item.id)),
    );
    setSelected(failed);
    setDeleteTarget(null);
    if (failed.length) {
      const reason = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )?.reason;
      setError(
        `已删除 ${removed.length} 条评论；${failed.length} 条未删除：${
          reason instanceof Error ? reason.message : "请稍后重试。"
        }`,
      );
      return;
    }
    setNotice({
      type: "success",
      text: ids.length > 1 ? `已删除 ${ids.length} 条评论。` : "评论已删除。",
    });
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const deleteDescription = isBatchDeleteTarget(deleteTarget)
    ? `确认永久删除选中的 ${selected.length} 条评论？此操作无法撤销。`
    : "确认永久删除这条评论？此操作无法撤销。";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="评论"
        description="审核讨论、处理举报，并维护高质量的交流空间。"
      />

      {notice ? (
        <Alert
          type={notice.type}
          showIcon
          title={notice.text}
          closable={{ onClose: () => setNotice(null) }}
        />
      ) : null}

      {error && comments.length > 0 ? (
        <Alert type="error" showIcon title="评论操作失败" description={error} />
      ) : null}

      <Card padding="base">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:w-48">
            <Select
              aria-label="评论状态"
              value={status}
              onChange={(value) => setFilter("status", String(value))}
            >
              <option value="pending">待审核</option>
              <option value="visible">已通过</option>
              <option value="hidden">已隐藏</option>
              <option value="all">全部</option>
            </Select>
          </div>
          <Checkbox
            label="仅看被举报"
            checked={reported}
            onChange={(event) =>
              setFilter("reported", event.target.checked ? "true" : "")
            }
          />
        </div>
      </Card>

      {selected.length ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 条评论`}
          onCancel={() => setSelected([])}
          cancelLabel="清除选择"
        >
          <Button size="small" icon={<Bot />} onClick={() => setAIOpen(true)}>
            交给 AI
          </Button>
          <Button
            size="small"
            color="error"
            type="button"
            onClick={() => setDeleteTarget({ kind: "batch" })}
            icon={<Trash2 />}
          >
            删除
          </Button>
        </BulkActionBar>
      ) : null}

      {loading ? (
        <LoadingComments />
      ) : error && comments.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="评论加载失败"
          description={error}
          action={
            <Button size="small" onClick={load}>
              重新载入
            </Button>
          }
        />
      ) : comments.length === 0 ? (
        <Card padding="base">
          <Empty
            title="当前队列已经处理完毕。"
            description={
              reported
                ? "当前筛选条件下没有被举报的评论。"
                : "没有符合当前状态筛选的评论。"
            }
          />
        </Card>
      ) : (
        <div role="list" aria-label="评论审核列表" className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id} padding="base" role="listitem">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <div className="pt-0.5">
                    <Checkbox
                      aria-label={`选择评论 ${comment.id}`}
                      checked={selected.includes(comment.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...new Set([...current, comment.id])]
                            : current.filter((id) => id !== comment.id),
                        )
                      }
                    />
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {comment.author.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold text-foreground">
                        {comment.author}
                      </strong>
                      <time className="font-mono text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleString("zh-CN")}
                      </time>
                      <Tag color={statusColor(comment.status)}>
                        {statusLabels[comment.status as CommentStatus] ||
                          comment.status}
                      </Tag>
                      {comment.report_count ? (
                        <Badge
                          status="error"
                          text={`被举报 ${comment.report_count} 次`}
                        />
                      ) : null}
                      <span className="font-mono text-xs text-muted-foreground">
                        文章 #{comment.post_id}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {comment.content}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-border/60 pt-3 md:border-t-0 md:pt-0">
                  <Button
                    size="small"
                    variant="ghost"
                    icon={<Check />}
                    aria-label={`通过 ${comment.author} 的评论`}
                    onClick={() => void moderate(comment, "visible")}
                  >
                    通过
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    icon={<EyeOff />}
                    aria-label={`隐藏 ${comment.author} 的评论`}
                    onClick={() => void moderate(comment, "hidden")}
                  >
                    隐藏
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    color="error"
                    icon={<Trash2 />}
                    aria-label={`删除 ${comment.author} 的评论`}
                    onClick={() => setDeleteTarget(comment)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={deleteTarget !== null}
        title={isBatchDeleteTarget(deleteTarget) ? "批量删除评论" : "删除评论"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
        onOk={remove}
        okText="永久删除"
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          删除后无法恢复，请确认目标评论无保留价值。
        </Text>
      </Modal>

      <WorkflowLauncher
        open={aiOpen}
        resourceType="comment"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选评论交给 AI"
      />
    </div>
  );
}
