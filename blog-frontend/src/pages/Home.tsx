import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  Cloud,
  Code2,
  Edit3,
  FileText,
  Folder,
  Image,
  ListFilter,
  Lock,
  MoreHorizontal,
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
  created_at: string;
}

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
        <button className="ghost-icon" type="button" aria-label={t('saveArticle')}>
          <Bookmark size={21} />
        </button>
        <button className="ghost-icon" type="button" aria-label={t('moreActions')}>
          <MoreHorizontal size={22} />
        </button>
        <time>{formatDate(post.created_at)}</time>
        <span>
          <Timer size={15} />
          {t('readMinutes', { count: readMinutes })}
        </span>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const postsUrl = new URL('/api/posts', window.location.origin);
        if (selectedTag) {
          postsUrl.searchParams.append('tag', selectedTag);
        }

        const postsResp = await fetch(postsUrl.toString());
        if (!postsResp.ok) throw new Error(t('failedLoadPosts'));
        const postsBody = await postsResp.json();
        setPosts(postsBody.data.list || []);

        const tagsResp = await fetch('/api/tags');
        if (tagsResp.ok) {
          const tagsBody = await tagsResp.json();
          setTags(tagsBody.data || []);
        }
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : t('failedFetch'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedTag, t]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredPosts = posts.filter((post) =>
    [post.title, post.summary].some((value) => value.toLowerCase().includes(normalizedSearch)),
  );
  const tagCounts = tags.map((tag) => ({
    tag,
    count: posts.filter((post) => post.tags.includes(tag)).length,
  }));

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
              {filteredPosts.length > 3 && (
                <button className="load-more" type="button">
                  {t('loadMore')}
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
          <Link className="quick-action" to="/admin">
            <span>
              <Folder size={18} />
              {t('categories')}
            </span>
            <ChevronRight size={18} />
          </Link>
          <Link className="quick-action" to="/admin">
            <span>
              <Image size={18} />
              {t('mediaLibrary')}
            </span>
            <ChevronRight size={18} />
          </Link>
        </Panel>
      </aside>
    </div>
  );
}
