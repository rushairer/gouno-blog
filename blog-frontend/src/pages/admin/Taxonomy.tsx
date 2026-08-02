import { useCallback, useEffect, useState } from 'react';
import { Edit3, Merge, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, Button, Checkbox, ConfirmDialog, ContentStack, EmptyState, Feedback, Field, Input, LoadingState, Modal, Panel, useToast } from '../../components/ui';
import { WorkflowLauncher } from '../../components/agent/WorkflowLauncher';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { readData } from '../../lib/blog-api';
import type { Category } from '../../types/blog';

interface TagSummary { name: string; post_count: number }
type TagEdit = { tag: TagSummary; mode: 'rename' | 'merge' } | null;
type DeleteTarget = { kind: 'category'; item: Category } | { kind: 'tag'; item: TagSummary } | null;

export default function AdminTaxonomy({ type }: { type: 'categories' | 'tags' }) {
  const allowed = useAdminGuard(`/admin/${type}`);
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [tagEdit, setTagEdit] = useState<TagEdit>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [selected, setSelected] = useState<Array<number | string>>([]); const [aiOpen, setAIOpen] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      if (type === 'categories') setCategories(await readData<Category[]>(apiFetch('/api/admin/categories')));
      else setTags(await readData<TagSummary[]>(apiFetch('/api/admin/tags')));
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '载入失败'); } finally { setLoading(false); }
  }, [allowed, type]);
  useEffect(() => { void load(); }, [load]);

  const send = async (path: string, options: RequestInit, fallback: string) => {
    const response = await apiFetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || fallback);
    return body.data;
  };

  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try {
      await send('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, sort_order: Number(data.sort_order || 0) }) }, '分类创建失败。');
      form.reset(); notify('分类已创建。'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '创建失败'); }
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editingCategory) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await send(`/api/admin/categories/${editingCategory.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, sort_order: Number(data.sort_order || 0) }) }, '分类更新失败。');
      setEditingCategory(null); notify('分类已更新。'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '分类更新失败。'); }
  };

  const saveTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!tagEdit) return;
    const value = String(new FormData(event.currentTarget).get('value') || '').trim();
    if (!value || value === tagEdit.tag.name) return;
    try {
      if (tagEdit.mode === 'rename') {
        await send(`/api/admin/tags/${encodeURIComponent(tagEdit.tag.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }) }, '标签重命名失败。');
      } else {
        await send('/api/admin/tags/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: tagEdit.tag.name, target: value }) }, '标签合并失败。');
      }
      notify(tagEdit.mode === 'rename' ? '标签已重命名。' : '标签已合并。'); setTagEdit(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '标签操作失败。'); }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'category') await send(`/api/admin/categories/${deleteTarget.item.id}`, { method: 'DELETE' }, '分类删除失败。');
      else await send(`/api/admin/tags/${encodeURIComponent(deleteTarget.item.name)}`, { method: 'DELETE' }, '标签删除失败。');
      notify(deleteTarget.kind === 'category' ? '分类已删除，相关文章已移至未分类。' : '标签已从文章中移除。');
      setDeleteTarget(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败。'); }
  };

  return (
    <AdminPage>
      <AdminPageHeader title={type === 'categories' ? '分类' : '标签'} description={type === 'categories' ? '建立长期稳定的内容脉络。' : '整理文章中的具体技术与概念信号。'} />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {selected.length ? <div className="bulk-action-bar"><strong>已选择 {selected.length} 个{type === 'categories' ? '分类' : '标签'}</strong><button onClick={() => setAIOpen(true)}><Sparkles />交给 AI</button><button onClick={() => setSelected([])}>取消</button></div> : null}
        {type === 'categories' ? <Panel><form className="taxonomy-form" onSubmit={createCategory}>
          <Field label="名称" required><Input name="name" required /></Field>
          <Field label="Slug" required><Input name="slug" className="mono" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></Field>
          <Field className="taxonomy-form__description" label="描述"><Input name="description" /></Field>
          <Field label="排序"><Input name="sort_order" type="number" defaultValue="0" /></Field>
          <Button variant="primary" className="taxonomy-form__action" type="submit"><Plus /> 新建分类</Button>
        </form></Panel> : null}
        {loading ? <LoadingState label="正在整理内容结构…" /> : type === 'categories' ? categories.length === 0 ? <EmptyState label="还没有分类。创建第一个分类来组织长期主题。" /> : <Panel className="taxonomy-table"><div className="table-scroll"><table className="admin-table"><thead><tr><th>选择</th><th>名称</th><th>Slug</th><th>文章</th><th>排序</th><th>操作</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><Checkbox aria-label={`选择分类 ${item.name}`} checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((key) => key !== item.id))} /></td><td><strong>{item.name}</strong><small>{item.description}</small></td><td className="mono">{item.slug}</td><td>{item.post_count || 0}</td><td>{item.sort_order || 0}</td><td><div className="table-actions"><button title="编辑分类" onClick={() => setEditingCategory(item)}><Edit3 /></button><button className="danger-action" title="删除分类" onClick={() => setDeleteTarget({ kind: 'category', item })}><Trash2 /></button></div></td></tr>)}</tbody></table></div></Panel> : tags.length === 0 ? <EmptyState label="文章添加标签后会自动在这里汇总。" /> : <div className="tag-admin-grid">{tags.map((tag) => <Panel key={tag.name}><Checkbox aria-label={`选择标签 ${tag.name}`} checked={selected.includes(tag.name)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, tag.name])] : current.filter((key) => key !== tag.name))} /><div><strong>{tag.name}</strong><span>{tag.post_count} 篇文章</span></div><div><button onClick={() => setTagEdit({ tag, mode: 'rename' })}><Save /> 重命名</button><button title="合并标签" onClick={() => setTagEdit({ tag, mode: 'merge' })}><Merge /></button><button className="danger-action" title="删除标签" onClick={() => setDeleteTarget({ kind: 'tag', item: tag })}><Trash2 /></button></div></Panel>)}</div>}
      </ContentStack>
      <Modal open={editingCategory !== null} title="编辑分类" description="更新名称、URL 标识、描述与排序。" onClose={() => setEditingCategory(null)}>
        {editingCategory ? <form className="modal-form" onSubmit={saveCategory}><label>名称<input name="name" defaultValue={editingCategory.name} required /></label><label>Slug<input name="slug" className="mono" defaultValue={editingCategory.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>描述<textarea name="description" rows={3} defaultValue={editingCategory.description} /></label><label>排序<input name="sort_order" type="number" defaultValue={editingCategory.sort_order || 0} /></label><div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setEditingCategory(null)}>取消</button><button className="btn btn-primary"><Save /> 保存分类</button></div></form> : null}
      </Modal>
      <Modal open={tagEdit !== null} title={tagEdit?.mode === 'merge' ? '合并标签' : '重命名标签'} description={tagEdit?.mode === 'merge' ? `将“${tagEdit?.tag.name}”合并至目标标签。` : `为“${tagEdit?.tag.name}”输入新名称。`} onClose={() => setTagEdit(null)}>
        <form className="modal-form" onSubmit={saveTag}><label>{tagEdit?.mode === 'merge' ? '目标标签' : '新标签名称'}<input name="value" required autoFocus /></label><div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setTagEdit(null)}>取消</button><button className="btn btn-primary">{tagEdit?.mode === 'merge' ? <Merge /> : <Save />}{tagEdit?.mode === 'merge' ? '合并标签' : '保存名称'}</button></div></form>
      </Modal>
      <ConfirmDialog open={deleteTarget !== null} title={deleteTarget?.kind === 'category' ? '删除分类' : '删除标签'} description={deleteTarget?.kind === 'category' ? `删除分类“${deleteTarget.item.name}”？相关文章会移至未分类。` : deleteTarget ? `从所有文章中移除标签“${deleteTarget.item.name}”？` : ''} confirmLabel="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={remove} />
      <WorkflowLauncher open={aiOpen} resourceType={type === 'categories' ? 'category' : 'tag'} resourceKeys={selected} onClose={() => setAIOpen(false)} title={`将所选${type === 'categories' ? '分类' : '标签'}交给 AI`} />
    </AdminPage>
  );
}
