import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Mail, Rss, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { authorInitials, DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { getPageBySlug, getSiteSettings } from '../lib/blog-api';
import { extractMarkdownTOC } from '../markdown';
import type { CustomPage, SiteSettings } from '../types/blog';
import NotFound from './NotFound';

export default function CustomPageView({ fixedSlug }: { fixedSlug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = fixedSlug || routeSlug || '';

  const [page, setPage] = useState<CustomPage | null>(null);
  const [site, setSite] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getSiteSettings()
      .then((settings) => setSite({ ...DEFAULT_SITE_SETTINGS, ...settings }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setNotFound(false);

    getPageBySlug(slug)
      .then((data) => {
        if (ignore) return;
        setPage(data);
      })
      .catch(() => {
        if (!ignore) {
          // If fixedSlug is 'about' and not yet in backend DB (or network down), fallback to site-defaults
          if (slug === 'about') {
            setPage({
              id: 0,
              title: '关于',
              slug: 'about',
              summary: '关于这个站点，以及持续写作的理由。',
              content: '这里用于记录值得长期保存的问题、过程与结论。比起只给答案，更重视交代上下文、约束和选择的理由。',
              template: 'about',
              status: 'published',
              allow_comments: false,
              show_in_nav: true,
              sort_order: 10,
              created_at: new Date().toISOString(),
            });
          } else {
            setNotFound(true);
          }
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

  // SEO updates
  useEffect(() => {
    if (page) {
      const pageTitle = page.seo_title || page.title;
      document.title = `${pageTitle} - ${site.site_title || DEFAULT_SITE_SETTINGS.site_title}`;

      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', page.seo_description || page.summary || site.site_description || '');
    }
  }, [page, site]);

  const toc = useMemo(() => (page?.content ? extractMarkdownTOC(page.content) : []), [page?.content]);

  if (notFound) return <NotFound />;

  if (loading || !page) {
    return (
      <div className="public-container state-page">
        <p className="loading-indicator">正在载入页面…</p>
      </div>
    );
  }

  const draftBanner = page.status === 'draft' ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        marginBottom: '24px',
        borderRadius: 'var(--radius-control)',
        background: 'var(--brand-soft)',
        color: 'var(--brand)',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      <ShieldAlert size={16} />
      <span><strong>管理员预览模式</strong> · 该单页当前为草稿状态，仅对管理员可见。</span>
    </div>
  ) : null;

  // 1. About Template
  if (page.template === 'about') {
    return (
      <div className="public-container about-page">
        {draftBanner}
        <header>
          <div className="about-mark">{authorInitials(site.author_name)}</div>
          <div>
            <p>ABOUT / {site.site_title.toUpperCase()}</p>
            <h1>{page.title === '关于' ? <>关于这个站点，<br />以及持续写作的理由。</> : page.title}</h1>
          </div>
        </header>
        <div className="about-grid">
          <main>
            {page.summary ? <p className="about-lead">{page.summary}</p> : null}
            <MarkdownRenderer content={page.content} />
          </main>
          <aside>
            <h2>订阅与联系</h2>
            {site.github_url ? (
              <a href={site.github_url} target="_blank" rel="noreferrer">
                <GitBranch /> GitHub
              </a>
            ) : null}
            {site.email ? (
              <a href={`mailto:${site.email}`}>
                <Mail /> Email
              </a>
            ) : null}
            <a href={site.rss_url || '/feed.xml'}>
              <Rss /> RSS
            </a>
          </aside>
        </div>
      </div>
    );
  }

  // 2. Blank Template (Full width clean container)
  if (page.template === 'blank') {
    return (
      <div className="public-container custom-page custom-page--blank">
        {draftBanner}
        <MarkdownRenderer content={page.content} />
      </div>
    );
  }

  // 3. Links Template
  if (page.template === 'links') {
    return (
      <div className="public-container custom-page links-page">
        {draftBanner}
        <header className="article-header" style={{ marginBottom: '28px' }}>
          <h1 className="article-title">{page.title}</h1>
          {page.summary ? <p className="lead">{page.summary}</p> : null}
        </header>
        <div className="article-content">
          <MarkdownRenderer content={page.content} />
        </div>
      </div>
    );
  }

  // 4. Default Standard Template
  return (
    <div className="public-container custom-page">
      {draftBanner}
      <div className="article-layout">
        <article className="article-main">
          <header className="article-header">
            <h1 className="article-title">{page.title}</h1>
            {page.summary ? <p className="lead">{page.summary}</p> : null}
          </header>
          <div className="article-content">
            <MarkdownRenderer content={page.content} />
          </div>
        </article>

        {toc.length > 0 ? (
          <aside className="article-sidebar">
            <div className="toc-card">
              <h3>目录导航</h3>
              <nav className="toc-list">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`toc-item toc-item--h${item.level}`}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
