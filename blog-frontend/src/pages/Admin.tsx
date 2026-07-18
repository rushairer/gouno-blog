import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Edit2, Eye, FileText, MessageSquare, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { EmptyState, Feedback, Field, IconButton, LoadingState, PageHeader, Panel } from '../components/ui';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { useI18n } from '../i18n';

type PostStatus = 'draft' | 'scheduled' | 'published';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Post { id: number; title: string; slug: string; summary: string; content: string; tags: string[]; status: PostStatus; published_at?: string; scheduled_at?: string; created_at: string; }
interface Comment { id: number; post_id: number; author: string; content: string; is_visible: boolean; created_at: string; }

function MarkdownPreview({ content }: { content: string }) {
  return <div className="article-content markdown-preview">{content.split(/\r?\n/).map((line, index) => {
    if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h2 key={index}>{line.slice(2)}</h2>;
    if (line.startsWith('- ')) return <li key={index}>{line.slice(2)}</li>;
    return line ? <p key={index}>{line}</p> : <br key={index} />;
  })}</div>;
}

function toShanghaiInput(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace(' ', 'T');
}

export default function Admin() {
  const { t, formatDate, formatDateTime } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [accessDenied, setAccessDenied] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null); const [isCreating, setIsCreating] = useState(false);
  const [formTitle, setFormTitle] = useState(''); const [formSlug, setFormSlug] = useState(''); const [formSummary, setFormSummary] = useState(''); const [formContent, setFormContent] = useState(''); const [formTags, setFormTags] = useState('');
  const [formStatus, setFormStatus] = useState<PostStatus>('draft'); const [scheduledAt, setScheduledAt] = useState(''); const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedPostComments, setSelectedPostComments] = useState<Comment[]>([]); const [moderatingPostId, setModeratingPostId] = useState<number | null>(null);
  const dirtyRef = useRef(false); const autoSaveTimer = useRef<number | null>(null);

  const fetchPosts = useCallback(async () => { try { setLoading(true); const response = await apiFetch('/api/admin/posts'); if (!response.ok) throw new Error(t('failedLoadPosts')); const body = await response.json(); setPosts(body.data.list || []); } catch (err) { setError(err instanceof Error ? err.message : t('failedLoadPosts')); } finally { setLoading(false); } }, [t]);
  useEffect(() => { if (!isLoggedIn() || !canManageBlog()) { setAccessDenied(true); setLoading(false); const timer = window.setTimeout(() => redirectToAuthorize('/admin'), 900); return () => window.clearTimeout(timer); } void fetchPosts(); }, [fetchPosts]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); }, []);

  const markDirty = () => { dirtyRef.current = true; setSaveState('idle'); };
  const payload = useCallback((status: PostStatus) => ({ title: formTitle, slug: formSlug, summary: formSummary, content: formContent, tags: formTags.split(',').map((tag) => tag.trim()).filter(Boolean), status, scheduled_at: status === 'scheduled' && scheduledAt ? new Date(`${scheduledAt}:00+08:00`).toISOString() : undefined }), [formContent, formSlug, formSummary, formTags, formTitle, scheduledAt]);
  const persist = useCallback(async (status: PostStatus, automatic = false) => {
    if (!formTitle.trim() || (status !== 'draft' && !formContent.trim())) return;
    if (status === 'scheduled' && !scheduledAt) { if (!automatic) setError(t('scheduleRequired')); return; }
    setSaveState('saving'); setError(null);
    try {
      const current = editingPost;
      const response = await apiFetch(current ? `/api/posts/${current.id}` : '/api/posts', { method: current ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(status)) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || t('failedSavePost'));
      const saved = body.data as Post; setEditingPost(saved); setIsCreating(false); setFormStatus(saved.status); dirtyRef.current = false; setSaveState('saved');
      setPosts((items) => current ? items.map((post) => post.id === saved.id ? saved : post) : [saved, ...items]);
    } catch (err) { setSaveState('error'); if (!automatic) setError(err instanceof Error ? err.message : t('errorSavingPost')); }
  }, [editingPost, formContent, formTitle, payload, scheduledAt, t]);
  useEffect(() => { if (!dirtyRef.current || !formTitle.trim()) return; if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); autoSaveTimer.current = window.setTimeout(() => void persist(formStatus, true), 1200); return () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); }; }, [formTitle, formSlug, formSummary, formContent, formTags, formStatus, scheduledAt, persist]);

  const startCreate = () => { setEditingPost(null); setIsCreating(true); setFormTitle(''); setFormSlug(''); setFormSummary(''); setFormContent(''); setFormTags(''); setFormStatus('draft'); setScheduledAt(''); dirtyRef.current = false; setModeratingPostId(null); };
  const startEdit = (post: Post) => { setEditingPost(post); setIsCreating(false); setFormTitle(post.title); setFormSlug(post.slug); setFormSummary(post.summary); setFormContent(post.content); setFormTags(post.tags.join(', ')); setFormStatus(post.status); setScheduledAt(toShanghaiInput(post.scheduled_at)); dirtyRef.current = false; setModeratingPostId(null); };
  const cancel = () => { setEditingPost(null); setIsCreating(false); dirtyRef.current = false; };
  const deletePost = async (id: number) => { if (!confirm(t('deletePostConfirm'))) return; const response = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' }); if (response.ok) { setPosts((items) => items.filter((post) => post.id !== id)); cancel(); } else setError(t('failedDeletePost')); };
  const moderate = async (id: number) => { setModeratingPostId(id); const response = await apiFetch(`/api/posts/${id}/comments/all`); if (response.ok) setSelectedPostComments((await response.json()).data || []); };
  const toggleComment = async (comment: Comment) => { const response = await apiFetch(`/api/comments/${comment.id}/visibility`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: !comment.is_visible }) }); if (response.ok) setSelectedPostComments((items) => items.map((item) => item.id === comment.id ? { ...item, is_visible: !item.is_visible } : item)); };

  const editorOpen = isCreating || editingPost;
  return <div>
    <PageHeader title={t('adminDashboard')} action={!editorOpen ? <button className="btn btn-primary" onClick={startCreate} type="button"><Plus />{t('writeNewPost')}</button> : null} />
    {error ? <Feedback type="error"><AlertTriangle size={16} /> {error}</Feedback> : null}
    {accessDenied ? <Feedback type="error"><AlertTriangle size={16} /> {t('adminAccessRequired')}</Feedback> : null}
    {accessDenied ? <LoadingState label={t('redirectingSignin')} /> : loading ? <LoadingState label={t('loadingResources')} /> : <div className="workspace-grid">
      {editorOpen ? <Panel><div className="panel-heading"><h2><FileText size={20} />{isCreating ? t('composeNewPost') : t('editPost', { title: editingPost?.title || '' })}</h2><IconButton label={t('cancel')} onClick={cancel} type="button"><X size={18} /></IconButton></div>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void persist(formStatus); }}><div className="split-grid"><Field label={t('title')}><input className="input-field" value={formTitle} onChange={(event) => { setFormTitle(event.target.value); markDirty(); }} required /></Field><Field label={t('slug')}><input className="input-field" value={formSlug} onChange={(event) => { setFormSlug(event.target.value); markDirty(); }} /></Field></div><Field label={t('summary')}><input className="input-field" value={formSummary} onChange={(event) => { setFormSummary(event.target.value); markDirty(); }} /></Field><Field label={t('tagsComma')}><input className="input-field" value={formTags} onChange={(event) => { setFormTags(event.target.value); markDirty(); }} /></Field>
          <div className="split-grid"><Field label={t('publicationStatus')}><select className="input-field" value={formStatus} onChange={(event) => { setFormStatus(event.target.value as PostStatus); markDirty(); }}><option value="draft">{t('draft')}</option><option value="published">{t('publishNow')}</option><option value="scheduled">{t('scheduled')}</option></select></Field>{formStatus === 'scheduled' ? <Field label={t('scheduledAt')}><input type="datetime-local" className="input-field" value={scheduledAt} onChange={(event) => { setScheduledAt(event.target.value); markDirty(); }} required /></Field> : null}</div>
          <div className="markdown-editor"><Field label={t('contentMarkdown')}><textarea className="input-field mono" rows={16} value={formContent} onChange={(event) => { setFormContent(event.target.value); markDirty(); }} /></Field><section><label className="field-label"><Eye size={16} /> {t('preview')}</label><Panel className="preview-panel"><MarkdownPreview content={formContent || t('previewEmpty')} /></Panel></section></div>
          <div className="row-actions"><button type="submit" className="btn btn-primary" disabled={saveState === 'saving'}><Save />{saveState === 'saving' ? t('saving') : t('savePost')}</button>{formStatus === 'published' ? <button type="button" className="btn btn-secondary" onClick={() => void persist('published')}><Send />{t('publishNow')}</button> : null}<span className={`save-state save-state--${saveState}`}>{saveState === 'saved' ? t('saved') : saveState === 'saving' ? t('saving') : saveState === 'error' ? t('saveFailed') : t('autosave')}</span></div></form></Panel> : null}
      {moderatingPostId !== null ? <Panel><div className="panel-heading"><h2><MessageSquare size={20} />{t('moderatingComments')}</h2><IconButton label={t('cancel')} onClick={() => setModeratingPostId(null)} type="button"><X size={18} /></IconButton></div>{selectedPostComments.length === 0 ? <EmptyState label={t('noPostComments')} /> : <div className="section-stack">{selectedPostComments.map((comment) => <div key={comment.id} className="list-row"><div><div className="inline-meta"><strong>{comment.author}</strong><span className={`status-pill ${comment.is_visible ? 'status-pill--visible' : 'status-pill--pending'}`}>{comment.is_visible ? t('visibleToEveryone') : t('pendingReview')}</span><span>{formatDateTime(comment.created_at)}</span></div><p className="muted">{comment.content}</p></div><button className="btn btn-secondary" onClick={() => void toggleComment(comment)} type="button">{comment.is_visible ? t('hideComment') : t('showComment')}</button></div>)}</div>}</Panel> : null}
      <Panel><div className="panel-heading"><h2>{t('manageArticles')}</h2></div>{posts.length === 0 ? <EmptyState label={t('noWrittenPosts')} /> : <div className="table-scroll"><table className="content-table"><thead><tr><th>{t('title')}</th><th>{t('publicationStatus')}</th><th>{t('date')}</th><th>{t('actions')}</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.status === 'published' ? <Link to={`/posts/${post.slug}`} target="_blank">{post.title}</Link> : post.title}</td><td><span className={`status-pill status-pill--${post.status}`}>{t(post.status)}</span>{post.scheduled_at ? <small className="muted"><CalendarClock size={13} />{formatDateTime(post.scheduled_at)}</small> : null}</td><td className="muted">{formatDate(post.created_at)}</td><td><div className="row-actions"><button className="btn btn-secondary" onClick={() => void moderate(post.id)} type="button"><MessageSquare />{t('comments')}</button><button className="btn btn-secondary" onClick={() => startEdit(post)} type="button"><Edit2 />{t('edit')}</button><button className="btn btn-danger" onClick={() => void deletePost(post.id)} type="button"><Trash2 />{t('delete')}</button></div></td></tr>)}</tbody></table></div>}</Panel>
    </div>}
  </div>;
}
