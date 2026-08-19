import { useEffect, useState } from 'react';
import { BarChart3, Eye, FileText, Heart, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import { analyticsApi } from '../api/analytics';
import { Feedback, LoadingState, PageHeader, Panel } from '../components/ui';
import { useI18n } from '../i18n';

interface Summary {
  total_posts: number;
  published_posts: number;
  total_views: number;
  total_likes: number;
  total_bookmarks: number;
  total_comments: number;
  pending_comments: number;
  reported_items: number;
  top_posts: Array<{ id: number; title: string; slug: string; views_count: number; likes_count: number }>;
  daily_events: Array<{ date: string; count: number }>;
}

export default function Analytics() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      void redirectToAuthorize('/admin/analytics');
      return;
    }
    analyticsApi.getSummary()
      .then((data) => {
        setSummary(data as unknown as Summary);
      })
      .catch((err: Error) => setError(err.message));
  }, [t]);

  if (!summary && !error) return <LoadingState label={t('loadingResources')} />;
  const maxDaily = Math.max(1, ...(summary?.daily_events || []).map((item) => item.count));
  return <div className="section-stack">
    <PageHeader title={t('analyticsDashboard')} action={<Link className="btn btn-secondary" to="/admin">{t('adminDashboard')}</Link>} />
    {error ? <Feedback type="error">{error}</Feedback> : null}
    {summary ? <>
      <div className="metric-grid">
        <Panel className="metric-card"><FileText /><span>{t('articles')}</span><strong>{summary.published_posts}/{summary.total_posts}</strong></Panel>
        <Panel className="metric-card"><Eye /><span>{t('views')}</span><strong>{summary.total_views}</strong></Panel>
        <Panel className="metric-card"><Heart /><span>{t('likes')}</span><strong>{summary.total_likes}</strong></Panel>
        <Panel className="metric-card"><MessageSquare /><span>{t('comments')}</span><strong>{summary.total_comments}</strong></Panel>
      </div>
      <div className="split-grid">
        <Panel className="section-stack">
          <h2 className="section-title"><BarChart3 />{t('recentTraffic')}</h2>
          <div className="bar-chart">{summary.daily_events.map((item) => <div className="bar-chart__item" key={item.date} title={`${item.date}: ${item.count}`}><div style={{ height: `${Math.max(4, item.count / maxDaily * 100)}%` }} /><small>{item.date.slice(5)}</small></div>)}</div>
        </Panel>
        <Panel className="section-stack">
          <h2>{t('topPosts')}</h2>
          {summary.top_posts.map((post) => <Link className="list-row analytics-post" to={`/posts/${post.slug}`} key={post.id}><strong>{post.title}</strong><span>{post.views_count} {t('views')} · {post.likes_count} {t('likes')}</span></Link>)}
          <p className="muted">{t('engagementSummary', { bookmarks: summary.total_bookmarks, pending: summary.pending_comments, reports: summary.reported_items })}</p>
        </Panel>
      </div>
    </> : null}
  </div>;
}
