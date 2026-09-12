import { useCallback, useEffect, useState } from "react";
import { Bot, Merge, Save, Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  FormField,
  Input,
  Modal,
  Skeleton,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type TagEdit = { tag: TagSummary; mode: "rename" | "merge" } | null;
type DeleteTarget =
  | { kind: "tag"; item: TagSummary }
  | { kind: "batch" }
  | null;

function TagGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="标签加载中"
      aria-live="polite"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} padding="sm" className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-12" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Tags() {
  const allowed = useAdminGuard("/admin/tags");
  const { notify } = useAppFeedback();
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tagEdit, setTagEdit] = useState<TagEdit>(null);
  const [editValue, setEditValue] = useState("");
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

  const setSelection = (name: string, checked: boolean) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, name])]
        : current.filter((item) => item !== name),
    );
  };

  const openEdit = (tag: TagSummary, mode: "rename" | "merge") => {
    setTagEdit({ tag, mode });
    setEditValue("");
    setError("");
  };

  const closeEdit = () => {
    setTagEdit(null);
    setEditValue("");
  };

  const saveTag = async () => {
    if (!tagEdit) return;
    const value = editValue.trim();
    if (!value || value === tagEdit.tag.name) {
      notify("请输入不同于当前标签的有效名称。", "error");
      return;
    }

    if (tagEdit.mode === "rename" && tags.some((tag) => tag.name === value)) {
      notify(`标签“${value}”已经存在。`, "error");
      return;
    }

    if (tagEdit.mode === "merge" && !tags.some((tag) => tag.name === value)) {
      notify("目标标签必须是现有标签。", "error");
      return;
    }

    try {
      if (tagEdit.mode === "rename") {
        await siteApi.renameTag(tagEdit.tag.name, value);
        setSelected((current) =>
          current.map((name) => (name === tagEdit.tag.name ? value : name)),
        );
        notify("标签已重命名。");
      } else {
        await siteApi.mergeTags(tagEdit.tag.name, value);
        setSelected((current) =>
          current.filter((name) => name !== tagEdit.tag.name),
        );
        notify("标签已合并。");
      }
      closeEdit();
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
      setSelected((current) =>
        current.filter((name) => name !== deleteTarget.item.name),
      );
      notify("标签已从文章中移除。");
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    }
  };

  const deleteDescription =
    deleteTarget?.kind === "batch"
      ? `确认删除选中的 ${selected.length} 个标签？这些标签会从文章中移除。`
      : deleteTarget?.kind === "tag"
        ? `从所有文章中移除标签“${deleteTarget.item.name}”？`
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="标签"
        description="整理文章中的具体技术与概念信号，支持批量清洗与合并。"
      />

      {error && tags.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      {selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 个标签`}
          onCancel={() => {
            setSelected([]);
            setAIOpen(false);
          }}
        >
          <Button size="small" icon={<Bot />} onClick={() => setAIOpen(true)}>
            交给 AI
          </Button>
          <Button
            size="small"
            color="error"
            icon={<Trash2 />}
            onClick={() => setDeleteTarget({ kind: "batch" })}
          >
            删除
          </Button>
        </BulkActionBar>
      ) : null}

      {loading ? (
        <TagGridSkeleton />
      ) : error && tags.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="标签加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : tags.length === 0 ? (
        <Card padding="lg">
          <Empty
            title="文章添加标签后会自动在这里汇总。"
            description="标签来自文章内容，无需在这里提前创建。"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tags.map((tag) => (
            <Card
              key={tag.name}
              padding="sm"
              className="gap-0 transition-colors hover:border-primary/40"
              data-state={selected.includes(tag.name) ? "selected" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    aria-label={`选择标签 ${tag.name}`}
                    checked={selected.includes(tag.name)}
                    onChange={(event) =>
                      setSelection(tag.name, event.target.checked)
                    }
                  />
                  <strong className="truncate text-sm font-semibold text-foreground">
                    {tag.name}
                  </strong>
                </div>
                <Tag color="default" className="shrink-0 font-mono">
                  {tag.post_count} 篇
                </Tag>
              </div>
              <div
                className="mt-4 flex flex-wrap items-center justify-end gap-1 border-t pt-3"
                aria-label={`标签 ${tag.name} 操作`}
              >
                <Button
                  size="small"
                  variant="text"
                  icon={<Save />}
                  aria-label={`重命名标签 ${tag.name}`}
                  onClick={() => openEdit(tag, "rename")}
                >
                  重命名
                </Button>
                <Button
                  size="small"
                  variant="text"
                  icon={<Merge />}
                  aria-label={`合并标签 ${tag.name}`}
                  onClick={() => openEdit(tag, "merge")}
                >
                  合并
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  icon={<Trash2 />}
                  aria-label={`删除标签 ${tag.name}`}
                  onClick={() => setDeleteTarget({ kind: "tag", item: tag })}
                >
                  删除
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={tagEdit !== null}
        title={tagEdit?.mode === "merge" ? "合并标签" : "重命名标签"}
        description={
          tagEdit?.mode === "merge"
            ? `将“${tagEdit?.tag.name ?? ""}”合并至现有目标标签。`
            : `为“${tagEdit?.tag.name ?? ""}”输入新名称。`
        }
        onClose={closeEdit}
        onOk={() => void saveTag()}
        okText={tagEdit?.mode === "merge" ? "合并标签" : "保存名称"}
        okButtonProps={{ variant: "solid", color: "primary" }}
      >
        <FormField
          label={tagEdit?.mode === "merge" ? "目标标签" : "新标签名称"}
          required
          hint={
            tagEdit?.mode === "merge"
              ? "输入一个已经存在的标签名称。"
              : undefined
          }
        >
          <Input
            aria-label={tagEdit?.mode === "merge" ? "目标标签" : "新标签名称"}
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            autoFocus
          />
        </FormField>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除标签" : "删除标签"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
        onOk={() => void remove()}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          删除只移除标签关联，不删除文章。
        </Text>
      </Modal>

      <WorkflowLauncher
        open={aiOpen}
        resourceType="tag"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选标签交给 AI"
      />
    </div>
  );
}
