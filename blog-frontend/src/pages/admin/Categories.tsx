import { useCallback, useEffect, useState } from "react";
import { Bot, Edit2, Plus, Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import { agentApi } from "../../api/agent";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";
import { useToast } from "@gouno/ui-legacy";
import { ConfirmActionModal } from "../../components/ConfirmActionModal";
import { WorkflowLauncher } from "../../components/agent/WorkflowLauncher";
import { CategoryForm } from "../../components/taxonomy/CategoryForm";
import type { CategoryFormValue } from "../../components/taxonomy/CategoryForm";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import type { Category } from "../../types/blog";

type DeleteTarget =
  | { kind: "category"; item: Category }
  | { kind: "batch" }
  | null;

const emptyCategoryForm: CategoryFormValue = {
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
};

function CategoriesSkeleton() {
  return (
    <Card padding="base">
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label="分类加载中"
        aria-live="polite"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[3rem_5rem_minmax(0,1fr)_12rem_6rem_8rem]"
          >
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-4 w-8" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Categories() {
  const allowed = useAdminGuard("/admin/categories");
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createForm, setCreateForm] =
    useState<CategoryFormValue>(emptyCategoryForm);
  const [editForm, setEditForm] =
    useState<CategoryFormValue>(emptyCategoryForm);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  const [slugLoading, setSlugLoading] = useState(false);
  const [slugCandidates, setSlugCandidates] = useState<string[]>([]);
  const [activeSlugMode, setActiveSlugMode] = useState<
    "create" | "edit" | null
  >(null);

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

  const openCreateDrawer = () => {
    setCreateForm(emptyCategoryForm);
    setSlugCandidates([]);
    setActiveSlugMode(null);
    setCreatingCategory(true);
  };

  const openEditDrawer = (item: Category) => {
    setEditingCategory(item);
    setEditForm({
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      sort_order: item.sort_order || 0,
    });
    setSlugCandidates([]);
    setActiveSlugMode(null);
  };

  const requestCategorySlug = async (mode: "create" | "edit") => {
    const currentForm = mode === "create" ? createForm : editForm;
    if (!currentForm.name.trim()) {
      notify("请先填写分类名称，AI 才能分析生成 Slug 标识。", "error");
      return;
    }
    setSlugLoading(true);
    setActiveSlugMode(mode);
    try {
      const res = await agentApi.getDraftAssist({
        task: "slug",
        title: currentForm.name,
        summary: currentForm.description,
      });
      const list = res.suggestions || [];
      if (res.metadata?.slug && !list.includes(res.metadata.slug)) {
        list.unshift(res.metadata.slug);
      }
      setSlugCandidates(list);
      if (list.length === 0) {
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

  const applySlug = (mode: "create" | "edit", slugValue: string) => {
    const clean = slugValue.trim().toLowerCase().replace(/\s+/g, "-");
    if (mode === "create") {
      setCreateForm((prev) => ({ ...prev, slug: clean }));
    } else {
      setEditForm((prev) => ({ ...prev, slug: clean }));
    }
    setSlugCandidates([]);
    setActiveSlugMode(null);
    notify(`已应用 Slug 标识：“${clean}”`, "success");
  };

  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await siteApi.createCategory({
        name: createForm.name.trim(),
        slug: createForm.slug.trim().toLowerCase(),
        description: createForm.description.trim() || undefined,
        sort_order: Number(createForm.sort_order) || 0,
      });
      setCreatingCategory(false);
      setCreateForm(emptyCategoryForm);
      notify("分类已创建。", "success");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败");
    }
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCategory) return;
    try {
      await siteApi.updateCategory(editingCategory.id, {
        name: editForm.name.trim(),
        slug: editForm.slug.trim().toLowerCase(),
        description: editForm.description.trim() || undefined,
        sort_order: Number(editForm.sort_order) || 0,
      });
      setEditingCategory(null);
      notify("分类已更新。", "success");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分类更新失败。");
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

  const renderActions = (item: Category) => (
    <>
      <IconButton
        variant="ghost"
        label={`编辑分类 ${item.name}`}
        icon={<Edit2 />}
        onClick={() => openEditDrawer(item)}
      />
      <IconButton
        variant="ghost"
        color="error"
        label={`删除分类 ${item.name}`}
        icon={<Trash2 />}
        onClick={() => setDeleteTarget({ kind: "category", item })}
      />
    </>
  );

  const allSelected =
    categories.length > 0 &&
    categories.every((item) => selected.includes(item.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="分类"
        description="建立长期稳定的内容脉络与主题结构。"
        actions={
          <Button
            variant="solid"
            color="primary"
            type="button"
            icon={<Plus />}
            onClick={openCreateDrawer}
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
          onCancel={() => setSelected([])}
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
            title="还没有分类。创建第一个分类来组织长期主题。"
            action={
              <Button
                size="small"
                variant="solid"
                color="primary"
                icon={<Plus />}
                onClick={openCreateDrawer}
              >
                创建第一个分类
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
                            ? categories.map((item) => item.id)
                            : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-20">排序</TableHead>
                  <TableHead>分类名称与描述</TableHead>
                  <TableHead className="w-48">Slug 标识</TableHead>
                  <TableHead className="w-24">文章数</TableHead>
                  <TableHead className="w-32 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`选择分类 ${item.name}`}
                        checked={selected.includes(item.id)}
                        onChange={(event) =>
                          setSelectedCategory(item.id, event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.sort_order ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-0.5">
                        <strong className="text-sm font-semibold text-foreground">
                          {item.name}
                        </strong>
                        {item.description ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {item.slug}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.post_count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {renderActions(item)}
                      </div>
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
            {categories.map((item) => (
              <Card key={item.id} padding="base" role="listitem">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`选择分类 ${item.name}`}
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelectedCategory(item.id, event.target.checked)
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {item.name}
                        </strong>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {item.post_count ?? 0} 篇
                        </span>
                      </div>
                      {item.description ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono">
                          {item.slug}
                        </code>
                        <span>排序 {item.sort_order ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {renderActions(item)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={creatingCategory}
        title="新建分类"
        description="创建一个可长期复用的内容主题。"
        onClose={() => setCreatingCategory(false)}
      >
        <CategoryForm
          mode="create"
          value={createForm}
          slugCandidates={slugCandidates}
          slugLoading={slugLoading && activeSlugMode === "create"}
          showSlugCandidates={activeSlugMode === "create"}
          onChange={setCreateForm}
          onRequestSlug={() => void requestCategorySlug("create")}
          onApplySlug={(value) => applySlug("create", value)}
          onCancel={() => setCreatingCategory(false)}
          onSubmit={createCategory}
        />
      </Drawer>

      <Drawer
        open={editingCategory !== null}
        title="编辑分类"
        description="更新名称、URL 标识、描述与排序。"
        onClose={() => setEditingCategory(null)}
      >
        {editingCategory ? (
          <CategoryForm
            mode="edit"
            value={editForm}
            slugCandidates={slugCandidates}
            slugLoading={slugLoading && activeSlugMode === "edit"}
            showSlugCandidates={activeSlugMode === "edit"}
            onChange={setEditForm}
            onRequestSlug={() => void requestCategorySlug("edit")}
            onApplySlug={(value) => applySlug("edit", value)}
            onCancel={() => setEditingCategory(null)}
            onSubmit={saveCategory}
          />
        ) : null}
      </Drawer>

      <ConfirmActionModal
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "batch" ? "批量删除分类" : "删除分类"}
        description={
          deleteTarget?.kind === "batch"
            ? `确认删除选中的 ${selected.length} 个分类？相关文章会移至未分类。`
            : deleteTarget?.kind === "category"
              ? `删除分类“${deleteTarget.item.name}”？相关文章会移至未分类。`
              : ""
        }
        confirmLabel="确认删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />

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
