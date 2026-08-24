import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { commentsApi } from "../../api/comments";
import {
  AdminPage,
  AdminPageHeader,
  BulkActionBar,
  Button,
  Checkbox,
  ConfirmDialog,
  ContentStack,
  EmptyState,
  Feedback,
  FilterBar,
  LoadingState,
  Panel,
  Select,
  useToast,
} from "../../components/ui";
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
        {error ? <Feedback type="error">{error}</Feedback> : null}
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
          <label className="checkbox-field">
            <Checkbox
              checked={reported}
              onChange={(event) =>
                setFilter("reported", event.target.checked ? "true" : "")
              }
            />{" "}
            仅看被举报
          </label>
        </FilterBar>
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
            >
              <Trash2 />
              删除
            </Button>
          </BulkActionBar>
        ) : null}
        {loading ? (
          <LoadingState label="正在载入评论…" />
        ) : comments.length === 0 ? (
          <EmptyState label="当前队列已经处理完毕。" />
        ) : (
          <div className="moderation-list">
            {comments.map((comment) => (
              <Panel key={comment.id}>
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
                <div className="comment-avatar">
                  {comment.author.slice(0, 1)}
                </div>
                <div>
                  <div>
                    <strong>{comment.author}</strong>
                    <time>
                      {new Date(comment.created_at).toLocaleString("zh-CN")}
                    </time>
                    {comment.report_count ? (
                      <span className="report-label">
                        被举报 {comment.report_count} 次
                      </span>
                    ) : null}
                  </div>
                  <p>{comment.content}</p>
                  <small>文章 #{comment.post_id}</small>
                </div>
                <div className="table-actions">
                  <Button
                    variant="secondary"
                    size="compact"
                    type="button"
                    onClick={() => void moderate(comment, "visible")}
                  >
                    通过
                  </Button>
                  <Button
                    variant="secondary"
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
                  >
                    <Trash2 /> 删除
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
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
