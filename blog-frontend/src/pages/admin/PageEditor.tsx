import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Save, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminPageState, ConfirmDialog, Feedback, Field, Input, Select, Textarea } from '../../components/ui';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { pagesApi } from '../../api/pages';
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
      pagesApi.getAdminPage(id)
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

  const update = <K extends keyof CustomPage>(key: K, value: CustomPage[K]) => {
    setPage((current) => ({ ...current, [key]: value }));
    dirty.current = true;
    setSavedAt(null);
  };

  const persist = useCallback(
    async (status: PostStatus, automatic = false) => {
      if (!page.title.trim()) {
        if (!automatic) setError('请先填写单页标题。');
        return;
      }
      if (!page.slug.trim()) {
        if (!automatic) setError('请填写单页访问路径 (Slug)。');
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
        status,
        allow_comments: false,
        show_in_nav: Boolean(page.show_in_nav),
        sort_order: Number(page.sort_order) || 0,
        seo_title: page.seo_title || '',
        seo_description: page.seo_description || '',
      };

      try {
        let result: CustomPage;
        if (page.id) {
          result = await pagesApi.updatePage(page.id, payload);
        } else {
          result = await pagesApi.createPage(payload);
        }
        setPage(result);
        dirty.current = false;
        setSavedAt(new Date());
        if (!page.id) {
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。');
      } finally {
        setSaving(false);
      }
    },
    [navigate, page]
  );

  const leaveEditor = () => {
    if (dirty.current) setConfirmExit(true);
    else navigate('/admin/pages');
  };

  const openFrontsitePreview = async () => {
    let currentPage = page;
    if (dirty.current || !currentPage.id) {
      if (!currentPage.title.trim() || !currentPage.slug.trim()) {
        setError('请先填写单页标题与路径。');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const payload: Partial<CustomPage> = {
          title: currentPage.title.trim(),
          slug: currentPage.slug.trim().toLowerCase(),
          summary: currentPage.summary || '',
          content: currentPage.content || '',
          template: currentPage.template || 'default',
          status: currentPage.status || 'draft',
          allow_comments: false,
          show_in_nav: Boolean(currentPage.show_in_nav),
          sort_order: Number(currentPage.sort_order) || 0,
          seo_title: currentPage.seo_title || '',
          seo_description: currentPage.seo_description || '',
        };
        const result = currentPage.id
          ? await pagesApi.updatePage(currentPage.id, payload)
          : await pagesApi.createPage(payload);
        currentPage = result;
        setPage(result);
        dirty.current = false;
        setSavedAt(new Date());
        if (!page.id) {
          navigate(`/admin/pages/${result.id}/edit`, { replace: true });
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '保存失败，无法开启预览。');
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    window.open(`/${currentPage.slug}`, '_blank');
  };

  if (!allowed || loading) {
    return (
      <AdminPageState
        title={isNew ? '新建单页' : '编辑单页'}
        description="撰写并管理独立单页展示结构与配置。"
        label="正在打开编辑器…"
      />
    );
  }

  return (
    <div className="editor-page">
      <header className="editor-commandbar">
        <button className="editor-back" type="button" onClick={leaveEditor}>
          <ArrowLeft /> 返回单页列表
        </button>
        <div className="editor-save-state">
          {saving ? (
            '正在保存…'
          ) : savedAt ? (
            <>
              <Check /> 已于{' '}
              {savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{' '}
              保存
            </>
          ) : dirty.current ? (
            '有未保存的更改'
          ) : (
            '所有更改已保存'
          )}
        </div>
        <div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void openFrontsitePreview()}
            disabled={saving}
          >
            <ExternalLink /> 预览前台页面
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void persist('draft')}
            disabled={saving}
          >
            <Save /> 保存草稿
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void persist('published')}
            disabled={saving}
          >
            <Send /> {page.status === 'published' ? '更新单页' : '发布'}
          </button>
        </div>
      </header>

      {error ? <Feedback type="error">{error}</Feedback> : null}

      <div className="editor-workspace" style={{ gridTemplateColumns: 'minmax(480px, 1fr) 280px' }}>
        <main className="editor-canvas">
          <Field label="标题" required>
            <Textarea
              className="editor-title"
              rows={2}
              value={page.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="写一个清晰、具体的单页标题"
              required
            />
          </Field>

          <Field label="摘要 / 描述">
            <Textarea
              className="editor-summary"
              rows={2}
              value={page.summary}
              onChange={(event) => update('summary', event.target.value)}
              maxLength={300}
              placeholder="用一两句话说明单页内容"
            />
          </Field>

          <div className="editor-tabs">
            <button
              className={!preview ? 'active' : ''}
              type="button"
              onClick={() => setPreview(false)}
            >
              Markdown
            </button>
            <button
              className={preview ? 'active' : ''}
              type="button"
              onClick={() => setPreview(true)}
            >
              预览
            </button>
          </div>

          {preview ? (
            <div className="editor-preview">
              <MarkdownRenderer content={page.content || '开始写作后，预览会出现在这里。'} />
            </div>
          ) : (
            <textarea
              className="editor-body mono"
              value={page.content}
              onChange={(event) => update('content', event.target.value)}
              aria-label="单页正文 Markdown"
              placeholder={'## 页面正文\n\n在此输入 Markdown 内容…'}
            />
          )}
        </main>

        <aside className="editor-inspector">
          <details open>
            <summary>发布设置</summary>
            <Field label="状态">
              <Select
                value={page.status || 'draft'}
                onChange={(event) => {
                  update('status', event.target.value as PostStatus);
                }}
              >
                <option value="draft">草稿</option>
                <option value="published">立即发布</option>
              </Select>
            </Field>
          </details>

          <details open>
            <summary>页面配置</summary>
            <Field label="显示模板" hint="选择页面的预设布局结构">
              <Select
                value={page.template || 'default'}
                onChange={(event) => update('template', event.target.value as PageTemplate)}
              >
                <option value="default">默认标准排版 (Default)</option>
                <option value="about">关于页专用模板 (About)</option>
                <option value="links">友情链接模板 (Links)</option>
                <option value="timeline">时间轴与历程 (Timeline)</option>
                <option value="projects">项目与作品集 (Projects)</option>
                <option value="focus">极简专注阅读 (Focus)</option>
                <option value="faq">问答与指南 (FAQ)</option>
                <option value="blank">全宽纯净模板 (Blank)</option>
              </Select>
            </Field>
            <Field label="主导航栏联动">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-2)',
                }}
              >
                <input
                  type="checkbox"
                  checked={page.show_in_nav}
                  onChange={(event) => update('show_in_nav', event.target.checked)}
                />
                <span>显示在顶部主导航栏</span>
              </label>
            </Field>
            {page.show_in_nav ? (
              <Field label="导航排序权重" hint="数字越小越靠前，如 10, 20">
                <Input
                  type="number"
                  value={page.sort_order}
                  onChange={(event) => update('sort_order', Number(event.target.value) || 0)}
                />
              </Field>
            ) : null}
          </details>

          <details open>
            <summary>路径与 SEO</summary>
            <Field label="访问路径 (Slug)" required hint="访问路径为 /<slug>">
              <Input
                className="mono"
                value={page.slug}
                onChange={(event) => update('slug', event.target.value)}
                placeholder="about"
                required
              />
            </Field>
            <Field label="SEO 标题" hint={`${(page.seo_title || '').length}/60`}>
              <Input
                value={page.seo_title || ''}
                maxLength={60}
                onChange={(event) => update('seo_title', event.target.value)}
                placeholder="留空时默认使用标题"
              />
            </Field>
            <Field label="SEO 描述" hint={`${(page.seo_description || '').length}/160`}>
              <Textarea
                rows={4}
                value={page.seo_description || ''}
                maxLength={160}
                onChange={(event) => update('seo_description', event.target.value)}
                placeholder="留空时默认使用摘要"
              />
            </Field>
          </details>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="放弃未保存的更改？"
        description="离开编辑器后，尚未保存的内容会丢失。"
        confirmLabel="放弃并离开"
        danger
        onClose={() => setConfirmExit(false)}
        onConfirm={() => navigate('/admin/pages')}
      />
    </div>
  );
}
