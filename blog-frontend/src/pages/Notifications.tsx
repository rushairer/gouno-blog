import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch, isLoggedIn, redirectToAuthorize } from '../auth';
import type { Notification } from '../community';
import { readResponse } from '../community';
import { EmptyState, Feedback, LoadingState, PageHeader, Panel } from '../components/ui';
import { useI18n } from '../i18n';

export default function Notifications() {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      await redirectToAuthorize('/notifications');
      return;
    }
    try {
      const data = await readResponse<{ list: Notification[] }>(await apiFetch('/api/me/notifications'));
      setItems(data?.list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOne = async (notification: Notification) => {
    if (!notification.read_at) {
      await apiFetch(`/api/me/notifications/${notification.id}/read`, { method: 'PUT' });
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      window.dispatchEvent(new CustomEvent('community:notifications-changed'));
    }
  };

  const readAll = async () => {
    await apiFetch('/api/me/notifications/read-all', { method: 'PUT' });
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || now })));
    window.dispatchEvent(new CustomEvent('community:notifications-changed'));
  };

  return (
    <div className="section-stack">
      <PageHeader
        title={t('notifications')}
        action={<button className="btn btn-secondary" type="button" onClick={() => void readAll()}><CheckCheck />{t('markAllRead')}</button>}
      />
      {error ? <Feedback type="error">{error}</Feedback> : null}
      {loading ? <LoadingState label={t('loadingResources')} /> : items.length === 0 ? (
        <EmptyState label={t('noNotifications')} />
      ) : (
        <Panel className="notification-list">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/posts/${item.post_slug}#comment-${item.comment_id || ''}`}
              className={`notification-row ${item.read_at ? '' : 'notification-row--unread'}`}
              onClick={() => void readOne(item)}
            >
              <Bell size={18} />
              <span>
                <strong>{t('replyNotification', { name: item.actor_name })}</strong>
                <small>{item.post_title} · {formatDateTime(item.created_at)}</small>
              </span>
            </Link>
          ))}
        </Panel>
      )}
    </div>
  );
}
