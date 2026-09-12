import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  Filter,
  GitBranch,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { notificationsApi } from "../../api/notifications";
import type { Notification } from "../../api/notifications";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Empty,
  Select,
  Skeleton,
  Tag,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { BulkActionBar } from "@gouno/ui/patterns";

import { ConfirmActionModal } from "../../components/ConfirmActionModal";
import { cn } from "../../lib/utils";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

type DeleteAction =
  | { kind: "single"; id: number; title: string }
  | { kind: "batch"; ids: number[] }
  | { kind: "clear_read" }
  | { kind: "clear_all" }
  | null;
type NotificationStatus = "all" | "unread" | "read";
type NotificationTypeFilter = "all" | "ai" | "comment";

function selectValue(value: string | string[]) {
  return String(Array.isArray(value) ? (value[0] ?? "") : value);
}

function NotificationsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-label="通知加载中"
      aria-live="polite"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} padding="base">
          <div className="flex items-start gap-4">
            <Skeleton className="size-4" />
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminNotifications() {
  const { notify } = useAppFeedback();
  const [items, setItems] = useState<Notification[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<NotificationStatus>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationTypeFilter>("all");
  const [deleteAction, setDeleteAction] = useState<DeleteAction>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationsApi.getNotifications();
      setItems(data?.list || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法载入通知列表");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markOneRead = async (item: Notification) => {
    if (item.read_at) return;
    try {
      await notificationsApi.markRead(item.id);
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, read_at: now }
            : notification,
        ),
      );
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记已读失败");
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      await notificationsApi.markAllRead();
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((notification) => ({
          ...notification,
          read_at: notification.read_at || now,
        })),
      );
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
      notify("全部通知已标记为已读。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "全部已读失败");
    } finally {
      setBusy(false);
    }
  };

  const markSelectedRead = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const selectedCount = selected.length;
      const toRead = items.filter(
        (notification) =>
          selected.includes(notification.id) && !notification.read_at,
      );
      await Promise.all(
        toRead.map((notification) =>
          notificationsApi.markRead(notification.id),
        ),
      );
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((notification) =>
          selected.includes(notification.id)
            ? { ...notification, read_at: notification.read_at || now }
            : notification,
        ),
      );
      setSelected([]);
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
      notify(`已将选中的 ${selectedCount} 条通知标为已读。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量标记已读失败");
    } finally {
      setBusy(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteAction) return;
    setBusy(true);
    setError("");

    try {
      if (deleteAction.kind === "single") {
        await notificationsApi.deleteNotification(deleteAction.id);
        setItems((current) =>
          current.filter((notification) => notification.id !== deleteAction.id),
        );
        setSelected((current) =>
          current.filter((id) => id !== deleteAction.id),
        );
        notify("通知已删除。");
      } else if (deleteAction.kind === "batch") {
        await notificationsApi.deleteNotifications(deleteAction.ids);
        const idsSet = new Set(deleteAction.ids);
        setItems((current) =>
          current.filter((notification) => !idsSet.has(notification.id)),
        );
        setSelected([]);
        notify(`已删除选中的 ${deleteAction.ids.length} 条通知。`);
      } else if (deleteAction.kind === "clear_read") {
        await notificationsApi.clearNotifications(true);
        setItems((current) =>
          current.filter((notification) => !notification.read_at),
        );
        setSelected((current) =>
          current.filter((id) =>
            items.find(
              (notification) => notification.id === id && !notification.read_at,
            ),
          ),
        );
        notify("已清空所有已读通知。");
      } else if (deleteAction.kind === "clear_all") {
        await notificationsApi.clearNotifications(false);
        setItems([]);
        setSelected([]);
        notify("已清空全部通知。");
      }
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setBusy(false);
      setDeleteAction(null);
    }
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === "unread" && item.read_at) return false;
      if (statusFilter === "read" && !item.read_at) return false;

      const isAI = item.type?.startsWith("ai_");
      if (typeFilter === "ai" && !isAI) return false;
      if (typeFilter === "comment" && isAI) return false;

      return true;
    });
  }, [items, statusFilter, typeFilter]);

  const unreadCount = useMemo(
    () => items.filter((notification) => !notification.read_at).length,
    [items],
  );
  const readCount = items.length - unreadCount;
  const hasFilters = statusFilter !== "all" || typeFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setSelected([]);
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const filteredIds = filtered.map((notification) => notification.id);
      setSelected((current) =>
        Array.from(new Set([...current, ...filteredIds])),
      );
    } else {
      const filteredIdsSet = new Set(
        filtered.map((notification) => notification.id),
      );
      setSelected((current) => current.filter((id) => !filteredIdsSet.has(id)));
    }
  };

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((notification) => selected.includes(notification.id));

  const resolvePresentation = (item: Notification) => {
    const isAI = item.type?.startsWith("ai_");
    const isWorkflow = item.type === "ai_workflow_failed";

    const destination =
      item.href ||
      (isWorkflow
        ? "/admin/ai-ops?tab=records&record=workflow"
        : isAI
          ? "/admin/ai-ops?tab=records&record=agent"
          : item.post_slug
            ? `/articles/${item.post_slug}${item.comment_id ? `#comment-${item.comment_id}` : ""}`
            : "/admin/comments");

    let icon = <Bell className="size-4" />;
    let tag = "系统通知";
    let color: "info" | "warning" | "primary" = "info";
    let iconClass = "bg-info-subtle text-info";

    if (isWorkflow) {
      icon = <GitBranch className="size-4" />;
      tag = "Workflow 告警";
      color = "warning";
      iconClass = "bg-warning-subtle text-warning";
    } else if (isAI) {
      icon = <Bot className="size-4" />;
      tag = "AI 运营告警";
      color = "warning";
      iconClass = "bg-warning-subtle text-warning";
    } else if (item.type === "comment_reply" || item.type === "comment") {
      icon = <MessageSquare className="size-4" />;
      tag = "评论互动";
      color = "primary";
      iconClass = "bg-accent text-accent-foreground";
    }

    return { destination, icon, tag, color, iconClass };
  };

  const confirmTitle =
    deleteAction?.kind === "single"
      ? "删除通知"
      : deleteAction?.kind === "batch"
        ? `批量删除 ${deleteAction.ids.length} 条通知`
        : deleteAction?.kind === "clear_read"
          ? "清空已读通知"
          : "清空全部通知";

  const confirmDescription =
    deleteAction?.kind === "single"
      ? `确定要删除此条通知（${deleteAction.title}）吗？删除后无法恢复。`
      : deleteAction?.kind === "batch"
        ? `确定要永久删除已选中的 ${deleteAction.ids.length} 条通知吗？此操作无法撤销。`
        : deleteAction?.kind === "clear_read"
          ? `确定要清空所有已读通知（共 ${readCount} 条）吗？未读通知将继续保留。`
          : "确定要清空所有通知记录吗？包括未读和已读通知，此操作无法撤销。";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="通知中心"
        description="查看系统告警、AI 自动化异常与站点互动通知，并支持批量管理与清理。"
        actions={
          items.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {unreadCount > 0 ? (
                <Button
                  size="small"
                  type="button"
                  disabled={busy}
                  onClick={() => void markAllRead()}
                  icon={<CheckCheck />}
                >
                  全部标为已读
                </Button>
              ) : null}
              {readCount > 0 ? (
                <Button
                  size="small"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteAction({ kind: "clear_read" })}
                  icon={<Trash2 />}
                >
                  清空已读
                </Button>
              ) : null}
              <Button
                size="small"
                color="error"
                type="button"
                disabled={busy}
                onClick={() => setDeleteAction({ kind: "clear_all" })}
                icon={<Trash2 />}
              >
                清空全部
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && items.length > 0 ? (
        <Alert type="error" showIcon title={error} />
      ) : null}

      <Card padding="base">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Filter className="size-3.5" />
              <span>筛选</span>
            </div>
            <div className="w-44">
              <Select
                aria-label="状态筛选"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(selectValue(value) as NotificationStatus);
                  setSelected([]);
                }}
              >
                <option value="all">全部状态 ({items.length})</option>
                <option value="unread">未读通知 ({unreadCount})</option>
                <option value="read">已读通知 ({readCount})</option>
              </Select>
            </div>
            <div className="w-40">
              <Select
                aria-label="类型筛选"
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(selectValue(value) as NotificationTypeFilter);
                  setSelected([]);
                }}
              >
                <option value="all">全部类型</option>
                <option value="ai">AI 运营告警</option>
                <option value="comment">互动与评论</option>
              </Select>
            </div>
            {hasFilters ? (
              <Button size="small" variant="text" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : null}
          </div>

          {filtered.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                aria-label="全选当前通知列表"
                checked={allFilteredSelected}
                onChange={(event) =>
                  toggleSelectAllFiltered(event.target.checked)
                }
              />
              <span>全选当前列表 ({filtered.length})</span>
            </label>
          ) : null}
        </div>
      </Card>

      {selected.length > 0 ? (
        <BulkActionBar
          selectionLabel={`已选择 ${selected.length} 条通知`}
          onCancel={() => setSelected([])}
        >
          <Button
            size="small"
            type="button"
            disabled={busy}
            onClick={() => void markSelectedRead()}
            icon={<Check />}
          >
            标为已读
          </Button>
          <Button
            size="small"
            color="error"
            type="button"
            disabled={busy}
            onClick={() =>
              setDeleteAction({ kind: "batch", ids: [...selected] })
            }
            icon={<Trash2 />}
          >
            批量删除
          </Button>
        </BulkActionBar>
      ) : null}

      {loading ? (
        <NotificationsSkeleton />
      ) : error && items.length === 0 ? (
        <Alert
          type="error"
          showIcon
          title="通知加载失败"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Card padding="lg">
          <Empty
            icon={<Bell className="size-7 text-muted-foreground" />}
            title={
              hasFilters ? "暂无符合当前筛选条件的通知。" : "暂无相关通知记录。"
            }
            description={
              hasFilters
                ? "调整状态或类型筛选后重试。"
                : "系统告警、AI 异常和互动提醒会出现在这里。"
            }
            action={
              hasFilters ? (
                <Button size="small" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3" role="list" aria-label="通知列表">
          {filtered.map((item) => {
            const { destination, icon, tag, color, iconClass } =
              resolvePresentation(item);
            const isUnread = !item.read_at;
            const isChecked = selected.includes(item.id);
            const displayTitle =
              item.title ||
              (item.actor_name ? `${item.actor_name} 互动消息` : "系统提醒");

            return (
              <Card
                key={item.id}
                padding="base"
                role="listitem"
                className={cn(
                  "transition-colors",
                  isUnread
                    ? "border-primary/40"
                    : "border-border/60 bg-card/70",
                  isChecked && "bg-accent/20",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <Checkbox
                      aria-label={`选择通知 ${item.id}`}
                      checked={isChecked}
                      onChange={(event) => {
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        );
                      }}
                    />

                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        iconClass,
                      )}
                    >
                      {icon}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-semibold text-foreground">
                          {displayTitle}
                        </strong>
                        <Tag color={color}>{tag}</Tag>
                        {isUnread ? (
                          <span
                            className="inline-block size-2 rounded-full bg-primary"
                            aria-label="未读"
                          />
                        ) : null}
                        <time
                          className="font-mono text-xs text-muted-foreground"
                          dateTime={item.created_at}
                        >
                          {new Date(item.created_at).toLocaleString("zh-CN")}
                        </time>
                      </div>

                      {item.body ? (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}

                      {item.post_title ? (
                        <p className="text-[11px] font-medium text-muted-foreground/80">
                          关联文章：{item.post_title}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    {isUnread ? (
                      <Button
                        size="small"
                        type="button"
                        onClick={() => void markOneRead(item)}
                      >
                        标为已读
                      </Button>
                    ) : null}

                    <ButtonLink
                      variant="text"
                      size="small"
                      to={destination}
                      onClick={() => void markOneRead(item)}
                      icon={<ChevronRight />}
                      iconPlacement="end"
                    >
                      前往处理
                    </ButtonLink>

                    <Button
                      variant="text"
                      color="error"
                      size="small"
                      type="button"
                      onClick={() =>
                        setDeleteAction({
                          kind: "single",
                          id: item.id,
                          title: displayTitle,
                        })
                      }
                      icon={<Trash2 />}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmActionModal
        open={deleteAction !== null}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={
          deleteAction?.kind === "clear_all" ||
          deleteAction?.kind === "clear_read"
            ? "确认清空"
            : "确认删除"
        }
        danger
        onClose={() => setDeleteAction(null)}
        onConfirm={executeDelete}
      />
    </div>
  );
}
