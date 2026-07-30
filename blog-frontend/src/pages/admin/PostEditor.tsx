import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Eye, History, Save, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../../auth';
import { Feedback, LoadingState } from '../../components/ui';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    const requests: Promise<unknown>[] = [
      fetch('/api/categories').then((response) => response.ok ? response.json().then((body) => body.data || []) : []).then(setCategories),
    ];
    if (id) {
      requests.push(readData<Post>(apiFetch(`/api/admin/posts/${id}`)).then(setPost));
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
      if (!post.id) navigate(`/admin/posts/${saved.id}/edit`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。');
    } finally { setSaving(false); }
  }, [navigate, post]);

  useEffect(() => {
    if (!dirty.current || !post.id || !post.title.trim()) return;
    const timer = window.setTimeout(() => void persist('draft', true), 1800);
    return () => window.clearTimeout(timer);
  }, [post, persist]);

  const outline = useMemo(() => extractMarkdownTOC(post.content), [post.content]);
  const restoreVersion = async (version: PostVersion) => {
    if (!post.id || !confirm(`恢复 ${new Date(version.created_at).toLocaleString('zh-CN')} 的版本？当前内容会先保留为历史版本。`)) return;
    try {
      const restored = await readData<Post>(apiFetch(`/api/admin/posts/${post.id}/versions/${version.id}/restore`, { method: 'POST' }));
      setPost(restored); dirty.current = false; setSavedAt(new Date()); setShowVersions(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '版本恢复失败'); }
  };
  if (!allowed || loading) return <LoadingState label="正在打开编辑器…" />;
  return <div className="editor-page">
    <header className="editor-commandbar">
      <Link to="/admin/posts"><ArrowLeft /> 返回文章列表</Link>
      <div className="editor-save-state">{saving ? '正在保存…' : savedAt ? <><Check /> 已于 {savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 保存</> : dirty.current ? '有未保存的更改' : '所有更改已保存'}</div>
      <div><button className="btn btn-secondary" type="button" onClick={() => setPreview(!preview)}><Eye /> {preview ? '继续编辑' : '预览'}</button><button className="btn btn-secondary" type="button" onClick={() => void persist('draft')} disabled={saving}><Save /> 保存草稿</button><button className="btn btn-primary" type="button" onClick={() => void persist('published')} disabled={saving}><Send /> 发布 <ChevronDown /></button></div>
    </header>
    {error ? <Feedback type="error">{error}</Feedback> : null}
    <div className="editor-workspace">
      <aside className="editor-outline"><div><h2>文档大纲</h2><button type="button" onClick={() => setShowVersions(!showVersions)}><History /> 版本历史 ({versions.length})</button></div>{showVersions ? <div className="version-drawer">{versions.map((version) => <button key={version.id} type="button" onClick={() => void restoreVersion(version)}><strong>{version.title}</strong><small>{new Date(version.created_at).toLocaleString('zh-CN')} · 点击恢复</small></button>)}</div> : <nav>{outline.length ? outline.map((item) => <span key={item.id} className={`level-${item.level}`}>{item.text}</span>) : <p>添加正文标题后，大纲会自动生成。</p>}</nav>}</aside>
      <main className="editor-canvas">
        <label>标题 *</label><textarea className="editor-title" rows={2} value={post.title} onChange={(event) => update('title', event.target.value)} placeholder="写一个清晰、具体的标题" />
        <label>摘要</label><textarea className="editor-summary" rows={3} value={post.summary} onChange={(event) => update('summary', event.target.value)} maxLength={300} placeholder="用两三句话说明文章解决的问题" />
        <div className="editor-tabs"><button className={!preview ? 'active' : ''} type="button" onClick={() => setPreview(false)}>Markdown</button><button className={preview ? 'active' : ''} type="button" onClick={() => setPreview(true)}>预览</button></div>
        {preview ? <div className="editor-preview"><h1>{post.title || '无标题文章'}</h1><MarkdownRenderer content={post.content || '开始写作后，预览会出现在这里。'} /></div> : <textarea className="editor-body mono" value={post.content} onChange={(event) => update('content', event.target.value)} aria-label="文章正文 Markdown" placeholder={'## 从问题开始\n\n写下背景、约束、判断与实现…'} />}
      </main>
      <aside className="editor-inspector">
        <details open><summary>发布设置</summary><label>状态<select value={post.status || 'draft'} onChange={(event) => update('status', event.target.value as PostStatus)}><option value="draft">草稿</option><option value="published">立即发布</option><option value="scheduled">定时发布</option></select></label>{post.status === 'scheduled' ? <label>发布时间<input type="datetime-local" value={post.scheduled_at?.slice(0, 16) || ''} onChange={(event) => update('scheduled_at', event.target.value)} /></label> : null}</details>
        <details open><summary>分类与标签</summary><label>分类<select value={post.category_id || ''} onChange={(event) => update('category_id', event.target.value ? Number(event.target.value) : null)}><option value="">未分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>标签<input value={post.tags.join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()))} placeholder="Go, OIDC, 安全" /><small>使用逗号分隔，最多建议 10 个。</small></label></details>
        <details open><summary>封面与摘要</summary><label>封面 URL<input value={post.cover_url || ''} onChange={(event) => update('cover_url', event.target.value)} placeholder="/media/cover.webp" /></label><label>替代文本<input value={post.cover_alt || ''} onChange={(event) => update('cover_alt', event.target.value)} /></label></details>
        <details open><summary>SEO</summary><label>SEO 标题<input value={post.seo_title || ''} maxLength={60} onChange={(event) => update('seo_title', event.target.value)} /><small>{(post.seo_title || '').length}/60</small></label><label>SEO 描述<textarea rows={4} value={post.seo_description || ''} maxLength={160} onChange={(event) => update('seo_description', event.target.value)} /><small>{(post.seo_description || '').length}/160</small></label><label>Slug<input className="mono" value={post.slug} onChange={(event) => update('slug', event.target.value)} required /></label></details>
      </aside>
    </div>
  </div>;
}
