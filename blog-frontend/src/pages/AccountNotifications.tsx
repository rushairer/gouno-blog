import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import { Alert, Button, Card, Empty, Skeleton } from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";

function NotificationsLoading() {
  return (
    <div role="status" aria-label="通知加载中" className="space-y-5">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} padding="sm">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/3" />
        </Card>
      ))}
    </div>
  );
}

export default function AccountNotifications() {
  const { t, formatDateTime } = useI18n();
  usePageTitle(t("accountNotifications.title"));
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await notificationsApi.getNotifications();
      setItems(data.list || []);
    } catch {
      setLoadError(t("accountNotifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item: Notification) => {
    if (item.read_at) return;
    setMutationError("");
    try {
      await notificationsApi.markRead(item.id);
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: now } : entry,
        ),
      );
    } catch {
      setMutationError(t("accountNotifications.markReadFailed"));
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMutationError("");
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((entry) =>
          entry.read_at ? entry : { ...entry, read_at: now },
        ),
      );
    } catch {
      setMutationError(t("requestFailed"));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <PageHeader
        title={t("accountNotifications.title")}
        description={t("accountNotifications.description")}
        actions={
          <Button
            variant="outline"
            size="small"
            icon={<CheckCheck />}
            disabled={loading || unreadCount === 0}
            loading={markingAll}
            onClick={() => void markAllRead()}
          >
            {t("markAllRead")}
          </Button>
        }
      />

      {loading ? <NotificationsLoading /> : null}

      {!loading && loadError ? (
        <Alert
          type="error"
          role="alert"
          title={t("accountNotifications.loadFailed")}
          description={loadError}
          action={
            <Button onClick={() => void load()}>{t("common.retry")}</Button>
          }
          showIcon
        />
      ) : null}

      {!loading && !loadError && mutationError ? (
        <Alert
          type="error"
          role="alert"
          title={t("requestFailed")}
          description={mutationError}
          showIcon
        />
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <Empty
          icon={<Inbox className="size-5 text-muted-foreground" />}
          title={t("accountNotifications.empty")}
        />
      ) : null}

      {!loading && !loadError && items.length > 0 ? (
        <section className="grid gap-3" aria-label="通知列表">
          {items.map((item) => (
            <Card
              key={item.id}
              padding="sm"
              className={
                item.read_at
                  ? "gap-3"
                  : "gap-3 border-primary/30 bg-primary/[0.025]"
              }
            >
              <div className="flex gap-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border bg-background text-primary">
                  <Bell className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <strong className="block break-words text-sm">
                    {item.title || t("accountNotifications.systemAlert")}
                  </strong>
                  {item.body ? (
                    <p className="break-words text-sm leading-6 text-muted-foreground">
                      {item.body}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time>{formatDateTime(item.created_at)}</time>
                    {!item.read_at ? (
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => void markRead(item)}
                      >
                        {t("accountNotifications.markAsRead")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
