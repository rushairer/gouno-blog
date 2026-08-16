import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GitBranch, Mail, Rss } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState } from '../components/ui';
import { authorInitials, DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { getPosts, getSiteSettings, getTags } from '../lib/blog-api';
import { markdownToPlainText } from '../markdown';
import type { Post, SiteSettings } from '../types/blog';

const readTime = (post: Post) => Math.max(3, Math.ceil((post.content?.length || post.summary.length) / 500));

function Story({ post, index, featured = false }: { post: Post; index: number; featured?: boolean }) {
  return (
    <article className={`editorial-story ${featured ? 'editorial-story--featured' : ''}`}>
      <span className="story-index">{String(index).padStart(2, '0')}</span>
      <div className="story-body">
        {post.cover_url ? (
          <Link className="story-cover-link" to={`/articles/${post.slug}`} tabIndex={-1} aria-hidden="true">
            <img className="story-cover" src={post.cover_url} alt={post.cover_alt || post.title} loading="lazy" />
          </Link>
        ) : null}
        <div>
          <Link to={`/articles/${post.slug}`}><h3>{post.title}</h3></Link>
          <p>{markdownToPlainText(post.summary)}</p>
          <div className="story-meta">
            <time>{new Date(post.published_at || post.created_at).toLocaleDateString('zh-CN')}</time>
            <span>{readTime(post)} 分钟阅读</span>
            {post.tags.slice(0, 2).map((tag) => <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</Link>)}
          </div>
          <Link className="text-action" to={`/articles/${post.slug}`}>阅读文章 <ArrowRight /></Link>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [site, setSite] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getPosts(new URLSearchParams({ page: '1', pageSize: '12' })),
      getTags(),
      getSiteSettings().catch(() => DEFAULT_SITE_SETTINGS),
    ])
      .then(([postData, tagData, siteData]) => {
        setPosts(postData.list || []);
        setTags(tagData || []);
        setSite({ ...DEFAULT_SITE_SETTINGS, ...siteData });
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const tagCounts = useMemo(() => tags.map((tag) => ({
    tag,
    count: posts.filter((post) => post.tags.includes(tag)).length,
  })).sort((a, b) => b.count - a.count), [posts, tags]);

  if (loading) return <div className="public-container state-page"><LoadingState label="正在整理文章…" /></div>;

  const lead = posts[0];
  return (
    <>
      <section className="home-hero public-container">
        <div className="home-hero-copy">
          <h1>把复杂系统，<br />写成可理解的路径。</h1>
          <p>关于工程架构、产品设计与 AI 实践的长期笔记。写清楚问题，也写清楚选择背后的理由。</p>
          {lead ? <Story post={lead} index={1} featured /> : null}
        </div>
        <figure className="system-art">
          <img src="/editorial-system-map.png" alt="由模块、关系与路径组成的抽象系统图" />
          <span className="art-caption">SYSTEMS / PEOPLE / DECISIONS</span>
        </figure>
      </section>

      <div className="public-container">
        {error ? <p className="feedback feedback--error">{error}</p> : null}
        {!error && posts.length === 0 ? <EmptyState label="这里还没有文章。完成第一篇写作后，它会成为首页主角。" /> : null}
        {posts.length > 1 ? (
          <section className="home-section">
            <header className="section-heading"><h2>精选文章</h2><Link to="/articles">查看全部 <ArrowRight /></Link></header>
            <div className="featured-layout">
              <Story post={posts[1]} index={2} featured />
              <div>{posts.slice(2, 4).map((post, index) => <Story key={post.id} post={post} index={index + 3} />)}</div>
            </div>
          </section>
        ) : null}

        {posts.length > 0 ? (
          <section className="home-section">
            <header className="section-heading"><h2>最新文章</h2></header>
            <div className="latest-table" role="list">
              {posts.slice(0, 8).map((post) => (
                <article key={post.id} role="listitem">
                  <div className="latest-table-main">
                    {post.cover_url ? (
                      <Link className="latest-table-cover-link" to={`/articles/${post.slug}`} tabIndex={-1} aria-hidden="true">
                        <img className="latest-table-cover" src={post.cover_url} alt={post.cover_alt || post.title} loading="lazy" />
                      </Link>
                    ) : null}
                    <div><Link to={`/articles/${post.slug}`}><h3>{post.title}</h3></Link><p>{markdownToPlainText(post.summary)}</p></div>
                  </div>
                  <time>{new Date(post.published_at || post.created_at).toLocaleDateString('zh-CN')}</time>
                  <span>{readTime(post)} 分钟</span>
                  <div>{post.tags.slice(0, 3).map((tag) => <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</Link>)}</div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="home-section topic-index">
          <header className="section-heading"><h2>主题索引</h2></header>
          <div className="topic-columns">
            <div><h3>长期关注</h3>{['工程架构', '产品设计', '人工智能', '开发者体验'].map((name, index) => <Link key={name} to={`/search?q=${encodeURIComponent(name)}`}><span>{name}</span><strong>{String(index + 1).padStart(2, '0')}</strong></Link>)}</div>
            <div><h3>热门标签</h3><div className="tag-cloud">{tagCounts.slice(0, 16).map(({ tag, count }) => <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}<sup>{count}</sup></Link>)}</div></div>
          </div>
        </section>

        <section className="author-section">
          <div className="author-monogram">{authorInitials(site.author_name)}</div>
          <div><h2>{site.author_name}</h2><p>{site.author_bio}</p></div>
          <div className="author-links"><Link to="/about">关于本站 <ArrowRight /></Link>{site.github_url ? <a href={site.github_url} target="_blank" rel="noreferrer"><GitBranch /> GitHub</a> : null}</div>
        </section>
      </div>

      <section className="subscribe-strip">
        <div className="public-container"><div><h2>订阅更新</h2><p>每当有新文章发布，都可以通过你熟悉的方式收到。</p></div><div><a href={site.rss_url || '/feed.xml'}><Rss /> RSS</a>{site.email ? <a href={`mailto:${site.email}`}><Mail /> Email</a> : null}</div></div>
      </section>
    </>
  );
}
