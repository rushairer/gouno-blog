import { useCallback, useEffect, useState } from 'react';
import { Edit3, Merge, Plus, Save, Trash2 } from 'lucide-react';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, EmptyState, Feedback, LoadingState, Panel } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { readData } from '../../lib/blog-api';
import type { Category } from '../../types/blog';

interface TagSummary { name: string; post_count: number }

export default function AdminTaxonomy({ type }: { type: 'categories' | 'tags' }) {
  const allowed = useAdminGuard(`/admin/${type}`);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      if (type === 'categories') setCategories(await readData<Category[]>(apiFetch('/api/admin/categories')));
      else setTags(await readData<TagSummary[]>(apiFetch('/api/admin/tags')));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '载入失败'); } finally { setLoading(false); }
  }, [allowed, type]);
  useEffect(() => { void load(); }, [load]);
  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try { await readData(apiFetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, sort_order: Number(data.sort_order || 0) }) })); form.reset(); void load(); } catch (reason) { setError(reason instanceof Error ? reason.message : '创建失败'); }
  };
  const deleteCategory = async (category: Category) => { if (!confirm(`删除分类“${category.name}”？其中的文章将移至未分类。`)) return; const response = await apiFetch(`/api/admin/categories/${category.id}`, { method: 'DELETE' }); if (response.ok) void load(); };
  const editCategory = async (category: Category) => {
    const name = prompt('分类名称', category.name)?.trim(); if (!name) return;
    const slug = prompt('分类 Slug', category.slug)?.trim(); if (!slug) return;
    const response = await apiFetch(`/api/admin/categories/${category.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug, description: category.description || '', sort_order: category.sort_order || 0 }) });
    if (response.ok) void load(); else setError('分类更新失败，请检查 Slug 是否重复。');
  };
  const renameTag = async (tag: TagSummary) => { const name = prompt('输入新的标签名称', tag.name)?.trim(); if (!name || name === tag.name) return; const response = await apiFetch(`/api/admin/tags/${encodeURIComponent(tag.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); if (response.ok) void load(); };
  const deleteTag = async (tag: TagSummary) => { if (!confirm(`从所有文章中移除标签“${tag.name}”？`)) return; const response = await apiFetch(`/api/admin/tags/${encodeURIComponent(tag.name)}`, { method: 'DELETE' }); if (response.ok) void load(); };
  const mergeTag = async (tag: TagSummary) => { const target = prompt(`将“${tag.name}”合并到哪个标签？`)?.trim(); if (!target || target === tag.name) return; const response = await apiFetch('/api/admin/tags/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: tag.name, target }) }); if (response.ok) void load(); };
  return <AdminPage><AdminPageHeader title={type === 'categories' ? '分类' : '标签'} description={type === 'categories' ? '建立长期稳定的内容脉络。' : '整理文章中的具体技术与概念信号。'} />{error ? <Feedback type="error">{error}</Feedback> : null}
    {type === 'categories' ? <Panel><form className="taxonomy-form" onSubmit={createCategory}><label>名称<input name="name" required /></label><label>Slug<input name="slug" className="mono" required /></label><label>描述<input name="description" /></label><label>排序<input name="sort_order" type="number" defaultValue="0" /></label><button className="btn btn-primary"><Plus /> 新建分类</button></form></Panel> : null}
    {loading ? <LoadingState label="正在整理内容结构…" /> : type === 'categories' ? categories.length === 0 ? <EmptyState label="还没有分类。创建第一个分类来组织长期主题。" /> : <Panel className="taxonomy-table"><table className="admin-table"><thead><tr><th>名称</th><th>Slug</th><th>文章</th><th>排序</th><th>操作</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.description}</small></td><td className="mono">{item.slug}</td><td>{item.post_count || 0}</td><td>{item.sort_order || 0}</td><td><div className="table-actions"><button title="编辑分类" onClick={() => void editCategory(item)}><Edit3 /></button><button className="danger-action" title="删除分类" onClick={() => void deleteCategory(item)}><Trash2 /></button></div></td></tr>)}</tbody></table></Panel> : tags.length === 0 ? <EmptyState label="文章添加标签后会自动在这里汇总。" /> : <div className="tag-admin-grid">{tags.map((tag) => <Panel key={tag.name}><div><strong>{tag.name}</strong><span>{tag.post_count} 篇文章</span></div><div><button onClick={() => void renameTag(tag)}><Save /> 重命名</button><button title="合并标签" onClick={() => void mergeTag(tag)}><Merge /></button><button className="danger-action" onClick={() => void deleteTag(tag)}><Trash2 /></button></div></Panel>)}</div>}
  </AdminPage>;
}
