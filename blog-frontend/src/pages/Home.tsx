import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GitBranch, Mail, Rss } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, SectionHeading } from '../components/ui';
import { authorInitials, DEFAULT_SITE_SETTINGS } from '../config/site-defaults';
import { postsApi } from '../api/posts';
import { siteApi } from '../api/site';
import { markdownToPlainText } from '../utils/markdown';
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
      postsApi.getPosts(new URLSearchParams({ page: '1', pageSize: '12' })),
      siteApi.getTags(),
      siteApi.getSiteSettings().catch(() => DEFAULT_SITE_SETTINGS),
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
          <h1 style={{ whiteSpace: 'pre-line' }}>{site.hero_title || DEFAULT_SITE_SETTINGS.hero_title}</h1>
          <p>{site.hero_description ?? DEFAULT_SITE_SETTINGS.hero_description}</p>
          {lead ? <Story post={lead} index={1} featured /> : null}
        </div>
        {site.hero_image_url ? (
          <figure className="system-art">
            <img src={site.hero_image_url} alt={site.hero_image_caption || '由模块、关系与路径组成的抽象系统图'} />
            {site.hero_image_caption ? <span className="art-caption">{site.hero_image_caption}</span> : null}
          </figure>
        ) : null}
      </section>

      <div className="public-container">
        {error ? <p className="feedback feedback--error">{error}</p> : null}
        {!error && posts.length === 0 ? <EmptyState label="这里还没有文章。完成第一篇写作后，它会成为首页主角。" /> : null}
        {posts.length > 1 ? (
          <section className="home-section">
            <SectionHeading title="精选文章" action={<Link to="/articles">查看全部 <ArrowRight /></Link>} />
            <div className="featured-layout">
              <Story post={posts[1]} index={2} featured />
              <div>{posts.slice(2, 4).map((post, index) => <Story key={post.id} post={post} index={index + 3} />)}</div>
            </div>
          </section>
        ) : null}

        {posts.length > 0 ? (
          <section className="home-section">
            <SectionHeading title="最新文章" />
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
          <SectionHeading title="主题索引" />
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
