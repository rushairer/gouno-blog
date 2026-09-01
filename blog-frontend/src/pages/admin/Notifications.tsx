import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  GitBranch,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { notificationsApi } from "../../api/notifications";
import type { Notification } from "../../api/notifications";
import {
  AdminPage,
  AdminPageHeader,
  BulkActionBar,
  Button,
  ButtonLink,
  Checkbox,
  ConfirmDialog,
  ContentStack,
  EmptyState,
  Feedback,
  FilterBar,
  LoadingState,
  Select,
  useToast,
} from "../../components/ui";

type DeleteAction =
  | { kind: "single"; id: number; title: string }
  | { kind: "batch"; ids: number[] }
  | { kind: "clear_read" }
  | { kind: "clear_all" }
  | null;

export default function AdminNotifications() {
  const { notify } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | "ai" | "comment">("all");
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
        current.map((n) => (n.id === item.id ? { ...n, read_at: now } : n)),
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
        current.map((n) => ({ ...n, read_at: n.read_at || now })),
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
      const toRead = items.filter((n) => selected.includes(n.id) && !n.read_at);
      await Promise.all(toRead.map((n) => notificationsApi.markRead(n.id)));
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((n) =>
          selected.includes(n.id) ? { ...n, read_at: n.read_at || now } : n,
        ),
      );
      setSelected([]);
      window.dispatchEvent(new CustomEvent("community:notifications-changed"));
      notify(`已将选中的 ${selected.length} 条通知标为已读。`);
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
        setItems((current) => current.filter((n) => n.id !== deleteAction.id));
        setSelected((current) =>
          current.filter((id) => id !== deleteAction.id),
        );
        notify("通知已删除。");
      } else if (deleteAction.kind === "batch") {
        await notificationsApi.deleteNotifications(deleteAction.ids);
        const idsSet = new Set(deleteAction.ids);
        setItems((current) => current.filter((n) => !idsSet.has(n.id)));
        setSelected([]);
        notify(`已删除选中的 ${deleteAction.ids.length} 条通知。`);
      } else if (deleteAction.kind === "clear_read") {
        await notificationsApi.clearNotifications(true);
        setItems((current) => current.filter((n) => !n.read_at));
        setSelected((current) =>
          current.filter((id) => items.find((n) => n.id === id && !n.read_at)),
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
    () => items.filter((n) => !n.read_at).length,
    [items],
  );
  const readCount = items.length - unreadCount;

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const filteredIds = filtered.map((n) => n.id);
      setSelected((prev) => Array.from(new Set([...prev, ...filteredIds])));
    } else {
      const filteredIdsSet = new Set(filtered.map((n) => n.id));
      setSelected((prev) => prev.filter((id) => !filteredIdsSet.has(id)));
    }
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((n) => selected.includes(n.id));

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

    let icon = <Bell />;
    let tag = "系统通知";
    let tagClass = "";
    let iconClass = "";

    if (isWorkflow) {
      icon = <GitBranch />;
      tag = "Workflow 告警";
      tagClass = "admin-notification-tag--ai";
      iconClass = "admin-notification-icon--ai";
    } else if (isAI) {
      icon = <Bot />;
      tag = "AI 运营告警";
      tagClass = "admin-notification-tag--ai";
      iconClass = "admin-notification-icon--ai";
    } else if (item.type === "comment_reply" || item.type === "comment") {
      icon = <MessageSquare />;
      tag = "评论互动";
      tagClass = "admin-notification-tag--comment";
      iconClass = "admin-notification-icon--comment";
    }

    return { destination, icon, tag, tagClass, iconClass };
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
    <AdminPage>
      <AdminPageHeader
        title="通知中心"
        description="查看系统告警、AI 自动化异常与站点互动通知，并支持批量管理与清理。"
        actions={
          <div
            className="admin-page-actions-group"
            style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
          >
            {unreadCount > 0 ? (
              <Button
                variant="secondary"
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
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => setDeleteAction({ kind: "clear_read" })}
                icon={<Trash2 />}
              >
                清空已读
              </Button>
            ) : null}
            {items.length > 0 ? (
              <Button
                variant="danger"
                type="button"
                disabled={busy}
                onClick={() => setDeleteAction({ kind: "clear_all" })}
                icon={<Trash2 />}
              >
                清空全部
              </Button>
            ) : null}
          </div>
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}

        <FilterBar>
          <Select
            size="compact"
            aria-label="状态筛选"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
          >
            <option value="all">全部状态 ({items.length})</option>
            <option value="unread">未读通知 ({unreadCount})</option>
            <option value="read">已读通知 ({readCount})</option>
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

          {filtered.length > 0 ? (
            <label
              className="checkbox-field"
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
              }}
            >
              <Checkbox
                checked={allFilteredSelected}
                onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
              />
              全选当前列表
            </label>
          ) : null}
        </FilterBar>

        {selected.length > 0 ? (
          <BulkActionBar
            selectionLabel={`已选择 ${selected.length} 条通知`}
            onCancel={() => setSelected([])}
          >
            <Button
              variant="secondary"
              size="compact"
              type="button"
              disabled={busy}
              onClick={() => void markSelectedRead()}
              icon={<Check />}
            >
              标为已读
            </Button>
            <Button
              variant="danger"
              size="compact"
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
          <LoadingState label="正在载入通知…" />
        ) : filtered.length === 0 ? (
          <EmptyState label="暂无相关通知记录。" />
        ) : (
          <div className="admin-notification-list">
            {filtered.map((item) => {
              const { destination, icon, tag, tagClass, iconClass } =
                resolvePresentation(item);
              const isUnread = !item.read_at;
              const isChecked = selected.includes(item.id);
              const displayTitle =
                item.title ||
                (item.actor_name ? `${item.actor_name} 互动消息` : "系统提醒");

              return (
                <div
                  key={item.id}
                  className={`admin-notification-card ${isUnread ? "admin-notification-card--unread" : ""}`}
                >
                  <div className="admin-notification-select">
                    <Checkbox
                      aria-label={`选择通知 ${item.id}`}
                      checked={isChecked}
                      onChange={(e) => {
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        );
                      }}
                    />
                  </div>

                  <div className={`admin-notification-icon ${iconClass}`}>
                    {icon}
                  </div>

                  <div className="admin-notification-main">
                    <div className="admin-notification-header">
                      <strong className="admin-notification-title">
                        {displayTitle}
                      </strong>
                      <span className={`admin-notification-tag ${tagClass}`}>
                        {tag}
                      </span>
                      <time
                        className="admin-notification-time"
                        dateTime={item.created_at}
                      >
                        {new Date(item.created_at).toLocaleString("zh-CN")}
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
                      <Button
                        variant="secondary"
                        size="compact"
                        type="button"
                        onClick={() => void markOneRead(item)}
                        title="标为已读"
                      >
                        标为已读
                      </Button>
                    ) : null}

                    {destination ? (
                      <ButtonLink
                        size="compact"
                        to={destination}
                        onClick={() => void markOneRead(item)}
                        icon={<ChevronRight size={14} />}
                        iconPosition="right"
                      >
                        前往处理
                      </ButtonLink>
                    ) : null}

                    <Button
                      variant="danger"
                      size="compact"
                      type="button"
                      onClick={() =>
                        setDeleteAction({
                          kind: "single",
                          id: item.id,
                          title: displayTitle,
                        })
                      }
                      title="删除此通知"
                      icon={<Trash2 size={14} />}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ContentStack>

      <ConfirmDialog
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
    </AdminPage>
  );
}
