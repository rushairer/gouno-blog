import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Crown,
  ExternalLink,
  KeyRound,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { membersApi, type BlogMember } from "../../api/members";
import { gossoAdminURL } from "../../auth";
import {
  AdminPage,
  AdminPageHeader,
  Badge,
  Button,
  ConfirmDialog,
  ContentStack,
  EmptyState,
  Feedback,
  LoadingState,
  Modal,
  Panel,
  TableContainer,
  useToast,
} from "../../components/ui";
import { StepUpMfaModal } from "../../components/auth/StepUpMfaModal";
import { useAdminGuard } from "../../hooks/useAdminGuard";

const assignableRoles = ["admin", "editor", "author", "moderator"] as const;
const roleLabels: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  editor: "编辑",
  author: "作者",
  moderator: "审核员",
};

const roleDescriptions: Record<string, string> = {
  admin: "管理后台成员、站点设置及全站内容",
  editor: "创建、编辑、审核与发布全站内容",
  author: "撰写、发布与管理本人创建的内容",
  moderator: "审核与管理读者评论、互动和举报",
};

function memberName(member: BlogMember) {
  if (member.principal.display_name?.trim()) {
    return member.principal.display_name.trim();
  }
  if (member.principal.email?.trim()) {
    return member.principal.email.trim();
  }
  if (member.principal.subject?.trim()) {
    return `用户 ${member.principal.subject.slice(0, 8)}`;
  }
  return "未命名成员";
}

function memberSubtitle(member: BlogMember) {
  const parts: string[] = [];
  if (member.principal.display_name && member.principal.email) {
    parts.push(member.principal.email);
  }
  if (member.principal.subject) {
    parts.push(`ID: ${member.principal.subject.slice(0, 8)}`);
  }
  return parts.length ? parts.join(" · ") : "GOSSO 已验证身份";
}

function initials(member: BlogMember) {
  return memberName(member).trim().slice(0, 2).toUpperCase();
}

function membershipLabel(status: BlogMember["membership_status"]) {
  if (status === "active") return "已启用";
  if (status === "suspended") return "已暂停";
  if (status === "removed") return "已移除";
  return "访客";
}

function membershipTone(status: BlogMember["membership_status"]) {
  if (status === "active") return "success" as const;
  if (status === "suspended" || status === "removed") return "danger" as const;
  return "neutral" as const;
}

const isMfaError = (err: unknown): boolean => {
  if (err instanceof Error) {
    return err.message.includes("recent_mfa_required") || err.message.includes("multi-factor");
  }
  return false;
};

export default function AdminUsers() {
  const allowed = useAdminGuard("/admin/users");
  const { notify } = useToast();
  const [members, setMembers] = useState<BlogMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [editing, setEditing] = useState<BlogMember | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [confirm, setConfirm] = useState<{
    member: BlogMember;
    action: "suspend" | "restore" | "transfer";
  } | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      setMembers((await membersApi.list()).members);
    } catch {
      setError("无法加载成员与权限，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMember = async (
    member: BlogMember,
    status: string,
    roles: string[],
    displayName?: string,
  ) => {
    setSaving(member.principal.id);
    setError("");
    try {
      await membersApi.update(member.principal.id, status, roles, displayName);
      await load();
      notify("成员信息与权限已更新。");
    } catch (err) {
      if (isMfaError(err)) {
        setPendingAction(() => () => updateMember(member, status, roles, displayName));
        setStepUpOpen(true);
      } else {
        setError(err instanceof Error ? err.message : "更新成员失败，请稍后重试。");
      }
    } finally {
      setSaving(null);
    }
  };

  const saveRoles = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") ?? "").trim();
    const roles = assignableRoles.filter((role) => form.get(role) === "on");
    await updateMember(
      editing,
      "active",
      [
        ...(editing.roles.includes("owner") ? ["owner"] : []),
        ...roles,
      ],
      displayName,
    );
    setEditing(null);
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { member, action } = confirm;
    setSaving(member.principal.id);
    setError("");
    try {
      if (action === "transfer") {
        await membersApi.transferOwner(member.principal.id);
        notify("所有权已移交。");
      } else {
        await membersApi.update(
          member.principal.id,
          action === "suspend" ? "suspended" : "active",
          member.roles,
        );
        notify(action === "suspend" ? "成员已暂停。" : "成员已恢复。");
      }
      setConfirm(null);
      await load();
    } catch (err) {
      if (isMfaError(err)) {
        setPendingAction(() => () => executeConfirm());
        setStepUpOpen(true);
      } else {
        setError(err instanceof Error ? err.message : "操作未完成，请稍后重试。");
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="成员与权限"
        description="管理 Blog 后台成员与角色分配；身份认证与账号安全由 GOSSO 提供。"
        actions={
          <>
            <Button size="compact" type="button" onClick={() => void load()} loading={loading}>
              <RefreshCw /> 刷新
            </Button>
            <a
              className="btn btn-secondary btn--compact"
              href={gossoAdminURL}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink /> 前往 GOSSO 管理
            </a>
          </>
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {loading ? (
          <LoadingState label="正在同步成员目录…" />
        ) : members.length === 0 ? (
          <EmptyState
            label="暂未同步到任何登录用户。"
            action={<Button size="compact" type="button" onClick={() => void load()}>重新加载</Button>}
          />
        ) : (
          <Panel>
            <TableContainer>
              <table className="admin-table member-table">
                <thead><tr><th>成员</th><th>Blog 角色</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>{members.map((member) => {
                  const busy = saving === member.principal.id;
                  const isOwner = member.roles.includes("owner");
                  return <tr key={member.principal.id}>
                    <td><div className="member-identity"><span className="member-avatar" aria-hidden="true">{initials(member)}</span><div><strong>{memberName(member)}</strong><small>{memberSubtitle(member)}</small></div></div></td>
                    <td><div className="member-roles">{member.roles.length ? member.roles.map((role) => <Badge key={role} tone={role === "owner" ? "brand" : "neutral"}>{roleLabels[role] || role}</Badge>) : <span className="muted-copy">尚未授予角色</span>}</div></td>
                    <td><Badge tone={membershipTone(member.membership_status)}>{membershipLabel(member.membership_status)}</Badge></td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          title="编辑成员与权限"
                          aria-label="编辑成员与权限"
                          disabled={busy}
                          onClick={() => setEditing(member)}
                        >
                          <KeyRound />
                        </button>
                        {!isOwner ? (
                          <button
                            type="button"
                            title="移交所有权"
                            aria-label="移交所有权"
                            disabled={busy || member.membership_status !== "active"}
                            onClick={() => setConfirm({ member, action: "transfer" })}
                          >
                            <Crown />
                          </button>
                        ) : null}
                        {isOwner ? null : member.membership_status === "suspended" ? (
                          <button
                            type="button"
                            title="恢复成员"
                            aria-label="恢复成员"
                            disabled={busy}
                            onClick={() => setConfirm({ member, action: "restore" })}
                          >
                            <RotateCcw />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="danger-action"
                            title="暂停成员"
                            aria-label="暂停成员"
                            disabled={busy}
                            onClick={() => setConfirm({ member, action: "suspend" })}
                          >
                            <Ban />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </TableContainer>
          </Panel>
        )}
      </ContentStack>

      <Modal
        open={Boolean(editing)}
        title={editing ? "编辑成员信息与权限" : "管理权限"}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <form className="modal-form member-role-form" onSubmit={(event) => void saveRoles(event)}>
            <div className="member-modal-profile">
              <span className="member-avatar" aria-hidden="true">
                {initials(editing)}
              </span>
              <div className="member-modal-info">
                <div className="member-modal-name">
                  <strong>{memberName(editing)}</strong>
                  {editing.roles.includes("owner") ? <Badge tone="brand">所有者</Badge> : null}
                </div>
                <span className="member-modal-meta">
                  {memberSubtitle(editing)}
                </span>
              </div>
            </div>

            <label className="member-field-group">
              <span className="member-field-label">成员显示昵称 / 备注名</span>
              <input
                type="text"
                name="display_name"
                defaultValue={editing.principal.display_name}
                placeholder={editing.principal.email || "设置在 Blog 内部展示的名称"}
                maxLength={64}
                autoComplete="off"
              />
              <small className="member-field-hint">
                用于在文章作者署名、操作审计日志及后台成员目录中展示。
              </small>
            </label>

            <div className="member-role-section">
              <span className="member-field-label">Blog 角色分配</span>
              <div className="member-role-list">
                {assignableRoles.map((role) => {
                  const isOwner = editing.roles.includes("owner");
                  return (
                    <label className="member-role-card" key={role}>
                      <input
                        type="checkbox"
                        name={role}
                        defaultChecked={editing.roles.includes(role) || isOwner}
                        disabled={isOwner}
                      />
                      <div className="member-role-card__content">
                        <div className="member-role-card__header">
                          <strong>{roleLabels[role]}</strong>
                          <span className="member-role-tag">{role}</span>
                        </div>
                        <small>{roleDescriptions[role]}</small>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button variant="primary" type="submit" loading={saving === editing.principal.id}>
                保存设置
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.action === "transfer" ? "移交所有权" : confirm?.action === "suspend" ? "暂停成员" : "恢复成员"}
        description={confirm?.action === "transfer" ? `确认将 Blog 的所有权移交给“${confirm && memberName(confirm.member)}”？当前所有者将保留管理员角色。` : confirm?.action === "suspend" ? `暂停“${confirm && memberName(confirm.member)}”后，其后台访问权限将立即失效。` : `确认恢复“${confirm && memberName(confirm.member)}”的成员资格？`}
        confirmLabel={confirm?.action === "transfer" ? "确认移交" : confirm?.action === "suspend" ? "确认暂停" : "确认恢复"}
        danger={confirm?.action !== "restore"}
        busy={saving !== null}
        onConfirm={executeConfirm}
        onClose={() => setConfirm(null)}
      />

      <StepUpMfaModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
          }
        }}
      />
    </AdminPage>
  );
}
