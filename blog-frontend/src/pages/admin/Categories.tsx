import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Sparkles, Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import { agentApi } from "../../api/agent";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Input,
  InputNumber,
  Modal,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import type { Category } from "../../types/blog";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type DeleteTarget =
  | { kind: "category"; item: Category }
  | { kind: "batch" }
  | null;

type EditorState = { mode: "create" } | { mode: "edit"; item: Category } | null;

type CategoryDraft = {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
};

const emptyCategoryDraft: CategoryDraft = {
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
};

function CategoriesSkeleton() {
  return (
    <Card padding="base" aria-label="分类加载中">
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Text size="sm" tone="muted">
          正在加载分类…
        </Text>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[4rem_minmax(0,1fr)_10rem_6rem]"
          >
            <Skeleton className="h-4 w-10" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function CategoryActions({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <div className="flex min-w-max flex-nowrap items-center justify-end gap-1">
      <IconButton
        variant="ghost"
        label={`编辑分类 ${category.name}`}
        icon={<Edit2 />}
        onClick={() => onEdit(category)}
      />
      <IconButton
        variant="ghost"
        color="error"
        label={`删除分类 ${category.name}`}
        icon={<Trash2 />}
        onClick={() => onDelete(category)}
      />
    </div>
  );
}

export default function Categories() {
  const allowed = useAdminGuard("/admin/categories");
  const { notify } = useAppFeedback();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [draft, setDraft] = useState<CategoryDraft>(emptyCategoryDraft);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);
  const [slugLoading, setSlugLoading] = useState(false);
  const [slugCandidates, setSlugCandidates] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      setCategories(await siteApi.getAdminCategories());
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

  const closeEditor = () => {
    setEditor(null);
    setSlugCandidates([]);
    setSlugLoading(false);
  };

  const openCreate = () => {
    setDraft(emptyCategoryDraft);
    setSlugCandidates([]);
    setEditor({ mode: "create" });
  };

  const openEdit = (category: Category) => {
    setDraft({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      sort_order: category.sort_order || 0,
    });
    setSlugCandidates([]);
    setEditor({ mode: "edit", item: category });
  };

  const requestCategorySlug = async () => {
    if (!draft.name.trim()) {
      notify("请先填写分类名称，AI 才能分析生成 Slug 标识。", "error");
      return;
    }
    setSlugLoading(true);
    try {
      const response = await agentApi.getDraftAssist({
        task: "slug",
        title: draft.name,
        summary: draft.description,
      });
      const next = [...(response.suggestions || [])];
      if (response.metadata?.slug && !next.includes(response.metadata.slug)) {
        next.unshift(response.metadata.slug);
      }
      setSlugCandidates(next);
      if (next.length === 0) {
        notify("未能生成 Slug 候选，请手动填写。", "error");
      } else {
        notify("已生成 Slug 标识候选，点击即可一键应用。", "success");
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "生成 Slug 失败",
        "error",
      );
    } finally {
      setSlugLoading(false);
    }
  };

  const applySlug = (slugValue: string) => {
    const clean = slugValue.trim().toLowerCase().replace(/\s+/g, "-");
    setDraft((current) => ({ ...current, slug: clean }));
    setSlugCandidates([]);
    notify(`已应用 Slug 标识：“${clean}”`, "success");
  };

  const saveCategory = async () => {
    if (!editor) return;
    const name = draft.name.trim();
    const slug = draft.slug.trim().toLowerCase();
    if (!name || !slug) {
      notify("分类名称和 Slug 标识都不能为空。", "error");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      notify("Slug 只能包含小写字母、数字与连字符。", "error");
      return;
    }

    try {
      const payload = {
        name,
        slug,
        description: draft.description.trim() || undefined,
        sort_order: Number(draft.sort_order) || 0,
      };
      if (editor.mode === "create") {
        await siteApi.createCategory(payload);
        notify("分类已创建。", "success");
      } else {
        await siteApi.updateCategory(editor.item.id, payload);
        notify("分类已更新。", "success");
      }
      closeEditor();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : editor.mode === "create"
            ? "创建失败"
            : "分类更新失败。",
      );
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "batch") {
        const results = await Promise.allSettled(
          selected.map(async (key) => {
            await siteApi.deleteCategory(key);
            return key;
          }),
        );
        const removed = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failed = selected.filter((key) => !removed.includes(key));
        setSelected(failed);
        setDeleteTarget(null);
        await load();
        if (failed.length) {
          const reason = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          )?.reason;
          setError(
            `已删除 ${removed.length} 个分类；${failed.length} 个未删除：${reason instanceof Error ? reason.message : "请稍后重试。"}`,
          );
        } else {
          notify(`已删除 ${removed.length} 个分类。`);
        }
        return;
      }

      await siteApi.deleteCategory(deleteTarget.item.id);
      notify("分类已删除，相关文章已移至未分类。");
      setDeleteTarget(null);
      setSelected((current) =>
        current.filter((id) => id !== deleteTarget.item.id),
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    }
  };

  const setSelectedCategory = (id: number, checked: boolean) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
    );
  };

  const allSelected =
    categories.length > 0 &&
    categories.every((category) => selected.includes(category.id));

  const deleteDescription =
    deleteTarget?.kind === "batch"
      ? `确认删除选中的 ${selected.length} 个分类？相关文章会移至未分类。`
      : deleteTarget?.kind === "category"
        ? `删除分类“${deleteTarget.item.name}”？相关文章会移至未分类。`
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="分类"
        description="建立长期稳定的内容脉络与主题结构。"
        actions={
          <Button
            variant="solid"
            color="primary"
            icon={<Plus />}
            onClick={openCreate}
          >
            新建分类
          </Button>
        }
      />

      {error && categories.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      {selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 个分类`}
          onCancel={() => {
            setSelected([]);
            setAIOpen(false);
          }}
        >
          <Button
            size="small"
            icon={<Sparkles />}
            onClick={() => setAIOpen(true)}
          >
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
        <CategoriesSkeleton />
      ) : error && categories.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="分类加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : categories.length === 0 ? (
        <Card padding="lg">
          <Empty
            title="还没有分类"
            description="创建第一个分类来组织长期主题。"
            action={
              <Button
                variant="solid"
                color="primary"
                icon={<Plus />}
                onClick={openCreate}
              >
                创建分类
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table density="compact" bordered>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      aria-label="选择全部分类"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? categories.map((category) => category.id)
                            : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-20">排序</TableHead>
                  <TableHead>分类名称与描述</TableHead>
                  <TableHead className="w-48">Slug 标识</TableHead>
                  <TableHead className="w-24 text-right">文章数</TableHead>
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow
                    key={category.id}
                    data-state={
                      selected.includes(category.id) ? "selected" : undefined
                    }
                  >
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`选择分类 ${category.name}`}
                        checked={selected.includes(category.id)}
                        onChange={(event) =>
                          setSelectedCategory(category.id, event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {category.sort_order ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-72 whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <strong className="text-sm font-semibold text-foreground">
                          {category.name}
                        </strong>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {category.description || "暂无描述"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {category.slug}
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {category.post_count ?? 0}
                    </TableCell>
                    <TableCell>
                      <CategoryActions
                        category={category}
                        onEdit={openEdit}
                        onDelete={(item) =>
                          setDeleteTarget({ kind: "category", item })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div
            className="grid gap-3 md:hidden"
            role="list"
            aria-label="分类列表"
          >
            {categories.map((category) => (
              <Card
                key={category.id}
                padding="base"
                role="listitem"
                className={
                  selected.includes(category.id)
                    ? "border-primary/40 bg-accent/20"
                    : undefined
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      aria-label={`选择分类 ${category.name}`}
                      checked={selected.includes(category.id)}
                      onChange={(event) =>
                        setSelectedCategory(category.id, event.target.checked)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold text-foreground">
                        {category.name}
                      </strong>
                      <Text
                        size="xs"
                        tone="muted"
                        className="mt-1 leading-relaxed"
                      >
                        {category.description || "暂无描述"}
                      </Text>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/35 p-3 text-xs">
                    <div>
                      <Text as="div" size="xs" tone="muted">
                        排序
                      </Text>
                      <span className="mt-1 block font-mono text-foreground">
                        {category.sort_order ?? 0}
                      </span>
                    </div>
                    <div>
                      <Text as="div" size="xs" tone="muted">
                        文章数
                      </Text>
                      <span className="mt-1 block font-mono text-foreground">
                        {category.post_count ?? 0}
                      </span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <Text as="div" size="xs" tone="muted">
                        Slug 标识
                      </Text>
                      <code className="mt-1 block break-all font-mono text-xs text-foreground">
                        {category.slug}
                      </code>
                    </div>
                  </div>
                  <div className="flex justify-end border-t pt-3">
                    <CategoryActions
                      category={category}
                      onEdit={openEdit}
                      onDelete={(item) =>
                        setDeleteTarget({ kind: "category", item })
                      }
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={editor !== null}
        title={editor?.mode === "edit" ? "编辑分类" : "新建分类"}
        description={
          editor?.mode === "edit"
            ? "更新名称、URL 标识、描述与排序。"
            : "创建一个可长期复用的内容主题。"
        }
        width={440}
        onClose={closeEditor}
        footer={
          <>
            <Button onClick={closeEditor}>取消</Button>
            <Button
              variant="solid"
              color="primary"
              onClick={() => void saveCategory()}
            >
              {editor?.mode === "edit" ? "保存修改" : "创建分类"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormField label="分类名称" required>
            <Input
              aria-label="分类名称"
              required
              autoFocus
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Slug 标识"
            required
            hint="用于分类 URL，建议使用稳定的英文短语。"
          >
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  aria-label="Slug 标识"
                  required
                  value={draft.slug}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      slug: event.target.value,
                    }))
                  }
                />
                <Button
                  size="small"
                  icon={<Sparkles />}
                  disabled={slugLoading}
                  onClick={() => void requestCategorySlug()}
                >
                  {slugLoading ? "生成中…" : "AI 生成"}
                </Button>
              </div>
              {slugCandidates.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Slug 候选">
                  {slugCandidates.map((candidate) => (
                    <Button
                      key={candidate}
                      size="small"
                      variant="text"
                      onClick={() => applySlug(candidate)}
                    >
                      {candidate}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </FormField>
          <FormField label="分类描述">
            <Textarea
              aria-label="分类描述"
              rows={4}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="排序" hint="数值越小，显示越靠前。">
            <InputNumber
              aria-label="分类排序"
              min={0}
              value={draft.sort_order}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  sort_order: value ?? 0,
                }))
              }
            />
          </FormField>
        </div>
      </Drawer>

      <Modal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除分类" : "删除分类"}
        description={deleteDescription}
        onClose={() => setDeleteTarget(null)}
        onOk={() => void remove()}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ variant: "solid", color: "error" }}
      >
        <Text size="sm" tone="muted">
          删除分类不会删除文章，但相关文章需要重新归类。
        </Text>
      </Modal>

      <WorkflowLauncher
        open={aiOpen}
        resourceType="category"
        resourceKeys={selected}
        onClose={() => setAIOpen(false)}
        title="将所选分类交给 AI"
      />
    </div>
  );
}
