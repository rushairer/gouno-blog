import { useCallback, useEffect, useState } from 'react';
import { Edit2, Merge, Plus, Save, Trash2 } from 'lucide-react';
import { siteApi } from '../../api/site';
import type { TagSummary } from '../../api/site';
import { AdminPage, AdminPageHeader, BulkActionBar, Button, Checkbox, ConfirmDialog, ContentStack, Drawer, EmptyState, Feedback, Field, Input, LoadingState, Modal, Panel, useToast } from '../../components/ui';
import { WorkflowLauncher } from '../../components/agent/WorkflowLauncher';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import type { Category } from '../../types/blog';

type TagEdit = { tag: TagSummary; mode: 'rename' | 'merge' } | null;
type DeleteTarget = { kind: 'category'; item: Category } | { kind: 'tag'; item: TagSummary } | { kind: 'batch' } | null;

export default function AdminTaxonomy({ type }: { type: 'categories' | 'tags' }) {
  const allowed = useAdminGuard(`/admin/${type}`);
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [tagEdit, setTagEdit] = useState<TagEdit>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<Array<number | string>>([]); const [aiOpen, setAIOpen] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      if (type === 'categories') setCategories(await siteApi.getAdminCategories());
      else setTags(await siteApi.getAdminTags());
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '载入失败'); } finally { setLoading(false); }
  }, [allowed, type]);
  useEffect(() => { void load(); }, [load]);

  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try {
      await siteApi.createCategory({
        name: String(data.name || ''),
        slug: String(data.slug || ''),
        description: data.description ? String(data.description) : undefined,
        sort_order: Number(data.sort_order || 0),
      });
      form.reset(); setCreatingCategory(false); notify('分类已创建。'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '创建失败'); }
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editingCategory) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await siteApi.updateCategory(editingCategory.id, {
        name: String(data.name || ''),
        slug: String(data.slug || ''),
        description: data.description ? String(data.description) : undefined,
        sort_order: Number(data.sort_order || 0),
      });
      setEditingCategory(null); notify('分类已更新。'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '分类更新失败。'); }
  };

  const saveTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!tagEdit) return;
    const value = String(new FormData(event.currentTarget).get('value') || '').trim();
    if (!value || value === tagEdit.tag.name) return;
    try {
      if (tagEdit.mode === 'rename') {
        await siteApi.renameTag(tagEdit.tag.name, value);
      } else {
        await siteApi.mergeTags(tagEdit.tag.name, value);
      }
      notify(tagEdit.mode === 'rename' ? '标签已重命名。' : '标签已合并。'); setTagEdit(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '标签操作失败。'); }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'batch') {
        const results = await Promise.allSettled(selected.map(async (key) => {
          if (type === 'categories') await siteApi.deleteCategory(key);
          else await siteApi.deleteTag(String(key));
          return key;
        }));
        const removed = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        const failed = selected.filter((key) => !removed.includes(key));
        setSelected(failed);
        setDeleteTarget(null);
        await load();
        if (failed.length) {
          const reason = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
          setError(`已删除 ${removed.length} 个${type === 'categories' ? '分类' : '标签'}；${failed.length} 个未删除：${reason instanceof Error ? reason.message : '请稍后重试。'}`);
        } else notify(`已删除 ${removed.length} 个${type === 'categories' ? '分类' : '标签'}。`);
        return;
      }
      if (deleteTarget.kind === 'category') await siteApi.deleteCategory(deleteTarget.item.id);
      else await siteApi.deleteTag(deleteTarget.item.name);
      notify(deleteTarget.kind === 'category' ? '分类已删除，相关文章已移至未分类。' : '标签已从文章中移除。');
      setDeleteTarget(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败。'); }
  };

  return (
    <AdminPage>
      <AdminPageHeader title={type === 'categories' ? '分类' : '标签'} description={type === 'categories' ? '建立长期稳定的内容脉络。' : '整理文章中的具体技术与概念信号。'} actions={type === 'categories' ? <Button variant="primary" type="button" onClick={() => setCreatingCategory(true)}><Plus />新建分类</Button> : undefined} />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {selected.length ? <BulkActionBar selectionLabel={`已选择 ${selected.length} 个${type === 'categories' ? '分类' : '标签'}`} onAIAssist={() => setAIOpen(true)} onCancel={() => setSelected([])}>
          <Button variant="danger" size="compact" type="button" onClick={() => setDeleteTarget({ kind: 'batch' })}><Trash2 />删除</Button>
        </BulkActionBar> : null}
        {loading ? <LoadingState label="正在整理内容结构…" /> : type === 'categories' ? categories.length === 0 ? <EmptyState label="还没有分类。创建第一个分类来组织长期主题。" /> : <Panel className="taxonomy-table"><div className="table-scroll"><table className="admin-table"><thead><tr><th>选择</th><th>名称</th><th>Slug</th><th>文章</th><th>排序</th><th>操作</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><Checkbox aria-label={`选择分类 ${item.name}`} checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((key) => key !== item.id))} /></td><td><strong>{item.name}</strong><small>{item.description}</small></td><td className="mono">{item.slug}</td><td>{item.post_count || 0}</td><td>{item.sort_order || 0}</td><td><div className="table-actions"><button title="编辑分类" onClick={() => setEditingCategory(item)}><Edit2 /></button><button className="danger-action" title="删除分类" onClick={() => setDeleteTarget({ kind: 'category', item })}><Trash2 /></button></div></td></tr>)}</tbody></table></div></Panel> : tags.length === 0 ? <EmptyState label="文章添加标签后会自动在这里汇总。" /> : <div className="tag-admin-grid">{tags.map((tag) => <Panel className="tag-admin-card" key={tag.name}>
          <Checkbox className="tag-admin-card__checkbox" aria-label={`选择标签 ${tag.name}`} checked={selected.includes(tag.name)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, tag.name])] : current.filter((key) => key !== tag.name))} />
          <div className="tag-admin-card__content"><strong>{tag.name}</strong><span>{tag.post_count} 篇文章</span></div>
          <div className="tag-admin-card__actions" aria-label={`标签 ${tag.name} 操作`}>
            <Button variant="secondary" size="compact" type="button" onClick={() => setTagEdit({ tag, mode: 'rename' })}><Save />重命名</Button>
            <Button variant="secondary" size="compact" type="button" onClick={() => setTagEdit({ tag, mode: 'merge' })}><Merge />合并</Button>
            <Button variant="danger" size="compact" type="button" onClick={() => setDeleteTarget({ kind: 'tag', item: tag })}><Trash2 />删除</Button>
          </div>
        </Panel>)}</div>}
      </ContentStack>
      <Drawer open={creatingCategory} title="新建分类" description="创建一个可长期复用的内容主题。" onClose={() => setCreatingCategory(false)}>
        <form className="drawer-form" onSubmit={createCategory}>
          <Field label="名称" required><Input name="name" required autoFocus /></Field>
          <Field label="Slug" required hint="仅限小写字母、数字与连字符。"><Input name="slug" className="mono" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
          <Field label="描述"><Input name="description" /></Field>
          <Field label="排序" hint="数值越小，显示越靠前。"><Input name="sort_order" type="number" defaultValue="0" /></Field>
          <div className="drawer-actions"><Button variant="secondary" type="button" onClick={() => setCreatingCategory(false)}>取消</Button><Button variant="primary"><Plus />创建分类</Button></div>
        </form>
      </Drawer>
      <Drawer open={editingCategory !== null} title="编辑分类" description="更新名称、URL 标识、描述与排序。" onClose={() => setEditingCategory(null)}>
        {editingCategory ? <form className="drawer-form" onSubmit={saveCategory}><Field label="名称" required><Input name="name" defaultValue={editingCategory.name} required autoFocus /></Field><Field label="Slug" required hint="仅限小写字母、数字与连字符。"><Input name="slug" className="mono" defaultValue={editingCategory.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field><Field label="描述"><textarea name="description" rows={3} defaultValue={editingCategory.description} /></Field><Field label="排序" hint="数值越小，显示越靠前。"><Input name="sort_order" type="number" defaultValue={editingCategory.sort_order || 0} /></Field><div className="drawer-actions"><Button variant="secondary" type="button" onClick={() => setEditingCategory(null)}>取消</Button><Button variant="primary"><Save />保存分类</Button></div></form> : null}
      </Drawer>
      <Modal open={tagEdit !== null} title={tagEdit?.mode === 'merge' ? '合并标签' : '重命名标签'} description={tagEdit?.mode === 'merge' ? `将“${tagEdit?.tag.name}”合并至目标标签。` : `为“${tagEdit?.tag.name}”输入新名称。`} onClose={() => setTagEdit(null)}>
        <form className="modal-form" onSubmit={saveTag}><label>{tagEdit?.mode === 'merge' ? '目标标签' : '新标签名称'}<input name="value" required autoFocus /></label><div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setTagEdit(null)}>取消</Button><Button variant="primary">{tagEdit?.mode === 'merge' ? <Merge /> : <Save />}{tagEdit?.mode === 'merge' ? '合并标签' : '保存名称'}</Button></div></form>
      </Modal>
      <ConfirmDialog open={deleteTarget !== null} title={deleteTarget?.kind === 'batch' ? `批量删除${type === 'categories' ? '分类' : '标签'}` : deleteTarget?.kind === 'category' ? '删除分类' : '删除标签'} description={deleteTarget?.kind === 'batch' ? `确认删除选中的 ${selected.length} 个${type === 'categories' ? '分类' : '标签'}？${type === 'categories' ? '相关文章会移至未分类。' : '这些标签会从文章中移除。'}` : deleteTarget?.kind === 'category' ? `删除分类“${deleteTarget.item.name}”？相关文章会移至未分类。` : deleteTarget ? `从所有文章中移除标签“${deleteTarget.item.name}”？` : ''} confirmLabel="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={remove} />
      <WorkflowLauncher open={aiOpen} resourceType={type === 'categories' ? 'category' : 'tag'} resourceKeys={selected} onClose={() => setAIOpen(false)} title={`将所选${type === 'categories' ? '分类' : '标签'}交给 AI`} />
    </AdminPage>
  );
}
