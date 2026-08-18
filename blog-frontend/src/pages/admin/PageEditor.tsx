import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, LoaderCircle, Save, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminPageState, Button, ConfirmDialog, Feedback, Field, Input, Select, Textarea } from '../../components/ui';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { createPage, getAdminPage, updatePage } from '../../lib/blog-api';
import type { CustomPage, PageTemplate, PostStatus } from '../../types/blog';

const emptyPage: CustomPage = {
  id: 0,
  title: '',
  slug: '',
  summary: '',
  content: '',
  template: 'default',
  status: 'draft',
  allow_comments: false,
  show_in_nav: false,
  sort_order: 0,
  seo_title: '',
  seo_description: '',
  created_at: '',
};

export default function PageEditor() {
  const { id } = useParams();
  const isNew = !id;
  const allowed = useAdminGuard(isNew ? '/admin/pages/new' : `/admin/pages/${id}/edit`);
  const navigate = useNavigate();

  const [page, setPage] = useState<CustomPage>(emptyPage);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!allowed) return;
    if (!isNew && id) {
      setLoading(true);
      getAdminPage(id)
        .then((data) => {
          setPage(data);
          setError('');
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }
  }, [allowed, id, isNew]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const updateField = <K extends keyof CustomPage>(key: K, value: CustomPage[K]) => {
    dirty.current = true;
    setPage((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (targetStatus?: PostStatus) => {
    if (!page.title.trim()) {
      setError('请输入页面标题');
      return;
    }
    if (!page.slug.trim()) {
      setError('请输入访问路径 (Slug)');
      return;
    }

    setSaving(true);
    setError('');

    const payload: Partial<CustomPage> = {
      title: page.title.trim(),
      slug: page.slug.trim().toLowerCase(),
      summary: page.summary || '',
      content: page.content || '',
      template: page.template || 'default',
      status: targetStatus || page.status || 'draft',
      allow_comments: Boolean(page.allow_comments),
      show_in_nav: Boolean(page.show_in_nav),
      sort_order: Number(page.sort_order) || 0,
      seo_title: page.seo_title || '',
      seo_description: page.seo_description || '',
    };

    try {
      let result: CustomPage;
      if (isNew) {
        result = await createPage(payload);
        dirty.current = false;
        navigate(`/admin/pages/${result.id}/edit`, { replace: true });
      } else {
        result = await updatePage(page.id, payload);
        dirty.current = false;
      }
      setPage(result);
      setSavedAt(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，请检查输入或路径冲突。');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return null;
  if (loading) return <AdminPageState title="编辑单页" label="正在载入页面详情…" />;

  return (
    <div className="editor-layout">
      <header className="editor-header">
        <div className="editor-header__primary">
          <button
            type="button"
            className="bare-icon"
            onClick={() => {
              if (dirty.current) setConfirmExit(true);
              else navigate('/admin/pages');
            }}
            aria-label="返回单页列表"
          >
            <ArrowLeft />
          </button>
          <div>
            <h1>{isNew ? '新建单页' : `编辑：${page.title || '无标题'}`}</h1>
            <span className="editor-status">
              {saving ? (
                <span className="saving-indicator">
                  <LoaderCircle className="spin" /> 正在保存…
                </span>
              ) : savedAt ? (
                <span className="saved-indicator">
                  <Check /> 已于 {savedAt.toLocaleTimeString()} 保存
                </span>
              ) : (
                '未保存修改'
              )}
            </span>
          </div>
        </div>

        <div className="editor-header__actions">
          {!isNew && page.slug ? (
            <a
              href={`/${page.slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              <ExternalLink /> 查看前台
            </a>
          ) : null}
          <Button
            variant={preview ? 'primary' : 'secondary'}
            type="button"
            onClick={() => setPreview(!preview)}
          >
            {preview ? '返回编辑' : '预览排版'}
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={saving}
            onClick={() => void handleSave('draft')}
          >
            <Save /> 保存草稿
          </Button>
          <Button
            variant="primary"
            type="button"
            disabled={saving}
            onClick={() => void handleSave('published')}
          >
            <Send /> {page.status === 'published' ? '更新并发布' : '直接发布'}
          </Button>
        </div>
      </header>

      {error ? <Feedback type="error">{error}</Feedback> : null}

      <div className="editor-main">
        <div className="editor-body">
          {preview ? (
            <div className="editor-preview-container public-article">
              <h1>{page.title || '页面标题'}</h1>
              {page.summary ? <p className="lead">{page.summary}</p> : null}
              <MarkdownRenderer content={page.content || '_暂无主体内容_'} />
            </div>
          ) : (
            <div className="editor-form">
              <Field label="页面标题" required>
                <Input
                  value={page.title}
                  placeholder="例如：关于本站、友情链接、隐私政策"
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </Field>

              <Field
                label="访问路径 (Slug)"
                required
                hint="访问路径将为 https://yoursite.com/<slug>。仅限英文小写、数字和短横线。"
              >
                <div className="input-group">
                  <span className="input-prefix">/</span>
                  <Input
                    value={page.slug}
                    placeholder="about"
                    onChange={(e) => updateField('slug', e.target.value)}
                  />
                </div>
              </Field>

              <Field label="页面摘要 / 副标题" hint="简要介绍该页面的主旨">
                <Textarea
                  rows={2}
                  value={page.summary}
                  placeholder="例如：关于这个站点，以及持续写作的理由。"
                  onChange={(e) => updateField('summary', e.target.value)}
                />
              </Field>

              <Field label="页面正文 (Markdown)" hint="支持 GitHub Flavored Markdown 语法">
                <Textarea
                  rows={16}
                  value={page.content}
                  placeholder="在此输入页面 Markdown 内容..."
                  onChange={(e) => updateField('content', e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <aside className="editor-sidebar">
          <div className="editor-sidebar-panel">
            <h3>页面配置</h3>

            <Field label="显示模板" hint="选择页面的预设布局结构">
              <Select
                value={page.template || 'default'}
                onChange={(e) => updateField('template', e.target.value as PageTemplate)}
              >
                <option value="default">默认标准排版 (Default)</option>
                <option value="about">关于页专用模板 (About)</option>
                <option value="links">友情链接模板 (Links)</option>
                <option value="blank">全宽纯净模板 (Blank)</option>
              </Select>
            </Field>

            <Field label="主导航栏联动">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={page.show_in_nav}
                  onChange={(e) => updateField('show_in_nav', e.target.checked)}
                />
                <span>显示在顶部主导航栏</span>
              </label>
            </Field>

            {page.show_in_nav ? (
              <Field label="导航排序权重" hint="数字越小越靠前，如 10, 20">
                <Input
                  type="number"
                  value={page.sort_order}
                  onChange={(e) => updateField('sort_order', Number(e.target.value) || 0)}
                />
              </Field>
            ) : null}

            <Field label="评论互动">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={page.allow_comments}
                  onChange={(e) => updateField('allow_comments', e.target.checked)}
                />
                <span>允许读者在本页下方发表评论</span>
              </label>
            </Field>

            <Field label="发布状态">
              <Select
                value={page.status || 'draft'}
                onChange={(e) => updateField('status', e.target.value as PostStatus)}
              >
                <option value="draft">草稿 (仅管理员可预览)</option>
                <option value="published">已发布 (公开可见)</option>
              </Select>
            </Field>
          </div>

          <div className="editor-sidebar-panel">
            <h3>SEO 与元数据</h3>

            <Field label="自定义 SEO 标题">
              <Input
                value={page.seo_title || ''}
                placeholder="留空时默认使用页面标题"
                onChange={(e) => updateField('seo_title', e.target.value)}
              />
            </Field>

            <Field label="自定义 SEO 描述">
              <Textarea
                rows={3}
                value={page.seo_description || ''}
                placeholder="留空时默认使用页面摘要"
                onChange={(e) => updateField('seo_description', e.target.value)}
              />
            </Field>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="有未保存的修改"
        description="离开后未保存的内容将会丢失，确定要离开吗？"
        confirmLabel="确认离开"
        onConfirm={() => navigate('/admin/pages')}
        onClose={() => setConfirmExit(false)}
      />
    </div>
  );
}
