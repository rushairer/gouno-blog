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

import { useI18n } from "../i18n";

export default function AccountNotifications() {
  const { t, formatDateTime } = useI18n();
  usePageTitle(t("accountNotifications.title"));
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
      setError(t("accountNotifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(t("accountNotifications.markReadFailed"));
    }
  };

  return (
    <main className="public-container page-content">
      <PageHeader
        title={t("accountNotifications.title")}
        description={t("accountNotifications.description")}
      />
      <ContentStack>
        {loading ? (
          <LoadingState label={t("accountNotifications.loading")} />
        ) : null}
        {!loading && error ? (
          <ErrorState
            label={error}
            action={
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void load()}
              >
                {t("common.retry")}
              </button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState label={t("accountNotifications.empty")} />
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
                  <strong>
                    {item.title || t("accountNotifications.systemAlert")}
                  </strong>
                  {item.body ? <p>{item.body}</p> : null}
                  <time>{formatDateTime(item.created_at)}</time>
                </div>
                {!item.read_at ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => void markRead(item)}
                  >
                    {t("accountNotifications.markAsRead")}
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
