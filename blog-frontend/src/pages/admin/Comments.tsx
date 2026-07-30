import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../../auth';
import { AdminPage, AdminPageHeader, EmptyState, Feedback, LoadingState, Panel } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';

interface Comment { id: number; post_id: number; author: string; content: string; status: string; is_visible: boolean; report_count?: number; created_at: string }

export default function AdminComments() {
  const allowed = useAdminGuard('/admin/comments');
  const [status, setStatus] = useState('pending'); const [reported, setReported] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    apiFetch(`/api/admin/comments?status=${status}&reported=${reported}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message); setComments(body.data?.list || []); }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [allowed, reported, status]);
  useEffect(load, [load]);
  const moderate = async (comment: Comment, next: 'visible' | 'hidden') => { const response = await apiFetch(`/api/admin/comments/${comment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }); if (response.ok) setComments((current) => current.filter((item) => item.id !== comment.id)); };
  const remove = async (comment: Comment) => { if (!confirm('确认永久删除这条评论？')) return; const response = await apiFetch(`/api/comments/${comment.id}`, { method: 'DELETE' }); if (response.ok) setComments((current) => current.filter((item) => item.id !== comment.id)); };
  return <AdminPage><AdminPageHeader title="评论" description="审核讨论、处理举报，并维护高质量的交流空间。" />{error ? <Feedback type="error">{error}</Feedback> : null}<Panel className="admin-filter-bar"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">待审核</option><option value="visible">已通过</option><option value="hidden">已隐藏</option><option value="all">全部</option></select><label><input type="checkbox" checked={reported} onChange={(event) => setReported(event.target.checked)} /> 仅看被举报</label></Panel>{loading ? <LoadingState label="正在载入评论…" /> : comments.length === 0 ? <EmptyState label="当前队列已经处理完毕。" /> : <div className="moderation-list">{comments.map((comment) => <Panel key={comment.id}><div className="comment-avatar">{comment.author.slice(0, 1)}</div><div><div><strong>{comment.author}</strong><time>{new Date(comment.created_at).toLocaleString('zh-CN')}</time>{comment.report_count ? <span className="report-label">被举报 {comment.report_count} 次</span> : null}</div><p>{comment.content}</p><small>文章 #{comment.post_id}</small></div><div><button className="btn btn-secondary" onClick={() => void moderate(comment, 'visible')}>通过</button><button className="btn btn-secondary" onClick={() => void moderate(comment, 'hidden')}>隐藏</button><button className="btn btn-danger" onClick={() => void remove(comment)}><Trash2 /> 删除</button></div></Panel>)}</div>}</AdminPage>;
}
