import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Cloud,
  Code2,
  Edit3,
  Eye,
  FileText,
  Heart,
  ListFilter,
  Lock,
  Search,
  Tag,
  Terminal,
  Timer,
} from 'lucide-react';
import { EmptyState, LoadingState, Panel } from '../components/ui';
import { useI18n } from '../i18n';

interface Post {
  id: number;
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  views_count?: number;
  likes_count?: number;
  created_at: string;
}

const pageSize = 6;

function PostCard({ post }: { post: Post }) {
  const { t, formatDate } = useI18n();
  const primaryTag = post.tags[0] || 'go';
  const readMinutes = Math.max(3, Math.min(12, Math.ceil(`${post.title} ${post.summary}`.length / 80)));
  const icon = getTopicIcon(primaryTag);

  return (
    <article className="post-row">
      <div className="post-thumb" aria-hidden="true">
        {icon}
      </div>
      <div className="post-row__body">
        <div className="post-kicker">{primaryTag}</div>
        <Link to={`/posts/${post.slug}`} className="post-title">
          {post.title}
        </Link>
        <p className="post-summary">{post.summary}</p>
        <div className="chip-row">
          {post.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="post-row__meta">
        <time>{formatDate(post.created_at)}</time>
        <span>
          <Timer size={15} />
          {t('readMinutes', { count: readMinutes })}
        </span>
        {post.views_count !== undefined && (
          <span title={t('views')}>
            <Eye size={15} />
            {post.views_count}
          </span>
        )}
        {post.likes_count !== undefined && (
          <span title={t('likes')}>
            <Heart size={15} />
            {post.likes_count}
          </span>
        )}
        <Link to={`/posts/${post.slug}`} className="text-link">
          {t('readArticle')}
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

function getTopicIcon(tag: string) {
  const normalized = tag.toLowerCase();
  if (normalized.includes('sso') || normalized.includes('auth') || normalized.includes('security')) return <Lock />;
  if (normalized.includes('cloud') || normalized.includes('infra') || normalized.includes('ops')) return <Cloud />;
  if (normalized.includes('web') || normalized.includes('react') || normalized.includes('ui')) return <Code2 />;
  if (normalized.includes('go')) return <span className="go-mark">GO</span>;
  return <Terminal />;
}

export default function Home() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [selectedTag, search]);

  useEffect(() => {
    let ignore = false;

    async function fetchPosts() {
      try {
        if (page === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
        const postsUrl = new URL('/api/posts', window.location.origin);
        postsUrl.searchParams.set('page', String(page));
        postsUrl.searchParams.set('pageSize', String(pageSize));
        if (selectedTag) {
          postsUrl.searchParams.append('tag', selectedTag);
        }
        if (search.trim()) {
          postsUrl.searchParams.append('search', search.trim());
        }

        const postsResp = await fetch(postsUrl.toString());
        if (!postsResp.ok) throw new Error(t('failedLoadPosts'));
        const postsBody = await postsResp.json();
        if (!ignore) {
          const nextPosts = postsBody.data.list || [];
          setPosts((current) => (page === 1 ? nextPosts : [...current, ...nextPosts]));
          setTotal(postsBody.data.total || nextPosts.length);
        }
      } catch (err: unknown) {
        console.error(err);
        if (!ignore) {
          setError(err instanceof Error ? err.message : t('failedFetch'));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    fetchPosts();
    return () => {
      ignore = true;
    };
  }, [page, selectedTag, search, t]);

  useEffect(() => {
    let ignore = false;

    async function fetchTags() {
      const tagsResp = await fetch('/api/tags');
      if (tagsResp.ok && !ignore) {
        const tagsBody = await tagsResp.json();
        setTags(tagsBody.data || []);
      }
    }

    fetchTags().catch((err: unknown) => {
      console.error(err);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredPosts = posts.filter((post) =>
    [post.title, post.summary].some((value) => value.toLowerCase().includes(normalizedSearch)),
  );
  const tagCounts = tags.map((tag) => ({
    tag,
    count: posts.filter((post) => post.tags.includes(tag)).length,
  }));
  const hasMore = posts.length < total;

  return (
    <div className="blog-shell">
      <section className="feed-panel">
        <header className="feed-header">
          <h1>{t('latestPosts')}</h1>
          <p>{t('intro')}</p>
        </header>

        <div className="feed-tools">
          <div className="search-box">
            <Search aria-hidden="true" />
            <input
              type="search"
              className="input-field"
              placeholder={t('searchPosts')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>/</kbd>
          </div>
          <div className="topic-select">
            <ListFilter size={18} />
            <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} aria-label={t('allTopics')}>
              <option value="">{t('allTopics')}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="feed-list">
          {loading ? (
            <LoadingState label={t('loadingPosts')} />
          ) : error ? (
            <Panel className="section-stack">
              <p className="feedback feedback--error">{error}</p>
              <button className="btn btn-secondary" onClick={() => window.location.reload()} type="button">
                {t('retry')}
              </button>
            </Panel>
          ) : filteredPosts.length === 0 ? (
            <EmptyState label={t('noPosts')} />
          ) : (
            <>
              {filteredPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              {hasMore && (
                <button className="load-more" type="button" onClick={() => setPage((current) => current + 1)} disabled={loadingMore}>
                  {loadingMore ? t('loadingPosts') : t('loadMore')}
                  <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <aside className="blog-sidebar" aria-label={t('sidebar')}>
        <Panel className="sidebar-card about-card">
          <h2>{t('aboutTitle')}</h2>
          <p>{t('aboutCopy')}</p>
          <Link to="/settings" className="text-link">
            {t('moreAbout')}
            <ArrowRight size={16} />
          </Link>
        </Panel>

        <Panel className="sidebar-card">
          <h2>{t('topics')}</h2>
          <button className={`topic-row ${selectedTag === '' ? 'active' : ''}`} onClick={() => setSelectedTag('')} type="button">
            <span>
              <Tag size={18} />
              {t('allTopics')}
            </span>
            <strong>{posts.length}</strong>
          </button>
          {tagCounts.map(({ tag, count }) => (
            <button key={tag} className={`topic-row ${selectedTag === tag ? 'active' : ''}`} onClick={() => setSelectedTag(tag)} type="button">
              <span>
                {getTopicIcon(tag)}
                {tag}
              </span>
              <strong>{count}</strong>
            </button>
          ))}
        </Panel>

        <Panel className="sidebar-card">
          <h2>{t('adminQuickActions')}</h2>
          <Link className="quick-action" to="/admin">
            <span>
              <Edit3 size={18} />
              {t('newPost')}
            </span>
            <ChevronRight size={18} />
          </Link>
          <Link className="quick-action" to="/admin">
            <span>
              <FileText size={18} />
              {t('managePosts')}
            </span>
            <ChevronRight size={18} />
          </Link>
        </Panel>
      </aside>
    </div>
  );
}
