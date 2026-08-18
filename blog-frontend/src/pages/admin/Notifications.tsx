import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Bot, Check, CheckCheck, ChevronRight, GitBranch, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../auth';
import type { Notification } from '../../community';
import { readData } from '../../community';
import { AdminPage, AdminPageHeader, Button, ContentStack, EmptyState, Feedback, FilterBar, LoadingState, Select, useToast } from '../../components/ui';
import { useAdminGuard } from '../../hooks/useAdminGuard';

export default function AdminNotifications() {
  const allowed = useAdminGuard('/admin/notifications');
  const { notify } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ai' | 'comment'>('all');
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const data = await readData<{ list: Notification[] }>(await apiFetch('/api/me/notifications'));
      setItems(data?.list || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法载入通知列表');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const markOneRead = async (item: Notification) => {
    if (item.read_at) return;
    try {
      await apiFetch(`/api/me/notifications/${item.id}/read`, { method: 'PUT' });
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => n.id === item.id ? { ...n, read_at: now } : n));
      window.dispatchEvent(new CustomEvent('community:notifications-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记已读失败');
    }
  };

  const markAllRead = async () => {
    setClearing(true);
    try {
      await apiFetch('/api/me/notifications/read-all', { method: 'PUT' });
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at || now })));
      window.dispatchEvent(new CustomEvent('community:notifications-changed'));
      notify('全部通知已标记为已读。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '全部已读失败');
    } finally {
      setClearing(false);
    }
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === 'unread' && item.read_at) return false;
      if (statusFilter === 'read' && !item.read_at) return false;

      const isAI = item.type?.startsWith('ai_');
      if (typeFilter === 'ai' && !isAI) return false;
      if (typeFilter === 'comment' && isAI) return false;

      return true;
    });
  }, [items, statusFilter, typeFilter]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const resolvePresentation = (item: Notification) => {
    const isAI = item.type?.startsWith('ai_');
    const isWorkflow = item.type === 'ai_workflow_failed';

    let destination = item.href || '';
    if (!destination) {
      if (isWorkflow) {
        destination = '/admin/agents?tab=records';
      } else if (isAI) {
        destination = '/admin/agents?tab=records&record=agent';
      } else if (item.post_slug) {
        destination = `/posts/${item.post_slug}${item.comment_id ? `#comment-${item.comment_id}` : ''}`;
      } else {
        destination = '/admin/comments';
      }
    }

    let icon = <Bell />;
    let tag = '系统通知';
    let tagClass = '';
    let iconClass = '';

    if (isWorkflow) {
      icon = <GitBranch />;
      tag = 'Workflow 告警';
      tagClass = 'admin-notification-tag--ai';
      iconClass = 'admin-notification-icon--ai';
    } else if (isAI) {
      icon = <Bot />;
      tag = 'AI 运营告警';
      tagClass = 'admin-notification-tag--ai';
      iconClass = 'admin-notification-icon--ai';
    } else if (item.type === 'comment_reply' || item.type === 'comment') {
      icon = <MessageSquare />;
      tag = '评论互动';
      tagClass = 'admin-notification-tag--comment';
      iconClass = 'admin-notification-icon--comment';
    }

    return { destination, icon, tag, tagClass, iconClass };
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="通知中心"
        description="查看系统告警、AI 自动化异常与站点互动通知。"
        actions={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              type="button"
              disabled={clearing}
              onClick={() => void markAllRead()}
            >
              <CheckCheck /> {clearing ? '处理中…' : '全部标为已读'}
            </Button>
          ) : undefined
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}

        <FilterBar>
          <Select
            size="compact"
            aria-label="状态筛选"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">全部状态 ({items.length})</option>
            <option value="unread">未读通知 ({unreadCount})</option>
            <option value="read">已读通知 ({items.length - unreadCount})</option>
          </Select>

          <Select
            size="compact"
            aria-label="类型筛选"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          >
            <option value="all">全部类型</option>
            <option value="ai">AI 运营告警</option>
            <option value="comment">互动与评论</option>
          </Select>
        </FilterBar>

        {loading ? (
          <LoadingState label="正在载入通知…" />
        ) : filtered.length === 0 ? (
          <EmptyState label="暂无相关通知记录。" />
        ) : (
          <div className="admin-notification-list">
            {filtered.map((item) => {
              const { destination, icon, tag, tagClass, iconClass } = resolvePresentation(item);
              const isUnread = !item.read_at;

              return (
                <div
                  key={item.id}
                  className={`admin-notification-card ${isUnread ? 'admin-notification-card--unread' : ''}`}
                >
                  <div className={`admin-notification-icon ${iconClass}`}>
                    {icon}
                  </div>

                  <div className="admin-notification-main">
                    <div className="admin-notification-header">
                      <strong className="admin-notification-title">
                        {item.title || (item.actor_name ? `${item.actor_name} 互动消息` : '系统提醒')}
                      </strong>
                      <span className={`admin-notification-tag ${tagClass}`}>
                        {tag}
                      </span>
                      <time className="admin-notification-time" dateTime={item.created_at}>
                        {new Date(item.created_at).toLocaleString('zh-CN')}
                      </time>
                    </div>

                    {item.body ? (
                      <p className="admin-notification-body">{item.body}</p>
                    ) : null}

                    {item.post_title ? (
                      <small className="admin-notification-meta">
                        关联文章：{item.post_title}
                      </small>
                    ) : null}
                  </div>

                  <div className="admin-notification-actions">
                    {isUnread ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => void markOneRead(item)}
                        title="标为已读"
                      >
                        <Check size={14} /> 标为已读
                      </button>
                    ) : null}

                    {destination ? (
                      <Link
                        className="btn btn-secondary btn-sm"
                        to={destination}
                        onClick={() => void markOneRead(item)}
                      >
                        前往处理 <ChevronRight size={14} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ContentStack>
    </AdminPage>
  );
}
