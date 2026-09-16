import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ExternalLink, Inbox } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Empty,
  Segmented,
  Skeleton,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { usePageTitle } from "../hooks/usePageTitle";
import { useI18n } from "../i18n";

type NotificationFilter = "all" | "unread";

function NotificationsLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
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
  const { t, formatDateTime, locale } = useI18n();
  usePageTitle(t("accountNotifications.title"));
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const labels =
    locale === "zh"
      ? {
          all: "全部",
          unread: "未读",
          view: "查看",
          reload: "重新载入",
          loading: "通知加载中",
          list: "通知列表",
          filter: "通知筛选",
          noUnread: "没有未读通知",
          unreadCount: (count: number) => `${count} 条未读`,
        }
      : {
          all: "All",
          unread: "Unread",
          view: "View",
          reload: "Reload",
          loading: "Loading notifications",
          list: "Notification list",
          filter: "Notification filter",
          noUnread: "No unread notifications",
          unreadCount: (count: number) => `${count} unread`,
        };

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );
  const visibleItems = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.read_at) : items),
    [filter, items],
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

      {loading ? <NotificationsLoading label={labels.loading} /> : null}

      {!loading && loadError ? (
        <Alert
          type="error"
          role="alert"
          title={t("accountNotifications.loadFailed")}
          description={loadError}
          action={
            <Button size="small" onClick={() => void load()}>
              {labels.reload}
            </Button>
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

      {!loading && !loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <Segmented<NotificationFilter>
            aria-label={labels.filter}
            options={[
              { value: "all", label: labels.all },
              { value: "unread", label: labels.unread },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <span className="text-sm text-muted-foreground">
            {labels.unreadCount(unreadCount)}
          </span>
        </div>
      ) : null}

      {!loading && !loadError && visibleItems.length === 0 ? (
        <Empty
          icon={<Inbox className="size-5 text-muted-foreground" />}
          title={
            filter === "unread"
              ? labels.noUnread
              : t("accountNotifications.empty")
          }
        />
      ) : null}

      {!loading && !loadError && visibleItems.length > 0 ? (
        <section className="grid gap-3" aria-label={labels.list}>
          {visibleItems.map((item) => {
            const itemTitle =
              item.title || t("accountNotifications.systemAlert");
            return (
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
                      {itemTitle}
                    </strong>
                    {item.body ? (
                      <p className="break-words text-sm leading-6 text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <time>{formatDateTime(item.created_at)}</time>
                      {item.href ? (
                        <ButtonLink
                          variant="text"
                          size="small"
                          to={item.href}
                          icon={<ExternalLink />}
                          aria-label={`${labels.view} ${itemTitle}`}
                          onClick={() => void markRead(item)}
                        >
                          {labels.view}
                        </ButtonLink>
                      ) : null}
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
            );
          })}
        </section>
      ) : null}
    </main>
  );
}