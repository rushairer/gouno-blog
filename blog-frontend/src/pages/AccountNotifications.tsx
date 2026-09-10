import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import { PageHeader } from "@gouno/ui/gouno";
import {
  Button,
  ContentStack,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
} from "@gouno/ui-legacy";
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
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
              <Button variant="primary" onClick={() => void load()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState label={t("accountNotifications.empty")} />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <section className="grid gap-3" aria-label="通知列表">
            {items.map((item) => (
              <Panel
                key={item.id}
                className={`grid gap-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] ${item.read_at ? "" : "border-l-4 border-l-primary"}`}
              >
                <Bell className="size-5 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <strong>
                    {item.title || t("accountNotifications.systemAlert")}
                  </strong>
                  {item.body ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  ) : null}
                  <time className="mt-2 block text-xs text-muted-foreground">
                    {formatDateTime(item.created_at)}
                  </time>
                </div>
                {!item.read_at ? (
                  <Button
                    variant="secondary"
                    className="sm:self-start"
                    onClick={() => void markRead(item)}
                  >
                    {t("accountNotifications.markAsRead")}
                  </Button>
                ) : null}
              </Panel>
            ))}
          </section>
        ) : null}
      </ContentStack>
    </main>
  );
}
