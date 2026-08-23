import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { siteApi } from '../../api/site';
import { agentApi } from '../../api/agent';
import { AdminPage, AdminPageHeader, BulkActionBar, Button, Checkbox, ConfirmDialog, ContentStack, Drawer, EmptyState, Feedback, LoadingState, Panel, TableContainer, useToast } from '../../components/ui';
import { WorkflowLauncher } from '../../components/agent/WorkflowLauncher';
import { CategoryForm } from '../../components/taxonomy/CategoryForm';
import type { CategoryFormValue } from '../../components/taxonomy/CategoryForm';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import type { Category } from '../../types/blog';

type DeleteTarget = { kind: 'category'; item: Category } | { kind: 'batch' } | null;

const emptyCategoryForm: CategoryFormValue = {
  name: '',
  slug: '',
  description: '',
  sort_order: 0,
};

export default function Categories() {
  const allowed = useAdminGuard('/admin/categories');
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createForm, setCreateForm] = useState<CategoryFormValue>(emptyCategoryForm);
  const [editForm, setEditForm] = useState<CategoryFormValue>(emptyCategoryForm);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [aiOpen, setAIOpen] = useState(false);

  // AI Slug states
  const [slugLoading, setSlugLoading] = useState(false);
  const [slugCandidates, setSlugCandidates] = useState<string[]>([]);
  const [activeSlugMode, setActiveSlugMode] = useState<'create' | 'edit' | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      setCategories(await siteApi.getAdminCategories());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '载入失败');
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
      description: item.description || '',
      sort_order: item.sort_order || 0,
    });
    setSlugCandidates([]);
    setActiveSlugMode(null);
  };

  const requestCategorySlug = async (mode: 'create' | 'edit') => {
    const currentForm = mode === 'create' ? createForm : editForm;
    if (!currentForm.name.trim()) {
      notify('请先填写分类名称，AI 才能分析生成 Slug 标识。', 'error');
      return;
    }
    setSlugLoading(true);
    setActiveSlugMode(mode);
    try {
      const res = await agentApi.getDraftAssist({
        task: 'slug',
        title: currentForm.name,
        summary: currentForm.description,
      });
      const list = res.suggestions || [];
      if (res.metadata?.slug && !list.includes(res.metadata.slug)) {
        list.unshift(res.metadata.slug);
      }
      setSlugCandidates(list);
      if (list.length === 0) {
        notify('未能生成 Slug 候选，请手动填写。', 'error');
      } else {
        notify('已生成 Slug 标识候选，点击即可一键应用。', 'success');
      }
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '生成 Slug 失败', 'error');
    } finally {
      setSlugLoading(false);
    }
  };

  const applySlug = (mode: 'create' | 'edit', slugValue: string) => {
    const clean = slugValue.trim().toLowerCase().replace(/\s+/g, '-');
    if (mode === 'create') {
      setCreateForm((prev) => ({ ...prev, slug: clean }));
    } else {
      setEditForm((prev) => ({ ...prev, slug: clean }));
    }
    setSlugCandidates([]);
    setActiveSlugMode(null);
    notify(`已应用 Slug 标识：“${clean}”`, 'success');
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
      notify('分类已创建。', 'success');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
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
      notify('分类已更新。', 'success');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分类更新失败。');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'batch') {
        const results = await Promise.allSettled(
          selected.map(async (key) => {
            await siteApi.deleteCategory(key);
            return key;
          })
        );
        const removed = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
        const failed = selected.filter((key) => !removed.includes(key));
        setSelected(failed);
        setDeleteTarget(null);
        await load();
        if (failed.length) {
          const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
          setError(`已删除 ${removed.length} 个分类；${failed.length} 个未删除：${reason instanceof Error ? reason.message : '请稍后重试。'}`);
        } else {
          notify(`已删除 ${removed.length} 个分类。`);
        }
        return;
      }
      await siteApi.deleteCategory(deleteTarget.item.id);
      notify('分类已删除，相关文章已移至未分类。');
      setDeleteTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败。');
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="分类"
        description="建立长期稳定的内容脉络与主题结构。"
        actions={
          <Button variant="primary" type="button" onClick={openCreateDrawer}>
            <Plus />新建分类
          </Button>
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {selected.length ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 个分类`}
            onAIAssist={() => setAIOpen(true)}
            onCancel={() => setSelected([])}
          >
            <Button variant="danger" size="compact" type="button" onClick={() => setDeleteTarget({ kind: 'batch' })}>
              <Trash2 />删除
            </Button>
          </BulkActionBar>
        ) : null}
        {loading ? (
          <LoadingState label="正在整理分类结构…" />
        ) : categories.length === 0 ? (
          <EmptyState label="还没有分类。创建第一个分类来组织长期主题。" />
        ) : (
          <Panel className="taxonomy-table">
            <TableContainer>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>名称</th>
                    <th>Slug</th>
                    <th>文章</th>
                    <th>排序</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Checkbox
                          aria-label={`选择分类 ${item.name}`}
                          checked={selected.includes(item.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...new Set([...current, item.id])]
                                : current.filter((key) => key !== item.id)
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </td>
                      <td className="mono">{item.slug}</td>
                      <td>{item.post_count || 0}</td>
                      <td>{item.sort_order || 0}</td>
                      <td>
                        <div className="table-actions">
                          <button title="编辑分类" onClick={() => openEditDrawer(item)}>
                            <Edit2 />
                          </button>
                          <button
                            className="danger-action"
                            title="删除分类"
                            onClick={() => setDeleteTarget({ kind: 'category', item })}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </Panel>
        )}
      </ContentStack>

      {/* 新建分类 Drawer */}
      <Drawer open={creatingCategory} title="新建分类" description="创建一个可长期复用的内容主题。" onClose={() => setCreatingCategory(false)}>
        <CategoryForm mode="create" value={createForm} slugCandidates={slugCandidates} slugLoading={slugLoading && activeSlugMode === 'create'} showSlugCandidates={activeSlugMode === 'create'} onChange={setCreateForm} onRequestSlug={() => void requestCategorySlug('create')} onApplySlug={(value) => applySlug('create', value)} onCancel={() => setCreatingCategory(false)} onSubmit={createCategory} />
      </Drawer>

      {/* 编辑分类 Drawer */}
      <Drawer open={editingCategory !== null} title="编辑分类" description="更新名称、URL 标识、描述与排序。" onClose={() => setEditingCategory(null)}>
        {editingCategory ? <CategoryForm mode="edit" value={editForm} slugCandidates={slugCandidates} slugLoading={slugLoading && activeSlugMode === 'edit'} showSlugCandidates={activeSlugMode === 'edit'} onChange={setEditForm} onRequestSlug={() => void requestCategorySlug('edit')} onApplySlug={(value) => applySlug('edit', value)} onCancel={() => setEditingCategory(null)} onSubmit={saveCategory} /> : null}
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'batch' ? '批量删除分类' : '删除分类'}
        description={
          deleteTarget?.kind === 'batch'
            ? `确认删除选中的 ${selected.length} 个分类？相关文章会移至未分类。`
            : deleteTarget?.kind === 'category'
            ? `删除分类“${deleteTarget.item.name}”？相关文章会移至未分类。`
            : ''
        }
        confirmLabel="确认删除"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
      <WorkflowLauncher open={aiOpen} resourceType="category" resourceKeys={selected} onClose={() => setAIOpen(false)} title="将所选分类交给 AI" />
    </AdminPage>
  );
}
