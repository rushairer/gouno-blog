import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Search, User } from 'lucide-react';
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

  return (
    <Panel as="article" className="post-card">
      <div>
        <Link to={`/posts/${post.slug}`} className="post-title">
          {post.title}
        </Link>
        <div className="post-meta inline-meta" aria-label="metadata">
          <span>
            <Calendar size={14} />
            {formatDate(post.created_at)}
          </span>
          <span>
            <User size={14} />
            {t('author')}
          </span>
        </div>
        <p className="post-summary">{post.summary}</p>
      </div>
      <div className="post-card__footer">
        <div className="chip-row">
          {post.tags.map((tag) => (
            <span key={tag} className="badge">
              #{tag}
            </span>
          ))}
        </div>
        <Link to={`/posts/${post.slug}`} className="text-link">
          {t('readArticle')}
          <ArrowRight size={15} />
        </Link>
      </div>
    </Panel>
  );
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

  return (
    <div>
      <section className="hero">
        <div>
          <h1 className="hero-title">{t('brand')}</h1>
          <p className="hero-copy">{t('intro')}</p>
        </div>
        <div className="search-box">
          <Search aria-hidden="true" />
          <input
            type="search"
            className="input-field"
            placeholder={t('searchPosts')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      {tags.length > 0 && (
        <section className="chip-row" aria-label={t('allTopics')}>
          <button className={`topic-button ${selectedTag === '' ? 'active' : ''}`} onClick={() => setSelectedTag('')} type="button">
            {t('allTopics')}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              className={`topic-button ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedTag(tag)}
              type="button"
            >
              #{tag}
            </button>
          ))}
        </section>
      )}

      <section className="section-stack" style={{ marginTop: '26px' }}>
        <h2 className="section-title">{t('latestPosts')}</h2>
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
          <div className="posts-grid">
            {filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
