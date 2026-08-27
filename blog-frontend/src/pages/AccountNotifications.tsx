import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import {
  ContentStack,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
} from "../components/ui";
import { isLoggedIn, redirectToAuthorize } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";

export default function AccountNotifications() {
  usePageTitle("通知");
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationsApi.getNotifications();
      setItems(data.list || []);
      setError("");
    } catch {
      setError("无法载入通知，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      void redirectToAuthorize("/account/notifications");
      return;
    }
    void load();
  }, [load]);

  const markRead = async (item: Notification) => {
    if (item.read_at) return;
    try {
      await notificationsApi.markRead(item.id);
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: now } : entry,
        ),
      );
    } catch {
      setError("标记通知已读失败，请重试。");
    }
  };

  return (
    <main className="public-container page-content">
      <PageHeader
        title="通知"
        description="查看与你相关的站点互动和系统提醒。"
      />
      <ContentStack>
        {loading ? <LoadingState label="正在载入通知…" /> : null}
        {!loading && error ? (
          <ErrorState
            label={error}
            action={
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void load()}
              >
                重试
              </button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState label="暂时没有通知。" />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <section className="account-notification-list" aria-label="通知列表">
            {items.map((item) => (
              <Panel
                key={item.id}
                className={`account-notification ${item.read_at ? "" : "account-notification--unread"}`}
              >
                <Bell aria-hidden="true" />
                <div>
                  <strong>{item.title || "系统提醒"}</strong>
                  {item.body ? <p>{item.body}</p> : null}
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                {!item.read_at ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => void markRead(item)}
                  >
                    标为已读
                  </button>
                ) : null}
              </Panel>
            ))}
          </section>
        ) : null}
      </ContentStack>
    </main>
  );
}
