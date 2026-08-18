import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Eye, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch, isLoggedIn, redirectToAuthorize } from '../auth';
import { readData } from '../community';
import { Badge, EmptyState, Feedback, LoadingState, PageHeader, Panel } from '../components/ui';
import { useI18n } from '../i18n';

interface BookmarkItem {
  post: {
    id: number;
    title: string;
    slug: string;
    summary: string;
    tags: string[];
    views_count: number;
    likes_count: number;
  };
  created_at: string;
}

export default function Bookmarks() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      await redirectToAuthorize('/bookmarks');
      return;
    }
    try {
      setItems((await readData<BookmarkItem[] | null>(await apiFetch('/api/me/bookmarks'))) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (postID: number) => {
    const response = await apiFetch(`/api/me/bookmarks/${postID}`, { method: 'DELETE' });
    if (response.ok) setItems((current) => current.filter((item) => item.post.id !== postID));
  };

  return (
    <div className="section-stack">
      <PageHeader title={t('bookmarks')} />
      {error ? <Feedback type="error">{error}</Feedback> : null}
      {loading ? <LoadingState label={t('loadingResources')} /> : items.length === 0 ? <EmptyState label={t('noBookmarks')} /> : (
        <div className="bookmark-grid">
          {items.map(({ post, created_at }) => (
            <Panel as="article" className="bookmark-card" key={post.id}>
              <div className="panel-heading">
                <Link to={`/posts/${post.slug}`}><strong>{post.title}</strong></Link>
                <button className="icon-button" type="button" title={t('removeBookmark')} onClick={() => void remove(post.id)}><Bookmark fill="currentColor" /></button>
              </div>
              <p className="muted">{post.summary}</p>
              <div className="chip-row">{post.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
              <div className="inline-meta"><span>{formatDate(created_at)}</span><span><Eye size={14} />{post.views_count}</span><span><Heart size={14} />{post.likes_count}</span></div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
