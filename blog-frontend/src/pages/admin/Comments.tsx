import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, ConfirmDialog, EmptyState, Feedback, LoadingState, Panel, useToast } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';

interface Comment { id: number; post_id: number; author: string; content: string; status: string; is_visible: boolean; report_count?: number; created_at: string }

export default function AdminComments() {
  const allowed = useAdminGuard('/admin/comments');
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending'; const reported = params.get('reported') === 'true';
  const [comments, setComments] = useState<Comment[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    apiFetch(`/api/admin/comments?status=${status}&reported=${reported}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); setComments(body.data?.list || []); setError(''); }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [allowed, reported, status]);
  useEffect(load, [load]);
  const moderate = async (comment: Comment, next: 'visible' | 'hidden') => {
    const response = await apiFetch(`/api/admin/comments/${comment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.message || '评论处理失败。'); return; }
    setComments((current) => current.filter((item) => item.id !== comment.id)); notify(next === 'visible' ? '评论已通过。' : '评论已隐藏。');
  };
  const remove = async () => {
    if (!deleteTarget) return;
    const response = await apiFetch(`/api/comments/${deleteTarget.id}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.message || '评论删除失败。'); return; }
    setComments((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); notify('评论已删除。');
  };
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  return <AdminPage><AdminPageHeader title="评论" description="审核讨论、处理举报，并维护高质量的交流空间。" />{error ? <Feedback type="error">{error}</Feedback> : null}<Panel className="admin-filter-bar"><select aria-label="评论状态" value={status} onChange={(event) => setFilter('status', event.target.value)}><option value="pending">待审核</option><option value="visible">已通过</option><option value="hidden">已隐藏</option><option value="all">全部</option></select><label><input type="checkbox" checked={reported} onChange={(event) => setFilter('reported', event.target.checked ? 'true' : '')} /> 仅看被举报</label></Panel>{loading ? <LoadingState label="正在载入评论…" /> : comments.length === 0 ? <EmptyState label="当前队列已经处理完毕。" /> : <div className="moderation-list">{comments.map((comment) => <Panel key={comment.id}><div className="comment-avatar">{comment.author.slice(0, 1)}</div><div><div><strong>{comment.author}</strong><time>{new Date(comment.created_at).toLocaleString('zh-CN')}</time>{comment.report_count ? <span className="report-label">被举报 {comment.report_count} 次</span> : null}</div><p>{comment.content}</p><small>文章 #{comment.post_id}</small></div><div><button className="btn btn-secondary" onClick={() => void moderate(comment, 'visible')}>通过</button><button className="btn btn-secondary" onClick={() => void moderate(comment, 'hidden')}>隐藏</button><button className="btn btn-danger" onClick={() => setDeleteTarget(comment)}><Trash2 /> 删除</button></div></Panel>)}</div>}<ConfirmDialog open={deleteTarget !== null} title="删除评论" description="确认永久删除这条评论？此操作无法撤销。" confirmLabel="永久删除" danger onClose={() => setDeleteTarget(null)} onConfirm={remove} /></AdminPage>;
}
