import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, History, Save, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../../auth';
import { AdminPageState, ConfirmDialog, Feedback, Field, Input, Select, Textarea } from '../../components/ui';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { readData } from '../../lib/blog-api';
import { extractMarkdownTOC } from '../../markdown';
import type { Category, Post, PostStatus } from '../../types/blog';

interface PostVersion extends Post { post_id: number }

const emptyPost: Post = { id: 0, title: '', slug: '', summary: '', content: '', tags: [], status: 'draft', created_at: '' };

export default function PostEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(isNew ? '/admin/posts/new' : `/admin/posts/${id}/edit`);
  const navigate = useNavigate();
  const [post, setPost] = useState<Post>(emptyPost);
  const [publishIntent, setPublishIntent] = useState<PostStatus>('draft');
  const [categories, setCategories] = useState<Category[]>([]);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PostVersion | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    const requests: Promise<unknown>[] = [
      fetch('/api/categories').then((response) => response.ok ? response.json().then((body) => body.data || []) : []).then(setCategories),
    ];
    if (id) {
      requests.push(readData<Post>(apiFetch(`/api/admin/posts/${id}`)).then((value) => {
        setPost(value);
        setPublishIntent(value.status || 'draft');
      }));
      requests.push(readData<PostVersion[]>(apiFetch(`/api/admin/posts/${id}/versions`)).then(setVersions));
    }
    Promise.all(requests).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [allowed, id]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const update = <K extends keyof Post>(key: K, value: Post[K]) => {
    setPost((current) => ({ ...current, [key]: value })); dirty.current = true; setSavedAt(null);
  };

  const persist = useCallback(async (status: PostStatus, automatic = false) => {
    if (!post.title.trim()) { if (!automatic) setError('请先填写文章标题。'); return; }
    if (status !== 'draft' && !post.content.trim()) { setError('发布前需要填写正文。'); return; }
    if (status === 'scheduled' && !post.scheduled_at) { setError('定时发布需要选择发布时间。'); return; }
    setSaving(true); setError('');
    try {
      const response = await apiFetch(post.id ? `/api/posts/${post.id}` : '/api/posts', {
        method: post.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...post, status, tags: post.tags.filter(Boolean) }),
      });
      const saved = await readData<Post>(response);
      setPost(saved); dirty.current = false; setSavedAt(new Date());
      if (!automatic) setPublishIntent(saved.status || 'draft');
      if (!post.id) navigate(`/admin/posts/${saved.id}/edit`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。');
    } finally { setSaving(false); }
  }, [navigate, post]);

  useEffect(() => {
    if (!dirty.current || !post.id || !post.title.trim() || post.status !== 'draft') return;
    const timer = window.setTimeout(() => void persist('draft', true), 1800);
    return () => window.clearTimeout(timer);
  }, [post, persist]);

  const outline = useMemo(() => extractMarkdownTOC(post.content), [post.content]);
  const restoreVersion = async () => {
    if (!post.id || !restoreTarget) return;
    try {
      const restored = await readData<Post>(apiFetch(`/api/admin/posts/${post.id}/versions/${restoreTarget.id}/restore`, { method: 'POST' }));
      setPost(restored); setPublishIntent(restored.status || 'draft'); dirty.current = false; setSavedAt(new Date()); setShowVersions(false); setRestoreTarget(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '版本恢复失败'); }
  };
  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate('/admin/posts');
  };

  const openFrontsitePreview = async () => {
    let currentPost = post;
    if (dirty.current || !currentPost.id) {
      if (!currentPost.title.trim()) {
        setError('请先填写文章标题。');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const response = await apiFetch(currentPost.id ? `/api/posts/${currentPost.id}` : '/api/posts', {
          method: currentPost.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...currentPost, status: currentPost.status || 'draft', tags: currentPost.tags.filter(Boolean) }),
        });
        currentPost = await readData<Post>(response);
        setPost(currentPost);
        dirty.current = false;
        setSavedAt(new Date());
        if (!post.id) navigate(`/admin/posts/${currentPost.id}/edit`, { replace: true });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '保存失败，无法开启预览。');
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    const target = currentPost.slug || String(currentPost.id);
    window.open(`/articles/${encodeURIComponent(target)}?preview=true`, '_blank');
  };

  const primaryStatus: PostStatus = publishIntent === 'scheduled' ? 'scheduled' : 'published';
  const primaryLabel = publishIntent === 'scheduled' ? '安排发布' : post.status === 'published' ? '更新文章' : '发布';
  if (!allowed || loading) return <AdminPageState title={isNew ? '新建文章' : '编辑文章'} description="撰写、预览并管理文章发布状态。" label="正在打开编辑器…" />;
  return <div className="editor-page">
    <header className="editor-commandbar">
      <button className="editor-back" type="button" onClick={leaveEditor}><ArrowLeft /> 返回文章列表</button>
      <div className="editor-save-state">{saving ? '正在保存…' : savedAt ? <><Check /> 已于 {savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 保存</> : dirty.current ? '有未保存的更改' : '所有更改已保存'}</div>
      <div><button className="btn btn-secondary" type="button" onClick={() => void openFrontsitePreview()} disabled={saving}><ExternalLink /> 预览前台页面</button><button className="btn btn-secondary" type="button" onClick={() => void persist('draft')} disabled={saving}><Save /> 保存草稿</button><button className="btn btn-primary" type="button" onClick={() => void persist(primaryStatus)} disabled={saving}><Send /> {primaryLabel}</button></div>
    </header>
    {error ? <Feedback type="error">{error}</Feedback> : null}
    <div className="editor-workspace">
      <aside className="editor-outline"><div><h2>文档大纲</h2><button type="button" onClick={() => setShowVersions(!showVersions)}><History /> 版本历史 ({versions.length})</button></div>{showVersions ? <div className="version-drawer">{versions.map((version) => <button key={version.id} type="button" onClick={() => setRestoreTarget(version)}><strong>{version.title}</strong><small>{new Date(version.created_at).toLocaleString('zh-CN')} · 点击恢复</small></button>)}</div> : <nav>{outline.length ? outline.map((item) => <a key={item.id} href={`#${item.id}`} className={`level-${item.level}`} onClick={() => { if (!preview) setPreview(true); }}>{item.text}</a>) : <p>在正文中添加 Markdown 标题（如 # 或 ##）后，大纲会自动生成。</p>}</nav>}</aside>
      <main className="editor-canvas">
        <Field label="标题" required>
          <Textarea className="editor-title" rows={2} value={post.title} onChange={(event) => update('title', event.target.value)} placeholder="写一个清晰、具体的标题" required />
        </Field>
        <Field label="摘要">
          <Textarea className="editor-summary" rows={3} value={post.summary} onChange={(event) => update('summary', event.target.value)} maxLength={300} placeholder="用两三句话说明文章解决的问题" />
        </Field>
        <div className="editor-tabs"><button className={!preview ? 'active' : ''} type="button" onClick={() => setPreview(false)}>Markdown</button><button className={preview ? 'active' : ''} type="button" onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="editor-preview"><h1>{post.title || '无标题文章'}</h1><MarkdownRenderer content={post.content || '开始写作后，预览会出现在这里。'} /></div> : <textarea className="editor-body mono" value={post.content} onChange={(event) => update('content', event.target.value)} aria-label="文章正文 Markdown" placeholder={'## 从问题开始\n\n写下背景、约束、判断与实现…'} />}
      </main>
      <aside className="editor-inspector">
        <details open><summary>发布设置</summary><Field label="状态"><Select value={publishIntent} onChange={(event) => { setPublishIntent(event.target.value as PostStatus); dirty.current = true; }}><option value="draft">草稿</option><option value="published">立即发布</option><option value="scheduled">定时发布</option></Select></Field>{publishIntent === 'scheduled' ? <Field label="发布时间"><Input type="datetime-local" value={post.scheduled_at?.slice(0, 16) || ''} onChange={(event) => update('scheduled_at', event.target.value)} /></Field> : null}</details>
        <details open><summary>分类与标签</summary><Field label="分类"><Select value={post.category_id || ''} onChange={(event) => update('category_id', event.target.value ? Number(event.target.value) : null)}><option value="">未分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field><Field label="标签" hint="使用逗号分隔，最多建议 10 个。"><Input value={post.tags.join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()))} placeholder="Go, OIDC, 安全" /></Field></details>
        <details open><summary>封面与摘要</summary><Field label="封面 URL"><Input value={post.cover_url || ''} onChange={(event) => update('cover_url', event.target.value)} placeholder="/media/cover.webp" /></Field><Field label="替代文本"><Input value={post.cover_alt || ''} onChange={(event) => update('cover_alt', event.target.value)} /></Field></details>
        <details open><summary>SEO</summary><Field label="SEO 标题" hint={`${(post.seo_title || '').length}/60`}><Input value={post.seo_title || ''} maxLength={60} onChange={(event) => update('seo_title', event.target.value)} /></Field><Field label="SEO 描述" hint={`${(post.seo_description || '').length}/160`}><Textarea rows={4} value={post.seo_description || ''} maxLength={160} onChange={(event) => update('seo_description', event.target.value)} /></Field><Field label="Slug" required><Input className="mono" value={post.slug} onChange={(event) => update('slug', event.target.value)} required /></Field></details>
      </aside>
    </div>
    <ConfirmDialog open={restoreTarget !== null} title="恢复历史版本" description={restoreTarget ? <>恢复 {new Date(restoreTarget.created_at).toLocaleString('zh-CN')} 的版本？当前内容会先保留为历史版本。</> : ''} confirmLabel="恢复版本" onClose={() => setRestoreTarget(null)} onConfirm={restoreVersion} />
    <ConfirmDialog open={confirmExit} title="放弃未保存的更改？" description="离开编辑器后，尚未保存的内容会丢失。" confirmLabel="放弃并离开" danger onClose={() => setConfirmExit(false)} onConfirm={() => navigate('/admin/posts')} />
  </div>;
}
