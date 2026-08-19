import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, CalendarClock, Edit2, Eye, FileText, History, Image, MessageSquare, Plus, RotateCcw, Save, Send, Trash2, X } from 'lucide-react';
import { EmptyState, Feedback, Field, IconButton, LoadingState, PageHeader, Panel, Select } from '../components/ui';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { commentsApi } from '../api/comments';
import { postsApi } from '../api/posts';
import { useI18n } from '../i18n';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type { Post, PostStatus, PostVersion, Comment } from '../types/blog';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [selectedPostComments, setSelectedPostComments] = useState<Comment[]>([]); const [moderatingPostId, setModeratingPostId] = useState<number | null>(null);
  const [moderationComments, setModerationComments] = useState<Comment[]>([]); const [moderationStatus, setModerationStatus] = useState('pending'); const [reportedOnly, setReportedOnly] = useState(false);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const dirtyRef = useRef(false); const autoSaveTimer = useRef<number | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await postsApi.getPosts(undefined, true);
      setPosts(data.list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedLoadPosts'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchModeration = useCallback(async () => {
    try {
      const data = await commentsApi.getAdminComments({ status: moderationStatus, reported: reportedOnly });
      setModerationComments(Array.isArray(data) ? (data as unknown as Comment[]) : []);
    } catch {
      setModerationComments([]);
    }
  }, [moderationStatus, reportedOnly]);

  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      setAccessDenied(true);
      setLoading(false);
      const timer = window.setTimeout(() => redirectToAuthorize('/admin'), 900);
      return () => window.clearTimeout(timer);
    }
    void fetchPosts();
  }, [fetchPosts]);

  useEffect(() => { if (isLoggedIn() && canManageBlog()) void fetchModeration(); }, [fetchModeration]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); }, []);

  const markDirty = () => { dirtyRef.current = true; setSaveState('idle'); setSaveNotice(null); };
  const payload = useCallback((status: PostStatus) => ({ title: formTitle, slug: formSlug, summary: formSummary, content: formContent, tags: formTags.split(',').map((tag) => tag.trim()).filter(Boolean), status, scheduled_at: status === 'scheduled' && scheduledAt ? new Date(`${scheduledAt}:00+08:00`).toISOString() : undefined }), [formContent, formSlug, formSummary, formTags, formTitle, scheduledAt]);
  
  const persist = useCallback(async (status: PostStatus, automatic = false) => {
    if (!formTitle.trim() || (status !== 'draft' && !formContent.trim())) return;
    if (status === 'scheduled' && !scheduledAt) { if (!automatic) setError(t('scheduleRequired')); return; }
    setSaveState('saving'); setError(null); if (!automatic) setSaveNotice(null);
    try {
      const current = editingPost;
      const data = payload(status);
      const saved = current
        ? await postsApi.updatePost(current.id, data)
        : await postsApi.createPost(data);
      setEditingPost(saved); setIsCreating(false); setFormStatus(saved.status || 'draft'); dirtyRef.current = false; setSaveState('saved');
      if (!automatic) setSaveNotice(saved.status === 'published' ? t('postPublished') : t('postSaved'));
      setPosts((items) => current ? items.map((post) => post.id === saved.id ? saved : post) : [saved, ...items]);
    } catch (err) { setSaveState('error'); if (!automatic) setError(err instanceof Error ? err.message : t('errorSavingPost')); }
  }, [editingPost, formContent, formTitle, payload, scheduledAt, t]);

  useEffect(() => { if (!dirtyRef.current || !formTitle.trim()) return; if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); autoSaveTimer.current = window.setTimeout(() => void persist(formStatus, true), 1200); return () => { if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current); }; }, [formTitle, formSlug, formSummary, formContent, formTags, formStatus, scheduledAt, persist]);

  const loadVersions = async (postID: number) => {
    try {
      const list = await postsApi.getVersions(postID);
      setVersions((list || []) as PostVersion[]);
    } catch {
      setVersions([]);
    }
  };

  const startCreate = () => { setEditingPost(null); setIsCreating(true); setVersions([]); setFormTitle(''); setFormSlug(''); setFormSummary(''); setFormContent(''); setFormTags(''); setFormStatus('draft'); setScheduledAt(''); setSaveNotice(null); dirtyRef.current = false; setModeratingPostId(null); };
  const startEdit = (post: Post) => { setEditingPost(post); setIsCreating(false); setFormTitle(post.title); setFormSlug(post.slug); setFormSummary(post.summary); setFormContent(post.content); setFormTags(post.tags.join(', ')); setFormStatus(post.status || 'draft'); setScheduledAt(toShanghaiInput(post.scheduled_at)); setSaveNotice(null); dirtyRef.current = false; setModeratingPostId(null); void loadVersions(post.id); };
  const cancel = () => { setEditingPost(null); setIsCreating(false); setSaveNotice(null); dirtyRef.current = false; };

  const restoreVersion = async (version: PostVersion) => {
    if (!editingPost || !confirm(t('restoreVersionConfirm'))) return;
    try {
      const restored = await postsApi.restoreVersion(editingPost.id, version.id);
      setEditingPost(restored); setPosts((items) => items.map((item) => item.id === restored.id ? restored : item)); setFormTitle(restored.title); setFormSlug(restored.slug); setFormSummary(restored.summary); setFormContent(restored.content); setFormTags(restored.tags.join(', ')); setFormStatus(restored.status || 'draft'); setScheduledAt(toShanghaiInput(restored.scheduled_at)); dirtyRef.current = false; void loadVersions(restored.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('requestFailed'));
    }
  };

  const deletePost = async (id: number) => {
    if (!confirm(t('deletePostConfirm'))) return;
    try {
      await postsApi.deletePost(id);
      setPosts((items) => items.filter((post) => post.id !== id));
      cancel();
    } catch {
      setError(t('failedDeletePost'));
    }
  };

  const moderate = async (id: number) => {
    setModeratingPostId(id);
    try {
      const list = await commentsApi.getAllPostComments(id);
      setSelectedPostComments((list || []) as Comment[]);
    } catch {
      setSelectedPostComments([]);
    }
  };

  const toggleComment = async (comment: Comment) => {
    try {
      await commentsApi.toggleCommentVisibility(comment.id, !comment.is_visible);
      setSelectedPostComments((items) => items.map((item) => item.id === comment.id ? { ...item, is_visible: !item.is_visible } : item));
    } catch (err) {
      console.error(err);
    }
  };

  const moderateGlobal = async (comment: Comment, status: 'visible' | 'hidden') => {
    try {
      await commentsApi.moderateComment(comment.id, status);
      setModerationComments((items) => items.filter((item) => item.id !== comment.id));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteGlobalComment = async (comment: Comment) => {
    if (!confirm(t('deleteCommentConfirm'))) return;
    try {
      await commentsApi.deleteComment(comment.id);
      setModerationComments((items) => items.filter((item) => item.id !== comment.id));
    } catch (err) {
      console.error(err);
    }
  };

  const editorOpen = isCreating || editingPost;
  return <div>
    <PageHeader title={t('adminDashboard')} action={!editorOpen ? <div className="row-actions"><Link className="btn btn-secondary" to="/admin/analytics"><BarChart3 />{t('analytics')}</Link><Link className="btn btn-secondary" to="/admin/media"><Image />{t('mediaLibrary')}</Link><button className="btn btn-primary" onClick={startCreate} type="button"><Plus />{t('writeNewPost')}</button></div> : null} />
    {error ? <Feedback type="error"><AlertTriangle size={16} /> {error}</Feedback> : null}
    {accessDenied ? <Feedback type="error"><AlertTriangle size={16} /> {t('adminAccessRequired')}</Feedback> : null}
    {accessDenied ? <LoadingState label={t('redirectingSignin')} /> : loading ? <LoadingState label={t('loadingResources')} /> : <div className="workspace-grid">
      {editorOpen ? <Panel><div className="panel-heading"><h2><FileText size={20} />{isCreating ? t('composeNewPost') : t('editPost', { title: editingPost?.title || '' })}</h2><IconButton label={t('cancel')} onClick={cancel} type="button"><X size={18} /></IconButton></div>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void persist(formStatus); }}><div className="split-grid"><Field label={t('title')}><input className="input-field" value={formTitle} onChange={(event) => { setFormTitle(event.target.value); markDirty(); }} required /></Field><Field label={t('slug')}><input className="input-field" value={formSlug} onChange={(event) => { setFormSlug(event.target.value); markDirty(); }} /></Field></div><Field label={t('summary')}><input className="input-field" value={formSummary} onChange={(event) => { setFormSummary(event.target.value); markDirty(); }} /></Field><Field label={t('tagsComma')}><input className="input-field" value={formTags} onChange={(event) => { setFormTags(event.target.value); markDirty(); }} /></Field>
          <div className="split-grid"><Field label={t('publicationStatus')}><Select value={formStatus} onChange={(event) => { setFormStatus(event.target.value as PostStatus); markDirty(); }}><option value="draft">{t('draft')}</option><option value="published">{t('publishNow')}</option><option value="scheduled">{t('scheduled')}</option></Select></Field>{formStatus === 'scheduled' ? <Field label={t('scheduledAt')}><input type="datetime-local" className="input-field" value={scheduledAt} onChange={(event) => { setScheduledAt(event.target.value); markDirty(); }} required /></Field> : null}</div>
          <div className="markdown-editor"><Field label={t('contentMarkdown')}><textarea className="input-field mono" rows={16} value={formContent} onChange={(event) => { setFormContent(event.target.value); markDirty(); }} /></Field><section><label className="field-label"><Eye size={16} /> {t('preview')}</label><Panel className="preview-panel"><MarkdownRenderer content={formContent || t('previewEmpty')} /></Panel></section></div>
          {saveNotice ? <Feedback type="success">{saveNotice}</Feedback> : null}
          <div className="row-actions"><button type="submit" className="btn btn-primary" disabled={saveState === 'saving'}><Save />{saveState === 'saving' ? t('saving') : t('savePost')}</button>{formStatus !== 'published' ? <button type="button" className="btn btn-secondary" disabled={saveState === 'saving'} onClick={() => void persist('published')}><Send />{t('publishNow')}</button> : null}<span className={`save-state save-state--${saveState}`}>{saveState === 'saved' ? t('saved') : saveState === 'saving' ? t('saving') : saveState === 'error' ? t('saveFailed') : t('autosave')}</span></div></form></Panel> : null}
      {editingPost ? <Panel className="section-stack"><div className="panel-heading"><h2><History size={20} />{t('versionHistory')}</h2></div>{versions.length === 0 ? <EmptyState label={t('noVersions')} /> : <div className="version-list">{versions.map((version) => <div className="list-row version-row" key={version.id}><div><strong>{version.title}</strong><span className={`status-pill status-pill--${version.status}`}>{t(version.status)}</span><small className="muted">{formatDateTime(version.created_at)}</small></div><button className="btn btn-secondary" type="button" onClick={() => void restoreVersion(version)}><RotateCcw />{t('restore')}</button></div>)}</div>}</Panel> : null}
      {moderatingPostId !== null ? <Panel><div className="panel-heading"><h2><MessageSquare size={20} />{t('moderatingComments')}</h2><IconButton label={t('cancel')} onClick={() => setModeratingPostId(null)} type="button"><X size={18} /></IconButton></div>{selectedPostComments.length === 0 ? <EmptyState label={t('noPostComments')} /> : <div className="section-stack">{selectedPostComments.map((comment) => <div key={comment.id} className="list-row"><div><div className="inline-meta"><strong>{comment.author}</strong><span className={`status-pill ${comment.is_visible ? 'status-pill--visible' : 'status-pill--pending'}`}>{comment.is_visible ? t('visibleToEveryone') : t('pendingReview')}</span><span>{formatDateTime(comment.created_at)}</span></div><p className="muted">{comment.content}</p></div><button className="btn btn-secondary" onClick={() => void toggleComment(comment)} type="button">{comment.is_visible ? t('hideComment') : t('showComment')}</button></div>)}</div>}</Panel> : null}
      {!editorOpen ? <Panel className="section-stack"><div className="panel-heading"><h2><MessageSquare size={20} />{t('moderationQueue')}</h2><div className="row-actions"><Select size="compact" value={moderationStatus} onChange={(event) => setModerationStatus(event.target.value)}><option value="all">{t('allStatuses')}</option><option value="pending">{t('pendingComments')}</option><option value="visible">{t('visibleComments')}</option><option value="hidden">{t('hiddenComments')}</option></Select><label className="checkbox-label"><input type="checkbox" checked={reportedOnly} onChange={(event) => setReportedOnly(event.target.checked)} />{t('reportedOnly')}</label></div></div>{moderationComments.length === 0 ? <EmptyState label={t('noPostComments')} /> : <div className="section-stack">{moderationComments.map((comment) => <div key={comment.id} className="list-row moderation-row"><div><div className="inline-meta"><strong>{comment.author}</strong><span className={`status-pill status-pill--${comment.status || (comment.is_visible ? 'visible' : 'pending')}`}>{comment.status === 'hidden' ? t('hidden') : comment.is_visible ? t('visibleToEveryone') : t('pendingReview')}</span>{comment.report_count ? <span className="report-count">{t('reportCount', { count: comment.report_count })}</span> : null}<span>{formatDateTime(comment.created_at)}</span></div><p className="muted">{comment.content}</p></div><div className="row-actions"><button className="btn btn-secondary" type="button" onClick={() => void moderateGlobal(comment, 'visible')}>{t('approve')}</button><button className="btn btn-secondary" type="button" onClick={() => void moderateGlobal(comment, 'hidden')}>{t('hide')}</button><button className="btn btn-danger" type="button" onClick={() => void deleteGlobalComment(comment)}><Trash2 />{t('delete')}</button></div></div>)}</div>}</Panel> : null}
      <Panel><div className="panel-heading"><h2>{t('manageArticles')}</h2></div>{posts.length === 0 ? <EmptyState label={t('noWrittenPosts')} /> : <div className="table-scroll"><table className="content-table"><thead><tr><th>{t('title')}</th><th>{t('publicationStatus')}</th><th>{t('date')}</th><th>{t('actions')}</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.status === 'published' ? <Link to={`/posts/${post.slug}`} target="_blank">{post.title}</Link> : post.title}</td><td><span className={`status-pill status-pill--${post.status}`}>{post.status ? t(post.status) : t('draft')}</span>{post.scheduled_at ? <small className="muted"><CalendarClock size={13} />{formatDateTime(post.scheduled_at)}</small> : null}</td><td className="muted">{formatDate(post.created_at)}</td><td><div className="row-actions"><button className="btn btn-secondary" onClick={() => void moderate(post.id)} type="button"><MessageSquare />{t('comments')}</button><button className="btn btn-secondary" onClick={() => startEdit(post)} type="button"><Edit2 />{t('edit')}</button><button className="btn btn-danger" onClick={() => void deletePost(post.id)} type="button"><Trash2 />{t('delete')}</button></div></td></tr>)}</tbody></table></div>}</Panel>
    </div>}
  </div>;
}
