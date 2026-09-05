import { useCallback, useEffect, useState } from "react";
import { Merge, Save, Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  AdminPage,
  AdminPageHeader,
  AsyncState,
  Badge,
  BulkActionBar,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  ContentStack,
  Feedback,
  Modal,
  TableSkeleton,
  useToast,
} from "../../components/ui";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAdminGuard } from "../../hooks/useAdminGuard";

type TagEdit = { tag: TagSummary; mode: "rename" | "merge" } | null;
type DeleteTarget =
  | { kind: "tag"; item: TagSummary }
  | { kind: "batch" }
  | null;

export default function Tags() {
  const allowed = useAdminGuard("/admin/tags");
  const { notify } = useToast();
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tagEdit, setTagEdit] = useState<TagEdit>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      setTags(await siteApi.getAdminTags());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "载入失败");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagEdit) return;
    const value = String(
      new FormData(event.currentTarget).get("value") || "",
    ).trim();
    if (!value || value === tagEdit.tag.name) return;
    try {
      if (tagEdit.mode === "rename") {
        await siteApi.renameTag(tagEdit.tag.name, value);
      } else {
        await siteApi.mergeTags(tagEdit.tag.name, value);
      }
      notify(tagEdit.mode === "rename" ? "标签已重命名。" : "标签已合并。");
      setTagEdit(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标签操作失败。");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "batch") {
        const results = await Promise.allSettled(
          selected.map(async (name) => {
            await siteApi.deleteTag(name);
            return name;
          }),
        );
        const removed = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failed = selected.filter((name) => !removed.includes(name));
        setSelected(failed);
        setDeleteTarget(null);
        await load();
        if (failed.length) {
          const reason = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          )?.reason;
          setError(
            `已删除 ${removed.length} 个标签；${failed.length} 个未删除：${reason instanceof Error ? reason.message : "请稍后重试。"}`,
          );
        } else {
          notify(`已删除 ${removed.length} 个标签。`);
        }
        return;
      }
      await siteApi.deleteTag(deleteTarget.item.name);
      notify("标签已从文章中移除。");
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="标签"
        description="整理文章中的具体技术与概念信号，支持批量清洗与合并。"
      />
      <ContentStack>
        {error && tags.length > 0 ? (
          <Feedback type="error">{error}</Feedback>
        ) : null}
        {selected.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 个标签`}
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
          skeleton={<TableSkeleton rows={4} columns={3} />}
          error={error && tags.length === 0 ? error : null}
          onRetry={load}
          retryLabel="重新载入"
          empty={!loading && tags.length === 0 && !error}
          emptyTitle="文章添加标签后会自动在这里汇总。"
        >
          <div className="tag-admin-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tags.map((tag) => (
              <Card
                className="tag-admin-card flex flex-col justify-between border-border/80 bg-card p-4 shadow-xs hover:border-primary/40 transition-colors"
                key={tag.name}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      className="tag-admin-card__checkbox"
                      aria-label={`选择标签 ${tag.name}`}
                      checked={selected.includes(tag.name)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...new Set([...current, tag.name])]
                            : current.filter((key) => key !== tag.name),
                        )
                      }
                    />
                    <div className="tag-admin-card__content flex flex-col gap-0.5">
                      <strong className="text-sm font-semibold text-foreground">
                        {tag.name}
                      </strong>
                    </div>
                  </div>
                  <Badge tone="neutral" pill className="text-xs font-mono">
                    {tag.post_count} 篇
                  </Badge>
                </div>
                <div
                  className="tag-admin-card__actions flex items-center justify-end gap-1.5 pt-3 mt-3 border-t border-border/60"
                  aria-label={`标签 ${tag.name} 操作`}
                >
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => setTagEdit({ tag, mode: "rename" })}
                    icon={<Save />}
                  >
                    重命名
                  </Button>
                  <Button
                    variant="ghost"
                    size="compact"
                    type="button"
                    onClick={() => setTagEdit({ tag, mode: "merge" })}
                    icon={<Merge />}
                  >
                    合并
                  </Button>
                  <Button
                    variant="danger"
                    size="compact"
                    type="button"
                    onClick={() => setDeleteTarget({ kind: "tag", item: tag })}
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
      <Modal
        open={tagEdit !== null}
        title={tagEdit?.mode === "merge" ? "合并标签" : "重命名标签"}
        description={
          tagEdit?.mode === "merge"
            ? `将“${tagEdit?.tag.name}”合并至目标标签。`
            : `为“${tagEdit?.tag.name}”输入新名称。`
        }
        onClose={() => setTagEdit(null)}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setTagEdit(null)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="tag-edit-form"
              icon={tagEdit?.mode === "merge" ? <Merge /> : <Save />}
            >
              {tagEdit?.mode === "merge" ? "合并标签" : "保存名称"}
            </Button>
          </>
        }
      >
        <form id="tag-edit-form" className="modal-form" onSubmit={saveTag}>
          <label>
            {tagEdit?.mode === "merge" ? "目标标签" : "新标签名称"}
            <input name="value" required autoFocus />
          </label>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除标签" : "删除标签"}
        description={
          deleteTarget?.kind === "batch"
            ? `确认删除选中的 ${selected.length} 个标签？这些标签会从文章中移除。`
            : deleteTarget
              ? `从所有文章中移除标签“${deleteTarget.item.name}”？`
              : ""
        }
        confirmLabel="确认删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
      <WorkflowLauncher
        open={aiOpen}
        resourceType="tag"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选标签交给 AI"
      />
    </AdminPage>
  );
}
