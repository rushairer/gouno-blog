import { useCallback, useEffect, useState } from "react";
import { Bell, Inbox } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import { Button, Card, Empty, Result, Spinner } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
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
      <div className="flex min-w-0 flex-col gap-6">
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"
          >
            <Spinner className="size-5 text-primary" />
            <span>{t("accountNotifications.loading")}</span>
          </div>
        ) : null}
        {!loading && error ? (
          <Result
            status="error"
            title={error}
            extra={
              <Button
                variant="solid"
                color="primary"
                onClick={() => void load()}
              >
                {t("common.retry")}
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <Empty
            icon={<Inbox className="size-5 text-muted-foreground" />}
            title={t("accountNotifications.empty")}
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <section className="grid gap-3" aria-label="通知列表">
            {items.map((item) => (
              <Card
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
                    variant="outline"
                    className="sm:self-start"
                    onClick={() => void markRead(item)}
                  >
                    {t("accountNotifications.markAsRead")}
                  </Button>
                ) : null}
              </Card>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
