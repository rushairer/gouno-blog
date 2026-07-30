import { useEffect, useMemo, useState } from 'react';
import { Copy, Edit2, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, EmptyState, Feedback, LoadingState, Panel } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { getPosts } from '../../lib/blog-api';
import type { Post } from '../../types/blog';

export default function AdminPosts() {
  const allowed = useAdminGuard('/admin/posts');
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const q = params.get('q') || ''; const status = params.get('status') || 'all';
  useEffect(() => { if (!allowed) return; getPosts(new URLSearchParams(), true).then((result) => setPosts(result.list || [])).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [allowed]);
  const visible = useMemo(() => posts.filter((post) => (status === 'all' || post.status === status) && (!q || `${post.title} ${post.summary}`.toLowerCase().includes(q.toLowerCase()))), [posts, q, status]);
  const remove = async (post: Post) => {
    if (!window.confirm(`确认永久删除《${post.title}》？此操作无法撤销。`)) return;
    const response = await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    if (response.ok) setPosts((current) => current.filter((item) => item.id !== post.id)); else setError('删除失败，请稍后重试。');
  };
  const batch = async (action: 'publish' | 'draft' | 'delete') => {
    if (selected.length === 0) return;
    if (action === 'delete' && !confirm(`确认永久删除选中的 ${selected.length} 篇文章？`)) return;
    const response = await apiFetch('/api/admin/posts/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, action }) });
    if (!response.ok) { setError('批量操作失败，请稍后重试。'); return; }
    if (action === 'delete') setPosts((current) => current.filter((post) => !selected.includes(post.id)));
    else setPosts((current) => current.map((post) => selected.includes(post.id) ? { ...post, status: action === 'publish' ? 'published' : 'draft' } : post));
    setSelected([]);
  };
  return <AdminPage><AdminPageHeader title="文章" description="管理草稿、定时内容与已发布文章。" actions={<Link className="btn btn-primary" to="/admin/posts/new"><Plus /> 新建文章</Link>} />
    {error ? <Feedback type="error">{error}</Feedback> : null}
    <Panel className="admin-filter-bar"><div className="filter-search"><Search /><input aria-label="搜索文章" value={q} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set('q', event.target.value); else next.delete('q'); setParams(next, { replace: true }); }} placeholder="搜索标题或摘要" /></div><select value={status} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value === 'all') next.delete('status'); else next.set('status', event.target.value); setParams(next); }}><option value="all">全部状态</option><option value="published">已发布</option><option value="draft">草稿</option><option value="scheduled">定时发布</option></select><span>{visible.length} 篇</span></Panel>
    {selected.length ? <div className="bulk-action-bar"><strong>已选择 {selected.length} 篇</strong><button onClick={() => void batch('publish')}>发布</button><button onClick={() => void batch('draft')}>转为草稿</button><button className="danger-action" onClick={() => void batch('delete')}>删除</button><button onClick={() => setSelected([])}>取消</button></div> : null}
    {loading ? <LoadingState label="正在载入文章…" /> : visible.length === 0 ? <EmptyState label="没有符合当前条件的文章。" /> : <Panel className="posts-table-panel"><div className="table-scroll"><table className="admin-table"><thead><tr><th><input aria-label="选择当前页全部文章" type="checkbox" checked={visible.length > 0 && visible.every((post) => selected.includes(post.id))} onChange={(event) => setSelected(event.target.checked ? visible.map((post) => post.id) : [])} /></th><th>文章</th><th>状态</th><th>更新时间</th><th>阅读</th><th>操作</th></tr></thead><tbody>{visible.map((post) => <tr key={post.id}><td><input aria-label={`选择 ${post.title}`} type="checkbox" checked={selected.includes(post.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id))} /></td><td><strong>{post.title}</strong><small>/{post.slug}</small></td><td><span className={`status-badge status-badge--${post.status}`}>{post.status === 'published' ? '已发布' : post.status === 'scheduled' ? '定时发布' : '草稿'}</span></td><td>{new Date(post.updated_at || post.created_at).toLocaleDateString('zh-CN')}</td><td>{post.views_count || 0}</td><td><div className="table-actions">{post.status === 'published' ? <Link to={`/articles/${post.slug}`} target="_blank" title="查看"><Eye /></Link> : null}<button title="复制链接" onClick={() => void navigator.clipboard.writeText(`${location.origin}/articles/${post.slug}`)}><Copy /></button><Link to={`/admin/posts/${post.id}/edit`} title="编辑"><Edit2 /></Link><button className="danger-action" title="删除" onClick={() => void remove(post)}><Trash2 /></button></div></td></tr>)}</tbody></table></div></Panel>}
  </AdminPage>;
}
