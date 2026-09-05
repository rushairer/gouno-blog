import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { commentsApi } from "../../api/comments";
import {
  AdminPage,
  AdminPageHeader,
  AsyncState,
  Badge,
  BulkActionBar,
  Button,
  Card,
  Checkbox,
  CheckboxField,
  ConfirmDialog,
  ContentStack,
  Feedback,
  FilterBar,
  Select,
  TableSkeleton,
  useToast,
} from "@gouno/ui";
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
type BatchDeleteTarget = { kind: "batch" };
type DeleteTarget = Comment | BatchDeleteTarget | null;

function isBatchDeleteTarget(
  target: DeleteTarget,
): target is BatchDeleteTarget {
  return Boolean(target && "kind" in target && target.kind === "batch");
}

export default function AdminComments() {
  const allowed = useAdminGuard("/admin/comments");
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "pending";
  const reported = params.get("reported") === "true";
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      notify(next === "visible" ? "评论已通过。" : "评论已隐藏。");
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
        `已删除 ${removed.length} 条评论；${failed.length} 条未删除：${reason instanceof Error ? reason.message : "请稍后重试。"}`,
      );
      return;
    }
    notify(ids.length > 1 ? `已删除 ${ids.length} 条评论。` : "评论已删除。");
  };
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <AdminPage>
      <AdminPageHeader
        title="评论"
        description="审核讨论、处理举报，并维护高质量的交流空间。"
      />
      <ContentStack>
        {error && comments.length > 0 ? (
          <Feedback type="error">{error}</Feedback>
        ) : null}
        <Card className="border-border/80 bg-card p-4 shadow-xs">
          <FilterBar>
            <Select
              size="compact"
              aria-label="评论状态"
              value={status}
              onChange={(event) => setFilter("status", event.target.value)}
            >
              <option value="pending">待审核</option>
              <option value="visible">已通过</option>
              <option value="hidden">已隐藏</option>
              <option value="all">全部</option>
            </Select>
            <CheckboxField>
              <Checkbox
                checked={reported}
                onChange={(event) =>
                  setFilter("reported", event.target.checked ? "true" : "")
                }
              />{" "}
              仅看被举报
            </CheckboxField>
          </FilterBar>
        </Card>
        {selected.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 条评论`}
            onAIAssist={() => setAIOpen(true)}
            onCancel={() => setSelected([])}
          >
            <Button
              variant="danger"
              size="compact"
              type="button"
              onClick={() => setDeleteTarget({ kind: "batch" })}
              icon={<Trash2 />}
            >
              删除
            </Button>
          </BulkActionBar>
        ) : null}
        <AsyncState
          loading={loading}
          skeleton={<TableSkeleton rows={4} columns={4} />}
          error={error && comments.length === 0 ? error : null}
          onRetry={load}
          retryLabel="重新载入"
          empty={!loading && comments.length === 0 && !error}
          emptyTitle="当前队列已经处理完毕。"
        >
          <div className="moderation-list space-y-3">
            {comments.map((comment) => (
              <Card
                key={comment.id}
                className="p-4 border-border/80 bg-card shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
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
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-sm">
                    {comment.author.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold text-foreground">
                        {comment.author}
                      </strong>
                      <time className="text-xs text-muted-foreground font-mono">
                        {new Date(comment.created_at).toLocaleString("zh-CN")}
                      </time>
                      {comment.report_count ? (
                        <Badge tone="danger" pill className="text-[11px]">
                          被举报 {comment.report_count} 次
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground/80 font-mono">
                        文章 #{comment.post_id}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/60">
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => void moderate(comment, "visible")}
                  >
                    通过
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => void moderate(comment, "hidden")}
                  >
                    隐藏
                  </Button>
                  <Button
                    variant="danger"
                    size="compact"
                    type="button"
                    onClick={() => setDeleteTarget(comment)}
                    icon={<Trash2 />}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </AsyncState>
      </ContentStack>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={isBatchDeleteTarget(deleteTarget) ? "批量删除评论" : "删除评论"}
        description={
          isBatchDeleteTarget(deleteTarget)
            ? `确认永久删除选中的 ${selected.length} 条评论？此操作无法撤销。`
            : "确认永久删除这条评论？此操作无法撤销。"
        }
        confirmLabel="永久删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
      <WorkflowLauncher
        open={aiOpen}
        resourceType="comment"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选评论交给 AI"
      />
    </AdminPage>
  );
}
